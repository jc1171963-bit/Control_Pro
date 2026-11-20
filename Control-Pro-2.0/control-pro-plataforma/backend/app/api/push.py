"""Suscripción de dispositivos a notificaciones push (navegador o app instalada) para cualquier cuenta con sesión."""
import uuid

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt, jwt_required
from marshmallow import fields, validate
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from ..errors import Conflicto
from ..extensions import db
from ..models import PushSuscripcion, SesionAuth, ahora
from ..schemas import Base, cargar
from ..security.auth import _cargar_cliente, _cargar_usuario, inactiva
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


def _sesion_vigente(sid) -> bool:
    """Misma frontera que motivo_rechazo_sesion: existe, no revocada, dentro del tope absoluto y no inactiva."""
    s = db.session.get(SesionAuth, sid) if sid else None
    t = ahora()
    return s is not None and s.revocada_en is None and t <= s.expira_absoluta and not inactiva(s, t)


def _registrar(d: dict, valores: dict) -> str:
    """'ok', 'conflicto' (endpoint de otra sesión vigente) o 'cambio' (otra solicitud lo modificó; reevaluar)."""
    s = db.session.scalars(select(PushSuscripcion).where(PushSuscripcion.endpoint == d["endpoint"])).first()
    if not s:
        db.session.add(PushSuscripcion(endpoint=d["endpoint"], **valores))
        try:
            db.session.commit()
        except IntegrityError as e:
            db.session.rollback()
            if getattr(e.orig.diag, "constraint_name", None) != "push_suscripcion_endpoint_key":
                raise
            return "cambio"  # otra solicitud lo registró primero
        return "ok"
    # Se permite si es el mismo navegador (mismas claves), la misma sesión, o la sesión anterior ya no sirve.
    if (s.p256dh, s.auth) != (valores["p256dh"], valores["auth"]) and s.sid != valores["sid"] and _sesion_vigente(s.sid):
        db.session.rollback()
        return "conflicto"
    # Compare-and-set: solo si el registro sigue como se leyó; si otra solicitud lo cambió, la decisión ya no vale.
    r = db.session.execute(update(PushSuscripcion).where(
        PushSuscripcion.id == s.id, PushSuscripcion.sid.is_not_distinct_from(s.sid), PushSuscripcion.p256dh == s.p256dh,
        PushSuscripcion.auth == s.auth).values(**valores).execution_options(synchronize_session=False))
    if r.rowcount != 1:
        db.session.rollback()
        return "cambio"
    db.session.commit()
    return "ok"


@bp.post("/suscripcion")
@jwt_required()
def suscribir():
    d = cargar(SuscripcionSchema, cuerpo())
    # El sid sale solo del token ya validado; nunca del cuerpo ni de cabeceras.
    valores = {**_dueno(), "sid": uuid.UUID(get_jwt()["sid"]), "p256dh": d["keys"]["p256dh"],
               "auth": d["keys"]["auth"], "agente": (request.headers.get("User-Agent") or "")[:200]}
    for _ in range(3):
        resultado = _registrar(d, valores)
        if resultado != "cambio":
            break
    if resultado != "ok":
        raise Conflicto("Este dispositivo ya recibe avisos de otra sesión activa.", codigo="suscripcion_en_uso")
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
