"""Pagos manuales con validación y reembolsos.

Un pago solo queda `confirmado` cuando lo valida una persona con el permiso `pago.validar` (o lo registra en caja
alguien con `pago.registrar_efectivo`). No existe confirmación automática mientras no haya una pasarela integrada.
"""
from decimal import Decimal

from sqlalchemy import select

from ..errors import AppError, Conflicto, NoEncontrado, TransicionInvalida
from ..extensions import db
from ..models import Devolucion, Pago, Pedido, Reembolso, ahora
from . import pedido_service as ped
from .comun import actor_ids, asignar_folio, auditar, cambiar_estado, dinero, notificar_cliente, notificar_personal

TRANSICIONES_PAGO = {
    "pendiente": {"en_proceso", "confirmado", "cancelado"},
    "en_proceso": {"confirmado", "rechazado", "cancelado"},
    "confirmado": {"reembolsado_parcial", "reembolsado"},
    "reembolsado_parcial": {"reembolsado"},
}


def bloquear_pago(pago_id: int) -> Pago:
    p = db.session.scalars(select(Pago).where(Pago.id == pago_id).with_for_update(of=Pago)
                           .execution_options(populate_existing=True)).first()
    if not p:
        raise NoEncontrado("Pago no encontrado.")
    return p


def _confirmado(pedido: Pedido) -> Decimal:
    return sum((p.monto for p in pedido.pagos if p.estado in {"confirmado", "reembolsado_parcial", "reembolsado"}),
               Decimal("0.00"))


def saldo(pedido: Pedido) -> Decimal:
    return dinero(pedido.total - _confirmado(pedido))


def _existente(clave: str | None):
    if not clave:
        return None
    return db.session.scalars(select(Pago).where(Pago.clave_idempotencia == clave)).first()


def registrar_transferencia(pedido: Pedido, referencia: str, comprobante_url: str | None, clave: str | None):
    previo = _existente(clave)
    if previo:
        return previo
    if pedido.metodo_pago != "transferencia":
        raise AppError("Este pedido no se paga por transferencia.")
    if pedido.estado != "pendiente_pago":
        raise TransicionInvalida("El pedido no está pendiente de pago.")
    if not referencia or len(referencia.strip()) < 4:
        raise AppError("Captura la referencia o clave de rastreo de la transferencia.")
    _, cliente_id = actor_ids()
    pago = Pago(pedido_id=pedido.id, metodo="transferencia", estado="en_proceso", monto=saldo(pedido),
                referencia=referencia.strip(), comprobante_url=comprobante_url, registrado_por_cliente=cliente_id,
                clave_idempotencia=clave)
    db.session.add(pago)
    asignar_folio(pago, "PAG")
    ped.transicionar(pedido, "pago_en_revision", f"Transferencia registrada ({pago.folio})")
    auditar("pago.registrar", "pago", pago.id, despues={"pedido": pedido.folio, "monto": pago.monto})
    notificar_personal("pago.validar", "pago_por_validar", "pago", pago.id,
                       f"Pago {pago.folio} de {pedido.folio} por validar.", enlace="/admin/pagos")
    db.session.commit()
    return pago


def registrar_efectivo(pedido: Pedido, monto: Decimal, sucursal_id: int, referencia: str | None, clave: str | None):
    previo = _existente(clave)
    if previo:
        return previo
    if pedido.estado != "pendiente_pago":
        raise TransicionInvalida("El pedido no está pendiente de pago.")
    if pedido.metodo_pago != "efectivo":
        raise AppError("Este pedido no se paga en efectivo.")
    if pedido.sucursal_recoger_id != sucursal_id:
        raise AppError("El efectivo se cobra en la sucursal donde se recoge el pedido.")
    if dinero(monto) != saldo(pedido):
        raise AppError(f"El monto debe ser exactamente el saldo del pedido ({saldo(pedido)}).")
    usuario_id, _ = actor_ids()
    pago = Pago(pedido_id=pedido.id, metodo="efectivo", estado="confirmado", monto=dinero(monto), referencia=referencia,
                sucursal_id=sucursal_id, registrado_por_usuario=usuario_id, validado_por=usuario_id,
                validado_en=ahora(), clave_idempotencia=clave)
    db.session.add(pago)
    asignar_folio(pago, "PAG")
    ped.confirmar(pedido, f"Cobro en efectivo {pago.folio}")
    auditar("pago.efectivo", "pago", pago.id, despues={"pedido": pedido.folio, "monto": pago.monto}, sucursal_id=sucursal_id)
    db.session.commit()
    return pago


