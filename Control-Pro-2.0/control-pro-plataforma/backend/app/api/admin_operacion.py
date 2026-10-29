"""Pagos, reembolsos, devoluciones e incidencias (personal interno)."""
from flask import Blueprint, jsonify, request
from sqlalchemy import or_, select

from ..errors import AppError, NoEncontrado
from ..extensions import db
from ..models import Devolucion, Incidencia, Pago, Pedido, Reembolso, Usuario
from ..schemas import (AutorizarDevolucionSchema, CantidadesSchema, IncidenciaCambioSchema, IncidenciaSchema,
                       InspeccionSchema, MotivoSchema, NotaSchema, PagoEfectivoSchema, ReferenciaSchema, cargar)
from ..security.auth import es_global, filtro_sucursal, requiere_usuario, sucursales_permitidas, verificar_alcance
from ..services import devolucion_service as dev
from ..services import pago_service as pagos
from ..services import pedido_service as ped
from ..services.comun import paginar
from . import serial
from .admin_pedidos import _filtro_pedidos, _pedido
from .util import arg_int, cuerpo, int_keys, pagina

bp = Blueprint("admin_operacion", __name__, url_prefix="/api/admin")


def _ids_pedidos_visibles():
    return _filtro_pedidos(select(Pedido.id))


# ---------------------------------------------------------------- pagos

@bp.get("/pagos")
@requiere_usuario("pago.ver")
def lista_pagos():
    q = select(Pago).order_by(Pago.id.desc())
    if not es_global():
        q = q.where(Pago.pedido_id.in_(_ids_pedidos_visibles()))
    if estado := request.args.get("estado"):
        q = q.where(Pago.estado.in_(estado.split(",")))
    if metodo := request.args.get("metodo"):
        q = q.where(Pago.metodo == metodo)
    def s(p):
        d = serial.pago(p)
        d["pedido"] = {"id": p.pedido.id, "folio": p.pedido.folio, "total": serial.m(p.pedido.total),
                       "cliente": p.pedido.cliente.razon_social or p.pedido.cliente.nombre, "estado": p.pedido.estado}
        return d
    return jsonify(paginar(q, *pagina(), s))


def _pago(pid):
    p = pagos.bloquear_pago(pid)
    _pedido(p.pedido_id)  # valida alcance
    return p


@bp.post("/pagos/<int:pid>/validar")
@requiere_usuario("pago.validar")
def validar(pid):
    d = cargar(NotaSchema, cuerpo())
    return jsonify(serial.pago(pagos.validar(_pago(pid), d.get("nota"))))


@bp.post("/pagos/<int:pid>/rechazar")
@requiere_usuario("pago.validar")
def rechazar(pid):
    d = cargar(MotivoSchema, cuerpo())
    return jsonify(serial.pago(pagos.rechazar(_pago(pid), d["motivo"])))


@bp.post("/pedidos/<int:pedido_id>/efectivo")
@requiere_usuario("pago.registrar_efectivo")
def efectivo(pedido_id):
    d = cargar(PagoEfectivoSchema, cuerpo())
    p = _pedido(pedido_id, bloquear=True)
    if not p.sucursal_recoger_id:
        raise AppError("El pedido no es para recoger en sucursal.")
    verificar_alcance(p.sucursal_recoger_id)
    pago = pagos.registrar_efectivo(p, d["monto"], p.sucursal_recoger_id, d.get("referencia"), d["clave_idempotencia"])
    return jsonify(serial.pago(pago)), 201


@bp.get("/reembolsos")
@requiere_usuario("pago.ver")
def reembolsos():
    q = select(Reembolso).order_by(Reembolso.id.desc())
    if not es_global():
        q = q.where(Reembolso.pedido_id.in_(_ids_pedidos_visibles()))
    if estado := request.args.get("estado"):
        q = q.where(Reembolso.estado == estado)
    def s(r):
        d = serial.reembolso(r)
        p = db.session.get(Pedido, r.pedido_id)
        d["pedido"] = {"id": p.id, "folio": p.folio, "cliente": p.cliente.razon_social or p.cliente.nombre}
        return d
    return jsonify(paginar(q, *pagina(), s))


@bp.post("/reembolsos/<int:rid>/realizar")
@requiere_usuario("reembolso.autorizar")
def realizar(rid):
    d = cargar(ReferenciaSchema, cuerpo())
    r = pagos.bloquear_reembolso(rid)
    _pedido(r.pedido_id)
    return jsonify(serial.reembolso(pagos.realizar_reembolso(r, d["referencia"])))


# ---------------------------------------------------------------- devoluciones

@bp.get("/devoluciones")
@requiere_usuario("pedido.ver")
def devoluciones():
    q = select(Devolucion).order_by(Devolucion.id.desc())
    permitidas = sucursales_permitidas()
    if permitidas is not None:
        q = q.where(or_(Devolucion.sucursal_recibe_id.in_(permitidas or {-1}), Devolucion.pedido_id.in_(_ids_pedidos_visibles())))
    if estado := request.args.get("estado"):
        q = q.where(Devolucion.estado.in_(estado.split(",")))
    return jsonify(paginar(q, *pagina(), serial.devolucion))


