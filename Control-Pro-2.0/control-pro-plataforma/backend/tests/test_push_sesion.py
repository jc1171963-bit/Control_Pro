"""H1.2: cada suscripción push queda ligada al sid de la sesión que la registró, y un endpoint solo cambia de sesión si es
el mismo navegador (mismas claves), la misma sesión, o la sesión anterior ya no es válida."""
import random
import threading
import time
import uuid
from datetime import timedelta

import pytest
from flask_jwt_extended import decode_token
from sqlalchemy import select, update

from app.api import push as push_api
from app.extensions import db
from app.models import PushSuscripcion, SesionAuth, ahora

ENDPOINT = "https://fcm.googleapis.com/fcm/send/dispositivo-h12"
CLAVES = {"p256dh": "B" + "x" * 86, "auth": "a" * 22}
OTRAS = {"p256dh": "B" + "y" * 86, "auth": "b" * 22}


def _sub(claves=CLAVES, endpoint=ENDPOINT):
    return {"endpoint": endpoint, "keys": claves}


def _sid(app, api):
    with app.app_context():
        return uuid.UUID(decode_token(api.token)["sid"])


def _fila(app, endpoint=ENDPOINT):
    with app.app_context():
        s = db.session.scalars(select(PushSuscripcion).where(PushSuscripcion.endpoint == endpoint)).first()
        return None if s is None else {c: getattr(s, c) for c in
                                       ("id", "usuario_id", "cliente_id", "sid", "p256dh", "auth", "agente", "creado")}


def _cambiar_sesion(app, sid, **valores):
    with app.app_context():
        db.session.execute(update(SesionAuth).where(SesionAuth.id == sid).values(**valores))
        db.session.commit()


def _fijar_sid(app, sid):
    with app.app_context():
        db.session.execute(update(PushSuscripcion).where(PushSuscripcion.endpoint == ENDPOINT).values(sid=sid))
        db.session.commit()


def test_registro_nuevo_guarda_el_sid_del_token(app, como):
    aprob = como("aprobador")
    assert aprob.post("/api/push/suscripcion", json=_sub()).status_code == 201
    f = _fila(app)
    assert f["sid"] == _sid(app, aprob) and f["usuario_id"] is not None and f["cliente_id"] is None


def test_sid_del_cliente_nunca_se_acepta(app, como):
    aprob = como("aprobador")
    falso = str(uuid.uuid4())
    r = aprob.post("/api/push/suscripcion", json={**_sub(), "sid": falso})
    assert r.status_code == 422 and _fila(app) is None  # el esquema rechaza el campo: no se escribe nada
    r = aprob.c.post("/api/push/suscripcion", json=_sub(), headers={**aprob._h(), "X-Sid": falso, "sid": falso})
    assert r.status_code == 201 and _fila(app)["sid"] == _sid(app, aprob)  # las cabeceras se ignoran


def test_misma_sesion_puede_actualizar_sus_claves(app, como):
    aprob = como("aprobador")
    aprob.post("/api/push/suscripcion", json=_sub())
    assert aprob.post("/api/push/suscripcion", json=_sub(OTRAS)).status_code == 201  # condición B
    f = _fila(app)
    assert (f["p256dh"], f["auth"], f["sid"]) == (OTRAS["p256dh"], OTRAS["auth"], _sid(app, aprob))


def test_mismo_navegador_pasa_a_otra_cuenta_con_las_mismas_claves(app, como):
    aprob, suc = como("aprobador"), como("empresa")
    aprob.post("/api/push/suscripcion", json=_sub())
    assert suc.post("/api/push/suscripcion", json=_sub()).status_code == 201  # condición A, con la anterior vigente
    f = _fila(app)
    assert f["sid"] == _sid(app, suc) and f["usuario_id"] is None and f["cliente_id"] is not None


def _anterior_invalida(app, como, invalidar):
    aprob, suc = como("aprobador"), como("empresa")
    aprob.post("/api/push/suscripcion", json=_sub())
    invalidar(_sid(app, aprob))
    assert suc.post("/api/push/suscripcion", json=_sub(OTRAS)).status_code == 201  # condición C, con otras claves
    f = _fila(app)
    assert (f["sid"], f["cliente_id"] is not None, f["p256dh"]) == (_sid(app, suc), True, OTRAS["p256dh"])


def test_reasigna_si_la_anterior_no_tiene_sid(app, como):
    _anterior_invalida(app, como, lambda sid: _fijar_sid(app, None))


def test_reasigna_si_la_sesion_anterior_fue_revocada(app, como):
    _anterior_invalida(app, como, lambda sid: _cambiar_sesion(app, sid, revocada_en=ahora(), motivo="cierre"))


