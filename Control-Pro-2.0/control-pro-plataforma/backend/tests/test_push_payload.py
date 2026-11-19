"""H1.6: todo aviso push lleva el mismo payload genérico (sin datos de la operación) y TTL de 900 s. El detalle sigue en la
notificación interna de la app. Los datos sensibles que reciben las funciones de negocio nunca llegan al servicio push."""
import json

from sqlalchemy import select

from app.extensions import db
from app.models import Cliente, Notificacion
from app.services import comun, push_service
from app.services.colaboracion_service import notificar_aprobadores

from .test_push import SUB, enviados  # noqa: F401  (fixture: webpush simulado, TTL 900 comprobado en cada envío)

GENERICO = {"titulo": "LURIMA", "cuerpo": "Tienes un aviso nuevo. Abre LURIMA para verlo.", "etiqueta": "lurima-aviso"}
# Datos que hoy viajan en los mensajes de negocio: folios, razón social, dirección, motivos, texto de chat, montos, ids.
SENSIBLES = ["PAG-2026-0042", "PED-7781", "Distribuidora Ejemplo S.A. de C.V.", "Av. Siempre Viva 742", "faltó la firma",
             "hola, ¿me confirmas la talla?", "$1,250.00", "/cuenta/pedidos/9911", "/admin/pagos?id=77", "pago_rechazado_77"]
MENSAJE = " · ".join(SENSIBLES)


def _endpoint(nombre):
    return {**SUB, "endpoint": f"https://fcm.googleapis.com/fcm/send/{nombre}"}


def _sin_sensibles(lista):
    crudo = json.dumps([d for _, d in lista], ensure_ascii=False)
    return [s for s in SENSIBLES if s in crudo]


def test_el_payload_unico_por_bandeja_y_el_ttl():
    for bandeja, url in (("cliente", "/cuenta/notificaciones"), ("personal", "/admin/notificaciones"),
                         ("aprobador", "/aprobador/notificaciones")):
        assert json.loads(push_service.payload(bandeja)) == {**GENERICO, "url": url}
    assert push_service.TTL_SEG == 900


def test_las_funciones_de_negocio_envian_solo_el_aviso_generico(como, app, enviados):  # noqa: F811
    lista, _ = enviados
    cliente, personal, aprob = _endpoint("cliente"), _endpoint("personal"), _endpoint("aprobador")
    assert como("empresa").post("/api/push/suscripcion", json=cliente).status_code == 201
    assert como("admin").post("/api/push/suscripcion", json=personal).status_code == 201
    assert como("aprobador").post("/api/push/suscripcion", json=aprob).status_code == 201
    with app.app_context():
        cid = db.session.scalar(select(Cliente.id).where(Cliente.correo == "empresa@demo.mx"))
        comun.notificar_cliente(cid, "pago_rechazado_77", "pago", 77, MENSAJE, "/cuenta/pedidos/9911")
        db.session.commit()
        assert [e for e, _ in lista] == [cliente["endpoint"]]  # solo la cuenta destinataria (separación intacta)
        comun.notificar_personal("pago.validar", "pago_por_validar_77", "pago", 77, MENSAJE, enlace="/admin/pagos?id=77")
        db.session.commit()
        notificar_aprobadores("mensaje_nuevo", "mensaje", 77, MENSAJE, enlace="/aprobador/mensajes?c=77")
        db.session.commit()
        # El detalle sí queda en la notificación interna de la app
        assert db.session.scalar(select(Notificacion.mensaje).where(Notificacion.cliente_id == cid)) == MENSAJE[:300]
    destinos = {e: d for e, d in lista}
    assert destinos == {cliente["endpoint"]: {**GENERICO, "url": "/cuenta/notificaciones"},
                        personal["endpoint"]: {**GENERICO, "url": "/admin/notificaciones"},
                        aprob["endpoint"]: {**GENERICO, "url": "/aprobador/notificaciones"}}
    assert _sin_sensibles(lista) == []


def test_encolar_ignora_cualquier_dato_del_llamador(como, app, enviados):  # noqa: F811
    lista, _ = enviados
    como("empresa").post("/api/push/suscripcion", json=SUB)
    with app.app_context():
        cid = db.session.scalar(select(Cliente.id).where(Cliente.correo == "empresa@demo.mx"))
        push_service.encolar(cliente_ids=[cid], evento="pago_rechazado_77", mensaje=MENSAJE, enlace="/cuenta/pedidos/9911")
        assert db.session.info["push"] == [{"usuarios": [], "clientes": [cid]}]  # ni siquiera se guardan
        db.session.commit()
    assert [d for _, d in lista] == [{**GENERICO, "url": "/cuenta/notificaciones"}] and _sin_sensibles(lista) == []


def test_el_aviso_de_prueba_usa_la_misma_construccion(como, enviados):  # noqa: F811
    lista, _ = enviados
    for quien, url in (("empresa", "/cuenta/notificaciones"), ("admin", "/admin/notificaciones"),
                       ("aprobador", "/aprobador/notificaciones")):
        api = como(quien)
        assert api.post("/api/push/suscripcion", json=_endpoint(quien)).status_code == 201
        lista.clear()
        assert api.post("/api/push/prueba").get_json()["dispositivos"] == 1
        assert [d for _, d in lista] == [json.loads(push_service.payload(
            {"empresa": "cliente", "admin": "personal", "aprobador": "aprobador"}[quien]))]
        assert lista[0][1]["url"] == url
