"""Surtido por sucursal, empaque, despacho, eventos de envío, entrega en sucursal, recepción corporativa y
entregas individuales con conformidad.

Los eventos de envío son internos: no hay integración con paqueterías y cada evento queda marcado
`origen='interno'`. La interfaz `integrations.envios.ProveedorEnvio` permite conectar una paquetería después.
"""
from decimal import Decimal

from sqlalchemy import select

from ..errors import AppError, Conflicto, NoEncontrado, TransicionInvalida
from ..extensions import db
from ..models import (AsignacionDetalle, AsignacionSurtido, EntregaIndividual, EntregaIndividualDetalle, Envio,
                      EventoEnvio, Incidencia, Paquete, PaqueteDetalle, Pedido, Recepcion, ReservaInventario, ahora)
from . import inventario_service as inv_srv
from . import pedido_service as ped
from .comun import actor_ids, asignar_folio, auditar, dinero, notificar_cliente, registrar_historial

ACTIVOS = {"confirmado", "en_preparacion", "parcialmente_enviado", "enviado", "parcialmente_entregado"}


def bloquear_asignacion(asignacion_id: int) -> AsignacionSurtido:
    a = db.session.scalars(select(AsignacionSurtido).where(AsignacionSurtido.id == asignacion_id)
                           .with_for_update(of=AsignacionSurtido).execution_options(populate_existing=True)).first()
    if not a:
        raise NoEncontrado("Asignación no encontrada.")
    return a


def bloquear_paquete(paquete_id: int) -> Paquete:
    p = db.session.scalars(select(Paquete).where(Paquete.id == paquete_id).with_for_update(of=Paquete)
                           .execution_options(populate_existing=True)).first()
    if not p:
        raise NoEncontrado("Paquete no encontrado.")
    return p


def _estado_asig(a: AsignacionSurtido, nuevo: str):
    if a.estado != nuevo:
        registrar_historial("asignacion", a.id, a.estado, nuevo)
        a.estado = nuevo


def iniciar_surtido(a: AsignacionSurtido):
    pedido = ped.bloquear_pedido(a.pedido_id)
    if pedido.estado not in ACTIVOS:
        raise TransicionInvalida("El pedido no está confirmado; no puede surtirse.",
                                 detalles={"estado_pedido": pedido.estado})
    if a.estado != "pendiente":
        raise TransicionInvalida("El surtido de esta asignación ya inició.")
    invs = inv_srv.bloquear_varios([(a.sucursal_id, d.pedido_detalle.variante_id) for d in a.detalles])
    for d in a.detalles:
        inv = invs[(a.sucursal_id, d.pedido_detalle.variante_id)]
        reserva = db.session.scalars(select(ReservaInventario).where(
            ReservaInventario.asignacion_detalle_id == d.id, ReservaInventario.estado == "activa")).first()
        if not reserva:
            raise Conflicto(f"No existe reserva activa para {d.pedido_detalle.sku}.")
        reserva.estado = "consumida"
        inv.reservado -= reserva.cantidad
        inv.comprometido += reserva.cantidad
    _estado_asig(a, "en_surtido")
    if pedido.estado == "confirmado":
        ped.transicionar(pedido, "en_preparacion", f"Surtido iniciado en {a.sucursal.nombre}")
    auditar("surtido.iniciar", "asignacion", a.id, sucursal_id=a.sucursal_id)
    db.session.commit()
    return a


