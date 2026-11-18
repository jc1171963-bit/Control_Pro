"""S2 · Sesiones de inicio.

S2.1: restricciones de la tabla sesion_auth. S2.2: emisión con `sid` y `gen`, validación por solicitud, tope absoluto,
renovación dentro de la misma sesión y cierre que revoca la sesión. S2.3: refresh determinista, gracia de 30 s,
reutilización, generación futura y concurrencia.
"""
import threading
import uuid
from datetime import timedelta

import pytest
from flask_jwt_extended import create_access_token, create_refresh_token, decode_token
from sqlalchemy import text, update
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import SesionAuth, ahora

from .conftest import PASSWORD


def _sesion(**cambios):
    t = ahora()
    datos = dict(tipo_cuenta="usuario", cuenta_id=1, gen_emitida_en=t, expira_absoluta=t + timedelta(hours=12), actividad_en=t)
    return SesionAuth(**{**datos, **cambios})


def test_sesion_valida_y_revocada(app):
    with app.app_context():
        s = _sesion()
        db.session.add(s)
        db.session.commit()
        assert s.id and s.gen == 1 and s.creada and s.revocada_en is None
        s.revocada_en, s.motivo = ahora(), "cierre"
        db.session.commit()


@pytest.mark.parametrize("cambios", [
    {"tipo_cuenta": "otro"},
    {"gen": 0},
    {"motivo": "cierre"},                 # motivo sin revocada_en
    {"revocada_en": ahora()},             # revocada_en sin motivo
    {"revocada_en": ahora(), "motivo": "desconocido"},
])
def test_restricciones(app, cambios):
    with app.app_context():
        db.session.add(_sesion(**cambios))
        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()


# ---------------------------------------------------------------- S2.2 · emisión y validación

def _entrar(client, url, correo):
    r = client.post(url, json={"correo": correo, "password": PASSWORD})
    assert r.status_code == 200, r.get_json()
    return r.get_json()


def _claims(app, token):
    with app.app_context():
        return decode_token(token, allow_expired=True)


def _refresh_actual(client):
    return client.get_cookie("cp_refresh", path="/api/auth").value


def _sesion_db(app, sid):
    with app.app_context():
        s = db.session.get(SesionAuth, uuid.UUID(sid))
        return None if s is None else {"gen": s.gen, "revocada_en": s.revocada_en, "motivo": s.motivo,
                                       "tipo": s.tipo_cuenta, "expira": s.expira_absoluta}


def _cambiar_sesion(app, sid, **valores):
    with app.app_context():
        db.session.execute(update(SesionAuth).where(SesionAuth.id == uuid.UUID(sid)).values(**valores))
        db.session.commit()


def _yo(client, access):
    return client.get("/api/auth/yo", headers={"Authorization": f"Bearer {access}"})


@pytest.mark.parametrize("url, correo, tipo", [
    ("/api/auth/login", "admin@controlpro.mx", "usuario"),
    ("/api/auth/cliente/login", "cliente@demo.mx", "cliente"),
    ("/api/auth/portal/login", "empresa@demo.mx", "cliente"),
    ("/api/auth/portal/login", "aprobador@controlpro.mx", "usuario"),
])
def test_cada_inicio_crea_su_sesion(app, client, url, correo, tipo):
    d = _entrar(client, url, correo)
    acceso, refresh = _claims(app, d["access_token"]), _claims(app, _refresh_actual(client))
    assert acceso["sid"] == refresh["sid"] and acceso["gen"] == refresh["gen"] == 1 and acceso["tipo"] == tipo
    s = _sesion_db(app, acceso["sid"])
    assert s["gen"] == 1 and s["tipo"] == tipo and s["revocada_en"] is None
    assert refresh["exp"] <= s["expira"].timestamp()  # nada vive más que el tope absoluto
    assert _yo(client, d["access_token"]).status_code == 200


def test_los_tokens_no_pasan_del_tope_absoluto(app, client):
    d = _entrar(client, "/api/auth/login", "admin@controlpro.mx")
    sid = _claims(app, d["access_token"])["sid"]
    tope = ahora() + timedelta(minutes=5)
    _cambiar_sesion(app, sid, expira_absoluta=tope)
    r = client.post("/api/auth/refresh")
    assert r.status_code == 200, r.get_json()
    assert abs(_claims(app, r.get_json()["access_token"])["exp"] - tope.timestamp()) <= 1  # no 15 min
    assert abs(_claims(app, _refresh_actual(client))["exp"] - tope.timestamp()) <= 1      # no 7 días


def test_token_sin_sesion_se_rechaza(app, client):
    with app.app_context():
        viejo = create_access_token("u:1", additional_claims={"tipo": "usuario"})  # como los emitidos antes de S2
    r = _yo(client, viejo)
    assert r.status_code == 401 and r.get_json()["error"]["codigo"] == "sesion_invalida"


def test_sesion_revocada_o_expirada_corta_todos_sus_tokens(app, client):
    d = _entrar(client, "/api/auth/login", "admin@controlpro.mx")
    sid = _claims(app, d["access_token"])["sid"]
    _cambiar_sesion(app, sid, expira_absoluta=ahora() - timedelta(minutes=1))
    for r in (_yo(client, d["access_token"]), client.post("/api/auth/refresh")):
        assert r.status_code == 401 and r.get_json()["error"]["codigo"] == "sesion_expirada"
    _cambiar_sesion(app, sid, expira_absoluta=ahora() + timedelta(hours=1), revocada_en=ahora(), motivo="admin")
    r = _yo(client, d["access_token"])
    assert r.status_code == 401 and r.get_json()["error"]["codigo"] == "sesion_revocada"


def test_la_rotacion_normal_es_determinista(app, client):
    d = _entrar(client, "/api/auth/login", "admin@controlpro.mx")
    sid = _claims(app, d["access_token"])["sid"]
    r = client.post("/api/auth/refresh")
    assert r.status_code == 200
    acceso, refresh = _claims(app, r.get_json()["access_token"]), _claims(app, _refresh_actual(client))
    assert acceso["sid"] == refresh["sid"] == sid and acceso["gen"] == refresh["gen"] == 2
    with app.app_context():
        s = db.session.get(SesionAuth, uuid.UUID(sid))
        assert s.gen == 2 and refresh["jti"] == f"{sid}.2" and refresh["iat"] == int(s.gen_emitida_en.timestamp())


