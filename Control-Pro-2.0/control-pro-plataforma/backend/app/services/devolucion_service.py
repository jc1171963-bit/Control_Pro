"""Devoluciones (solicitud con evidencia, autorización, recepción, inspección, reingreso o merma, reembolso) e
incidencias."""
from decimal import Decimal

from sqlalchemy import select

from ..errors import AppError, Conflicto, NoEncontrado, TransicionInvalida
from ..extensions import db
from ..models import (Cliente, Devolucion, DevolucionDetalle, Incidencia, IncidenciaSeguimiento, Pedido,
                      PedidoDetalle, Sucursal)
from . import inventario_service as inv_srv
from .comun import (actor_ids, asignar_folio, auditar, cambiar_estado, notificar_cliente, notificar_personal,
                    registrar_incidencia)

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
_ETIQUETAS_INCIDENCIA = {"abierta": "abierta", "en_atencion": "en atención", "resuelta": "resuelta", "cerrada": "cerrada"}


def etiqueta_incidencia(estado: str) -> str:
    return _ETIQUETAS_INCIDENCIA.get(estado, estado)


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
                     devolucion_id=None, transferencia_id=None, sucursal_id=None, empleado_id=None,
                     pedido_detalle_id=None, evidencias: list[str] | None = None) -> Incidencia:
    if not descripcion or len(descripcion.strip()) < 10:
        raise AppError("Describe la incidencia (mínimo 10 caracteres).")
    if not any([pedido_id, paquete_id, devolucion_id, transferencia_id]):
        raise AppError("La incidencia debe relacionarse con un pedido, paquete, devolución o transferencia.")
    if paquete_id is not None and pedido_id is not None:
        from ..models import Paquete
        paq = db.session.get(Paquete, paquete_id)
        if not paq or paq.asignacion.pedido_id != pedido_id:
            raise NoEncontrado("El paquete no pertenece a la solicitud.")
    if pedido_detalle_id is not None:
        pdet = db.session.get(PedidoDetalle, pedido_detalle_id)
        if not pdet or pdet.pedido_id != pedido_id:
            raise NoEncontrado("El artículo no pertenece a la solicitud.")
        empleado_id = empleado_id or pdet.empleado_id
    if empleado_id is not None and pedido_id is not None:
        en_pedido = db.session.scalar(select(PedidoDetalle.id).where(PedidoDetalle.pedido_id == pedido_id,
                                                                     PedidoDetalle.empleado_id == empleado_id).limit(1))
        if not en_pedido:
            raise NoEncontrado("El empleado no está incluido en la solicitud.")
    inc = registrar_incidencia(tipo=tipo, prioridad=prioridad, descripcion=descripcion.strip(), pedido_id=pedido_id,
                               paquete_id=paquete_id, devolucion_id=devolucion_id, transferencia_id=transferencia_id,
                               sucursal_id=sucursal_id, empleado_id=empleado_id, pedido_detalle_id=pedido_detalle_id,
                               evidencias=list(evidencias or []))
    if evidencias and pedido_id:
        from ..api.archivos import dueno_actual, vincular_a_pedido
        vincular_a_pedido(evidencias, pedido_id, dueno_actual())
    auditar("incidencia.crear", "incidencia", inc.id, despues={"tipo": tipo, "prioridad": prioridad},
            sucursal_id=sucursal_id)
    notificar_personal("incidencia.gestionar", "incidencia_nueva", "incidencia", inc.id,
                       f"Nueva incidencia {inc.folio}: {tipo}.", sucursal_id=sucursal_id, enlace="/admin/incidencias")
    db.session.commit()
    return inc


def _adjuntar(inc: Incidencia, adjuntos: list[str] | None) -> list[str]:
    """Liga a la solicitud los archivos del mensaje (solo los que subió quien escribe) para que ambas partes los vean."""
    adjuntos = list(dict.fromkeys(adjuntos or []))
    if adjuntos:
        from ..api.archivos import dueno_actual, vincular_a_pedido
        vincular_a_pedido(adjuntos, inc.pedido_id, dueno_actual())
    return adjuntos