def registrar_surtido(a: AsignacionSurtido, partidas: list[dict]):
    """partidas: [{asignacion_detalle_id, surtida, faltante, motivo_faltante}] con valores acumulados."""
    if a.estado not in {"en_surtido", "empacada"}:
        raise TransicionInvalida("La asignación no está en surtido.")
    pedido = ped.bloquear_pedido(a.pedido_id)
    detalles = {d.id: d for d in a.detalles}
    invs = inv_srv.bloquear_varios([(a.sucursal_id, d.pedido_detalle.variante_id) for d in a.detalles])
    reembolsar = Decimal("0.00")
    faltas = []
    for p in partidas:
        d = detalles.get(p["asignacion_detalle_id"])
        if not d:
            raise NoEncontrado("Partida no pertenece a esta asignación.")
        surtida, faltante = p.get("surtida", d.surtida), p.get("faltante", d.faltante)
        if surtida < d.surtida or faltante < d.faltante:
            raise AppError("Las cantidades son acumuladas y no pueden disminuir.")
        if surtida + faltante > d.cantidad:
            raise AppError(f"{d.pedido_detalle.sku}: surtida + faltante excede lo asignado ({d.cantidad}).")
        nuevo_faltante = faltante - d.faltante
        if nuevo_faltante:
            if not (p.get("motivo_faltante") or "").strip():
                raise AppError("Indica el motivo del faltante.")
            inv = invs[(a.sucursal_id, d.pedido_detalle.variante_id)]
            inv.comprometido -= nuevo_faltante
            inv_srv.movimiento(inv, "merma", -nuevo_faltante,
                               f"Faltante al surtir {pedido.folio}: {p['motivo_faltante']}", "pedido", pedido.id)
            d.pedido_detalle.cantidad_cancelada += nuevo_faltante
            reembolsar += d.pedido_detalle.precio_final * nuevo_faltante
            faltas.append(f"{d.pedido_detalle.sku} x{nuevo_faltante}: {p['motivo_faltante']}")
        d.surtida, d.faltante = surtida, faltante
    if faltas:
        usuario_id, _ = actor_ids()
        inc = Incidencia(tipo="faltante_surtido", prioridad="alta", pedido_id=pedido.id, sucursal_id=a.sucursal_id,
                         descripcion="Faltantes al surtir: " + "; ".join(faltas), creado_por_usuario=usuario_id)
        db.session.add(inc)
        asignar_folio(inc, "INC")
        if reembolsar > 0:
            from .pago_service import crear_reembolso
            crear_reembolso(pedido, reembolsar, f"Artículos faltantes en {pedido.folio}")
        notificar_cliente(pedido.cliente_id, "pedido_faltante", "pedido", pedido.id,
                          f"Algunos artículos de {pedido.folio} no pudieron surtirse; se generó un reembolso o ajuste.",
                          f"/cuenta/pedidos/{pedido.id}")
    _actualizar_asignacion(a)
    ped.recalcular(pedido)
    auditar("surtido.registrar", "asignacion", a.id, despues={"partidas": partidas}, sucursal_id=a.sucursal_id)
    db.session.commit()
    return a


def _actualizar_asignacion(a: AsignacionSurtido):
    efectivo = [(d.cantidad - d.faltante, d) for d in a.detalles]
    if all(q == 0 for q, _ in efectivo):
        _estado_asig(a, "cancelada")
        return
    if all(d.despachada == q for q, d in efectivo):
        entregados = all(p.estado in {"entregado", "cancelado"} for p in a.paquetes)
        _estado_asig(a, "entregada" if entregados and a.paquetes else "despachada")
    elif all(d.empacada == q for q, d in efectivo):
        _estado_asig(a, "empacada")


def crear_paquete(a: AsignacionSurtido, partidas: list[dict], peso_kg: Decimal | None = None) -> Paquete:
    if a.estado not in {"en_surtido", "empacada"}:
        raise TransicionInvalida("Inicia el surtido antes de empacar.")
    detalles = {d.id: d for d in a.detalles}
    paq = Paquete(asignacion_id=a.id, estado="preparado", peso_kg=peso_kg)
    total = 0
    for p in partidas:
        d = detalles.get(p["asignacion_detalle_id"])
        if not d:
            raise NoEncontrado("Partida no pertenece a esta asignación.")
        cant = p["cantidad"]
        if cant <= 0:
            continue
        if d.empacada + cant > d.surtida:
            raise Conflicto(f"{d.pedido_detalle.sku}: solo hay {d.surtida - d.empacada} unidad(es) surtidas sin empacar.")
        d.empacada += cant
        paq.detalles.append(PaqueteDetalle(asignacion_detalle_id=d.id, cantidad=cant))
        total += cant
    if total == 0:
        raise AppError("El paquete debe contener al menos un artículo.")
    db.session.add(paq)
    asignar_folio(paq, "PAQ")
    _actualizar_asignacion(a)
    auditar("paquete.crear", "paquete", paq.id, despues={"unidades": total}, sucursal_id=a.sucursal_id)
    db.session.commit()
    return paq


def _salida(paq: Paquete, a: AsignacionSurtido, pedido: Pedido):
    invs = inv_srv.bloquear_varios([(a.sucursal_id, pd.asignacion_detalle.pedido_detalle.variante_id)
                                    for pd in paq.detalles])
    for pd in paq.detalles:
        d = pd.asignacion_detalle
        inv = invs[(a.sucursal_id, d.pedido_detalle.variante_id)]
        inv.comprometido -= pd.cantidad
        inv_srv.movimiento(inv, "salida_venta", -pd.cantidad, f"Salida de {paq.folio} ({pedido.folio})", "paquete", paq.id)
        d.despachada += pd.cantidad


