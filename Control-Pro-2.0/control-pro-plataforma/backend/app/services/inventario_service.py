"""Existencias, kardex y transferencias. Único módulo que modifica la tabla `inventario`.

Toda modificación bloquea la fila (`SELECT ... FOR UPDATE`) dentro de la transacción en curso, de modo que dos
operaciones simultáneas sobre la misma variante y sucursal se serializan y nunca producen saldos negativos.
"""
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from ..errors import AppError, Conflicto, NoEncontrado
from ..extensions import db
from ..models import (Incidencia, Inventario, MovimientoInventario, Sucursal, Transferencia, TransferenciaDetalle,
                      Variante)
from .comun import actor_ids, asignar_folio, auditar, cambiar_estado, notificar_personal

TRANSICIONES_TRANSFERENCIA = {
    "solicitada": {"autorizada", "cancelada"},
    "autorizada": {"enviada", "cancelada"},
    "enviada": {"recibida", "recibida_parcial"},
}


def bloquear(sucursal_id: int, variante_id: int) -> Inventario:
    db.session.execute(insert(Inventario).values(sucursal_id=sucursal_id, variante_id=variante_id, fisico=0,
                                                 reservado=0, comprometido=0, en_transito=0, minimo=5)
                       .on_conflict_do_nothing(index_elements=["sucursal_id", "variante_id"]))
    return db.session.scalars(
        select(Inventario).where(Inventario.sucursal_id == sucursal_id, Inventario.variante_id == variante_id)
        .with_for_update(of=Inventario).execution_options(populate_existing=True)
    ).one()


def bloquear_varios(pares: list[tuple[int, int]]) -> dict[tuple[int, int], Inventario]:
    """Bloquea en orden determinista (sucursal, variante) para evitar interbloqueos."""
    return {par: bloquear(*par) for par in sorted(set(pares))}


def movimiento(inv: Inventario, tipo: str, delta: int, motivo: str, referencia_tipo: str | None = None,
               referencia_id: int | None = None, clave: str | None = None) -> MovimientoInventario:
    if delta == 0:
        raise AppError("La cantidad del movimiento no puede ser cero.")
    nuevo = inv.fisico + delta
    if nuevo < 0:
        raise Conflicto("La existencia física quedaría negativa.",
                        detalles={"sucursal_id": inv.sucursal_id, "variante_id": inv.variante_id, "fisico": inv.fisico})
    if nuevo < inv.reservado + inv.comprometido:
        raise Conflicto("No se pueden retirar unidades reservadas o comprometidas con pedidos.",
                        detalles={"fisico": inv.fisico, "reservado": inv.reservado, "comprometido": inv.comprometido})
    inv.fisico = nuevo
    usuario_id, _ = actor_ids()
    mov = MovimientoInventario(sucursal_id=inv.sucursal_id, variante_id=inv.variante_id, tipo=tipo, cantidad=delta,
                               saldo_resultante=nuevo, motivo=motivo[:250], referencia_tipo=referencia_tipo,
                               referencia_id=referencia_id, usuario_id=usuario_id, clave_idempotencia=clave)
    db.session.add(mov)
    if inv.fisico - inv.reservado - inv.comprometido <= inv.minimo and delta < 0:
        notificar_personal("inventario.entrada", "existencia_baja", "inventario", inv.variante_id,
                           f"Existencia baja de {inv.variante.sku} en {inv.sucursal.nombre}: "
                           f"{inv.fisico - inv.reservado - inv.comprometido} disponibles.",
                           sucursal_id=inv.sucursal_id)
    return mov


def _ya_procesado(clave: str | None) -> MovimientoInventario | None:
    if not clave:
        return None
    return db.session.scalars(select(MovimientoInventario).where(MovimientoInventario.clave_idempotencia == clave)).first()


def _validar(sucursal_id: int, variante_id: int):
    suc = db.session.get(Sucursal, sucursal_id)
    var = db.session.get(Variante, variante_id)
    if not suc or not suc.activo:
        raise NoEncontrado("Sucursal no encontrada o inactiva.")
    if not var:
        raise NoEncontrado("Variante no encontrada.")
    return suc, var


