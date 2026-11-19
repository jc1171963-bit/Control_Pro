"""Ajustes generales visibles en la interfaz (logo CNR) y "actividad": un pulso ligero para actualizar en vivo.

- GET /api/config/publica: lo que la interfaz necesita sin sesión (por ahora el logo CNR).
- POST/DELETE /api/admin/config/cnr-logo: lo sube quien administra las sucursales (aprobador o distribuidora).
- GET /api/actividad: avisos y mensajes no leídos con su marca más reciente. La interfaz la consulta cada pocos segundos
  mientras está visible y solo recarga las listas cuando algo cambió (más barato que recargar todo).
"""
import os

from flask import Blueprint, current_app, g, jsonify
from flask_jwt_extended import get_jwt, jwt_required
from sqlalchemy import func, select

from ..extensions import db
from ..models import Configuracion, Notificacion
from ..security.auth import _cargar_cliente, _cargar_usuario, requiere_usuario, tiene_permiso
from ..services import colaboracion_service as col
from ..services.comun import auditar
from . import serial

bp = Blueprint("configuracion", __name__)


def valor(clave: str, defecto=None):
    c = db.session.get(Configuracion, clave)
    return c.valor if c else defecto


@bp.get("/api/config/publica")
def publica():
    return jsonify({"cnr_logo": valor("cnr_logo")})


@bp.post("/api/admin/config/cnr-logo")
@requiere_usuario("cliente.gestionar")
def subir_logo_cnr():
    from .archivos import _guardar
    nombre = _guardar("publicos", {"png", "jpg", "jpeg", "webp"})
    _borrar(valor("cnr_logo"))
    c = db.session.get(Configuracion, "cnr_logo") or Configuracion(clave="cnr_logo")
    c.valor = f"/api/archivos/publicos/{nombre}"
    db.session.add(c)
    auditar("configuracion.cnr_logo", "configuracion", None, despues={"url": c.valor})
    db.session.commit()
    return jsonify({"cnr_logo": c.valor}), 201


@bp.delete("/api/admin/config/cnr-logo")
@requiere_usuario("cliente.gestionar")
def quitar_logo_cnr():
    c = db.session.get(Configuracion, "cnr_logo")
    if c:
        _borrar(c.valor)
        db.session.delete(c)
        auditar("configuracion.cnr_logo", "configuracion", None, despues={"url": None})
        db.session.commit()
    return jsonify({"cnr_logo": None})


def _borrar(url):
    if url and str(url).startswith("/api/archivos/publicos/"):
        ruta = os.path.join(current_app.config["UPLOAD_DIR"], "publicos", os.path.basename(url))
        if os.path.exists(ruta):
            os.remove(ruta)


@bp.get("/api/actividad")
@jwt_required()
def actividad():
    if get_jwt().get("tipo") == "usuario":
        u = _cargar_usuario()
        g.usuario = u
        filtro, kw = Notificacion.usuario_id == u.id, {"usuario": u}
        participa = col.es_aprobador(u) or tiene_permiso("orden.recibir")
    else:
        c = _cargar_cliente()
        filtro, kw = Notificacion.cliente_id == c.id, {"cliente": c}
        participa = c.tipo == "empresa"
    n_total, n_ultima = db.session.execute(select(func.count().filter(Notificacion.leida.is_(False)), func.max(Notificacion.id)).where(filtro)).one()
    datos = {"notificaciones": {"no_leidas": int(n_total or 0), "ultima": n_ultima}, "mensajes": None}
    if participa:
        sub = col.visibles(**kw).subquery()
        ultimo = db.session.scalar(select(func.max(sub.c.ultimo_mensaje_en)))
        datos["mensajes"] = {"no_leidos": col.total_no_leidos(**kw), "ultimo": serial.f(ultimo)}
    return jsonify(datos)
