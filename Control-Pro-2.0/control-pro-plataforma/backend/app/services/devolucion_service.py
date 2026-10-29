"""Devoluciones (solicitud con evidencia, autorización, recepción, inspección, reingreso o merma, reembolso) e
incidencias."""
from decimal import Decimal

from sqlalchemy import select

from ..errors import AppError, Conflicto, NoEncontrado, TransicionInvalida
from ..extensions import db
from ..models import Cliente, Devolucion, DevolucionDetalle, Incidencia, Pedido, PedidoDetalle, Sucursal
from . import inventario_service as inv_srv
from .comun import (actor_ids, asignar_folio, auditar, cambiar_estado, notificar_cliente, notificar_personal)

TRANSICIONES_DEVOLUCION = {
    "solicitada": {"autorizada", "rechazada"},
    "autorizada": {"en_camino", "recibida"},
    "en_camino": {"recibida"},
    "recibida": {"inspeccionada"},
    "inspeccionada": {"reembolsada", "cerrada"},
    "reembolsada": {"cerrada"},
}
TRANSICIONES_INCIDENCIA = {
    "abierta": {"en_atencion", "resuelta"},
    "en_atencion": {"resuelta", "abierta"},
    "resuelta": {"cerrada", "en_atencion"},
}
ACTIVAS = {"solicitada", "autorizada", "en_camino", "recibida"}


def bloquear_devolucion(dev_id: int) -> Devolucion:
    d = db.session.scalars(select(Devolucion).where(Devolucion.id == dev_id).with_for_update(of=Devolucion)
                           .execution_options(populate_existing=True)).first()
    if not d:
        raise NoEncontrado("Devolución no encontrada.")
    return d


def _en_tramite(pedido_detalle_id: int) -> int:
    filas = db.session.scalars(select(DevolucionDetalle).join(Devolucion).where(
        DevolucionDetalle.pedido_detalle_id == pedido_detalle_id, Devolucion.estado.in_(ACTIVAS)))
    return sum(f.cantidad for f in filas)


def solicitar(cliente: Cliente, pedido: Pedido, motivo: str, descripcion: str, evidencias: list[str],
              partidas: list[dict]) -> Devolucion:
    if pedido.cliente_id != cliente.id:
        raise NoEncontrado("Pedido no encontrado.")
    if pedido.estado not in {"parcialmente_entregado", "entregado"}:
        raise TransicionInvalida("Solo se pueden devolver artículos de pedidos entregados.")
    if not evidencias:
        raise AppError("Adjunta al menos una evidencia (foto o descripción detallada).")
    if not descripcion or len(descripcion.strip()) < 10:
        raise AppError("Describe el problema (mínimo 10 caracteres).")
    detalles = {d.id: d for d in pedido.detalles}
    dev = Devolucion(pedido_id=pedido.id, cliente_id=cliente.id, motivo=motivo, descripcion=descripcion.strip(),
                     evidencias=evidencias, estado="solicitada")
    for p in partidas:
        d = detalles.get(p["pedido_detalle_id"])
        if not d:
            raise NoEncontrado("Partida no pertenece al pedido.")
        maximo = d.cantidad_entregada - d.cantidad_devuelta - _en_tramite(d.id)
        if p["cantidad"] <= 0 or p["cantidad"] > maximo:
            raise Conflicto(f"{d.sku}: puedes devolver como máximo {max(maximo, 0)} unidad(es).")
        dev.detalles.append(DevolucionDetalle(pedido_detalle_id=d.id, cantidad=p["cantidad"]))
    if not dev.detalles:
        raise AppError("Selecciona al menos un artículo.")
    db.session.add(dev)
    asignar_folio(dev, "DEV")
    auditar("devolucion.solicitar", "devolucion", dev.id, despues={"pedido": pedido.folio, "motivo": motivo})
    notificar_personal("devolucion.gestionar", "devolucion_solicitada", "devolucion", dev.id,
                       f"Nueva solicitud de devolución {dev.folio} ({pedido.folio}).", enlace="/admin/devoluciones")
    db.session.commit()
    return dev


