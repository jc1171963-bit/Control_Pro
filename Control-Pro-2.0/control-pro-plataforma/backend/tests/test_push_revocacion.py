"""H1.4: al revocarse una sesión se borran, en la misma transacción, las suscripciones push de ESA sesión. Las demás
sesiones de la cuenta, la exceptuada (`excepto_sid`) y las demás cuentas conservan las suyas. Las heredadas sin sid solo
las borra la limpieza de S2.5 (revocación de todas las sesiones de una cuenta); nunca una revocación individual."""
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.extensions import db
from app.models import PushSuscripcion, ahora
from app.services import auth_service, push_service

from .conftest import PASSWORD
from .test_push import enviados  # noqa: F401  (fixture: webpush simulado y envío sin hilo)
from .test_sesion_auth import (NUEVA, Api_, _admin_dispositivo, _bearer, _cambiar_sesion, _codigo, _dispositivo,
                               _id_cuenta, _payload_usuario)

CLAVES = {"p256dh": "B" + "x" * 86, "auth": "a" * 22}


def _sub(app, disp, columna, nombre, sid="propio"):
    """Suscripción de la cuenta de `disp`, ligada a su sesión (o a `sid`, o sin sid con sid=None)."""
    endpoint = f"https://fcm.googleapis.com/fcm/send/{nombre}-{uuid.uuid4().hex[:8]}"
    with app.app_context():
        db.session.add(PushSuscripcion(endpoint=endpoint, sid=uuid.UUID(disp["sid"]) if sid == "propio" else sid,
                                       **{columna: _id_cuenta(app, disp)}, **CLAVES))
        db.session.commit()
    return endpoint


def _quedan(app):
    with app.app_context():
        return set(db.session.scalars(select(PushSuscripcion.endpoint)))


def _escenario(app):
    """Dos dispositivos de la misma cuenta del personal, una suscripción heredada y otra cuenta (tienda)."""
    a, b, ajena = _dispositivo(app, "personal"), _dispositivo(app, "personal"), _dispositivo(app, "tienda")
    return a, b, ajena, {"a": _sub(app, a, "usuario_id", "a"), "b": _sub(app, b, "usuario_id", "b"),
                         "historica": _sub(app, a, "usuario_id", "historica", sid=None),
                         "ajena": _sub(app, ajena, "cliente_id", "ajena")}


def test_cierre_de_sesion_borra_solo_las_de_esa_sesion(app):
    a, _, _, e = _escenario(app)
    assert a["c"].post("/api/auth/logout", headers=_bearer(a["d"])).status_code == 200
    assert _quedan(app) == {e["b"], e["historica"], e["ajena"]}  # otro sid, la sin sid y la otra cuenta intactas


def test_una_sesion_ya_revocada_no_provoca_mas_borrados(app):
    a, _, _, e = _escenario(app)
    _cambiar_sesion(app, a["sid"], revocada_en=ahora(), motivo="cierre")  # revocada antes, sin limpieza
    with app.app_context():
        auth_service.revocar_sesion(a["sid"])
    assert _quedan(app) == set(e.values())


@pytest.mark.parametrize("via", ["refresh", "actividad"])
def test_revocacion_por_inactividad_borra_las_de_esa_sesion(app, via):
    a, _, _, e = _escenario(app)
    limite = timedelta(minutes=app.config["SESION_INACTIVIDAD_MIN"])
    _cambiar_sesion(app, a["sid"], actividad_en=ahora() - limite - timedelta(seconds=1))
    r = a["c"].post("/api/auth/refresh") if via == "refresh" else a["c"].post("/api/auth/actividad", json={"inactivo_ms": 0})
    assert r.status_code == 401 and _codigo(r) == "sesion_inactiva"
    assert _quedan(app) == {e["b"], e["historica"], e["ajena"]}