def _dev(did, recibir=False):
    d = dev.bloquear_devolucion(did)
    if recibir:
        verificar_alcance(d.sucursal_recibe_id)
    else:
        _pedido(d.pedido_id)
    return d


@bp.get("/devoluciones/<int:did>")
@requiere_usuario("pedido.ver")
def devolucion(did):
    d = db.session.get(Devolucion, did)
    if not d:
        raise NoEncontrado("Devolución no encontrada.")
    if not es_global():
        verificar_alcance({d.sucursal_recibe_id, *ped.sucursales_de(d.pedido)})
    return jsonify(serial.devolucion(d))


@bp.post("/devoluciones/<int:did>/autorizar")
@requiere_usuario("devolucion.gestionar")
def autorizar(did):
    d = cargar(AutorizarDevolucionSchema, cuerpo())
    return jsonify(serial.devolucion(dev.autorizar(_dev(did), d["sucursal_id"], d.get("nota"))))


@bp.post("/devoluciones/<int:did>/rechazar")
@requiere_usuario("devolucion.gestionar")
def rechazar_dev(did):
    d = cargar(MotivoSchema, cuerpo())
    return jsonify(serial.devolucion(dev.rechazar(_dev(did), d["motivo"])))


@bp.post("/devoluciones/<int:did>/recibir")
@requiere_usuario("devolucion.recibir")
def recibir_dev(did):
    d = cargar(CantidadesSchema, cuerpo())
    return jsonify(serial.devolucion(dev.recibir(_dev(did, recibir=True), int_keys(d["cantidades"]), d.get("observaciones"))))


@bp.post("/devoluciones/<int:did>/inspeccionar")
@requiere_usuario("devolucion.recibir")
def inspeccionar(did):
    d = cargar(InspeccionSchema, cuerpo())
    try:
        resultados = {int(k): {"aptas": int(v.get("aptas", 0)), "merma": int(v.get("merma", 0))}
                      for k, v in d["resultados"].items()}
    except (TypeError, ValueError, AttributeError):
        raise AppError("Resultados de inspección inválidos.")
    return jsonify(serial.devolucion(dev.inspeccionar(_dev(did, recibir=True), resultados, d.get("nota"))))


@bp.post("/devoluciones/<int:did>/cerrar")
@requiere_usuario("devolucion.gestionar")
def cerrar_dev(did):
    d = cargar(NotaSchema, cuerpo())
    return jsonify(serial.devolucion(dev.cerrar(_dev(did), d.get("nota"))))


# ---------------------------------------------------------------- incidencias

@bp.get("/incidencias")
@requiere_usuario("incidencia.gestionar")
def incidencias():
    q = select(Incidencia).order_by(Incidencia.id.desc())
    permitidas = sucursales_permitidas()
    if permitidas is not None:
        q = q.where(or_(Incidencia.sucursal_id.in_(permitidas or {-1}), Incidencia.pedido_id.in_(_ids_pedidos_visibles())))
    if estado := request.args.get("estado"):
        q = q.where(Incidencia.estado.in_(estado.split(",")))
    if prioridad := request.args.get("prioridad"):
        q = q.where(Incidencia.prioridad == prioridad)
    return jsonify(paginar(q, *pagina(), serial.incidencia))


@bp.post("/incidencias")
@requiere_usuario("incidencia.gestionar")
def crear_incidencia():
    d = cargar(IncidenciaSchema, cuerpo())
    sucursal_id = None
    if d.get("pedido_id"):
        p = _pedido(d["pedido_id"])
        sucs = ped.sucursales_de(p)
        sucursal_id = next(iter(sucs)) if len(sucs) == 1 else None
    inc = dev.crear_incidencia(d["tipo"], d["descripcion"], d["prioridad"], d.get("pedido_id"), d.get("paquete_id"),
                               d.get("devolucion_id"), d.get("transferencia_id"), sucursal_id)
    return jsonify(serial.incidencia(inc)), 201


@bp.patch("/incidencias/<int:iid>")
@requiere_usuario("incidencia.gestionar")
def actualizar_incidencia(iid):
    d = cargar(IncidenciaCambioSchema, cuerpo())
    inc = db.session.scalars(select(Incidencia).where(Incidencia.id == iid).with_for_update()).first()
    if not inc:
        raise NoEncontrado("Incidencia no encontrada.")
    if inc.sucursal_id:
        verificar_alcance(inc.sucursal_id)
    elif inc.pedido_id:
        _pedido(inc.pedido_id)
    if d.get("responsable_id") and not db.session.get(Usuario, d["responsable_id"]):
        raise NoEncontrado("Responsable no encontrado.")
    return jsonify(serial.incidencia(dev.actualizar_incidencia(inc, d.get("estado"), d.get("comentario"), d.get("responsable_id"))))
