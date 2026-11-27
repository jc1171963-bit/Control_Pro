"""Modo presentación (ver services/presentacion_service.py).

- POST /api/presentacion/vista   {ruta}            la interfaz avisa cada pantalla que abre la cuenta de presentación
- POST /api/presentacion/evento  {tipo, detalle}   intentos de captura, impresión, herramientas de desarrollador…
- GET  /api/admin/presentacion                     configuración vigente y bitácora (quien consulta auditoría)
- GET  /api/admin/presentacion/en-vivo             estado y actividad al momento (pantalla «Presentación en vivo»)
- POST /api/admin/presentacion/extender {minutos}  alarga la ventana en curso sin cambiar la contraseña
- POST /api/admin/presentacion/cerrar              termina la presentación ya y saca a la persona de todos lados

La cuenta de presentación nunca ve estas rutas de administración (aunque su rol tuviera el permiso).
"""
from flask import Blueprint, g, jsonify

from ..errors import NoEncontrado
from ..security.auth import requiere_usuario
from ..services import presentacion_service as pres
from .util import cuerpo

bp = Blueprint("presentacion", __name__)

EVENTOS = {"captura", "imprimir", "copiar", "herramientas", "fuera_de_ventana", "clic_derecho", "guardar"}


def _exigir_presentacion():
    if not pres.es_presentacion(g.usuario.id):
        raise NoEncontrado("No disponible.")


@bp.post("/api/presentacion/vista")
@requiere_usuario()
def vista():
    _exigir_presentacion()
    ruta = str((cuerpo() or {}).get("ruta") or "")[:200]
    pres.registrar("vista", {"ruta": ruta})
    return jsonify({"ok": True})


@bp.post("/api/presentacion/evento")
@requiere_usuario()
def evento():
    _exigir_presentacion()
    d = cuerpo() or {}
    tipo = str(d.get("tipo") or "")
    if tipo not in EVENTOS:
        tipo = "otro"
    pres.registrar(f"evento.{tipo}", {"detalle": str(d.get("detalle") or "")[:200]})
    return jsonify({"ok": True})


def _negar_a_presentacion():
    if pres.es_presentacion(g.usuario.id):
        raise NoEncontrado("No disponible.")


@bp.get("/api/admin/presentacion")
@requiere_usuario("auditoria.ver")
def ver():
    _negar_a_presentacion()
    c = pres.config()
    return jsonify({"presentacion": c, "vigente": bool(c) and pres.en_ventana(), "bitacora": pres.bitacora()})


@bp.get("/api/admin/presentacion/en-vivo")
@requiere_usuario("auditoria.ver")
def en_vivo():
    _negar_a_presentacion()
    return jsonify(pres.en_vivo())


@bp.post("/api/admin/presentacion/extender")
@requiere_usuario("usuario.gestionar")
def extender():
    _negar_a_presentacion()
    pres.extender((cuerpo() or {}).get("minutos"))
    v = pres.ventana_vigente()
    return jsonify({"hasta": v[1].isoformat() if v else None, "tipo": v[2] if v else None})


@bp.post("/api/admin/presentacion/cerrar")
@requiere_usuario("usuario.gestionar")
def cerrar():
    _negar_a_presentacion()
    u = pres.cerrar()
    return jsonify({"cerrada": bool(u)})