def registrar_entrada(sucursal_id: int, variante_id: int, cantidad: int, motivo: str, clave: str | None = None):
    if cantidad <= 0:
        raise AppError("La cantidad de entrada debe ser mayor que cero.")
    previo = _ya_procesado(clave)
    if previo:
        return previo
    _validar(sucursal_id, variante_id)
    inv = bloquear(sucursal_id, variante_id)
    mov = movimiento(inv, "entrada", cantidad, motivo, "entrada", None, clave)
    db.session.flush()
    auditar("inventario.entrada", "inventario", variante_id, despues={"cantidad": cantidad, "motivo": motivo},
            sucursal_id=sucursal_id)
    db.session.commit()
    return mov


def registrar_ajuste(sucursal_id: int, variante_id: int, cantidad: int, tipo: str, motivo: str, clave: str | None = None):
    if tipo not in {"ajuste_positivo", "ajuste_negativo", "merma"}:
        raise AppError("Tipo de ajuste inválido.")
    if cantidad <= 0:
        raise AppError("Indica una cantidad positiva; el tipo define si suma o resta.")
    if not motivo or len(motivo.strip()) < 5:
        raise AppError("El motivo del ajuste es obligatorio (mínimo 5 caracteres).")
    previo = _ya_procesado(clave)
    if previo:
        return previo
    _validar(sucursal_id, variante_id)
    inv = bloquear(sucursal_id, variante_id)
    antes = inv.fisico
    delta = cantidad if tipo == "ajuste_positivo" else -cantidad
    mov = movimiento(inv, tipo, delta, motivo, "ajuste", None, clave)
    db.session.flush()
    auditar(f"inventario.{tipo}", "inventario", variante_id, antes={"fisico": antes}, despues={"fisico": inv.fisico,
            "motivo": motivo}, sucursal_id=sucursal_id)
    db.session.commit()
    return mov


def actualizar_minimo(sucursal_id: int, variante_id: int, minimo: int):
    if minimo < 0:
        raise AppError("El mínimo no puede ser negativo.")
    inv = bloquear(sucursal_id, variante_id)
    antes = inv.minimo
    inv.minimo = minimo
    auditar("inventario.minimo", "inventario", variante_id, {"minimo": antes}, {"minimo": minimo}, sucursal_id)
    db.session.commit()
    return inv


# ---------------------------------------------------------------- transferencias

def crear_transferencia(origen_id: int, destino_id: int, motivo: str, partidas: list[dict]) -> Transferencia:
    if origen_id == destino_id:
        raise AppError("El origen y el destino deben ser sucursales distintas.")
    for sid in (origen_id, destino_id):
        s = db.session.get(Sucursal, sid)
        if not s or not s.activo:
            raise NoEncontrado("Sucursal no encontrada o inactiva.")
    if not partidas:
        raise AppError("Agrega al menos una partida.")
    vistos = set()
    usuario_id, _ = actor_ids()
    t = Transferencia(origen_id=origen_id, destino_id=destino_id, motivo=motivo, solicitada_por=usuario_id,
                      estado="solicitada")
    for p in partidas:
        if p["variante_id"] in vistos:
            raise AppError("Hay variantes repetidas en la transferencia.")
        vistos.add(p["variante_id"])
        if not db.session.get(Variante, p["variante_id"]):
            raise NoEncontrado(f"Variante {p['variante_id']} no encontrada.")
        t.detalles.append(TransferenciaDetalle(variante_id=p["variante_id"], cantidad=p["cantidad"]))
    db.session.add(t)
    asignar_folio(t, "TRF")
    auditar("transferencia.crear", "transferencia", t.id, despues={"origen": origen_id, "destino": destino_id},
            sucursal_id=origen_id)
    notificar_personal("transferencia.autorizar", "transferencia_solicitada", "transferencia", t.id,
                       f"Transferencia {t.folio} solicitada; requiere autorización.", sucursal_id=origen_id)
    db.session.commit()
    return t


def obtener_transferencia_bloqueada(transferencia_id: int) -> Transferencia:
    t = db.session.scalars(select(Transferencia).where(Transferencia.id == transferencia_id).with_for_update(of=Transferencia)
                           .execution_options(populate_existing=True)).first()
    if not t:
        raise NoEncontrado("Transferencia no encontrada.")
    return t


