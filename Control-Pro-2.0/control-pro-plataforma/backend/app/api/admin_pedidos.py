"""Pedidos (consulta, aprobación corporativa, cancelación, cierre) y surtido por sucursal."""
from flask import Blueprint, jsonify, request
from sqlalchemy import or_, select

from ..errors import NoEncontrado
from ..extensions import db
from ..models import AsignacionSurtido, Cliente, Pedido
from ..schemas import (DecisionSchema, DespachoSchema, EntregaSucursalSchema, EventoSchema, MotivoSchema, NotaSchema,
                       PaqueteSchema, SurtidoSchema, cargar)
from ..security.auth import es_global, filtro_sucursal, requiere_usuario, sucursales_permitidas, verificar_alcance
from ..services import logistica_service as log
from ..services import pedido_service as ped
from ..services.comun import paginar
from . import serial
from .util import arg_int, cuerpo, pagina

bp = Blueprint("admin_pedidos", __name__, url_prefix="/api/admin")


def _filtro_pedidos(q):
    permitidas = sucursales_permitidas()
    if permitidas is None:
        return q
    ids = permitidas or {-1}
    return q.where(or_(Pedido.asignaciones.any(AsignacionSurtido.sucursal_id.in_(ids)), Pedido.sucursal_recoger_id.in_(ids)))


def _pedido(pedido_id, bloquear=False) -> Pedido:
    p = ped.bloquear_pedido(pedido_id) if bloquear else db.session.get(Pedido, pedido_id)
    if not p:
        raise NoEncontrado("Pedido no encontrado.")
    if not es_global():
        verificar_alcance(ped.sucursales_de(p) or None)
    return p


@bp.get("/pedidos")
@requiere_usuario("pedido.ver")
def pedidos():
    q = _filtro_pedidos(select(Pedido).join(Cliente).order_by(Pedido.id.desc()))
    if estado := request.args.get("estado"):
        q = q.where(Pedido.estado.in_(estado.split(",")))
    if canal := request.args.get("canal"):
        q = q.where(Pedido.canal == canal)
    if (sid := arg_int("sucursal_id")) is not None:
        verificar_alcance(sid)
        q = q.where(or_(Pedido.asignaciones.any(AsignacionSurtido.sucursal_id == sid), Pedido.sucursal_recoger_id == sid))
    if texto := request.args.get("q"):
        q = q.where(or_(Pedido.folio.ilike(f"%{texto}%"), Cliente.nombre.ilike(f"%{texto}%"),
                        Cliente.razon_social.ilike(f"%{texto}%"), Cliente.correo.ilike(f"%{texto}%")))
    if desde := request.args.get("desde"):
        q = q.where(Pedido.creado >= desde)
    if hasta := request.args.get("hasta"):
        q = q.where(Pedido.creado <= hasta + " 23:59:59")
    return jsonify(paginar(q, *pagina(), serial.pedido_resumen))


@bp.get("/pedidos/<int:pedido_id>")
@requiere_usuario("pedido.ver")
def pedido(pedido_id):
    return jsonify(serial.pedido(_pedido(pedido_id), interno=True))


@bp.post("/pedidos/<int:pedido_id>/decision")
@requiere_usuario("pedido.aprobar")
def decidir(pedido_id):
    d = cargar(DecisionSchema, cuerpo())
    p = _pedido(pedido_id, bloquear=True)
    ped.decidir_corporativo(p, d["decision"], d.get("motivo"), d["aceptar_excepciones"])
    return jsonify(serial.pedido(p, interno=True))


@bp.post("/pedidos/<int:pedido_id>/cancelar")
@requiere_usuario("pedido.cancelar")
def cancelar(pedido_id):
    d = cargar(MotivoSchema, cuerpo())
    p = _pedido(pedido_id, bloquear=True)
    ped.cancelar(p, d["motivo"], por_cliente=False)
    return jsonify(serial.pedido(p, interno=True))


@bp.post("/pedidos/<int:pedido_id>/cerrar")
@requiere_usuario("pedido.cerrar")
def cerrar(pedido_id):
    d = cargar(NotaSchema, cuerpo())
    p = _pedido(pedido_id, bloquear=True)
    ped.cerrar(p, d.get("nota"))
    return jsonify(serial.pedido(p, interno=True))