def test_el_cierre_revoca_la_sesion(app, client):
    d = _entrar(client, "/api/auth/login", "admin@controlpro.mx")
    sid, refresh = _claims(app, d["access_token"])["sid"], _refresh_actual(client)
    assert client.post("/api/auth/logout", headers={"Authorization": f"Bearer {d['access_token']}"}).status_code == 200
    s = _sesion_db(app, sid)
    assert s["revocada_en"] is not None and s["motivo"] == "cierre"
    r = _yo(client, d["access_token"])
    assert r.status_code == 401 and r.get_json()["error"]["codigo"] == "sesion_revocada"
    client.set_cookie("cp_refresh", refresh, path="/api/auth")
    assert client.post("/api/auth/refresh").get_json()["error"]["codigo"] == "sesion_revocada"
    assert client.post("/api/auth/logout").status_code == 200  # cerrar otra vez sigue respondiendo 200


# ---------------------------------------------------------------- S2.3 · gracia, reutilización y generación futura

def _rotada(app, client):
    """Inicia sesión y renueva una vez: devuelve (sid, refresh de gen 1 ya usado, respuesta de la rotación a gen 2)."""
    d = _entrar(client, "/api/auth/login", "admin@controlpro.mx")
    sid, usado = _claims(app, d["access_token"])["sid"], _refresh_actual(client)
    r = client.post("/api/auth/refresh")
    assert r.status_code == 200
    return sid, usado, r


def _cookies(r):
    return sorted(c for c in r.headers.getlist("Set-Cookie") if c.startswith(("cp_refresh=", "csrf_refresh_token=")))


def _auditorias(app, accion):
    with app.app_context():
        return db.session.execute(text("select despues from auditoria where accion = :a"), {"a": accion}).scalars().all()


def _fila(app, sid):
    with app.app_context():
        return tuple(db.session.execute(text(
            "select gen, gen_emitida_en, actividad_en, revocada_en, motivo from sesion_auth where id = :i"), {"i": sid}).one())


def test_reintento_en_la_gracia_devuelve_el_mismo_refresh_sin_escribir(app, client):
    sid, usado, primera = _rotada(app, client)  # la respuesta "se perdió": el navegador sigue con gen 1
    antes = _fila(app, sid)
    for _ in range(3):
        client.set_cookie("cp_refresh", usado, path="/api/auth")
        r = client.post("/api/auth/refresh")
        assert r.status_code == 200
        assert _cookies(r) == _cookies(primera)  # mismo refresh byte a byte (y misma cookie CSRF si aplica)
        assert _claims(app, r.get_json()["access_token"])["gen"] == 2
    assert _fila(app, sid) == antes  # nada cambió: gen sigue en 2


def test_renovaciones_concurrentes_rotan_una_sola_vez(app, client):
    d = _entrar(client, "/api/auth/login", "admin@controlpro.mx")
    sid, refresh = _claims(app, d["access_token"])["sid"], _refresh_actual(client)
    n = 5
    barrera, resultados = threading.Barrier(n), []

    def renovar():
        c = app.test_client()
        c.set_cookie("cp_refresh", refresh, path="/api/auth")
        barrera.wait()
        r = c.post("/api/auth/refresh")
        cookie = c.get_cookie("cp_refresh", path="/api/auth")
        resultados.append((r.status_code, cookie.value if cookie else None))

    hilos = [threading.Thread(target=renovar) for _ in range(n)]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()
    assert [s for s, _ in resultados] == [200] * n
    assert len({v for _, v in resultados}) == 1  # todos recibieron el mismo refresh
    s = _sesion_db(app, sid)
    assert s["gen"] == 2 and s["revocada_en"] is None


def test_generacion_anterior_fuera_de_la_gracia_revoca_la_sesion(app, client):
    sid, usado, r = _rotada(app, client)
    acceso = r.get_json()["access_token"]
    _cambiar_sesion(app, sid, gen_emitida_en=ahora() - timedelta(seconds=31))
    client.set_cookie("cp_refresh", usado, path="/api/auth")
    r = client.post("/api/auth/refresh")
    assert r.status_code == 401 and r.get_json()["error"]["codigo"] == "sesion_revocada"
    assert _sesion_db(app, sid)["motivo"] == "reutilizacion"
    assert _yo(client, acceso).get_json()["error"]["codigo"] == "sesion_revocada"  # muere también el access vigente
    assert any(a["sid"] == sid and a["presentada"] == 1 and a["vigente"] == 2 for a in _auditorias(app, "sesion.reutilizacion"))


def test_dos_generaciones_atras_revoca_aun_dentro_de_la_gracia(app, client):
    sid, usado, _ = _rotada(app, client)
    assert client.post("/api/auth/refresh").status_code == 200  # gen 3; `usado` es gen 1 = gen-2
    client.set_cookie("cp_refresh", usado, path="/api/auth")
    r = client.post("/api/auth/refresh")
    assert r.status_code == 401 and r.get_json()["error"]["codigo"] == "sesion_revocada"
    assert _sesion_db(app, sid)["motivo"] == "reutilizacion"


def test_generacion_futura_no_modifica_ni_revoca_la_sesion(app, client):
    d = _entrar(client, "/api/auth/login", "admin@controlpro.mx")
    sid, legitimo = _claims(app, d["access_token"])["sid"], _refresh_actual(client)
    antes = _fila(app, sid)
    cuenta = _claims(app, d["access_token"])["sub"]
    with app.app_context():
        futuro = create_refresh_token(cuenta, additional_claims={"tipo": "usuario", "sid": sid, "gen": 4})
    client.set_cookie("cp_refresh", futuro, path="/api/auth")
    r = client.post("/api/auth/refresh")
    assert r.status_code == 401 and r.get_json()["error"]["codigo"] == "token_invalido"
    assert any(c.startswith("cp_refresh=;") for c in r.headers.getlist("Set-Cookie"))  # se borra la cookie
    assert _fila(app, sid) == antes
    assert any(a["sid"] == sid and a["presentada"] == 4 for a in _auditorias(app, "sesion.generacion_futura"))
    client.set_cookie("cp_refresh", legitimo, path="/api/auth")
    assert client.post("/api/auth/refresh").status_code == 200  # la sesión legítima sigue funcionando


def test_fallo_antes_del_commit_no_avanza_la_generacion(app, client, monkeypatch):
    from app.services import auth_service
    d = _entrar(client, "/api/auth/login", "admin@controlpro.mx")
    sid, refresh = _claims(app, d["access_token"])["sid"], _refresh_actual(client)
    original = auth_service.Vigente.de
    fallos = []

    def falla_antes_del_commit(s):  # la rotación ya cambió la fila, pero aún no confirma
        if not fallos and s.gen == 2:
            fallos.append(1)
            raise RuntimeError("caída antes de confirmar")
        return original(s)

    monkeypatch.setattr(auth_service.Vigente, "de", staticmethod(falla_antes_del_commit))
    app.config["PROPAGATE_EXCEPTIONS"], propagar = False, app.config.get("PROPAGATE_EXCEPTIONS")
    try:
        assert client.post("/api/auth/refresh").status_code == 500
    finally:
        app.config["PROPAGATE_EXCEPTIONS"] = propagar
    monkeypatch.undo()
    assert _sesion_db(app, sid)["gen"] == 1  # no se confirmó nada ni se emitió ningún token
    client.set_cookie("cp_refresh", refresh, path="/api/auth")
    r = client.post("/api/auth/refresh")
    assert r.status_code == 200 and _claims(app, r.get_json()["access_token"])["gen"] == 2
    assert _sesion_db(app, sid)["gen"] == 2  # una sola rotación


