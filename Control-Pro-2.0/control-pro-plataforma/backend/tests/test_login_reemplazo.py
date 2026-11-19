"""H1.9 (H-05): iniciar sesión o registrarse en un navegador revoca con motivo `reemplazo` la sesión que ese navegador
tenía (su cookie de refresh, con firma verificada) y borra sus suscripciones push, en la misma transacción que crea la
nueva. Los demás dispositivos no se tocan; una cookie ausente, inválida o vencida no revoca nada."""
import random
import time
import uuid
from datetime import timedelta
from threading import Barrier, Thread  # los reales: la fixture `enviados` sustituye Thread en el módulo

from flask_jwt_extended import create_access_token, create_refresh_token
from sqlalchemy import func, select

from app.extensions import db
from app.models import PushSuscripcion, SesionAuth
from app.services import auth_service, push_service

from .conftest import PASSWORD
from .test_push import enviados  # noqa: F401  (fixture: webpush simulado y envío sin hilo)
from .test_sesion_auth import ENTRADAS, _bearer, _claims, _codigo, _dispositivo, _sesion_db, _yo

CLAVES = {"p256dh": "B" + "x" * 86, "auth": "a" * 22}


def _entrar(c, tipo, password=PASSWORD):
    url, correo = ENTRADAS[tipo]
    return c.post(url, json={"correo": correo, "password": password})


def _sid(app, d):
    return _claims(app, d["access_token"])["sid"]


def _cookie(c):
    return c.get_cookie("cp_refresh", path="/api/auth").value


def _sub_de(app, d, nombre):
    """Suscripción ligada a la sesión de `d` (dueño según el token)."""
    claims = _claims(app, d["access_token"])
    dueno = {"usuario_id" if claims["tipo"] == "usuario" else "cliente_id": int(claims["sub"].split(":")[1])}
    endpoint = f"https://fcm.googleapis.com/fcm/send/{nombre}-{uuid.uuid4().hex[:8]}"
    with app.app_context():
        db.session.add(PushSuscripcion(endpoint=endpoint, sid=uuid.UUID(claims["sid"]), **dueno, **CLAVES))
        db.session.commit()
    return endpoint


def _existe(app, endpoint):
    with app.app_context():
        return db.session.scalar(select(func.count()).select_from(PushSuscripcion).where(PushSuscripcion.endpoint == endpoint)) == 1


def _revocadas(app):
    with app.app_context():
        return db.session.scalar(select(func.count()).select_from(SesionAuth).where(SesionAuth.revocada_en.is_not(None)))


def test_login_revoca_la_sesion_previa_del_navegador(app):
    """Invariantes 2 y 5: la sesión anterior del navegador queda revocada y sin suscripciones; la nueva, activa."""
    c = app.test_client()
    a = _entrar(c, "personal").get_json()
    sub_a = _sub_de(app, a, "a")
    r = _entrar(c, "tienda")  # otra cuenta en el mismo navegador
    assert r.status_code == 200
    previa, nueva = _sesion_db(app, _sid(app, a)), _sesion_db(app, _sid(app, r.get_json()))
    assert previa["motivo"] == "reemplazo" and previa["revocada_en"] is not None
    assert not _existe(app, sub_a)  # limpieza de H1.4 en la misma transacción
    assert nueva["revocada_en"] is None and _yo(c, r.get_json()["access_token"]).status_code == 200
    assert "reemplazo" not in r.get_data(as_text=True) and _sid(app, a) not in r.get_data(as_text=True)  # nada revela


def test_login_misma_cuenta_reemplaza_solo_la_sesion_del_navegador(app):
    """Invariante 4: otro dispositivo de la misma cuenta sigue autenticado y con su suscripción."""
    otro = _dispositivo(app, "personal")
    sub_otro = _sub_de(app, otro["d"], "otro")
    c = app.test_client()
    previa = _entrar(c, "personal").get_json()
    assert _entrar(c, "personal").status_code == 200
    assert _sesion_db(app, _sid(app, previa))["motivo"] == "reemplazo"
    assert _sesion_db(app, otro["sid"])["revocada_en"] is None and _yo(otro["c"], otro["d"]["access_token"]).status_code == 200
    assert _existe(app, sub_otro)