def test_reasigna_si_la_sesion_anterior_vencio(app, como):
    _anterior_invalida(app, como, lambda sid: _cambiar_sesion(app, sid, expira_absoluta=ahora() - timedelta(seconds=1)))


def test_reasigna_si_la_sesion_anterior_esta_inactiva(app, como):
    limite = timedelta(minutes=app.config["SESION_INACTIVIDAD_MIN"])
    _anterior_invalida(app, como,
                       lambda sid: _cambiar_sesion(app, sid, actividad_en=ahora() - limite - timedelta(seconds=1)))


def test_una_sesion_inexistente_no_es_vigente(app):
    # La FK con ON DELETE CASCADE impide guardar un sid sin sesión; la regla se comprueba en la función que la decide.
    with app.app_context():
        assert push_api._sesion_vigente(uuid.uuid4()) is False
        assert push_api._sesion_vigente(None) is False


def test_conflicto_con_otra_sesion_vigente_no_cambia_nada(app, como):
    aprob, suc = como("aprobador"), como("empresa")
    aprob.c.post("/api/push/suscripcion", json=_sub(), headers={**aprob._h(), "User-Agent": "navegador-original"})
    antes = _fila(app)
    r = suc.c.post("/api/push/suscripcion", json=_sub(OTRAS), headers={**suc._h(), "User-Agent": "intruso"})
    assert r.status_code == 409 and r.get_json()["error"]["codigo"] == "suscripcion_en_uso"
    assert _fila(app) == antes  # dueño, sid, claves, agente y fecha intactos
    # Otra sesión de la misma cuenta con otras claves tampoco puede quitársela a una sesión vigente
    assert como("aprobador").post("/api/push/suscripcion", json=_sub(OTRAS)).status_code == 409
    assert _fila(app) == antes


def test_borrar_la_propia_y_no_la_de_otro_dueno(app, como):
    aprob, suc = como("aprobador"), como("empresa")
    aprob.post("/api/push/suscripcion", json=_sub())
    r = suc.c.delete("/api/push/suscripcion", json={"endpoint": ENDPOINT}, headers=suc._h())
    assert r.status_code == 200 and _fila(app) is not None  # de otro dueño: no se borra
    r = aprob.c.delete("/api/push/suscripcion", json={"endpoint": ENDPOINT}, headers=aprob._h())
    assert r.status_code == 200 and _fila(app) is None


@pytest.mark.parametrize("existente", ["sin_sid", "nueva"])
def test_dos_sesiones_concurrentes_no_se_apropian_del_endpoint(app, como, monkeypatch, existente):
    """PostgreSQL real, 15 rondas con barrera y una variación de 0–30 ms: dos sesiones vigentes con claves distintas
    compiten por el mismo endpoint (heredado sin sid, o todavía inexistente). Exactamente una gana; la otra recibe 409
    y el registro final es el de la ganadora."""
    reevaluaciones = []
    original = push_api._registrar

    def registrar(d, valores):
        resultado = original(d, valores)
        if resultado == "cambio":
            reevaluaciones.append(1)
        return resultado
    monkeypatch.setattr(push_api, "_registrar", registrar)

    for ronda in range(15):
        endpoint = f"{ENDPOINT}-{existente}-{ronda}"
        a, b = como("aprobador"), como("empresa")
        if existente == "sin_sid":
            como("cliente").post("/api/push/suscripcion", json=_sub({"p256dh": "B" + "z" * 86, "auth": "c" * 22}, endpoint))
            with app.app_context():
                db.session.execute(update(PushSuscripcion).where(PushSuscripcion.endpoint == endpoint).values(sid=None))
                db.session.commit()
        barrera, res = threading.Barrier(2), {}

        def enviar(nombre, api, claves):
            c = app.test_client()
            barrera.wait()
            time.sleep(random.uniform(0, 0.03))
            res[nombre] = c.post("/api/push/suscripcion", json=_sub(claves, endpoint), headers=api._h()).status_code

        hilos = [threading.Thread(target=enviar, args=("a", a, CLAVES)), threading.Thread(target=enviar, args=("b", b, OTRAS))]
        for h in hilos:
            h.start()
        for h in hilos:
            h.join()
        assert sorted(res.values()) == [201, 409], res
        ganador, claves = (a, CLAVES) if res["a"] == 201 else (b, OTRAS)
        f = _fila(app, endpoint)
        assert (f["sid"], f["p256dh"], f["auth"]) == (_sid(app, ganador), claves["p256dh"], claves["auth"])
    print(f"\n[{existente}] reevaluaciones por cambio concurrente: {len(reevaluaciones)} de 15 rondas")