def autorizar_transferencia(t: Transferencia):
    cambiar_estado(t, "transferencia", "autorizada", TRANSICIONES_TRANSFERENCIA)
    t.autorizada_por = actor_ids()[0]
    auditar("transferencia.autorizar", "transferencia", t.id, sucursal_id=t.origen_id)
    db.session.commit()
    return t


def cancelar_transferencia(t: Transferencia, motivo: str):
    cambiar_estado(t, "transferencia", "cancelada", TRANSICIONES_TRANSFERENCIA, motivo)
    t.observaciones = motivo
    auditar("transferencia.cancelar", "transferencia", t.id, despues={"motivo": motivo}, sucursal_id=t.origen_id)
    db.session.commit()
    return t


def enviar_transferencia(t: Transferencia, enviadas: dict[int, int]):
    """La salida descuenta en origen y deja las unidades en tránsito hacia el destino."""
    cambiar_estado(t, "transferencia", "enviada", TRANSICIONES_TRANSFERENCIA)
    pares = [(t.origen_id, d.variante_id) for d in t.detalles] + [(t.destino_id, d.variante_id) for d in t.detalles]
    invs = bloquear_varios(pares)
    total = 0
    for d in t.detalles:
        cant = enviadas.get(d.id, d.cantidad)
        if cant < 0 or cant > d.cantidad:
            raise AppError(f"Cantidad enviada inválida para {d.variante.sku}.")
        d.enviada = cant
        total += cant
        if cant:
            movimiento(invs[(t.origen_id, d.variante_id)], "transferencia_salida", -cant,
                       f"Salida por transferencia {t.folio}", "transferencia", t.id)
            invs[(t.destino_id, d.variante_id)].en_transito += cant
    if total == 0:
        raise AppError("Debe enviarse al menos una unidad.")
    t.enviada_por = actor_ids()[0]
    auditar("transferencia.enviar", "transferencia", t.id, despues={str(k): v for k, v in enviadas.items()},
            sucursal_id=t.origen_id)
    notificar_personal("transferencia.operar", "transferencia_enviada", "transferencia", t.id,
                       f"Transferencia {t.folio} en camino; confirma su recepción.", sucursal_id=t.destino_id)
    db.session.commit()
    return t


def recibir_transferencia(t: Transferencia, recibidas: dict[int, int], observaciones: str | None = None):
    pares = [(t.destino_id, d.variante_id) for d in t.detalles]
    invs = bloquear_varios(pares)
    faltantes = []
    for d in t.detalles:
        cant = recibidas.get(d.id, d.enviada)
        if cant < 0 or cant > d.enviada:
            raise AppError(f"La cantidad recibida de {d.variante.sku} no puede superar la enviada ({d.enviada}).")
        d.recibida = cant
        inv = invs[(t.destino_id, d.variante_id)]
        inv.en_transito -= d.enviada
        if cant:
            movimiento(inv, "transferencia_entrada", cant, f"Entrada por transferencia {t.folio}", "transferencia", t.id)
        if cant < d.enviada:
            faltantes.append(f"{d.variante.sku}: enviadas {d.enviada}, recibidas {cant}")
    nuevo = "recibida_parcial" if faltantes else "recibida"
    cambiar_estado(t, "transferencia", nuevo, TRANSICIONES_TRANSFERENCIA, observaciones)
    t.recibida_por = actor_ids()[0]
    t.observaciones = observaciones
    if faltantes:
        usuario_id, _ = actor_ids()
        inc = Incidencia(tipo="faltante_transferencia", prioridad="alta", transferencia_id=t.id,
                         sucursal_id=t.destino_id, descripcion="Diferencias al recibir: " + "; ".join(faltantes),
                         creado_por_usuario=usuario_id)
        db.session.add(inc)
        asignar_folio(inc, "INC")
    auditar("transferencia.recibir", "transferencia", t.id, despues={"estado": nuevo, "faltantes": faltantes},
            sucursal_id=t.destino_id)
    db.session.commit()
    return t