def despachar(paq: Paquete, paqueteria: str, guia: str):
    a = bloquear_asignacion(paq.asignacion_id)
    pedido = ped.bloquear_pedido(a.pedido_id)
    if pedido.modalidad != "envio":
        raise AppError("Este pedido se recoge en sucursal; usa 'listo para recoger'.")
    if paq.estado != "preparado":
        raise TransicionInvalida("El paquete ya fue despachado o cancelado.")
    if not guia.strip() or not paqueteria.strip():
        raise AppError("Captura la paquetería y el número de guía.")
    _salida(paq, a, pedido)
    paq.estado = "despachado"
    envio = Envio(paquete_id=paq.id, paqueteria=paqueteria.strip(), guia=guia.strip(), proveedor="manual",
                  estado="despachado")
    envio.eventos.append(EventoEnvio(estado="despachado", descripcion=f"Despachado desde {a.sucursal.nombre}",
                                     origen="interno", usuario_id=actor_ids()[0]))
    db.session.add(envio)
    _actualizar_asignacion(a)
    ped.recalcular(pedido)
    notificar_cliente(pedido.cliente_id, f"paquete_despachado_{paq.id}", "paquete", paq.id,
                      f"Tu paquete {paq.folio} salió con {paqueteria}, guía {guia}.", f"/cuenta/pedidos/{pedido.id}")
    auditar("paquete.despachar", "paquete", paq.id, despues={"paqueteria": paqueteria, "guia": guia},
            sucursal_id=a.sucursal_id)
    db.session.commit()
    return paq


def _marcar_entregado(paq: Paquete, a: AsignacionSurtido, pedido: Pedido):
    paq.estado = "entregado"
    for pd in paq.detalles:
        pd.asignacion_detalle.pedido_detalle.cantidad_entregada += pd.cantidad
    if pedido.canal == "corporativo":
        por_empleado: dict[int, list] = {}
        for pd in paq.detalles:
            pdet = pd.asignacion_detalle.pedido_detalle
            por_empleado.setdefault(pdet.empleado_id, []).append((pdet, pd.cantidad))
        for emp_id, items in por_empleado.items():
            ent = EntregaIndividual(paquete_id=paq.id, empleado_id=emp_id, estado="pendiente")
            for pdet, cant in items:
                ent.detalles.append(EntregaIndividualDetalle(pedido_detalle_id=pdet.id, esperada=cant))
            db.session.add(ent)
    _actualizar_asignacion(a)
    ped.recalcular(pedido)


def registrar_evento(paq: Paquete, estado: str, descripcion: str):
    if estado not in {"en_transito", "entregado", "incidencia"}:
        raise AppError("Estado de envío inválido.")
    a = bloquear_asignacion(paq.asignacion_id)
    pedido = ped.bloquear_pedido(a.pedido_id)
    envio = paq.envio
    if not envio or paq.estado not in {"despachado", "en_transito", "incidencia"}:
        raise TransicionInvalida("El paquete no está en ruta.")
    if envio.estado == "entregado":
        raise TransicionInvalida("El envío ya se registró como entregado.")
    if estado == "en_transito" and envio.estado not in {"despachado", "incidencia"}:
        raise TransicionInvalida("El envío ya está en tránsito.")
    if not descripcion or len(descripcion.strip()) < 3:
        raise AppError("Describe el evento (por ejemplo, quién confirmó la entrega).")
    envio.estado = estado
    envio.eventos.append(EventoEnvio(estado=estado, descripcion=descripcion.strip(), origen="interno",
                                     usuario_id=actor_ids()[0]))
    if estado == "en_transito":
        paq.estado = "en_transito"
    elif estado == "incidencia":
        paq.estado = "incidencia"
        inc = Incidencia(tipo="incidencia_envio", prioridad="alta", pedido_id=pedido.id, paquete_id=paq.id,
                         sucursal_id=a.sucursal_id, descripcion=descripcion, creado_por_usuario=actor_ids()[0])
        db.session.add(inc)
        asignar_folio(inc, "INC")
    else:
        _marcar_entregado(paq, a, pedido)
    auditar(f"envio.{estado}", "paquete", paq.id, despues={"descripcion": descripcion}, sucursal_id=a.sucursal_id)
    db.session.commit()
    return paq


def listo_para_recoger(paq: Paquete):
    a = bloquear_asignacion(paq.asignacion_id)
    pedido = ped.bloquear_pedido(a.pedido_id)
    if pedido.modalidad != "recoger":
        raise AppError("Este pedido es de envío a domicilio.")
    if paq.estado != "preparado":
        raise TransicionInvalida("El paquete no está preparado.")
    if a.sucursal_id != pedido.sucursal_recoger_id:
        raise Conflicto("El paquete debe estar en la sucursal donde se recoge.")
    paq.estado = "listo_para_recoger"
    notificar_cliente(pedido.cliente_id, f"paquete_listo_{paq.id}", "paquete", paq.id,
                      f"Tu paquete {paq.folio} está listo para recoger en {a.sucursal.nombre}.",
                      f"/cuenta/pedidos/{pedido.id}")
    auditar("paquete.listo_recoger", "paquete", paq.id, sucursal_id=a.sucursal_id)
    db.session.commit()
    return paq