@pytest.mark.parametrize("cambio, codigo", [
    ("revocar", "sesion_revocada"),
    ("vencer", "sesion_expirada"),
])
def test_rechazo_bajo_bloqueo_usa_el_codigo_preciso(app, client, monkeypatch, cambio, codigo):
    """La sesión cambia entre la validación del token (sin bloqueo) y el bloqueo de la renovación."""
    import app.security.auth as seguridad
    d = _entrar(client, "/api/auth/login", "admin@controlpro.mx")
    sid = _claims(app, d["access_token"])["sid"]
    valores = ({"revocada_en": ahora(), "motivo": "admin"} if cambio == "revocar"
               else {"expira_absoluta": ahora() - timedelta(minutes=1)})
    original = seguridad.motivo_rechazo_sesion

    def valida_y_luego_cambia(payload):
        motivo = original(payload)  # la validación ve la sesión vigente…
        if payload.get("type") == "refresh":  # …y justo después otra conexión la revoca o la vence
            with db.engine.begin() as conn:
                conn.execute(update(SesionAuth).where(SesionAuth.id == uuid.UUID(sid)).values(**valores))
        return motivo

    monkeypatch.setattr(seguridad, "motivo_rechazo_sesion", valida_y_luego_cambia)
    r = client.post("/api/auth/refresh")
    assert r.status_code == 401 and r.get_json()["error"]["codigo"] == codigo
    assert _sesion_db(app, sid)["gen"] == 1  # no se emitió ninguna generación nueva


def test_el_cierre_invalida_la_generacion_vigente_y_la_anterior(app, client):
    _, usado, r = _rotada(app, client)
    vigente = _refresh_actual(client)
    assert client.post("/api/auth/logout", headers={"Authorization": f"Bearer {r.get_json()['access_token']}"}).status_code == 200
    for token in (vigente, usado):
        client.set_cookie("cp_refresh", token, path="/api/auth")
        assert client.post("/api/auth/refresh").get_json()["error"]["codigo"] == "sesion_revocada"


# ---------------------------------------------------------------- S2.4 · inactividad

MIN = timedelta(minutes=1)


def _admin(app, client):
    d = _entrar(client, "/api/auth/login", "admin@controlpro.mx")
    return _claims(app, d["access_token"])["sid"], d


def _actividad(client, inactivo_ms):
    return client.post("/api/auth/actividad", json={"inactivo_ms": inactivo_ms})


def _codigo(r):
    return (r.get_json() or {}).get("error", {}).get("codigo")


def _hace(**kw):
    return ahora() - timedelta(**kw)


def _cerca(a, b, tolerancia_s=3):
    return abs((a - b).total_seconds()) <= tolerancia_s


def _bearer(d):
    return {"Authorization": f"Bearer {d['access_token']}"}


def test_inicio_y_renovacion_traen_las_duraciones_de_la_sesion(app, client):
    _, d = _admin(app, client)
    s = d["sesion"]
    assert s["estado"] == "activa" and abs(s["restante_inactividad_ms"] - 30 * 60_000) < 5_000
    assert abs(s["aviso_en_ms"] - 28 * 60_000) < 5_000 and abs(s["restante_absoluto_ms"] - 12 * 3_600_000) < 5_000
    assert client.post("/api/auth/refresh").get_json()["sesion"]["estado"] == "activa"


def test_28_minutos_sin_actividad_dejan_2_de_margen_y_avisan(app, client):
    sid, _ = _admin(app, client)
    _cambiar_sesion(app, sid, actividad_en=_hace(minutes=28))
    s = client.get("/api/auth/sesion").get_json()
    assert abs(s["restante_inactividad_ms"] - 2 * 60_000) < 3_000 and s["aviso_en_ms"] == 0


def test_a_los_30_minutos_todo_rechaza_y_solo_el_refresh_revoca(app, client):
    sid, d = _admin(app, client)
    _cambiar_sesion(app, sid, actividad_en=_hace(minutes=31))
    antes = _fila(app, sid)
    for r in (_yo(client, d["access_token"]), client.get("/api/admin/notificaciones", headers=_bearer(d)),
              client.get("/api/auth/sesion")):
        assert r.status_code == 401 and _codigo(r) == "sesion_inactiva"
    assert _fila(app, sid) == antes  # solicitudes normales y la consulta no escriben
    r = client.post("/api/auth/refresh")
    assert r.status_code == 401 and _codigo(r) == "sesion_inactiva"
    assert _sesion_db(app, sid)["motivo"] == "inactividad"


def test_endpoints_normales_rechazan_una_sesion_inactiva_sin_escribir(app, client):
    sid, d = _admin(app, client)
    otro = app.test_client()
    c = _entrar(otro, "/api/auth/cliente/login", "cliente@demo.mx")
    sid_c = _claims(app, c["access_token"])["sid"]
    for s in (sid, sid_c):
        _cambiar_sesion(app, s, actividad_en=_hace(minutes=31))
    antes = (_fila(app, sid), _fila(app, sid_c))
    for r in (_yo(client, d["access_token"]), client.get("/api/admin/pedidos", headers=_bearer(d)),
              client.get("/api/archivos/privados/x.png", headers=_bearer(d)),
              otro.get("/api/cuenta/notificaciones", headers=_bearer(c)), _yo(otro, c["access_token"])):
        assert r.status_code == 401 and _codigo(r) == "sesion_inactiva", r.get_json()
    assert (_fila(app, sid), _fila(app, sid_c)) == antes


def test_interaccion_real_antes_del_vencimiento(app, client):
    sid, _ = _admin(app, client)
    _cambiar_sesion(app, sid, actividad_en=_hace(minutes=27), creada=_hace(minutes=28))  # estado real: creada ≤ actividad
    r = _actividad(client, 60_000)
    assert r.status_code == 200 and r.get_json()["resultado"] == "registrada"
    assert _cerca(_sesion_db_actividad(app, sid), _hace(minutes=1))
    assert abs(r.get_json()["sesion"]["restante_inactividad_ms"] - 29 * 60_000) < 3_000


def _sesion_db_actividad(app, sid):
    return _fila(app, sid)[2]


