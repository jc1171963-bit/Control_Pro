"""Aprobador corporativo y distribuidora: permisos de padrón de las sucursales y conversaciones (chat)."""
from flask import Blueprint, g, jsonify, request

from ..errors import SinPermiso
from ..schemas import ConversacionSchema, MensajeSchema, PermisoPadronDecisionSchema, cargar
from ..security.auth import canales_permitidos, requiere_usuario, tiene_permiso
from ..services import colaboracion_service as col
from ..services.comun import paginar
from .admin_sucursales import _sucursal
from .util import cuerpo, pagina

bp = Blueprint("admin_colaboracion", __name__, url_prefix="/api/admin")


# ---------------------------------------------------------------- permisos de padrón

@bp.get("/permisos-padron")
@requiere_usuario("permiso_padron.gestionar")
def permisos():
    consulta = col.consulta_permisos(request.args.get("estado"), request.args.get("q"))
    r = paginar(consulta, *pagina(), col.permiso_json)
    r["conteo"] = col.conteo_permisos()
    return jsonify(r)


@bp.post("/permisos-padron/<int:permiso_id>/decision")
@requiere_usuario("permiso_padron.gestionar")
def decidir_permiso(permiso_id):
    d = cargar(PermisoPadronDecisionSchema, cuerpo())
    return jsonify(col.permiso_json(col.resolver_permiso(permiso_id, d["decision"], d["respuesta"], d["horas"])))


@bp.get("/cuentas-sucursal/<int:cliente_id>/permiso-padron")
@requiere_usuario("cliente.ver")
def permiso_de_sucursal(cliente_id):
    if canales_permitidos() is not None:
        _sucursal(cliente_id)  # aprobador: 404 si no es una cuenta de sucursal (empresa)
    return jsonify(col.estado_padron(cliente_id))


# ---------------------------------------------------------------- conversaciones

def _participa():
    """Conversan el aprobador y la distribuidora (quien recibe las órdenes aprobadas)."""
    if not (col.es_aprobador(g.usuario) or tiene_permiso("orden.recibir")):
        raise SinPermiso("Tu rol no participa en las conversaciones con el aprobador.")


@bp.get("/conversaciones")
@requiere_usuario()
def conversaciones():
    _participa()
    return jsonify({"items": col.listar(usuario=g.usuario, tipo=request.args.get("tipo")),
                    "no_leidos": col.total_no_leidos(usuario=g.usuario)})


@bp.get("/conversaciones/no-leidos")
@requiere_usuario()
def conversaciones_no_leidos():
    _participa()
    return jsonify({"no_leidos": col.total_no_leidos(usuario=g.usuario)})


@bp.post("/conversaciones")
@requiere_usuario()
def abrir_conversacion():
    _participa()
    d = cargar(ConversacionSchema, cuerpo())
    c = col.abrir(d["tipo"], d["pedido_id"], d["cliente_id"], usuario=g.usuario)
    return jsonify(col.conversacion_json(c, col.lado_de(g.usuario)))


@bp.get("/conversaciones/<int:conversacion_id>/mensajes")
@requiere_usuario()
def mensajes(conversacion_id):
    _participa()
    c = col.obtener(conversacion_id, usuario=g.usuario)
    despues = request.args.get("despues", type=int)
    return jsonify({"conversacion": col.conversacion_json(c, col.lado_de(g.usuario)),
                    "items": col.mensajes(c, usuario=g.usuario, despues=despues)})


@bp.post("/conversaciones/<int:conversacion_id>/mensajes")
@requiere_usuario()
def enviar_mensaje(conversacion_id):
    _participa()
    c = col.obtener(conversacion_id, usuario=g.usuario)
    d = cargar(MensajeSchema, cuerpo())
    m = col.enviar(c, d["texto"], usuario=g.usuario)
    return jsonify(col.mensaje_json(m, col.lado_de(g.usuario))), 201