def _reutilizar(app, disp):
    usado = disp["c"].get_cookie("cp_refresh", path="/api/auth").value
    assert disp["c"].post("/api/auth/refresh").status_code == 200  # gen 1 → 2
    _cambiar_sesion(app, disp["sid"], gen_emitida_en=ahora() - timedelta(seconds=app.config["REFRESH_GRACIA_SEG"] + 1))
    disp["c"].set_cookie("cp_refresh", usado, path="/api/auth")
    return disp["c"].post("/api/auth/refresh")


def test_reutilizacion_borra_las_de_la_sesion_revocada_y_conserva_las_demas(app):
    a, _, _, e = _escenario(app)
    r = _reutilizar(app, a)
    assert r.status_code == 401 and _codigo(r) == "sesion_revocada"
    assert _quedan(app) == {e["b"], e["historica"], e["ajena"]}  # la política revoca solo esa sesión


def test_si_la_revocacion_falla_no_se_confirma_la_limpieza(app, monkeypatch):
    a, _, _, e = _escenario(app)
    monkeypatch.setattr(auth_service, "auditar", lambda *x, **k: (_ for _ in ()).throw(RuntimeError("caída")))
    r = _reutilizar(app, a)  # el borrado se ejecutó antes de auditar, en la misma transacción
    monkeypatch.undo()
    assert r.status_code == 500
    assert _quedan(app) == set(e.values())  # ni revocación ni limpieza confirmadas
    with app.app_context():
        from app.models import SesionAuth
        assert db.session.get(SesionAuth, uuid.UUID(a["sid"])).revocada_en is None


def test_cambio_propio_conserva_la_suscripcion_de_la_sesion_actual(app, enviados):  # noqa: F811
    a, b, ajena, e = _escenario(app)
    r = a["c"].post("/api/auth/password", json={"actual": PASSWORD, "nueva": NUEVA}, headers=_bearer(a["d"]))
    assert r.status_code == 200, r.get_json()
    # La de b (revocada) y la heredada (limpieza S2.5) se van; la de la sesión exceptuada y la otra cuenta quedan
    assert _quedan(app) == {e["a"], e["ajena"]}
    with app.app_context():  # y la selección de H1.3 sigue enviando a la sesión conservada
        push_service.encolar(usuario_ids=[_id_cuenta(app, a)], evento="prueba", mensaje="x", enlace="/")
        db.session.execute(select(1))
        db.session.commit()
    assert {x for x, _ in enviados[0]} == {e["a"]}


@pytest.mark.parametrize("evento", ["restablecimiento", "admin", "desactivacion"])
def test_revocar_todas_las_sesiones_borra_todas_las_de_la_cuenta(app, evento):
    a, _, _, e = _escenario(app)
    if evento == "restablecimiento":
        token = a["c"].post("/api/auth/recuperar", json={"correo": "finanzas@controlpro.mx", "tipo": "usuario"}).get_json()["token_desarrollo"]
        r = a["c"].post("/api/auth/restablecer", json={"token": token, "password": NUEVA})
    else:
        adm = _admin_dispositivo(app)
        cambios = {"password": NUEVA} if evento == "admin" else {"activo": False}
        uid, cuerpo_ = _payload_usuario(Api_(adm), "finanzas@controlpro.mx", **cambios)
        r = adm["c"].put(f"/api/admin/usuarios/{uid}", json=cuerpo_, headers=_bearer(adm["d"]))
    assert r.status_code == 200, r.get_json()
    assert _quedan(app) == {e["ajena"]}  # sin excepción: todas las sesiones de la cuenta, y su heredada


def test_las_de_sesiones_revocadas_antes_no_entran_en_la_operacion(app):
    """revocar_sesiones_de_cuenta borra por las sesiones que revoca ahora; una ya revocada no forma parte de ella."""
    a, b, _, e = _escenario(app)
    _cambiar_sesion(app, b["sid"], revocada_en=ahora(), motivo="cierre")
    with app.app_context():
        n = auth_service.revocar_sesiones_de_cuenta("usuario", _id_cuenta(app, a), "admin")
        db.session.commit()
    assert n == 1 and _quedan(app) == {e["b"], e["ajena"]}