def test_el_polling_no_adelanta_la_actividad(app, client):
    sid, d = _admin(app, client)
    _cambiar_sesion(app, sid, actividad_en=_hace(minutes=20))
    inicial = _sesion_db_actividad(app, sid)
    for _ in range(5):
        assert client.get("/api/admin/notificaciones?por_pagina=1", headers=_bearer(d)).status_code == 200
    r = client.post("/api/auth/refresh")
    assert r.status_code == 200
    for _ in range(3):
        assert client.get("/api/auth/sesion").status_code == 200
    assert _sesion_db_actividad(app, sid) == inicial  # ni consultas, ni renovación, ni la consulta de estado
    _cambiar_sesion(app, sid, actividad_en=_hace(minutes=31))
    r = client.get("/api/admin/notificaciones?por_pagina=1", headers={"Authorization": f"Bearer {r.get_json()['access_token']}"})
    assert r.status_code == 401 and _codigo(r) == "sesion_inactiva"


def test_consultar_el_estado_100_veces_no_escribe(app, client):
    sid, _ = _admin(app, client)
    _cambiar_sesion(app, sid, actividad_en=_hace(minutes=10))
    antes = _fila(app, sid)
    for _ in range(100):
        assert client.get("/api/auth/sesion").status_code == 200
    assert _fila(app, sid) == antes


def test_la_actividad_nunca_retrocede(app, client):
    sid, _ = _admin(app, client)
    _cambiar_sesion(app, sid, actividad_en=_hace(minutes=25), creada=_hace(minutes=26))
    assert _actividad(client, 10 * 60_000).get_json()["resultado"] == "registrada"
    primera = _sesion_db_actividad(app, sid)
    assert _cerca(primera, _hace(minutes=10))
    assert _actividad(client, 20 * 60_000).get_json()["resultado"] == "sin_cambios"
    assert _sesion_db_actividad(app, sid) == primera


@pytest.mark.parametrize("valor", [-1, "x", True, None, 1.5, 1e12, [], {}])
def test_duraciones_invalidas_se_rechazan_sin_cambios(app, client, valor):
    sid, _ = _admin(app, client)
    _cambiar_sesion(app, sid, actividad_en=_hace(minutes=25))
    antes = _fila(app, sid)
    r = _actividad(client, valor)
    assert r.status_code == 422 and _codigo(r) == "actividad_invalida"
    assert _fila(app, sid) == antes


def test_duracion_excesiva_se_ignora(app, client):
    sid, _ = _admin(app, client)
    _cambiar_sesion(app, sid, actividad_en=_hace(minutes=25))
    antes = _fila(app, sid)
    r = _actividad(client, 10 ** 12)  # entero válido pero mayor que la ventana: no describe actividad
    assert r.status_code == 200 and r.get_json()["resultado"] == "sin_cambios"
    assert _fila(app, sid) == antes


def test_tope_absoluto_prevalece_sobre_la_actividad(app, client):
    sid, _ = _admin(app, client)
    _cambiar_sesion(app, sid, expira_absoluta=_hace(seconds=1))
    antes = _fila(app, sid)
    for r in (_actividad(client, 0), client.get("/api/auth/sesion"), client.post("/api/auth/refresh")):
        assert r.status_code == 401 and _codigo(r) == "sesion_expirada"
    assert _fila(app, sid) == antes


def test_revocar_primero_y_reportar_despues(app, client):
    sid, d = _admin(app, client)
    refresh = _refresh_actual(client)
    _cambiar_sesion(app, sid, actividad_en=_hace(minutes=25))
    inicial = _sesion_db_actividad(app, sid)
    assert client.post("/api/auth/logout", headers=_bearer(d)).status_code == 200
    client.set_cookie("cp_refresh", refresh, path="/api/auth")
    r = _actividad(client, 0)
    assert r.status_code == 401 and _codigo(r) == "sesion_revocada"
    s = _sesion_db(app, sid)
    assert _sesion_db_actividad(app, sid) == inicial and s["revocada_en"] is not None and s["motivo"] == "cierre"


def test_reportar_primero_y_revocar_despues(app, client):
    sid, d = _admin(app, client)
    _cambiar_sesion(app, sid, actividad_en=_hace(minutes=25))
    inicial = _sesion_db_actividad(app, sid)
    assert _actividad(client, 0).get_json()["resultado"] == "registrada"
    assert client.post("/api/auth/logout", headers=_bearer(d)).status_code == 200
    s = _sesion_db(app, sid)
    assert _sesion_db_actividad(app, sid) > inicial and s["revocada_en"] is not None and s["motivo"] == "cierre"


def test_reporte_y_cierre_concurrentes_dejan_un_estado_coherente(app, client):
    """30 rondas con barrera y una variación aleatoria de 0–40 ms en cada lado: el reporte y el cierre compiten por la misma
    fila (PostgreSQL real). La invariante se comprueba en cada ronda, gane quien gane."""
    import random
    import time
    ordenes = {"reporte_primero": 0, "cierre_primero": 0}
    for _ in range(30):
        sid, d = _admin(app, client)
        refresh = _refresh_actual(client)
        _cambiar_sesion(app, sid, actividad_en=_hace(minutes=25))
        inicial = _sesion_db_actividad(app, sid)
        barrera, resultado = threading.Barrier(2), {}

        def reportar():
            c = app.test_client()
            c.set_cookie("cp_refresh", refresh, path="/api/auth")
            barrera.wait()
            time.sleep(random.uniform(0, 0.04))
            resultado["reporte"] = _actividad(c, 0)

        def cerrar():
            c = app.test_client()
            barrera.wait()
            time.sleep(random.uniform(0, 0.04))
            resultado["cierre"] = c.post("/api/auth/logout", headers=_bearer(d))

        hilos = [threading.Thread(target=reportar), threading.Thread(target=cerrar)]
        for h in hilos:
            h.start()
        for h in hilos:
            h.join()
        assert resultado["cierre"].status_code == 200
        s, actividad_final = _sesion_db(app, sid), _sesion_db_actividad(app, sid)
        assert s["revocada_en"] is not None and s["motivo"] == "cierre"  # nunca queda revocada como activa
        r = resultado["reporte"]
        if r.status_code == 200:
            assert r.get_json()["resultado"] == "registrada" and actividad_final > inicial
            ordenes["reporte_primero"] += 1
        else:
            assert r.status_code == 401 and _codigo(r) == "sesion_revocada" and actividad_final == inicial
            ordenes["cierre_primero"] += 1
    print(f"\n[concurrencia S2.4] órdenes observados: {ordenes}")


def test_un_reporte_no_revive_una_sesion_inactiva(app, client):
    sid, _ = _admin(app, client)
    _cambiar_sesion(app, sid, actividad_en=_hace(minutes=31))
    inicial = _sesion_db_actividad(app, sid)
    r = _actividad(client, 0)  # llega al servicio aunque la sesión esté inactiva, y el servicio la revoca
    assert r.status_code == 401 and _codigo(r) == "sesion_inactiva"
    assert _sesion_db(app, sid)["motivo"] == "inactividad" and _sesion_db_actividad(app, sid) == inicial