def test_login_sin_cookie_no_revoca_sesiones(app):
    otro = _dispositivo(app, "personal")
    antes = _revocadas(app)
    assert _entrar(app.test_client(), "personal").status_code == 200
    assert _revocadas(app) == antes and _sesion_db(app, otro["sid"])["revocada_en"] is None


def test_login_cookie_invalida_no_revoca_sesiones(app):
    """Firma alterada, basura, o un access token en lugar de un refresh: se ignoran."""
    victima = _dispositivo(app, "personal")
    valida = _cookie(victima["c"])
    alterada = valida[:-2] + ("AA" if valida[-2:] != "AA" else "BB")
    with app.app_context():
        acceso = create_access_token("u:1", additional_claims={"tipo": "usuario", "sid": victima["sid"], "gen": 1})
    antes = _revocadas(app)
    for cookie in (alterada, "no-es-un-jwt", "a.b.c", acceso):
        c = app.test_client()
        c.set_cookie("cp_refresh", cookie, path="/api/auth")
        assert _entrar(c, "tienda").status_code == 200
    assert _revocadas(app) == antes and _sesion_db(app, victima["sid"])["revocada_en"] is None


def test_login_cookie_vencida_no_revoca_sesiones(app):
    victima = _dispositivo(app, "personal")
    claims = _claims(app, victima["d"]["access_token"])
    with app.app_context():
        vencida = create_refresh_token(claims["sub"], expires_delta=timedelta(seconds=-60),
                                       additional_claims={"tipo": claims["tipo"], "sid": claims["sid"], "gen": 1})
    c = app.test_client()
    c.set_cookie("cp_refresh", vencida, path="/api/auth")
    assert _entrar(c, "tienda").status_code == 200
    assert _sesion_db(app, victima["sid"])["revocada_en"] is None


def test_cookie_de_otra_cuenta_que_no_corresponde_a_su_sesion_se_ignora(app):
    """Firma válida, pero el sid no es de la cuenta que dice la cookie: no se revoca nada."""
    victima = _dispositivo(app, "personal")
    with app.app_context():
        falsa = create_refresh_token("c:999999", additional_claims={"tipo": "cliente", "sid": victima["sid"], "gen": 1})
    c = app.test_client()
    c.set_cookie("cp_refresh", falsa, path="/api/auth")
    assert _entrar(c, "tienda").status_code == 200
    assert _sesion_db(app, victima["sid"])["revocada_en"] is None


def test_token_antiguo_rechazado_despues_del_reemplazo(app):
    """Invariante 2: el token de la sesión reemplazada ya no sirve, tampoco para registrar push (H-05)."""
    c = app.test_client()
    a = _entrar(c, "personal").get_json()
    assert _entrar(c, "tienda").status_code == 200
    r = _yo(c, a["access_token"])
    assert r.status_code == 401 and _codigo(r) == "sesion_revocada"
    r = c.post("/api/push/suscripcion", json={"endpoint": "https://fcm.googleapis.com/fcm/send/x", "keys": CLAVES},
               headers=_bearer(a))
    assert r.status_code == 401


def test_registro_reemplaza_la_sesion_anterior(app):
    c = app.test_client()
    a = _entrar(c, "tienda").get_json()
    r = c.post("/api/auth/cliente/registro", json={"correo": "nuevo.h19@demo.mx", "password": "Segura123", "nombre": "Nuevo H19"})
    assert r.status_code == 201
    assert _sesion_db(app, _sid(app, a))["motivo"] == "reemplazo"
    assert _sesion_db(app, _sid(app, r.get_json()))["revocada_en"] is None


def test_login_fallido_no_revoca_la_sesion_anterior(app):
    c = app.test_client()
    a = _entrar(c, "personal").get_json()
    sub_a = _sub_de(app, a, "a")
    assert _entrar(c, "tienda", password="Incorrecta123").status_code == 401
    assert _sesion_db(app, _sid(app, a))["revocada_en"] is None and _existe(app, sub_a)
    assert _yo(c, a["access_token"]).status_code == 200