def autorizar(dev: Devolucion, sucursal_id: int, nota: str | None):
    s = db.session.get(Sucursal, sucursal_id)
    if not s or not s.activo:
        raise NoEncontrado("Sucursal no encontrada.")
    cambiar_estado(dev, "devolucion", "autorizada", TRANSICIONES_DEVOLUCION, nota)
    dev.sucursal_recibe_id, dev.autorizada_por = sucursal_id, actor_ids()[0]
    notificar_cliente(dev.cliente_id, "devolucion_autorizada", "devolucion", dev.id,
                      f"Autorizamos tu devolución {dev.folio}. Entrégala o envíala a {s.nombre}, {s.direccion}.",
                      f"/cuenta/pedidos/{dev.pedido_id}")
    notificar_personal("devolucion.recibir", "devolucion_por_recibir", "devolucion", dev.id,
                       f"Devolución {dev.folio} autorizada; se recibirá en tu sucursal.", sucursal_id=sucursal_id)
    auditar("devolucion.autorizar", "devolucion", dev.id, despues={"sucursal": sucursal_id, "nota": nota})
    db.session.commit()
    return dev


def rechazar(dev: Devolucion, motivo: str):
    if not motivo or len(motivo.strip()) < 5:
        raise AppError("Indica el motivo del rechazo.")
    cambiar_estado(dev, "devolucion", "rechazada", TRANSICIONES_DEVOLUCION, motivo)
    dev.resolucion = motivo
    notificar_cliente(dev.cliente_id, "devolucion_rechazada", "devolucion", dev.id,
                      f"Tu devolución {dev.folio} no procede: {motivo}", f"/cuenta/pedidos/{dev.pedido_id}")
    auditar("devolucion.rechazar", "devolucion", dev.id, despues={"motivo": motivo})
    db.session.commit()
    return dev


def marcar_en_camino(dev: Devolucion, cliente: Cliente, guia: str | None):
    if dev.cliente_id != cliente.id:
        raise NoEncontrado("Devolución no encontrada.")
    cambiar_estado(dev, "devolucion", "en_camino", TRANSICIONES_DEVOLUCION, f"Guía de retorno: {guia or 'sin guía'}")
    dev.guia_retorno = guia
    auditar("devolucion.en_camino", "devolucion", dev.id, despues={"guia": guia})
    db.session.commit()
    return dev


def recibir(dev: Devolucion, recibidas: dict[int, int], nota: str | None):
    for det in dev.detalles:
        cant = recibidas.get(det.id, det.cantidad)
        if cant < 0 or cant > det.cantidad:
            raise AppError(f"{det.pedido_detalle.sku}: la cantidad recibida debe estar entre 0 y {det.cantidad}.")
        det.recibida = cant
    if sum(d.recibida for d in dev.detalles) == 0:
        raise AppError("No se recibió ningún artículo; registra una incidencia en lugar de la recepción.")
    cambiar_estado(dev, "devolucion", "recibida", TRANSICIONES_DEVOLUCION, nota)
    auditar("devolucion.recibir", "devolucion", dev.id, despues={"recibidas": {str(k): v for k, v in recibidas.items()}},
            sucursal_id=dev.sucursal_recibe_id)
    db.session.commit()
    return dev