def test_generacion_no_aceptada_en_actividad_y_consulta_no_escribe(app, client):
    sid, usado, _ = _rotada(app, client)
    assert client.post("/api/auth/refresh").status_code == 200  # gen 3: `usado` (gen 1) es gen-2
    antes = _fila(app, sid)
    cuenta = _claims(app, _refresh_actual(client))["sub"]
    with app.app_context():
        futuro = create_refresh_token(cuenta, additional_claims={"tipo": "usuario", "sid": sid, "gen": 9})
    for token in (usado, futuro):
        client.set_cookie("cp_refresh", token, path="/api/auth")
        for r in (_actividad(client, 0), client.get("/api/auth/sesion")):
            assert r.status_code == 401 and _codigo(r) == "sesion_invalida"
    assert _fila(app, sid) == antes  # ni revoca ni escribe: la reutilización la juzga solo el refresh


def test_un_access_emitido_no_se_extiende_con_actividad_posterior(app, client):
    sid, _ = _admin(app, client)
    _cambiar_sesion(app, sid, actividad_en=_hace(minutes=20))
    r = client.post("/api/auth/refresh")
    viejo = r.get_json()["access_token"]
    exp_viejo = _claims(app, viejo)["exp"]
    assert abs(exp_viejo - (_sesion_db_actividad(app, sid) + timedelta(minutes=30)).timestamp()) <= 2  # ~10 min, no 15
    assert _actividad(client, 0).get_json()["resultado"] == "registrada"
    assert _claims(app, viejo)["exp"] == exp_viejo  # el token emitido conserva su vencimiento
    nuevo = client.post("/api/auth/refresh").get_json()["access_token"]
    assert abs(_claims(app, nuevo)["exp"] - (ahora() + timedelta(minutes=15)).timestamp()) <= 3


def test_el_cierre_de_una_sesion_inactiva_registra_inactividad(app, client):
    sid, d = _admin(app, client)
    _cambiar_sesion(app, sid, actividad_en=_hace(minutes=31))
    assert client.post("/api/auth/logout", headers=_bearer(d)).status_code == 200
    assert _sesion_db(app, sid)["motivo"] == "inactividad"


def test_reporte_sin_cambios_no_escribe(app, client):
    sid, _ = _admin(app, client)
    _cambiar_sesion(app, sid, actividad_en=_hace(minutes=25))
    assert _actividad(client, 0).get_json()["resultado"] == "registrada"
    antes = _fila(app, sid)
    r = _actividad(client, 5_000)  # interacción anterior a la ya registrada (p. ej. de otra pestaña)
    assert r.status_code == 200 and r.get_json()["resultado"] == "sin_cambios" and _fila(app, sid) == antes


def test_frontera_exacta_de_los_30_minutos(app, client):
    sid, d = _admin(app, client)
    _cambiar_sesion(app, sid, actividad_en=_hace(minutes=30) + timedelta(seconds=2))
    assert client.get("/api/auth/sesion").status_code == 200 and _yo(client, d["access_token"]).status_code == 200
    _cambiar_sesion(app, sid, actividad_en=_hace(minutes=30, seconds=1))
    for r in (client.get("/api/auth/sesion"), _yo(client, d["access_token"])):
        assert r.status_code == 401 and _codigo(r) == "sesion_inactiva"


def test_solo_cuatro_endpoints_omiten_la_inactividad_comun(app, client):
    """Recorre TODAS las rutas registradas: solo la lista cerrada deja pasar una sesión inactiva a su propia lógica."""
    import re

    from app.security.auth import ENDPOINTS_CON_INACTIVIDAD_PROPIA, motivo_rechazo_sesion
    assert ENDPOINTS_CON_INACTIVIDAD_PROPIA == {"auth.refresh", "auth.actividad", "auth.sesion", "auth.logout"}
    sid, d = _admin(app, client)
    _cambiar_sesion(app, sid, actividad_en=_hace(minutes=31))
    payload = _claims(app, d["access_token"])
    revisadas = 0
    for regla in app.url_map.iter_rules():
        if regla.endpoint == "static":
            continue
        ruta = re.sub(r"<(?:[^:>]+:)?[^>]+>", "1", regla.rule)
        metodo = sorted(regla.methods - {"HEAD", "OPTIONS"})[0]
        with app.test_request_context(ruta, method=metodo):
            from flask import request
            assert request.endpoint == regla.endpoint
            esperado = None if regla.endpoint in ENDPOINTS_CON_INACTIVIDAD_PROPIA else "sesion_inactiva"
            assert motivo_rechazo_sesion(payload) == esperado, regla.endpoint
        revisadas += 1
    assert revisadas > 100


@pytest.mark.parametrize("cambio, codigo", [("revocar", "sesion_revocada"), ("vencer", "sesion_expirada"),
                                            ("inactivar", "sesion_inactiva")])
def test_reporte_clasifica_bajo_bloqueo_un_cambio_posterior_a_la_validacion(app, client, monkeypatch, cambio, codigo):
    """La sesión cambia DESPUÉS de que la validación común la aceptó y ANTES de que el servicio bloquee la fila: la
    respuesta sale de la clasificación bajo `FOR UPDATE`, no de la validación común (M3)."""
    import app.security.auth as seguridad
    sid, _ = _admin(app, client)
    _cambiar_sesion(app, sid, actividad_en=_hace(minutes=25), creada=_hace(minutes=26))
    valores = {"revocar": {"revocada_en": ahora(), "motivo": "admin"},
               "vencer": {"expira_absoluta": _hace(minutes=1)},
               "inactivar": {"actividad_en": _hace(minutes=31)}}[cambio]
    original = seguridad.motivo_rechazo_sesion
    llegadas = []

    def valida_y_luego_cambia(payload):
        motivo = original(payload)  # la validación común ve la sesión vigente…
        llegadas.append(motivo)
        with db.engine.begin() as conn:  # …y otra conexión la cambia antes del bloqueo del servicio
            conn.execute(update(SesionAuth).where(SesionAuth.id == uuid.UUID(sid)).values(**valores))
        return motivo

    monkeypatch.setattr(seguridad, "motivo_rechazo_sesion", valida_y_luego_cambia)
    antes = _sesion_db_actividad(app, sid) if cambio != "inactivar" else None
    r = _actividad(client, 0)
    monkeypatch.undo()
    assert llegadas == [None]  # la validación común dejó pasar la solicitud: el rechazo lo produjo el servicio
    assert r.status_code == 401 and _codigo(r) == codigo
    s = _sesion_db(app, sid)
    if cambio == "revocar":
        assert s["motivo"] == "admin" and _sesion_db_actividad(app, sid) == antes  # ni pisa el motivo ni registra actividad
    elif cambio == "vencer":
        assert s["revocada_en"] is None and _sesion_db_actividad(app, sid) == antes  # rechazo sin escritura
    else:
        assert s["motivo"] == "inactividad"  # el servicio revoca la sesión que encontró inactiva bajo el bloqueo