def test_un_fallo_al_crear_la_sesion_nueva_no_confirma_la_revocacion(app, monkeypatch):
    """Revocación, limpieza y sesión nueva son una sola transacción: si algo falla antes del commit, nada queda."""
    c = app.test_client()
    a = _entrar(c, "personal").get_json()
    sub_a = _sub_de(app, a, "a")
    original = auth_service.Vigente.de
    monkeypatch.setattr(auth_service.Vigente, "de", classmethod(lambda cls, s: (_ for _ in ()).throw(RuntimeError("caída"))))
    r = _entrar(c, "tienda")
    monkeypatch.setattr(auth_service.Vigente, "de", original)
    assert r.status_code == 500
    assert _sesion_db(app, _sid(app, a))["revocada_en"] is None and _existe(app, sub_a)
    with app.app_context():  # ni sesión nueva a medias
        assert db.session.scalar(select(func.count()).select_from(SesionAuth).where(SesionAuth.revocada_en.is_(None))) == 1


def test_dos_logins_concurrentes_con_la_misma_cookie_no_dejan_estado_parcial(app):
    """PostgreSQL real, 10 rondas con barrera y 0–30 ms de variación: la sesión anterior se revoca una sola vez, cada login
    crea su sesión completa y ninguna suscripción queda ligada a la revocada."""
    for _ in range(10):
        c0 = app.test_client()
        previa = _entrar(c0, "personal").get_json()
        sub_previa = _sub_de(app, previa, "previa")
        cookie, barrera, res = _cookie(c0), Barrier(2), {}

        def entrar(nombre, tipo):
            c = app.test_client()
            c.set_cookie("cp_refresh", cookie, path="/api/auth")
            barrera.wait()
            time.sleep(random.uniform(0, 0.03))
            res[nombre] = _entrar(c, tipo)

        hilos = [Thread(target=entrar, args=("x", "tienda")), Thread(target=entrar, args=("y", "personal"))]
        for h in hilos:
            h.start()
        for h in hilos:
            h.join()
        assert [r.status_code for r in res.values()] == [200, 200]
        assert _sesion_db(app, _sid(app, previa))["motivo"] == "reemplazo" and not _existe(app, sub_previa)
        nuevas = {_sid(app, r.get_json()) for r in res.values()}
        assert len(nuevas) == 2 and all(_sesion_db(app, s)["revocada_en"] is None for s in nuevas)


def test_login_concurrente_con_registro_push_del_token_anterior(app, enviados):  # noqa: F811
    """PostgreSQL real, 10 rondas: el token anterior registra su endpoint mientras otro login lo reemplaza. Gane quien gane,
    la cuenta anterior nunca recibe avisos en ese navegador y la sesión nueva puede quedarse con el endpoint."""
    lista, _ = enviados
    ordenes = {"push_201": 0, "push_401": 0}
    for ronda in range(10):
        c = app.test_client()
        a = _entrar(c, "personal").get_json()
        uid = int(_claims(app, a["access_token"])["sub"].split(":")[1])
        sub = {"endpoint": f"https://fcm.googleapis.com/fcm/send/carrera-{ronda}", "keys": CLAVES}
        barrera, res = Barrier(2), {}

        def registrar():
            barrera.wait()
            time.sleep(random.uniform(0, 0.03))
            res["push"] = app.test_client().post("/api/push/suscripcion", json=sub, headers=_bearer(a))

        def reemplazar():
            barrera.wait()
            time.sleep(random.uniform(0, 0.03))
            res["login"] = _entrar(c, "tienda")

        hilos = [Thread(target=registrar), Thread(target=reemplazar)]
        for h in hilos:
            h.start()
        for h in hilos:
            h.join()
        assert res["login"].status_code == 200 and res["push"].status_code in (201, 401)
        ordenes["push_201" if res["push"].status_code == 201 else "push_401"] += 1
        assert _sesion_db(app, _sid(app, a))["motivo"] == "reemplazo"
        lista.clear()
        with app.app_context():  # una fila que quedara ligada a la sesión revocada no es entregable (H1.3)
            push_service.encolar(usuario_ids=[uid], evento="prueba", mensaje="x", enlace="/")
            db.session.execute(select(1))
            db.session.commit()
        assert [e for e, _ in lista if e == sub["endpoint"]] == []
        nueva = res["login"].get_json()
        assert c.post("/api/push/suscripcion", json=sub, headers=_bearer(nueva)).status_code == 201
        with app.app_context():
            fila = db.session.scalars(select(PushSuscripcion).where(PushSuscripcion.endpoint == sub["endpoint"])).one()
            assert str(fila.sid) == _sid(app, nueva) and fila.cliente_id is not None
    print(f"\n[H1.9 login/push concurrentes] {ordenes}")
