"""Notificaciones push (Web Push con claves VAPID) a los dispositivos suscritos de cada cuenta.

Cómo funciona:
- Cada aviso que el sistema ya registra (notificar_cliente / notificar_personal / notificar_aprobadores) también se
  ENCOLA como push en la sesión de base de datos.
- Solo si la transacción se confirma (after_commit) se envían, en un hilo aparte: una operación que se revierte nunca
  manda avisos y la respuesta al usuario no espera al servicio push del navegador.
- Las suscripciones que el servicio push da por vencidas (404/410) se eliminan solas.
- Claves VAPID: de VAPID_PRIVATE_KEY (PEM) o, si no hay, se generan una vez y se guardan en UPLOAD_DIR/.vapid.pem
  (en Docker es un volumen: sobreviven a los reinicios y las suscripciones siguen siendo válidas).
"""
import base64
import json
import logging
import os
import threading

from flask import current_app
from sqlalchemy import event, or_, select
from sqlalchemy.orm import Session

from ..extensions import db

log = logging.getLogger(__name__)
_cache: dict = {}
_candado = threading.Lock()

# Título de la notificación según el prefijo del evento (el primero que coincide).
TITULOS = [("mensaje", "Nuevo mensaje"), ("permiso_padron", "Permiso de padrón"), ("orden_aprobada", "Orden aprobada"),
           ("orden_expirada", "Orden expirada"), ("pedido_por_aprobar", "Solicitud por revisar"),
           ("pedido_en_revision", "Solicitud por revisar"), ("pedido_creado", "Nueva solicitud"),
           ("pedido_reenviado", "Solicitud reenviada"), ("pedido", "Tu solicitud"), ("paquete", "Envío"),
           ("envio", "Envío"), ("guia", "Envío"), ("incidencia", "Incidencia"), ("asignacion", "Surtido"),
           ("devolucion", "Devolución"), ("reembolso", "Reembolso"), ("pago", "Pago"), ("transferencia", "Transferencia"),
           ("existencia_baja", "Inventario")]


def _vapid():
    from cryptography.hazmat.primitives import serialization
    from py_vapid import Vapid01
    with _candado:
        if "v" in _cache:
            return _cache["v"], _cache["pub"]
        pem = current_app.config.get("VAPID_PRIVATE_KEY")
        if pem:
            v = Vapid01.from_pem(pem.replace("\\n", "\n").encode())
        else:
            ruta = os.path.join(current_app.config["UPLOAD_DIR"], ".vapid.pem")
            os.makedirs(os.path.dirname(ruta), exist_ok=True)
            if not os.path.exists(ruta):
                nueva = Vapid01()
                nueva.generate_keys()
                try:  # creación exclusiva: si otro proceso la creó primero, se usa la suya
                    fd = os.open(ruta, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                    with os.fdopen(fd, "wb") as fh:
                        fh.write(nueva.private_pem())
                except FileExistsError:
                    pass
            v = Vapid01.from_file(ruta)
        pub = v.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        _cache["v"], _cache["pub"] = v, base64.urlsafe_b64encode(pub).rstrip(b"=").decode()
        return _cache["v"], _cache["pub"]


def clave_publica() -> str:
    return _vapid()[1]


def titulo_de(evento: str) -> str:
    return next((t for prefijo, t in TITULOS if evento.startswith(prefijo)), "LURIMA")


def encolar(*, usuario_ids=(), cliente_ids=(), evento: str, mensaje: str, enlace: str | None):
    """Agrega un aviso push a la transacción en curso; se envía solo si la transacción se confirma."""
    if not current_app.config.get("PUSH_ACTIVO", True):
        return
    db.session.info.setdefault("push", []).append({
        "usuarios": list(usuario_ids), "clientes": list(cliente_ids), "titulo": titulo_de(evento), "cuerpo": mensaje[:240],
        "url": enlace or "/", "etiqueta": evento})


@event.listens_for(Session, "after_commit")
def _tras_confirmar(session):
    pendientes = session.info.pop("push", None)
    if not pendientes:
        return
    try:
        app = current_app._get_current_object()
    except RuntimeError:
        return
    threading.Thread(target=_enviar, args=(app, pendientes), daemon=True, name="push").start()


@event.listens_for(Session, "after_rollback")
def _tras_revertir(session):
    session.info.pop("push", None)


def _enviar(app, pendientes):
    from pywebpush import WebPushException, webpush

    from ..models import PushSuscripcion, Rol, Usuario
    with app.app_context():
        try:
            vapid, _ = _vapid()
            contacto = app.config.get("VAPID_CONTACTO") or "mailto:soporte@controlpro.mx"
            aprobadores = set(db.session.scalars(select(Usuario.id).join(Rol, Rol.id == Usuario.rol_id).where(Rol.codigo == "aprobador")))
            vencidas = []
            for p in pendientes:
                if not p["usuarios"] and not p["clientes"]:
                    continue
                subs = db.session.scalars(select(PushSuscripcion).where(or_(
                    PushSuscripcion.usuario_id.in_(p["usuarios"] or [-1]), PushSuscripcion.cliente_id.in_(p["clientes"] or [-1])))).all()
                for s in subs:
                    url = p["url"]
                    # Los avisos del personal enlazan a /admin; el aprobador trabaja en su propio portal.
                    if s.usuario_id in aprobadores and url.startswith("/admin"):
                        url = "/aprobador" + url[len("/admin"):]
                    datos = json.dumps({"titulo": p["titulo"], "cuerpo": p["cuerpo"], "url": url, "etiqueta": p["etiqueta"]})
                    try:
                        webpush({"endpoint": s.endpoint, "keys": {"p256dh": s.p256dh, "auth": s.auth}}, datos,
                                vapid_private_key=vapid, vapid_claims={"sub": contacto}, ttl=86400, timeout=10)
                    except WebPushException as e:
                        estado = getattr(e.response, "status_code", None)
                        if estado in (404, 410):
                            vencidas.append(s.id)
                        else:
                            log.warning("Push no enviado (%s): %s", estado, e)
                    except Exception as e:  # red, certificados: nunca debe tumbar el proceso
                        log.warning("Push no enviado: %s", e)
            if vencidas:
                db.session.query(PushSuscripcion).filter(PushSuscripcion.id.in_(vencidas)).delete(synchronize_session=False)
                db.session.commit()
        except Exception:
            log.exception("Fallo al enviar notificaciones push")
        finally:
            db.session.remove()
