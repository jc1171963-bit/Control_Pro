"""Notificaciones push: suscripción de dispositivos, envío tras confirmar la transacción y limpieza de vencidas."""
import json

import pytest
from sqlalchemy import func, select

from app.extensions import db
from app.models import Cliente, PushSuscripcion
from app.services import comun, push_service

SUB = {"endpoint": "https://fcm.googleapis.com/fcm/send/dispositivo-prueba-1",
       "keys": {"p256dh": "B" + "x" * 86, "auth": "a" * 22}}


class _Hilo:
    """Sustituye al hilo de envío para que la prueba sea determinista."""
    def __init__(self, target, args, **_):
        self.target, self.args = target, args

    def start(self):
        self.target(*self.args)


@pytest.fixture()
def enviados(app, monkeypatch):
    lista, codigos = [], {}

    def falso_webpush(info, datos, **kw):
        assert kw["vapid_claims"]["sub"].startswith("mailto:") and kw["ttl"] == 86400
        lista.append((info["endpoint"], json.loads(datos)))
        if info["endpoint"] in codigos:
            from pywebpush import WebPushException
            class R:  # noqa: E306
                status_code = codigos[info["endpoint"]]
            raise WebPushException("vencida", response=R())

    import pywebpush
    monkeypatch.setattr(pywebpush, "webpush", falso_webpush)
    monkeypatch.setattr(push_service.threading, "Thread", _Hilo)
    monkeypatch.setitem(app.config, "PUSH_ACTIVO", True)
    return lista, codigos


def test_clave_publica_vapid(client):
    clave = client.get("/api/push/clave").get_json()["clave"]
    assert len(clave) == 87 and "=" not in clave  # punto P-256 sin comprimir en base64url


def test_suscribir_probar_y_desuscribir(como, app, enviados):
    lista, _ = enviados
    aprob = como("aprobador")
    assert aprob.post("/api/push/suscripcion", json={"endpoint": "http://inseguro", "keys": SUB["keys"]}).status_code == 422
    assert aprob.post("/api/push/suscripcion", json=SUB).status_code == 201
    assert aprob.post("/api/push/suscripcion", json=SUB).status_code == 201  # idempotente
    assert aprob.post("/api/push/prueba").get_json()["dispositivos"] == 1
    assert lista[-1][0] == SUB["endpoint"] and lista[-1][1]["titulo"] == "LURIMA"
    # El mismo navegador pasa a la sesión de una sucursal: la suscripción cambia de dueño, no se duplica
    suc = como("empresa")
    assert suc.post("/api/push/suscripcion", json=SUB).status_code == 201
    with app.app_context():
        s = db.session.scalars(select(PushSuscripcion)).one()
        assert s.usuario_id is None and s.cliente_id is not None
    assert aprob.post("/api/push/prueba").get_json()["dispositivos"] == 0
    r = suc.c.delete("/api/push/suscripcion", json={"endpoint": SUB["endpoint"]}, headers=suc._h())
    assert r.status_code == 200
    with app.app_context():
        assert db.session.scalar(select(func.count()).select_from(PushSuscripcion)) == 0
    assert aprob.post("/api/push/suscripcion", json={}).status_code in (400, 422)
    assert como("cliente").c.post("/api/push/prueba").status_code == 401  # sin token


def test_aviso_solo_tras_commit_y_limpieza_de_vencidas(como, app, enviados):
    lista, codigos = enviados
    como("empresa").post("/api/push/suscripcion", json=SUB)
    otra = {**SUB, "endpoint": "https://updates.push.services.mozilla.com/wpush/v2/vencida"}
    como("empresa").post("/api/push/suscripcion", json=otra)
    codigos[otra["endpoint"]] = 410
    with app.app_context():
        cid = db.session.scalar(select(Cliente.id).where(Cliente.correo == "empresa@demo.mx"))
        # Una transacción revertida no manda nada
        comun.notificar_cliente(cid, "pedido_aprobado:999", "pedido", 999, "Se aprobó tu solicitud", "/cuenta/solicitudes/999")
        db.session.rollback()
        assert lista == []
        comun.notificar_cliente(cid, "pedido_aprobado:999", "pedido", 999, "Se aprobó tu solicitud", "/cuenta/solicitudes/999")
        assert lista == []  # todavía no se confirma
        db.session.commit()
        assert {e for e, _ in lista} == {SUB["endpoint"], otra["endpoint"]}
        datos = next(d for e, d in lista if e == SUB["endpoint"])
        assert datos == {"titulo": "Tu solicitud", "cuerpo": "Se aprobó tu solicitud", "url": "/cuenta/solicitudes/999",
                         "etiqueta": "pedido_aprobado:999"}
        # La vencida (410) se eliminó; la vigente sigue
        assert db.session.scalars(select(PushSuscripcion.endpoint)).all() == [SUB["endpoint"]]
        # Un aviso repetido (mismo evento) no vuelve a sonar
        lista.clear()
        comun.notificar_cliente(cid, "pedido_aprobado:999", "pedido", 999, "Se aprobó tu solicitud", "/cuenta/solicitudes/999")
        db.session.commit()
        assert lista == []


def test_aprobador_recibe_enlaces_de_su_portal(como, app, enviados):
    lista, _ = enviados
    como("aprobador").post("/api/push/suscripcion", json=SUB)
    with app.app_context():
        from app.services.colaboracion_service import notificar_aprobadores
        notificar_aprobadores("pedido_en_revision:777", "pedido", 777, "Nueva solicitud por revisar", "/admin/pedidos/777")
        db.session.commit()
    assert lista and lista[-1][1]["url"] == "/aprobador/pedidos/777" and lista[-1][1]["titulo"] == "Solicitud por revisar"