def test_actividad_no_emite_tokens_ni_cambia_la_generacion(app, client):
    sid, _ = _admin(app, client)
    _cambiar_sesion(app, sid, actividad_en=_hace(minutes=25), creada=_hace(minutes=26))
    gen = _sesion_db(app, sid)["gen"]
    r = _actividad(client, 0)
    assert r.status_code == 200 and r.get_json()["resultado"] == "registrada"
    assert not r.headers.getlist("Set-Cookie") and "access_token" not in r.get_json()
    assert _sesion_db(app, sid)["gen"] == gen


def test_la_inactividad_prevalece_sobre_la_gracia(app, client):
    sid, usado, _ = _rotada(app, client)  # gen 2 recién emitida: `usado` (gen 1) estaría dentro de la gracia
    _cambiar_sesion(app, sid, actividad_en=_hace(minutes=31))
    client.set_cookie("cp_refresh", usado, path="/api/auth")
    r = client.post("/api/auth/refresh")
    assert r.status_code == 401 and _codigo(r) == "sesion_inactiva"
    assert _sesion_db(app, sid)["motivo"] == "inactividad"


# ---------------------------------------------------------------- S2.5 · revocación por credenciales y desactivación

ENTRADAS = {"personal": ("/api/auth/login", "finanzas@controlpro.mx"),
            "aprobador": ("/api/auth/portal/login", "aprobador@controlpro.mx"),
            "sucursal": ("/api/auth/portal/login", "empresa@demo.mx"),
            "tienda": ("/api/auth/cliente/login", "cliente@demo.mx")}
NUEVA = "NuevaClave2026"


def _dispositivo(app, tipo, password=PASSWORD):
    """Un navegador independiente (su propio cliente y cookie) con una sesión iniciada."""
    url, correo = ENTRADAS[tipo]
    c = app.test_client()
    r = c.post(url, json={"correo": correo, "password": password})
    assert r.status_code == 200, r.get_json()
    d = r.get_json()
    return {"c": c, "d": d, "sid": _claims(app, d["access_token"])["sid"]}


def _viva(disp):
    return _yo(disp["c"], disp["d"]["access_token"]).status_code == 200


def _muerta_en_todas_partes(disp):
    c = disp["c"]
    for r in (_yo(c, disp["d"]["access_token"]), c.post("/api/auth/refresh"), _actividad(c, 0), c.get("/api/auth/sesion")):
        assert r.status_code == 401 and _codigo(r) == "sesion_revocada", (r.request.path, r.get_json())


def _payload_usuario(admin, buscar, **cambios):
    u = next(x for x in admin.get("/api/admin/usuarios").get_json() if x["correo"] == buscar)
    return u["id"], {"correo": u["correo"], "nombre": u["nombre"], "rol": u["rol"]["codigo"],
                     "sucursales": [s["id"] for s in u["sucursales"]], "activo": u["activo"], **cambios}


def _id_cuenta(app, disp):
    return int(_claims(app, disp["d"]["access_token"])["sub"].split(":")[1])


@pytest.mark.parametrize("tipo", ["personal", "aprobador", "tienda"])
def test_cambio_propio_revoca_los_demas_dispositivos_y_conserva_el_actual(app, tipo):
    actual, otros = _dispositivo(app, tipo), [_dispositivo(app, tipo) for _ in range(2)]
    r = actual["c"].post("/api/auth/password", json={"actual": PASSWORD, "nueva": NUEVA},
                         headers=_bearer(actual["d"]))
    assert r.status_code == 200, r.get_json()
    for o in otros:
        _muerta_en_todas_partes(o)
        assert _sesion_db(app, o["sid"])["motivo"] == "password"
    assert _viva(actual) and actual["c"].post("/api/auth/refresh").status_code == 200  # la sesión actual sigue
    assert _sesion_db(app, actual["sid"])["revocada_en"] is None
    url, correo = ENTRADAS[tipo]
    assert app.test_client().post(url, json={"correo": correo, "password": NUEVA}).status_code == 200
    assert any(a.get("sesiones_revocadas") == 2 for a in _auditorias(app, "auth.password_cambiada"))


def test_la_sucursal_no_cambia_su_contrasena_ni_pierde_sesiones(app):
    a, b = _dispositivo(app, "sucursal"), _dispositivo(app, "sucursal")
    r = a["c"].post("/api/auth/password", json={"actual": PASSWORD, "nueva": NUEVA}, headers=_bearer(a["d"]))
    assert r.status_code == 403
    assert _viva(a) and _viva(b)


@pytest.mark.parametrize("tipo, tipo_token", [("personal", "usuario"), ("tienda", "cliente")])
def test_restablecer_revoca_todas_incluida_la_del_que_lo_pidio(app, tipo, tipo_token):
    disps = [_dispositivo(app, tipo) for _ in range(2)]
    c = disps[0]["c"]
    token = c.post("/api/auth/recuperar", json={"correo": ENTRADAS[tipo][1], "tipo": tipo_token}).get_json()["token_desarrollo"]
    assert c.post("/api/auth/restablecer", json={"token": token, "password": NUEVA}).status_code == 200
    for disp in disps:
        _muerta_en_todas_partes(disp)
        assert _sesion_db(app, disp["sid"])["motivo"] == "restablecimiento"
    assert any(a.get("sesiones_revocadas") == 2 for a in _auditorias(app, "auth.password_restablecida"))


@pytest.mark.parametrize("tipo, correo", [("personal", "finanzas@controlpro.mx"), ("aprobador", "aprobador@controlpro.mx")])
def test_admin_cambia_la_contrasena_de_un_usuario(app, tipo, correo):
    adm = _admin_dispositivo(app)
    objetivo, ajena = [_dispositivo(app, tipo) for _ in range(2)], _dispositivo(app, "tienda")
    uid, cuerpo_ = _payload_usuario(Api_(adm), correo, password=NUEVA)
    assert adm["c"].put(f"/api/admin/usuarios/{uid}", json=cuerpo_, headers=_bearer(adm["d"])).status_code == 200
    for o in objetivo:
        _muerta_en_todas_partes(o)
        assert _sesion_db(app, o["sid"])["motivo"] == "admin"
    assert _viva(adm) and _viva(ajena)  # ni el administrador ni otras cuentas pierden su sesión
    assert any(a.get("sesiones_revocadas") == 2 for a in _auditorias(app, "usuario.editar"))