def inspeccionar(dev: Devolucion, resultados: dict[int, dict], nota: str | None):
    """resultados: {devolucion_detalle_id: {"aptas": n, "merma": m}} con aptas + merma = recibida."""
    if dev.estado != "recibida":
        raise TransicionInvalida("Primero registra la recepción de la devolución.")
    pedido = db.session.get(Pedido, dev.pedido_id)
    invs = inv_srv.bloquear_varios([(dev.sucursal_recibe_id, d.pedido_detalle.variante_id) for d in dev.detalles])
    monto = Decimal("0.00")
    for det in dev.detalles:
        r = resultados.get(det.id, {"aptas": det.recibida, "merma": 0})
        aptas, merma = int(r.get("aptas", 0)), int(r.get("merma", 0))
        if aptas < 0 or merma < 0 or aptas + merma != det.recibida:
            raise AppError(f"{det.pedido_detalle.sku}: aptas + merma debe ser igual a lo recibido ({det.recibida}).")
        if aptas:
            inv_srv.movimiento(invs[(dev.sucursal_recibe_id, det.pedido_detalle.variante_id)], "devolucion_reingreso",
                               aptas, f"Reingreso por devolución {dev.folio}", "devolucion", dev.id)
        det.resultado = "reingreso" if merma == 0 else ("merma" if aptas == 0 else "parcial")
        pdet = db.session.get(PedidoDetalle, det.pedido_detalle_id)
        pdet.cantidad_devuelta += det.recibida
        monto += pdet.precio_final * det.recibida
    dev.monto_reembolso = monto
    dev.resolucion = nota
    cambiar_estado(dev, "devolucion", "inspeccionada", TRANSICIONES_DEVOLUCION, nota)
    if monto > 0:
        from .pago_service import crear_reembolso
        crear_reembolso(pedido, monto, f"Devolución {dev.folio}", devolucion_id=dev.id)
    auditar("devolucion.inspeccionar", "devolucion", dev.id, despues={"monto": monto}, sucursal_id=dev.sucursal_recibe_id)
    db.session.commit()
    return dev


def cerrar(dev: Devolucion, nota: str | None):
    if dev.estado == "inspeccionada" and dev.monto_reembolso > 0:
        raise Conflicto("Falta registrar el reembolso antes de cerrar.")
    cambiar_estado(dev, "devolucion", "cerrada", TRANSICIONES_DEVOLUCION, nota)
    auditar("devolucion.cerrar", "devolucion", dev.id)
    db.session.commit()
    return dev


# ---------------------------------------------------------------- incidencias

def crear_incidencia(tipo: str, descripcion: str, prioridad: str = "media", pedido_id=None, paquete_id=None,
                     devolucion_id=None, transferencia_id=None, sucursal_id=None) -> Incidencia:
    if not descripcion or len(descripcion.strip()) < 10:
        raise AppError("Describe la incidencia (mínimo 10 caracteres).")
    usuario_id, cliente_id = actor_ids()
    inc = Incidencia(tipo=tipo, prioridad=prioridad, descripcion=descripcion.strip(), pedido_id=pedido_id,
                     paquete_id=paquete_id, devolucion_id=devolucion_id, transferencia_id=transferencia_id,
                     sucursal_id=sucursal_id, creado_por_usuario=usuario_id, creado_por_cliente=cliente_id)
    if not any([pedido_id, paquete_id, devolucion_id, transferencia_id]):
        raise AppError("La incidencia debe relacionarse con un pedido, paquete, devolución o transferencia.")
    db.session.add(inc)
    asignar_folio(inc, "INC")
    auditar("incidencia.crear", "incidencia", inc.id, despues={"tipo": tipo, "prioridad": prioridad},
            sucursal_id=sucursal_id)
    notificar_personal("incidencia.gestionar", "incidencia_nueva", "incidencia", inc.id,
                       f"Nueva incidencia {inc.folio}: {tipo}.", sucursal_id=sucursal_id, enlace="/admin/incidencias")
    db.session.commit()
    return inc


def actualizar_incidencia(inc: Incidencia, estado: str | None, comentario: str | None, responsable_id: int | None):
    antes = {"estado": inc.estado, "responsable": inc.responsable_id}
    if comentario:
        # La resolución se agrega: nunca se reemplaza el historial previo.
        usuario_id, _ = actor_ids()
        inc.resolucion = ((inc.resolucion + "\n") if inc.resolucion else "") + f"[usuario {usuario_id}] {comentario.strip()}"
    if responsable_id is not None:
        inc.responsable_id = responsable_id
    if estado and estado != inc.estado:
        if estado in {"resuelta", "cerrada"} and not inc.resolucion:
            raise AppError("Registra la resolución antes de marcarla como resuelta.")
        cambiar_estado(inc, "incidencia", estado, TRANSICIONES_INCIDENCIA, comentario)
    auditar("incidencia.actualizar", "incidencia", inc.id, antes, {"estado": inc.estado, "responsable": inc.responsable_id},
            sucursal_id=inc.sucursal_id)
    db.session.commit()
    return inc
