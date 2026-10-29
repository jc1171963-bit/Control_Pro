"""Inventario por sucursal, kardex, entradas, ajustes y transferencias."""
from flask import Blueprint, g, jsonify, request
from sqlalchemy import or_, select

from ..errors import AppError
from ..extensions import db
from ..models import Inventario, MovimientoInventario, Producto, Transferencia, Variante
from ..schemas import AjusteSchema, CantidadesSchema, EntradaSchema, MinimoSchema, MotivoSchema, TransferenciaSchema, cargar
from ..security.auth import filtro_sucursal, requiere_usuario, tiene_permiso, verificar_alcance
from ..services import inventario_service as inv
from ..services.comun import paginar
from . import serial
from .util import arg_int, cuerpo, int_keys, pagina

bp = Blueprint("admin_inventario", __name__, url_prefix="/api/admin")


@bp.get("/inventario")
@requiere_usuario("inventario.ver")
def inventario():
    q = select(Inventario).join(Variante).join(Producto).order_by(Producto.nombre, Variante.sku, Inventario.sucursal_id)
    if (sid := arg_int("sucursal_id")) is not None:
        verificar_alcance(sid)
        q = q.where(Inventario.sucursal_id == sid)
    cond = filtro_sucursal(Inventario.sucursal_id)
    if cond is not None:
        q = q.where(cond)
    if texto := request.args.get("q"):
        q = q.where(or_(Producto.nombre.ilike(f"%{texto}%"), Variante.sku.ilike(f"%{texto}%")))
    if request.args.get("bajo") in {"1", "true"}:
        q = q.where(Inventario.fisico - Inventario.reservado - Inventario.comprometido <= Inventario.minimo)
    return jsonify(paginar(q, *pagina(), serial.inventario))


@bp.get("/inventario/movimientos")
@requiere_usuario("inventario.ver")
def movimientos():
    q = select(MovimientoInventario).order_by(MovimientoInventario.id.desc())
    if (sid := arg_int("sucursal_id")) is not None:
        verificar_alcance(sid)
        q = q.where(MovimientoInventario.sucursal_id == sid)
    cond = filtro_sucursal(MovimientoInventario.sucursal_id)
    if cond is not None:
        q = q.where(cond)
    if (vid := arg_int("variante_id")) is not None:
        q = q.where(MovimientoInventario.variante_id == vid)
    if tipo := request.args.get("tipo"):
        q = q.where(MovimientoInventario.tipo == tipo)
    return jsonify(paginar(q, *pagina(), serial.movimiento))


@bp.post("/inventario/entradas")
@requiere_usuario("inventario.entrada")
def entrada():
    d = cargar(EntradaSchema, cuerpo())
    verificar_alcance(d["sucursal_id"])
    mov = inv.registrar_entrada(d["sucursal_id"], d["variante_id"], d["cantidad"], d["motivo"], d["clave_idempotencia"])
    return jsonify(serial.movimiento(mov)), 201


@bp.post("/inventario/ajustes")
@requiere_usuario("inventario.ajustar")
def ajuste():
    d = cargar(AjusteSchema, cuerpo())
    verificar_alcance(d["sucursal_id"])
    mov = inv.registrar_ajuste(d["sucursal_id"], d["variante_id"], d["cantidad"], d["tipo"], d["motivo"],
                               d["clave_idempotencia"])
    return jsonify(serial.movimiento(mov)), 201


@bp.put("/inventario/minimo")
@requiere_usuario("inventario.ajustar")
def minimo():
    d = cargar(MinimoSchema, cuerpo())
    verificar_alcance(d["sucursal_id"])
    return jsonify(serial.inventario(inv.actualizar_minimo(d["sucursal_id"], d["variante_id"], d["minimo"])))


# ---------------------------------------------------------------- transferencias

@bp.get("/transferencias")
@requiere_usuario("inventario.ver")
def transferencias():
    q = select(Transferencia).order_by(Transferencia.id.desc())
    cond_o, cond_d = filtro_sucursal(Transferencia.origen_id), filtro_sucursal(Transferencia.destino_id)
    if cond_o is not None:
        q = q.where(or_(cond_o, cond_d))
    if estado := request.args.get("estado"):
        q = q.where(Transferencia.estado == estado)
    return jsonify(paginar(q, *pagina(), serial.transferencia))


@bp.post("/transferencias")
@requiere_usuario("transferencia.solicitar")
def crear_transferencia():
    d = cargar(TransferenciaSchema, cuerpo())
    verificar_alcance([d["origen_id"], d["destino_id"]])
    try:
        partidas = [{"variante_id": int(p["variante_id"]), "cantidad": int(p["cantidad"])} for p in d["partidas"]]
    except (KeyError, TypeError, ValueError):
        raise AppError("Cada partida requiere variante_id y cantidad numéricos.")
    if any(p["cantidad"] <= 0 for p in partidas):
        raise AppError("Las cantidades deben ser mayores que cero.")
    t = inv.crear_transferencia(d["origen_id"], d["destino_id"], d["motivo"], partidas)
    return jsonify(serial.transferencia(t)), 201


def _transferencia(tid, lado: str):
    t = inv.obtener_transferencia_bloqueada(tid)
    verificar_alcance(t.origen_id if lado == "origen" else t.destino_id)
    return t


@bp.post("/transferencias/<int:tid>/autorizar")
@requiere_usuario("transferencia.autorizar")
def autorizar(tid):
    return jsonify(serial.transferencia(inv.autorizar_transferencia(_transferencia(tid, "origen"))))


@bp.post("/transferencias/<int:tid>/cancelar")
@requiere_usuario("transferencia.autorizar")
def cancelar(tid):
    d = cargar(MotivoSchema, cuerpo())
    return jsonify(serial.transferencia(inv.cancelar_transferencia(_transferencia(tid, "origen"), d["motivo"])))


@bp.post("/transferencias/<int:tid>/enviar")
@requiere_usuario("transferencia.operar")
def enviar(tid):
    d = cargar(CantidadesSchema, cuerpo())
    return jsonify(serial.transferencia(inv.enviar_transferencia(_transferencia(tid, "origen"), int_keys(d["cantidades"]))))


@bp.post("/transferencias/<int:tid>/recibir")
@requiere_usuario("transferencia.operar")
def recibir(tid):
    d = cargar(CantidadesSchema, cuerpo())
    t = _transferencia(tid, "destino")
    if t.estado != "enviada":
        from ..errors import TransicionInvalida
        raise TransicionInvalida("La transferencia no está en camino.")
    return jsonify(serial.transferencia(inv.recibir_transferencia(t, int_keys(d["cantidades"]), d.get("observaciones"))))