def validar(pago: Pago, nota: str | None = None):
    if pago.metodo == "credito_corporativo":
        if pago.estado != "pendiente":
            raise TransicionInvalida("El crédito ya fue cobrado o cancelado.")
        if not nota or len(nota.strip()) < 4:
            raise AppError("Indica la referencia del cobro del crédito corporativo.")
        pago.referencia = nota.strip()
    elif pago.estado != "en_proceso":
        raise TransicionInvalida("Solo se validan pagos en proceso.")
    cambiar_estado(pago, "pago", "confirmado", TRANSICIONES_PAGO, nota)
    pago.validado_por, pago.validado_en = actor_ids()[0], ahora()
    pedido = ped.bloquear_pedido(pago.pedido_id)
    if pedido.estado == "pago_en_revision":
        if _confirmado(pedido) >= pedido.total:
            ped.confirmar(pedido, f"Pago {pago.folio} validado")
        else:
            ped.transicionar(pedido, "pendiente_pago", "Pago parcial validado; resta saldo")
    notificar_cliente(pedido.cliente_id, "pago_confirmado", "pago", pago.id,
                      f"Confirmamos tu pago {pago.folio} del pedido {pedido.folio}.", f"/cuenta/pedidos/{pedido.id}")
    auditar("pago.validar", "pago", pago.id, despues={"monto": pago.monto, "nota": nota})
    db.session.commit()
    return pago


def rechazar(pago: Pago, motivo: str):
    if not motivo or len(motivo.strip()) < 5:
        raise AppError("Indica el motivo del rechazo.")
    cambiar_estado(pago, "pago", "rechazado", TRANSICIONES_PAGO, motivo)
    pago.motivo_rechazo = motivo
    pago.validado_por, pago.validado_en = actor_ids()[0], ahora()
    pedido = ped.bloquear_pedido(pago.pedido_id)
    otros = [p for p in pedido.pagos if p.id != pago.id and p.estado == "en_proceso"]
    if pedido.estado == "pago_en_revision" and not otros:
        ped.transicionar(pedido, "pendiente_pago", f"Pago rechazado: {motivo}")
    notificar_cliente(pedido.cliente_id, "pago_rechazado", "pago", pago.id,
                      f"No pudimos validar tu pago {pago.folio}: {motivo}", f"/cuenta/pedidos/{pedido.id}")
    auditar("pago.rechazar", "pago", pago.id, despues={"motivo": motivo})
    db.session.commit()
    return pago


def bloquear_reembolso(reembolso_id: int) -> Reembolso:
    r = db.session.scalars(select(Reembolso).where(Reembolso.id == reembolso_id).with_for_update()
                           .execution_options(populate_existing=True)).first()
    if not r:
        raise NoEncontrado("Reembolso no encontrado.")
    return r


def realizar_reembolso(r: Reembolso, referencia: str):
    if r.estado != "pendiente":
        raise TransicionInvalida("El reembolso ya fue procesado.")
    if not referencia or len(referencia.strip()) < 4:
        raise AppError("Captura la referencia del reembolso (transferencia, folio de caja o nota de crédito).")
    if r.tipo == "reembolso":
        pago = bloquear_pago(r.pago_id)
        if pago.monto_reembolsado + r.monto > pago.monto:
            raise Conflicto("El reembolso excede el monto confirmado del pago.")
        pago.monto_reembolsado = dinero(pago.monto_reembolsado + r.monto)
        cambiar_estado(pago, "pago", "reembolsado" if pago.monto_reembolsado == pago.monto else "reembolsado_parcial",
                       TRANSICIONES_PAGO, r.motivo)
    r.estado, r.referencia, r.autorizado_por, r.realizado_en = "realizado", referencia.strip(), actor_ids()[0], ahora()
    if r.devolucion_id:
        dev = db.session.get(Devolucion, r.devolucion_id)
        from .devolucion_service import TRANSICIONES_DEVOLUCION
        cambiar_estado(dev, "devolucion", "reembolsada", TRANSICIONES_DEVOLUCION, f"Reembolso {referencia}")
    pedido = db.session.get(Pedido, r.pedido_id)
    notificar_cliente(pedido.cliente_id, "reembolso_realizado", "reembolso", r.id,
                      f"Realizamos un {'reembolso' if r.tipo == 'reembolso' else 'ajuste'} de ${r.monto} "
                      f"del pedido {pedido.folio}.", f"/cuenta/pedidos/{pedido.id}")
    auditar("reembolso.realizar", "reembolso", r.id, despues={"monto": r.monto, "referencia": referencia})
    db.session.commit()
    return r


def crear_reembolso(pedido: Pedido, monto: Decimal, motivo: str, devolucion_id: int | None = None) -> Reembolso:
    """Asigna el reembolso a pagos confirmados con saldo; si no hay (crédito no cobrado), genera un ajuste."""
    monto = dinero(monto)
    for pago in pedido.pagos:
        if pago.estado not in {"confirmado", "reembolsado_parcial"}:
            continue
        comprometido = sum((x.monto for x in pago.reembolsos if x.estado == "pendiente"), Decimal("0"))
        if pago.monto - pago.monto_reembolsado - comprometido >= monto:
            r = Reembolso(pago_id=pago.id, pedido_id=pedido.id, devolucion_id=devolucion_id, tipo="reembolso",
                          monto=monto, motivo=motivo)
            break
    else:
        r = Reembolso(pago_id=None, pedido_id=pedido.id, devolucion_id=devolucion_id, tipo="ajuste", monto=monto,
                      motivo=motivo)
    db.session.add(r)
    db.session.flush()
    notificar_personal("reembolso.autorizar", "reembolso_pendiente", "reembolso", r.id,
                       f"Reembolso pendiente de ${monto} ({pedido.folio}).", enlace="/admin/pagos")
    return r