@bp.post("/pedidos/expirar-reservas")
@requiere_usuario("pedido.cancelar")
def expirar():
    return jsonify({"expirados": ped.expirar_reservas()})


# ---------------------------------------------------------------- surtido

@bp.get("/surtido")
@requiere_usuario("surtido.operar")
def asignaciones():
    q = select(AsignacionSurtido).join(Pedido).order_by(AsignacionSurtido.id.desc())
    cond = filtro_sucursal(AsignacionSurtido.sucursal_id)
    if cond is not None:
        q = q.where(cond)
    if (sid := arg_int("sucursal_id")) is not None:
        verificar_alcance(sid)
        q = q.where(AsignacionSurtido.sucursal_id == sid)
    estado = request.args.get("estado", "activas")
    if estado == "activas":
        q = q.where(AsignacionSurtido.estado.in_(["pendiente", "en_surtido", "empacada", "despachada"]),
                    Pedido.estado.notin_(["pendiente_pago", "pago_en_revision", "cancelado", "expirado"]))
    elif estado != "todas":
        q = q.where(AsignacionSurtido.estado == estado)
    return jsonify(paginar(q, *pagina(), lambda a: serial.asignacion(a, con_pedido=True)))


def _asig(aid, bloquear=True):
    a = log.bloquear_asignacion(aid) if bloquear else db.session.get(AsignacionSurtido, aid)
    if not a:
        raise NoEncontrado("Asignación no encontrada.")
    verificar_alcance(a.sucursal_id)
    return a


@bp.get("/surtido/<int:aid>")
@requiere_usuario("surtido.operar")
def asignacion(aid):
    return jsonify(serial.asignacion(_asig(aid, False), con_pedido=True))


@bp.post("/surtido/<int:aid>/iniciar")
@requiere_usuario("surtido.operar")
def iniciar(aid):
    return jsonify(serial.asignacion(log.iniciar_surtido(_asig(aid)), con_pedido=True))


@bp.post("/surtido/<int:aid>/registrar")
@requiere_usuario("surtido.operar")
def registrar(aid):
    d = cargar(SurtidoSchema, cuerpo())
    partidas = [{"asignacion_detalle_id": int(p["asignacion_detalle_id"]), "surtida": int(p.get("surtida", 0)),
                 "faltante": int(p.get("faltante", 0)), "motivo_faltante": p.get("motivo_faltante")} for p in d["partidas"]]
    return jsonify(serial.asignacion(log.registrar_surtido(_asig(aid), partidas), con_pedido=True))


@bp.post("/surtido/<int:aid>/paquetes")
@requiere_usuario("surtido.operar")
def paquete(aid):
    d = cargar(PaqueteSchema, cuerpo())
    partidas = [{"asignacion_detalle_id": int(p["asignacion_detalle_id"]), "cantidad": int(p["cantidad"])} for p in d["partidas"]]
    a = _asig(aid)
    log.crear_paquete(a, partidas, d.get("peso_kg"))
    return jsonify(serial.asignacion(a, con_pedido=True)), 201


def _paq(pid):
    p = log.bloquear_paquete(pid)
    verificar_alcance(p.asignacion.sucursal_id)
    return p


@bp.post("/paquetes/<int:pid>/despachar")
@requiere_usuario("surtido.operar")
def despachar(pid):
    d = cargar(DespachoSchema, cuerpo())
    p = log.despachar(_paq(pid), d["paqueteria"], d["guia"])
    return jsonify(serial.paquete(p))


@bp.post("/paquetes/<int:pid>/eventos")
@requiere_usuario("surtido.operar")
def evento(pid):
    d = cargar(EventoSchema, cuerpo())
    return jsonify(serial.paquete(log.registrar_evento(_paq(pid), d["estado"], d["descripcion"])))


@bp.post("/paquetes/<int:pid>/listo")
@requiere_usuario("surtido.operar")
def listo(pid):
    return jsonify(serial.paquete(log.listo_para_recoger(_paq(pid))))


@bp.post("/paquetes/<int:pid>/entregar")
@requiere_usuario("surtido.operar")
def entregar(pid):
    d = cargar(EntregaSucursalSchema, cuerpo())
    return jsonify(serial.paquete(log.entregar_en_sucursal(_paq(pid), d["recibio"], d["identificacion"])))