def actualizar_incidencia(inc: Incidencia, estado: str | None, comentario: str | None, responsable_id: int | None,
                          adjuntos: list[str] | None = None):
    """Cada actualización agrega una entrada al historial (`incidencia_seguimiento`); nada se reemplaza ni se borra."""
    antes = {"estado": inc.estado, "responsable": inc.responsable_id}
    comentario = (comentario or "").strip() or None
    adjuntos = _adjuntar(inc, adjuntos)
    usuario_id, cliente_id = actor_ids()
    cambio_responsable = responsable_id is not None and responsable_id != inc.responsable_id
    if cambio_responsable:
        inc.responsable_id = responsable_id
    anterior = inc.estado
    if estado and estado != inc.estado:
        if estado == "cerrada" and de_sucursal(inc):
            raise TransicionInvalida("La sucursal confirma la solución para cerrar la incidencia.", codigo="cierre_por_sucursal")
        if estado == "resuelta" and not comentario:
            raise AppError("Registra la resolución antes de marcarla como resuelta.")
        if estado == "cerrada" and not inc.resolucion:
            raise AppError("Registra la resolución antes de cerrarla.")
        cambiar_estado(inc, "incidencia", estado, TRANSICIONES_INCIDENCIA, comentario)
        if estado == "resuelta":  # la resolución vigente; los mensajes y resoluciones anteriores siguen en el seguimiento
            inc.resolucion = comentario
    if inc.pedido_id and (comentario or adjuntos or inc.estado != anterior):
        pedido = db.session.get(Pedido, inc.pedido_id)
        n = len(inc.seguimiento) + 1
        notificar_cliente(pedido.cliente_id, f"incidencia_{inc.id}_{n}", "incidencia", inc.id,
                          f"Actualización de la incidencia {inc.folio}: {etiqueta_incidencia(inc.estado)}"
                          + (f". {comentario}" if comentario else "") + (f" ({len(adjuntos)} archivo(s) adjunto(s))" if adjuntos else ""),
                          f"/cuenta/pedidos/{pedido.id}")
    if comentario or adjuntos or cambio_responsable or inc.estado != anterior:
        db.session.add(IncidenciaSeguimiento(incidencia_id=inc.id, estado_anterior=anterior, estado_nuevo=inc.estado,
                                             comentario=comentario, adjuntos=adjuntos,
                                             responsable_id=responsable_id if cambio_responsable else None,
                                             usuario_id=usuario_id, cliente_id=cliente_id))
    auditar("incidencia.actualizar", "incidencia", inc.id, antes, {"estado": inc.estado, "responsable": inc.responsable_id},
            sucursal_id=inc.sucursal_id)
    db.session.commit()
    return inc


# ---------------------------------------------------------------- conversación y cierre por la sucursal

# Lo que hace la sucursal sobre una incidencia resuelta: confirmar la solución o reabrirla.
TRANSICIONES_SUCURSAL = {"resuelta": {"cerrada", "en_atencion"}}


def de_sucursal(inc: Incidencia) -> bool:
    """Incidencia de una solicitud corporativa: su cierre lo confirma la sucursal. Las demás las cierra el personal."""
    return bool(inc.pedido_id) and db.session.get(Pedido, inc.pedido_id).canal == "corporativo"


def transiciones_personal(inc: Incidencia) -> list[str]:
    permitidas = TRANSICIONES_INCIDENCIA.get(inc.estado, set())
    return sorted(permitidas - {"cerrada"} if de_sucursal(inc) else permitidas)


def _entrada_sucursal(inc: Incidencia, anterior: str, comentario: str | None, adjuntos: list[str] | None = None):
    _, cliente_id = actor_ids()
    db.session.add(IncidenciaSeguimiento(incidencia_id=inc.id, estado_anterior=anterior, estado_nuevo=inc.estado,
                                         comentario=comentario, adjuntos=adjuntos or [], cliente_id=cliente_id))


def _exigir_de_sucursal(inc: Incidencia):
    if not de_sucursal(inc):
        raise TransicionInvalida("Esta incidencia la atiende y la cierra el personal.")


def mensaje_sucursal(inc: Incidencia, texto: str, adjuntos: list[str] | None = None) -> Incidencia:
    """La sucursal escribe en la conversación de su incidencia (texto, fotos o documentos). No cambia el estado."""
    _exigir_de_sucursal(inc)
    texto = str(texto or "").strip()
    if len(texto) > 2000 or (len(texto) < 2 and not adjuntos):
        raise AppError("Escribe tu mensaje (entre 2 y 2000 caracteres) o adjunta un archivo.")
    if inc.estado == "cerrada":
        raise TransicionInvalida("La incidencia está cerrada; si el problema continúa, reporta una nueva.")
    _entrada_sucursal(inc, inc.estado, texto or None, _adjuntar(inc, adjuntos))
    auditar("incidencia.mensaje_sucursal", "incidencia", inc.id, sucursal_id=inc.sucursal_id)
    db.session.commit()
    return inc


def confirmar_solucion(inc: Incidencia) -> Incidencia:
    _exigir_de_sucursal(inc)
    anterior = inc.estado
    cambiar_estado(inc, "incidencia", "cerrada", TRANSICIONES_SUCURSAL, "Solución confirmada por la sucursal")
    _entrada_sucursal(inc, anterior, "Solución confirmada por la sucursal")
    auditar("incidencia.confirmar", "incidencia", inc.id, {"estado": anterior}, {"estado": inc.estado}, sucursal_id=inc.sucursal_id)
    db.session.commit()
    return inc


def reabrir(inc: Incidencia, motivo: str) -> Incidencia:
    _exigir_de_sucursal(inc)
    motivo = str(motivo or "").strip()
    if not 10 <= len(motivo) <= 1000:
        raise AppError("Explica por qué no quedó resuelta (entre 10 y 1000 caracteres).")
    anterior = inc.estado
    cambiar_estado(inc, "incidencia", "en_atencion", TRANSICIONES_SUCURSAL, f"Reabierta por la sucursal: {motivo}")
    _entrada_sucursal(inc, anterior, f"Reabierta por la sucursal: {motivo}")
    auditar("incidencia.reabrir", "incidencia", inc.id, {"estado": anterior}, {"estado": inc.estado, "motivo": motivo},
            sucursal_id=inc.sucursal_id)
    db.session.commit()
    return inc