def entregar_en_sucursal(paq: Paquete, recibio: str, identificacion: str):
    a = bloquear_asignacion(paq.asignacion_id)
    pedido = ped.bloquear_pedido(a.pedido_id)
    if paq.estado != "listo_para_recoger":
        raise TransicionInvalida("El paquete no está listo para recoger.")
    if len((recibio or "").strip()) < 3 or len((identificacion or "").strip()) < 3:
        raise AppError("Registra el nombre de quien recibe y la identificación mostrada.")
    _salida(paq, a, pedido)
    _marcar_entregado(paq, a, pedido)
    auditar("paquete.entregar_sucursal", "paquete", paq.id, despues={"recibio": recibio, "identificacion": identificacion},
            sucursal_id=a.sucursal_id)
    db.session.commit()
    return paq


# ---------------------------------------------------------------- canal corporativo: recepción y entregas

def registrar_recepcion(paq: Paquete, cliente_id: int, completa: bool, diferencias: str | None):
    a = paq.asignacion
    pedido = a.pedido
    if pedido.cliente_id != cliente_id or pedido.canal != "corporativo":
        raise NoEncontrado("Paquete no encontrado.")
    if paq.estado != "entregado":
        raise TransicionInvalida("El paquete aún no se entrega a tu empresa.")
    if db.session.scalars(select(Recepcion).where(Recepcion.paquete_id == paq.id)).first():
        raise Conflicto("La recepción de este paquete ya fue registrada.")
    if not completa and not (diferencias or "").strip():
        raise AppError("Describe las diferencias encontradas.")
    rec = Recepcion(paquete_id=paq.id, estado="completa" if completa else "parcial",
                    diferencias=None if completa else diferencias.strip(), cliente_id=cliente_id)
    db.session.add(rec)
    if not completa:
        inc = Incidencia(tipo="diferencia_recepcion", prioridad="alta", pedido_id=pedido.id, paquete_id=paq.id,
                         sucursal_id=a.sucursal_id, descripcion=diferencias.strip(), creado_por_cliente=cliente_id)
        db.session.add(inc)
        asignar_folio(inc, "INC")
    auditar("recepcion.registrar", "paquete", paq.id, despues={"completa": completa, "diferencias": diferencias})
    db.session.commit()
    return rec


def registrar_entrega_individual(ent: EntregaIndividual, cliente_id: int, cantidades: dict[int, int], firma: str,
                                 valoracion: int | None, observaciones: str | None):
    paq = db.session.get(Paquete, ent.paquete_id)
    pedido = paq.asignacion.pedido
    if pedido.cliente_id != cliente_id:
        raise NoEncontrado("Entrega no encontrada.")
    if not db.session.scalars(select(Recepcion).where(Recepcion.paquete_id == paq.id)).first():
        raise TransicionInvalida("Registra primero la recepción física del paquete.")
    if ent.estado != "pendiente":
        raise TransicionInvalida("Esta entrega ya fue registrada.")
    if not firma or not firma.startswith("data:image/png;base64,") or len(firma) < 200:
        raise AppError("Captura la firma del empleado.")
    if len(firma) > 400_000:
        raise AppError("La imagen de la firma es demasiado grande.")
    completas = True
    for det in ent.detalles:
        cant = cantidades.get(det.pedido_detalle_id, det.esperada)
        if cant < 0 or cant > det.esperada:
            raise AppError(f"{det.pedido_detalle.sku}: la cantidad entregada debe estar entre 0 y {det.esperada}.")
        det.entregada = cant
        completas &= cant == det.esperada
    ent.firma, ent.valoracion, ent.observaciones, ent.entregado_en = firma, valoracion, observaciones, ahora()
    ent.estado = "entregada" if completas else "con_incidencia"
    if not completas:
        inc = Incidencia(tipo="entrega_incompleta", prioridad="media", pedido_id=pedido.id, paquete_id=paq.id,
                         descripcion=f"Entrega incompleta a {ent.empleado.nombre}. {observaciones or ''}".strip(),
                         creado_por_cliente=cliente_id)
        db.session.add(inc)
        asignar_folio(inc, "INC")
    auditar("entrega_individual.registrar", "entrega_individual", ent.id,
            despues={"empleado": ent.empleado.nombre, "estado": ent.estado, "valoracion": valoracion})
    db.session.commit()
    return ent