class Api_:
    """Adaptador mínimo para `_payload_usuario` sobre un dispositivo del administrador."""
    def __init__(self, disp):
        self.disp = disp

    def get(self, url):
        return self.disp["c"].get(url, headers=_bearer(self.disp["d"]))


def _admin_dispositivo(app):
    c = app.test_client()
    d = _entrar(c, "/api/auth/login", "admin@controlpro.mx")
    return {"c": c, "d": d, "sid": _claims(app, d["access_token"])["sid"]}


def test_admin_cambia_la_contrasena_de_una_sucursal(app):
    adm, ajena = _admin_dispositivo(app), _dispositivo(app, "personal")
    suc = [_dispositivo(app, "sucursal") for _ in range(2)]
    cid = _id_cuenta(app, suc[0])
    r = adm["c"].post(f"/api/admin/cuentas-sucursal/{cid}/password", json={"password": NUEVA}, headers=_bearer(adm["d"]))
    assert r.status_code == 200, r.get_json()
    for s in suc:
        _muerta_en_todas_partes(s)
        assert _sesion_db(app, s["sid"])["motivo"] == "admin"
    assert _viva(adm) and _viva(ajena)
    assert any(a.get("sesiones_revocadas") == 2 for a in _auditorias(app, "sucursal_cliente.password"))


def test_desactivar_revoca_y_reactivar_no_restaura(app):
    adm = _admin_dispositivo(app)
    usu, suc = _dispositivo(app, "personal"), _dispositivo(app, "sucursal")
    uid, cuerpo_ = _payload_usuario(Api_(adm), "finanzas@controlpro.mx", activo=False)
    assert adm["c"].put(f"/api/admin/usuarios/{uid}", json=cuerpo_, headers=_bearer(adm["d"])).status_code == 200
    cid = _id_cuenta(app, suc)
    assert adm["c"].put(f"/api/admin/cuentas-sucursal/{cid}", json={"activo": False}, headers=_bearer(adm["d"])).status_code == 200
    for disp in (usu, suc):
        _muerta_en_todas_partes(disp)
        assert _sesion_db(app, disp["sid"])["motivo"] == "desactivacion"
    cuerpo_["activo"] = True
    adm["c"].put(f"/api/admin/usuarios/{uid}", json=cuerpo_, headers=_bearer(adm["d"]))
    adm["c"].put(f"/api/admin/cuentas-sucursal/{cid}", json={"activo": True}, headers=_bearer(adm["d"]))
    for disp in (usu, suc):
        _muerta_en_todas_partes(disp)  # reactivar no revive las sesiones anteriores
    assert _viva(_dispositivo(app, "personal")) and _viva(_dispositivo(app, "sucursal"))


def test_contrasena_y_desactivacion_juntas_registran_desactivacion(app):
    adm, usu = _admin_dispositivo(app), _dispositivo(app, "personal")
    uid, cuerpo_ = _payload_usuario(Api_(adm), "finanzas@controlpro.mx", activo=False, password=NUEVA)
    assert adm["c"].put(f"/api/admin/usuarios/{uid}", json=cuerpo_, headers=_bearer(adm["d"])).status_code == 200
    assert _sesion_db(app, usu["sid"])["motivo"] == "desactivacion"


def test_las_sesiones_ya_cerradas_conservan_su_motivo(app):
    adm = _admin_dispositivo(app)
    cerrada, inactiva_, viva = (_dispositivo(app, "personal") for _ in range(3))
    assert cerrada["c"].post("/api/auth/logout", headers=_bearer(cerrada["d"])).status_code == 200
    _cambiar_sesion(app, inactiva_["sid"], revocada_en=_hace(minutes=5), motivo="inactividad")
    antes = (_fila(app, cerrada["sid"]), _fila(app, inactiva_["sid"]))
    uid, cuerpo_ = _payload_usuario(Api_(adm), "finanzas@controlpro.mx", password=NUEVA)
    assert adm["c"].put(f"/api/admin/usuarios/{uid}", json=cuerpo_, headers=_bearer(adm["d"])).status_code == 200
    assert (_fila(app, cerrada["sid"]), _fila(app, inactiva_["sid"])) == antes  # mismo motivo y misma revocada_en
    assert _sesion_db(app, viva["sid"])["motivo"] == "admin"


def test_admin_que_cambia_su_propia_contrasena_conserva_su_sesion(app):
    adm, otro = _admin_dispositivo(app), _admin_dispositivo(app)
    uid, cuerpo_ = _payload_usuario(Api_(adm), "admin@controlpro.mx", password=NUEVA)
    assert adm["c"].put(f"/api/admin/usuarios/{uid}", json=cuerpo_, headers=_bearer(adm["d"])).status_code == 200
    assert _viva(adm)
    _muerta_en_todas_partes(otro)
    assert _sesion_db(app, otro["sid"])["motivo"] == "password"


def test_cambiar_el_correo_no_revoca_sesiones(app):
    adm, usu = _admin_dispositivo(app), _dispositivo(app, "personal")
    uid, cuerpo_ = _payload_usuario(Api_(adm), "finanzas@controlpro.mx", correo="finanzas2@controlpro.mx")
    assert adm["c"].put(f"/api/admin/usuarios/{uid}", json=cuerpo_, headers=_bearer(adm["d"])).status_code == 200
    assert _viva(usu) and _sesion_db(app, usu["sid"])["revocada_en"] is None


def test_un_fallo_antes_de_confirmar_no_cambia_ni_revoca_nada(app, monkeypatch):
    from app.services import auth_service
    actual, otro = _dispositivo(app, "personal"), _dispositivo(app, "personal")

    def auditoria_que_falla(*a, **k):
        raise RuntimeError("caída antes de confirmar")

    monkeypatch.setattr(auth_service, "auditar", auditoria_que_falla)
    r = actual["c"].post("/api/auth/password", json={"actual": PASSWORD, "nueva": NUEVA}, headers=_bearer(actual["d"]))
    monkeypatch.undo()
    assert r.status_code == 500
    assert _viva(otro) and _sesion_db(app, otro["sid"])["revocada_en"] is None
    assert app.test_client().post("/api/auth/login", json={"correo": "finanzas@controlpro.mx", "password": PASSWORD}).status_code == 200


