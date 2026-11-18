"""Suscripción de dispositivos a notificaciones push (navegador o app instalada) para cualquier cuenta con sesión."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt, jwt_required
from marshmallow import fields, validate
from sqlalchemy import func, select

from ..extensions import db
from ..models import PushSuscripcion
from ..schemas import Base, cargar
from ..security.auth import _cargar_cliente, _cargar_usuario
from ..services import push_service
from .util import cuerpo

bp = Blueprint("push", __name__, url_prefix="/api/push")


class _Claves(Base):
    p256dh = fields.Str(required=True, validate=validate.Length(min=20, max=200))
    auth = fields.Str(required=True, validate=validate.Length(min=8, max=100))


class SuscripcionSchema(Base):
    endpoint = fields.Url(required=True, schemes={"https"}, validate=validate.Length(max=1000))
    keys = fields.Nested(_Claves, required=True)
    expirationTime = fields.Raw(load_default=None, allow_none=True)


def _dueno():
    if get_jwt().get("tipo") == "usuario":
        return {"usuario_id": _cargar_usuario().id, "cliente_id": None}
    return {"usuario_id": None, "cliente_id": _cargar_cliente().id}


@bp.get("/clave")
def clave():
    """Clave pública VAPID que el navegador necesita para suscribirse."""
    return jsonify({"clave": push_service.clave_publica()})


@bp.post("/suscripcion")
@jwt_required()
def suscribir():
    d = cargar(SuscripcionSchema, cuerpo())
    dueno = _dueno()
    s = db.session.scalars(select(PushSuscripcion).where(PushSuscripcion.endpoint == d["endpoint"])).first()
    if not s:  # el mismo dispositivo puede pasar a otra cuenta (otra sesión en el mismo navegador)
        s = PushSuscripcion(endpoint=d["endpoint"])
        db.session.add(s)
    s.usuario_id, s.cliente_id = dueno["usuario_id"], dueno["cliente_id"]
    s.p256dh, s.auth = d["keys"]["p256dh"], d["keys"]["auth"]
    s.agente = (request.headers.get("User-Agent") or "")[:200]
    db.session.commit()
    return jsonify({"ok": True}), 201


@bp.delete("/suscripcion")
@jwt_required()
def desuscribir():
    endpoint = (cuerpo() or {}).get("endpoint")
    dueno = _dueno()
    db.session.query(PushSuscripcion).filter(PushSuscripcion.endpoint == endpoint,
                                             PushSuscripcion.usuario_id.is_not_distinct_from(dueno["usuario_id"]),
                                             PushSuscripcion.cliente_id.is_not_distinct_from(dueno["cliente_id"])).delete()
    db.session.commit()
    return jsonify({"ok": True})


@bp.post("/prueba")
@jwt_required()
def prueba():
    """Envía un aviso de prueba a los dispositivos de la propia cuenta."""
    dueno = _dueno()
    n = db.session.scalar(select(func.count()).select_from(PushSuscripcion).where(
        PushSuscripcion.usuario_id.is_not_distinct_from(dueno["usuario_id"]),
        PushSuscripcion.cliente_id.is_not_distinct_from(dueno["cliente_id"])))
    push_service.encolar(usuario_ids=[dueno["usuario_id"]] if dueno["usuario_id"] else [],
                         cliente_ids=[dueno["cliente_id"]] if dueno["cliente_id"] else [],
                         evento="prueba", mensaje="¡Listo! Así te llegarán los avisos de LURIMA en este dispositivo.", enlace="/")
    db.session.commit()
    return jsonify({"dispositivos": n})