def test_inicio_de_sesion_y_cambio_de_contrasena_concurrentes(app):
    """30 rondas con barrera y variación aleatoria: nunca queda viva una sesión abierta con la contraseña anterior."""
    import random
    import time
    cambiador = _dispositivo(app, "personal")
    uid = _id_cuenta(app, cambiador)
    resultados = {"rechazado_al_verificar": 0, "rechazado_al_crear_sesion": 0, "creada_y_revocada": 0}
    actual = PASSWORD
    for i in range(30):
        nueva = f"Rotada{i:02d}Clave"
        with app.app_context():  # sin bloqueos por intentos fallidos entre rondas
            db.session.execute(text("update usuario set intentos_fallidos = 0, bloqueado_hasta = null where id = :i"), {"i": uid})
            acceso_antes = db.session.execute(text("select ultimo_acceso from usuario where id = :i"), {"i": uid}).scalar()
            db.session.commit()
        barrera, res = threading.Barrier(2), {}

        def entrar():
            c = app.test_client()
            barrera.wait()
            time.sleep(random.uniform(0, 0.04))
            res["login"] = c.post("/api/auth/login", json={"correo": "finanzas@controlpro.mx", "password": actual})

        def cambiar():
            barrera.wait()
            time.sleep(random.uniform(0, 0.04))
            res["cambio"] = app.test_client().post("/api/auth/password", json={"actual": actual, "nueva": nueva},
                                                   headers=_bearer(cambiador["d"]))

        hilos = [threading.Thread(target=entrar), threading.Thread(target=cambiar)]
        for h in hilos:
            h.start()
        for h in hilos:
            h.join()
        assert res["cambio"].status_code == 200, res["cambio"].get_json()
        actual = nueva
        if res["login"].status_code == 200:
            sid = _claims(app, res["login"].get_json()["access_token"])["sid"]
            s = _sesion_db(app, sid)
            assert s["revocada_en"] is not None and s["motivo"] == "password"  # nunca queda viva
            resultados["creada_y_revocada"] += 1
        else:
            assert res["login"].status_code == 401
            with app.app_context():
                acceso_despues = db.session.execute(text("select ultimo_acceso from usuario where id = :i"), {"i": uid}).scalar()
            # si la contraseña se verificó (ultimo_acceso cambió) y aun así no hubo sesión, la frenó crear_sesion
            resultados["rechazado_al_crear_sesion" if acceso_despues != acceso_antes else "rechazado_al_verificar"] += 1
    with app.app_context():
        vivas = db.session.execute(text("select count(*) from sesion_auth where tipo_cuenta = 'usuario' and cuenta_id = :i "
                                        "and revocada_en is null and id <> :s"), {"i": uid, "s": cambiador["sid"]}).scalar()
    assert vivas == 0
    print(f"\n[concurrencia S2.5 login/cambio] {resultados}")


def test_renovacion_y_desactivacion_concurrentes(app):
    import random
    import time
    adm = _admin_dispositivo(app)
    uid, cuerpo_ = _payload_usuario(Api_(adm), "atencion@controlpro.mx", activo=False)
    resultados = {"refresh_200": 0, "refresh_401": 0}
    for _ in range(15):
        with app.app_context():
            db.session.execute(text("update usuario set activo = true where id = :i"), {"i": uid})
            db.session.commit()
        c = app.test_client()
        d = _entrar(c, "/api/auth/login", "atencion@controlpro.mx")
        sid = _claims(app, d["access_token"])["sid"]
        barrera, res = threading.Barrier(2), {}

        def renovar():
            barrera.wait()
            time.sleep(random.uniform(0, 0.04))
            res["refresh"] = c.post("/api/auth/refresh")

        def desactivar():
            barrera.wait()
            time.sleep(random.uniform(0, 0.04))
            res["des"] = app.test_client().put(f"/api/admin/usuarios/{uid}", json=cuerpo_, headers=_bearer(adm["d"]))

        hilos = [threading.Thread(target=renovar), threading.Thread(target=desactivar)]
        for h in hilos:
            h.start()
        for h in hilos:
            h.join()
        assert res["des"].status_code == 200
        assert _sesion_db(app, sid)["motivo"] == "desactivacion"
        if res["refresh"].status_code == 200:
            nuevo = res["refresh"].get_json()["access_token"]
            assert _yo(c, nuevo).status_code == 401  # lo emitido durante la carrera muere en su siguiente uso
            resultados["refresh_200"] += 1
        else:
            resultados["refresh_401"] += 1
    print(f"\n[concurrencia S2.5 refresh/desactivación] {resultados}")


def _suscribir_push(app, columna, cuenta_id, n):
    with app.app_context():
        for _ in range(n):
            db.session.execute(text(f"insert into push_suscripcion ({columna}, endpoint, p256dh, auth) "
                                    "values (:c, :e, 'p256', 'auth')"),
                               {"c": cuenta_id, "e": f"https://push.ejemplo/{uuid.uuid4()}"})
        db.session.commit()


def _push_de(app, columna, cuenta_id):
    with app.app_context():
        return db.session.execute(text(f"select count(*) from push_suscripcion where {columna} = :c"), {"c": cuenta_id}).scalar()


@pytest.mark.parametrize("evento", ["cambio_propio", "admin", "desactivacion", "restablecimiento"])
def test_revocar_por_credenciales_borra_las_suscripciones_push_de_la_cuenta(app, evento):
    adm, usu, ajena = _admin_dispositivo(app), _dispositivo(app, "personal"), _dispositivo(app, "tienda")
    uid, cid = _id_cuenta(app, usu), _id_cuenta(app, ajena)
    _suscribir_push(app, "usuario_id", uid, 2)
    _suscribir_push(app, "cliente_id", cid, 1)
    if evento == "cambio_propio":
        r = usu["c"].post("/api/auth/password", json={"actual": PASSWORD, "nueva": NUEVA}, headers=_bearer(usu["d"]))
    elif evento == "restablecimiento":
        token = usu["c"].post("/api/auth/recuperar", json={"correo": "finanzas@controlpro.mx", "tipo": "usuario"}).get_json()["token_desarrollo"]
        r = usu["c"].post("/api/auth/restablecer", json={"token": token, "password": NUEVA})
    else:
        cambios = {"password": NUEVA} if evento == "admin" else {"activo": False}
        _, cuerpo_ = _payload_usuario(Api_(adm), "finanzas@controlpro.mx", **cambios)
        r = adm["c"].put(f"/api/admin/usuarios/{uid}", json=cuerpo_, headers=_bearer(adm["d"]))
    assert r.status_code == 200, r.get_json()
    assert _push_de(app, "usuario_id", uid) == 0  # ningún dispositivo de la cuenta sigue recibiendo avisos
    assert _push_de(app, "cliente_id", cid) == 1  # las demás cuentas conservan los suyos


def test_un_fallo_antes_de_confirmar_conserva_las_suscripciones_push(app, monkeypatch):
    from app.services import auth_service
    usu = _dispositivo(app, "personal")
    uid = _id_cuenta(app, usu)
    _suscribir_push(app, "usuario_id", uid, 2)
    monkeypatch.setattr(auth_service, "auditar", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("caída")))
    r = usu["c"].post("/api/auth/password", json={"actual": PASSWORD, "nueva": NUEVA}, headers=_bearer(usu["d"]))
    monkeypatch.undo()
    assert r.status_code == 500 and _push_de(app, "usuario_id", uid) == 2  # todo o nada, también para push
