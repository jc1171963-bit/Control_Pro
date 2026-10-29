"""Ciclo de vida del pedido: checkout con reserva atómica, asignación de sucursales, canal corporativo,
confirmación, cancelación, expiración, recálculo de estado y cierre."""
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from flask import current_app
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from ..errors import AppError, Conflicto, NoEncontrado, SinPermiso, TransicionInvalida
from ..extensions import db
from ..models import (AsignacionDetalle, AsignacionSurtido, Aprobacion, Carrito, Cliente, Devolucion, Direccion,
                      EmpleadoCorporativo, Incidencia, Pago, Pedido, PedidoDetalle, Producto, ProductoSucursal,
                      Reembolso, ReservaInventario, Sucursal, SucursalZona, Variante, ahora)
from . import inventario_service as inv_srv
from .comun import (actor_ids, asignar_folio, auditar, cambiar_estado, dinero, notificar_cliente,
                    notificar_personal, registrar_historial)
from .precios import precio_con_descuento, promociones_vigentes, totales

TRANSICIONES_PEDIDO = {
    "en_revision": {"devuelto", "rechazado", "confirmado", "cancelado"},
    "devuelto": {"en_revision", "cancelado"},
    "pendiente_pago": {"pago_en_revision", "confirmado", "cancelado", "expirado"},
    "pago_en_revision": {"pendiente_pago", "confirmado", "cancelado"},
    "confirmado": {"en_preparacion", "cancelado"},
    "en_preparacion": {"parcialmente_enviado", "enviado", "parcialmente_entregado", "entregado", "cancelado"},
    "parcialmente_enviado": {"enviado", "parcialmente_entregado", "entregado"},
    "enviado": {"parcialmente_entregado", "entregado"},
    "parcialmente_entregado": {"entregado"},
    "entregado": {"cerrado"},
}
RANGO_LOGISTICO = {"confirmado": 0, "en_preparacion": 1, "parcialmente_enviado": 2, "enviado": 3,
                   "parcialmente_entregado": 4, "entregado": 5}
CANCELABLE_CLIENTE = {"en_revision", "devuelto", "pendiente_pago", "pago_en_revision", "confirmado"}
CANCELABLE_PERSONAL = CANCELABLE_CLIENTE | {"en_preparacion"}

ETIQUETAS = {
    "en_revision": "en revisión", "devuelto": "devuelto para corrección", "rechazado": "rechazado",
    "pendiente_pago": "pendiente de pago", "pago_en_revision": "con pago en revisión", "confirmado": "confirmado",
    "en_preparacion": "en preparación", "parcialmente_enviado": "parcialmente enviado", "enviado": "enviado",
    "parcialmente_entregado": "parcialmente entregado", "entregado": "entregado", "cerrado": "cerrado",
    "cancelado": "cancelado", "expirado": "expirado",
}


def transicionar(pedido: Pedido, nuevo: str, motivo: str | None = None):
    cambiar_estado(pedido, "pedido", nuevo, TRANSICIONES_PEDIDO, motivo)
    notificar_cliente(pedido.cliente_id, f"pedido_{nuevo}", "pedido", pedido.id,
                      f"Tu pedido {pedido.folio} está {ETIQUETAS.get(nuevo, nuevo)}.", f"/cuenta/pedidos/{pedido.id}")


def bloquear_pedido(pedido_id: int) -> Pedido:
    p = db.session.scalars(select(Pedido).where(Pedido.id == pedido_id).with_for_update(of=Pedido)
                           .execution_options(populate_existing=True)).first()
    if not p:
        raise NoEncontrado("Pedido no encontrado.")
    return p


# ---------------------------------------------------------------- asignación de sucursales

def ranking_sucursales(cp: str | None, sucursal_fija: int | None = None) -> list[Sucursal]:
    activas = list(db.session.scalars(select(Sucursal).where(Sucursal.activo.is_(True)).order_by(Sucursal.id)))
    if sucursal_fija is not None:
        return [s for s in activas if s.id == sucursal_fija]
    zonas = defaultdict(list)
    for z in db.session.scalars(select(SucursalZona)):
        zonas[z.sucursal_id].append(z)

    def puntaje(s: Sucursal):
        mejor = (0, 99)
        for z in zonas.get(s.id, []):
            if cp and cp.startswith(z.cp_prefijo):
                mejor = max(mejor, (len(z.cp_prefijo), -z.prioridad))
        return (-mejor[0], -mejor[1] if mejor[0] else 99, s.id)

    return sorted(activas, key=puntaje)


def _habilitados(producto_ids: set[int]) -> set[tuple[int, int]]:
    """Pares (producto, sucursal) deshabilitados explícitamente."""
    filas = db.session.scalars(select(ProductoSucursal).where(ProductoSucursal.producto_id.in_(producto_ids),
                                                              ProductoSucursal.habilitado.is_(False)))
    return {(f.producto_id, f.sucursal_id) for f in filas}


def calcular_asignacion(necesidades: dict[int, int], sucursales: list[Sucursal], permitir_division: bool):
    """Bloquea las filas de inventario candidatas y decide qué sucursal surte cada variante.

    Devuelve {sucursal_id: {variante_id: cantidad}} o lanza Conflicto con el detalle de faltantes.
    """
    variantes = {v.id: v for v in db.session.scalars(select(Variante).where(Variante.id.in_(necesidades)))}
    deshabilitado = _habilitados({v.producto_id for v in variantes.values()})
    invs = inv_srv.bloquear_varios([(s.id, v) for s in sucursales for v in necesidades])

    def disp(sid, vid):
        if (variantes[vid].producto_id, sid) in deshabilitado:
            return 0
        return max(0, invs[(sid, vid)].disponible)

    for s in sucursales:  # 1) una sola sucursal que surta todo, en orden de cercanía
        if all(disp(s.id, v) >= q for v, q in necesidades.items()):
            return {s.id: dict(necesidades)}, invs

    if permitir_division:  # 2) dividir entre el menor número de sucursales (cobertura voraz)
        pendiente = dict(necesidades)
        plan: dict[int, dict[int, int]] = {}
        restantes = list(sucursales)
        while any(pendiente.values()) and restantes:
            mejor = max(restantes, key=lambda s: (sum(min(disp(s.id, v), q) for v, q in pendiente.items()),
                                                  -sucursales.index(s)))
            cubre = {v: min(disp(mejor.id, v), q) for v, q in pendiente.items() if q and disp(mejor.id, v) > 0}
            if not cubre:
                break
            plan[mejor.id] = cubre
            for v, q in cubre.items():
                pendiente[v] -= q
            restantes.remove(mejor)
        if not any(pendiente.values()):
            return plan, invs

    faltantes = []
    for v, q in necesidades.items():
        total = sum(disp(s.id, v) for s in sucursales)
        maximo = max((disp(s.id, v) for s in sucursales), default=0)
        if (permitir_division and total < q) or (not permitir_division and maximo < q):
            faltantes.append({"variante_id": v, "sku": variantes[v].sku, "solicitado": q,
                              "disponible_total": total, "disponible_en_una_sucursal": maximo})
    if not faltantes:  # cada variante alcanza por separado, pero ninguna sucursal surte todo junto
        faltantes = [{"mensaje": "Ninguna sucursal puede surtir el pedido completo y no se permite dividirlo."}]
    raise Conflicto("No hay existencias suficientes para surtir el pedido.", detalles={"faltantes": faltantes},
                    codigo="sin_existencias")


def asignar_y_reservar(pedido: Pedido, sucursales: list[Sucursal], permitir_division: bool, expira):
    necesidades: dict[int, int] = defaultdict(int)
    for d in pedido.detalles:
        necesidades[d.variante_id] += d.cantidad
    plan, invs = calcular_asignacion(dict(necesidades), sucursales, permitir_division)

    # Repartir lo asignado a cada sucursal entre las partidas del pedido (varias partidas pueden compartir variante).
    restante_por_suc = {sid: dict(vs) for sid, vs in plan.items()}
    for sid in plan:
        asig = AsignacionSurtido(pedido=pedido, sucursal_id=sid, estado="pendiente")
        db.session.add(asig)
        for d in pedido.detalles:
            ya = sum(ad.cantidad for a in pedido.asignaciones for ad in a.detalles if ad.pedido_detalle is d)
            falta = d.cantidad - ya
            toma = min(falta, restante_por_suc[sid].get(d.variante_id, 0))
            if toma <= 0:
                continue
            restante_por_suc[sid][d.variante_id] -= toma
            ad = AsignacionDetalle(asignacion=asig, pedido_detalle=d, cantidad=toma)
            db.session.add(ad)
            db.session.flush()
            invs[(sid, d.variante_id)].reservado += toma
            db.session.add(ReservaInventario(asignacion_detalle_id=ad.id, sucursal_id=sid, variante_id=d.variante_id,
                                             cantidad=toma, estado="activa", expira=expira))
    db.session.flush()
    return plan


# ---------------------------------------------------------------- canal tienda

def _snapshot_direccion(cliente: Cliente, direccion_id: int | None) -> dict:
    d = db.session.get(Direccion, direccion_id) if direccion_id else None
    if not d or d.cliente_id != cliente.id or not d.activo:
        raise NoEncontrado("Dirección de entrega no encontrada.")
    return d.como_dict()


def _sucursal_recoger(sucursal_id: int | None) -> Sucursal:
    s = db.session.get(Sucursal, sucursal_id) if sucursal_id else None
    if not s or not s.activo or not s.permite_recoger:
        raise AppError("La sucursal elegida no está disponible para recoger pedidos.")
    return s


def _validar_variante(v: Variante | None):
    if not v or not v.activo or not v.producto.activo:
        raise Conflicto("Uno de los productos ya no está disponible.", detalles={"variante_id": v.id if v else None})


def _metodo_valido(metodo: str, modalidad: str):
    if metodo == "tarjeta_pasarela":
        raise AppError("El pago con tarjeta requiere una pasarela que aún no está integrada. "
                       "Elige transferencia o efectivo en sucursal.", codigo="metodo_no_disponible")
    if metodo not in {"transferencia", "efectivo"}:
        raise AppError("Método de pago no válido.")
    if metodo == "efectivo" and modalidad != "recoger":
        raise AppError("El pago en efectivo solo está disponible al recoger en sucursal.")


def checkout(cliente: Cliente, modalidad: str, metodo_pago: str, clave: str, direccion_id: int | None = None,
             sucursal_id: int | None = None, notas: str | None = None) -> tuple[Pedido, bool]:
    existente = db.session.scalars(select(Pedido).where(Pedido.clave_idempotencia == clave)).first()
    if existente:
        if existente.cliente_id != cliente.id:
            raise Conflicto("Clave de operación ya utilizada.")
        return existente, False

    _metodo_valido(metodo_pago, modalidad)
    carrito = db.session.scalars(select(Carrito).where(Carrito.cliente_id == cliente.id)).first()
    if not carrito or not carrito.items:
        raise AppError("Tu carrito está vacío.", codigo="carrito_vacio")

    direccion, suc_recoger, cp = None, None, None
    if modalidad == "envio":
        direccion = _snapshot_direccion(cliente, direccion_id)
        cp = direccion["cp"]
    elif modalidad == "recoger":
        suc_recoger = _sucursal_recoger(sucursal_id)
    else:
        raise AppError("Modalidad de entrega inválida.")

    promos = promociones_vigentes()
    pedido = Pedido(canal="tienda", cliente_id=cliente.id, modalidad=modalidad, metodo_pago=metodo_pago,
                    sucursal_recoger_id=suc_recoger.id if suc_recoger else None, direccion_envio=direccion,
                    estado="pendiente_pago", notas=notas, clave_idempotencia=clave)
    subtotal = descuento = Decimal("0.00")
    for item in carrito.items:
        v = item.variante
        _validar_variante(v)
        precio, desc, _ = precio_con_descuento(v, promos, pedido.sucursal_recoger_id)
        pedido.detalles.append(PedidoDetalle(
            variante_id=v.id, sku=v.sku, nombre=v.producto.nombre, talla=v.talla, color=v.color,
            cantidad=item.cantidad, precio_unitario=precio, descuento_unitario=desc,
            importe=dinero((precio - desc) * item.cantidad)))
        subtotal += precio * item.cantidad
        descuento += desc * item.cantidad
    for k, val in totales(subtotal, descuento, modalidad).items():
        setattr(pedido, k, val)
    pedido.reserva_expira = ahora() + timedelta(hours=current_app.config["RESERVA_HORAS"])
    db.session.add(pedido)
    try:
        db.session.flush()
    except IntegrityError:  # misma clave enviada en paralelo
        db.session.rollback()
        previo = db.session.scalars(select(Pedido).where(Pedido.clave_idempotencia == clave)).first()
        if previo and previo.cliente_id == cliente.id:
            return previo, False
        raise
    asignar_folio(pedido, "PED")

    sucursales = ranking_sucursales(cp, suc_recoger.id if suc_recoger else None)
    division = current_app.config["PERMITIR_DIVISION"] and modalidad == "envio"
    asignar_y_reservar(pedido, sucursales, division, pedido.reserva_expira)

    for item in list(carrito.items):
        db.session.delete(item)
    registrar_historial("pedido", pedido.id, None, "pendiente_pago", "Pedido creado en la tienda")
    auditar("pedido.crear", "pedido", pedido.id, despues={"folio": pedido.folio, "total": pedido.total,
                                                          "sucursales": [a.sucursal_id for a in pedido.asignaciones]})
    notificar_cliente(cliente.id, "pedido_creado", "pedido", pedido.id,
                      f"Recibimos tu pedido {pedido.folio}. Registra tu pago antes de "
                      f"{pedido.reserva_expira:%d/%m/%Y %H:%M} UTC para conservar la reserva.", f"/cuenta/pedidos/{pedido.id}")
    db.session.commit()
    return pedido, True


def confirmar(pedido: Pedido, motivo: str):
    """Pago confirmado o aprobación corporativa: las reservas dejan de expirar y se avisa a las sucursales."""
    transicionar(pedido, "confirmado", motivo)
    pedido.confirmado_en = ahora()
    pedido.reserva_expira = None
    for a in pedido.asignaciones:
        for ad in a.detalles:
            for r in db.session.scalars(select(ReservaInventario).where(
                    ReservaInventario.asignacion_detalle_id == ad.id, ReservaInventario.estado == "activa")):
                r.expira = None
        notificar_personal("surtido.operar", "asignacion_nueva", "asignacion", a.id,
                           f"Nuevo pedido por surtir: {pedido.folio}.", sucursal_id=a.sucursal_id,
                           enlace=f"/admin/surtido/{a.id}")


# ---------------------------------------------------------------- liberar / cancelar / expirar

def _liberar_inventario(pedido: Pedido, estado_reserva: str):
    pares = [(a.sucursal_id, ad.pedido_detalle.variante_id) for a in pedido.asignaciones for ad in a.detalles]
    invs = inv_srv.bloquear_varios(pares)
    for a in pedido.asignaciones:
        if a.estado == "cancelada":
            continue
        for ad in a.detalles:
            if ad.despachada:
                raise Conflicto("El pedido ya tiene artículos despachados; procede una devolución, no una cancelación.")
            inv = invs[(a.sucursal_id, ad.pedido_detalle.variante_id)]
            reservas = db.session.scalars(select(ReservaInventario).where(
                ReservaInventario.asignacion_detalle_id == ad.id, ReservaInventario.estado == "activa")).all()
            for r in reservas:
                inv.reservado -= r.cantidad
                r.estado = estado_reserva
            if a.estado != "pendiente":  # ya estaba comprometido para surtido
                inv.comprometido -= ad.cantidad - ad.faltante - ad.despachada
        a.estado = "cancelada"
        for paq in a.paquetes:
            paq.estado = "cancelado"


def _reembolsar_pagos(pedido: Pedido, motivo: str):
    for pago in pedido.pagos:
        if pago.estado in {"pendiente", "en_proceso"}:
            pago.estado = "cancelado"
        elif pago.estado in {"confirmado", "reembolsado_parcial"}:
            pendientes = sum((r.monto for r in pago.reembolsos if r.estado == "pendiente"), Decimal("0"))
            saldo = pago.monto - pago.monto_reembolsado - pendientes
            if saldo > 0:
                db.session.add(Reembolso(pago_id=pago.id, pedido_id=pedido.id, monto=saldo, motivo=motivo,
                                         tipo="reembolso", estado="pendiente"))
                notificar_personal("reembolso.autorizar", "reembolso_pendiente", "pedido", pedido.id,
                                   f"Reembolso pendiente por cancelación de {pedido.folio}.")


def cancelar(pedido: Pedido, motivo: str, por_cliente: bool):
    permitidos = CANCELABLE_CLIENTE if por_cliente else CANCELABLE_PERSONAL
    if pedido.estado not in permitidos:
        raise TransicionInvalida(f"Un pedido {ETIQUETAS.get(pedido.estado, pedido.estado)} no se puede cancelar.",
                                 detalles={"estado_actual": pedido.estado})
    if not motivo or len(motivo.strip()) < 5:
        raise AppError("Indica el motivo de la cancelación.")
    _liberar_inventario(pedido, "liberada")
    for d in pedido.detalles:
        d.cantidad_cancelada = d.cantidad - d.cantidad_entregada
    _reembolsar_pagos(pedido, f"Cancelación del pedido {pedido.folio}")
    transicionar(pedido, "cancelado", motivo)
    auditar("pedido.cancelar", "pedido", pedido.id, despues={"motivo": motivo, "por_cliente": por_cliente})
    db.session.commit()
    return pedido


def expirar_reservas() -> int:
    """Expira pedidos de tienda sin pago registrado dentro del plazo. Seguro de ejecutar en paralelo."""
    ids = db.session.scalars(select(Pedido.id).where(Pedido.estado == "pendiente_pago",
                                                     Pedido.reserva_expira < ahora())).all()
    n = 0
    for pid in ids:
        p = bloquear_pedido(pid)
        if p.estado != "pendiente_pago" or not p.reserva_expira or p.reserva_expira >= ahora():
            db.session.rollback()
            continue
        _liberar_inventario(p, "expirada")
        for d in p.detalles:
            d.cantidad_cancelada = d.cantidad
        transicionar(p, "expirado", "Reserva vencida sin pago registrado")
        auditar("pedido.expirar", "pedido", p.id)
        db.session.commit()
        n += 1
    return n


# ---------------------------------------------------------------- recálculo y cierre

def recalcular(pedido: Pedido):
    efectivo = sum(d.cantidad - d.cantidad_cancelada for d in pedido.detalles)
    if efectivo == 0:
        _reembolsar_pagos(pedido, f"Pedido {pedido.folio} sin artículos surtibles")
        pedido.estado, anterior = "cancelado", pedido.estado
        registrar_historial("pedido", pedido.id, anterior, "cancelado", "Todos los artículos resultaron faltantes")
        return
    entregada = sum(d.cantidad_entregada for d in pedido.detalles)
    despachada = sum(ad.despachada for a in pedido.asignaciones for ad in a.detalles)
    if entregada >= efectivo:
        nuevo = "entregado"
    elif entregada > 0:
        nuevo = "parcialmente_entregado"
    elif despachada >= efectivo:
        nuevo = "enviado"
    elif despachada > 0:
        nuevo = "parcialmente_enviado"
    else:
        nuevo = "en_preparacion"
    if pedido.estado in RANGO_LOGISTICO and RANGO_LOGISTICO[nuevo] > RANGO_LOGISTICO[pedido.estado]:
        transicionar(pedido, nuevo, "Actualización logística")


def cerrar(pedido: Pedido, comentario: str | None = None):
    if pedido.estado != "entregado":
        raise TransicionInvalida("Solo se cierran pedidos entregados por completo.")
    pendientes = []
    abiertas = db.session.scalars(select(Incidencia.folio).where(Incidencia.pedido_id == pedido.id,
                                                                 Incidencia.estado.in_(["abierta", "en_atencion"]))).all()
    if abiertas:
        pendientes.append(f"Incidencias abiertas: {', '.join(abiertas)}")
    devs = db.session.scalars(select(Devolucion.folio).where(
        Devolucion.pedido_id == pedido.id, Devolucion.estado.notin_(["rechazada", "cerrada"]))).all()
    if devs:
        pendientes.append(f"Devoluciones en proceso: {', '.join(devs)}")
    reemb = db.session.scalars(select(Reembolso.id).where(Reembolso.pedido_id == pedido.id,
                                                          Reembolso.estado == "pendiente")).all()
    if reemb:
        pendientes.append(f"{len(reemb)} reembolso(s) pendiente(s)")
    if pedido.canal == "tienda":
        confirmado = sum((p.monto for p in pedido.pagos if p.estado in {"confirmado", "reembolsado_parcial", "reembolsado"}),
                         Decimal("0"))
        if confirmado < pedido.total:
            pendientes.append("El pago no cubre el total")
    else:
        from ..models import EntregaIndividual, Paquete
        sin_entregar = db.session.scalars(select(EntregaIndividual.id).join(Paquete).join(AsignacionSurtido).where(
            AsignacionSurtido.pedido_id == pedido.id, EntregaIndividual.estado == "pendiente")).all()
        if sin_entregar:
            pendientes.append(f"{len(sin_entregar)} entrega(s) individual(es) pendiente(s)")
    if pendientes:
        raise Conflicto("El pedido no se puede cerrar todavía.", detalles={"pendientes": pendientes})
    transicionar(pedido, "cerrado", comentario or "Pedido conciliado")
    auditar("pedido.cerrar", "pedido", pedido.id)
    db.session.commit()
    return pedido


# ---------------------------------------------------------------- canal corporativo

def _partidas_corporativas(cliente: Cliente, partidas: list[dict], pedido: Pedido, promos):
    if not partidas:
        raise AppError("Agrega al menos una partida.")
    subtotal = descuento = Decimal("0.00")
    errores = []
    for i, p in enumerate(partidas):
        emp = db.session.get(EmpleadoCorporativo, p["empleado_id"])
        if not emp or emp.cliente_id != cliente.id or not emp.activo:
            errores.append({"partida": i, "error": "Empleado no encontrado o inactivo."})
            continue
        v = db.session.get(Variante, p["variante_id"])
        if not v or not v.activo or not v.producto.activo:
            errores.append({"partida": i, "error": "Producto no disponible."})
            continue
        autorizado = emp.puesto in {pp.puesto for pp in v.producto.puestos}
        excepcion = (p.get("excepcion") or "").strip() or None
        if not autorizado and (not excepcion or len(excepcion) < 10):
            errores.append({"partida": i, "error": f"{v.producto.nombre} no está autorizado para el puesto "
                                                   f"{emp.puesto}; justifica la excepción (mínimo 10 caracteres)."})
            continue
        precio, desc, _ = precio_con_descuento(v, promos, pedido.sucursal_recoger_id)
        pedido.detalles.append(PedidoDetalle(
            variante_id=v.id, empleado_id=emp.id, sku=v.sku, nombre=v.producto.nombre, talla=v.talla, color=v.color,
            cantidad=p["cantidad"], precio_unitario=precio, descuento_unitario=desc,
            importe=dinero((precio - desc) * p["cantidad"]), excepcion=None if autorizado else excepcion))
        subtotal += precio * p["cantidad"]
        descuento += desc * p["cantidad"]
    if errores:
        raise AppError("Hay partidas con errores.", detalles={"partidas": errores}, status=422, codigo="partidas_invalidas")
    for k, val in totales(subtotal, descuento, pedido.modalidad, "corporativo").items():
        setattr(pedido, k, val)


def crear_corporativo(cliente: Cliente, modalidad: str, partidas: list[dict], clave: str,
                      direccion_id: int | None = None, sucursal_id: int | None = None, notas: str | None = None):
    existente = db.session.scalars(select(Pedido).where(Pedido.clave_idempotencia == clave)).first()
    if existente:
        if existente.cliente_id != cliente.id:
            raise Conflicto("Clave de operación ya utilizada.")
        return existente, False
    pedido = Pedido(canal="corporativo", cliente_id=cliente.id, modalidad=modalidad, metodo_pago="credito_corporativo",
                    estado="en_revision", notas=notas, clave_idempotencia=clave)
    if modalidad == "envio":
        pedido.direccion_envio = _snapshot_direccion(cliente, direccion_id)
    elif modalidad == "recoger":
        pedido.sucursal_recoger_id = _sucursal_recoger(sucursal_id).id
    else:
        raise AppError("Modalidad de entrega inválida.")
    _partidas_corporativas(cliente, partidas, pedido, promociones_vigentes())
    db.session.add(pedido)
    asignar_folio(pedido, "PED")
    registrar_historial("pedido", pedido.id, None, "en_revision", "Pedido corporativo enviado a revisión")
    auditar("pedido.crear_corporativo", "pedido", pedido.id, despues={"folio": pedido.folio, "partidas": len(partidas)})
    notificar_personal("pedido.aprobar", "pedido_por_aprobar", "pedido", pedido.id,
                       f"Pedido corporativo {pedido.folio} de {cliente.razon_social or cliente.nombre} por aprobar.",
                       enlace=f"/admin/pedidos/{pedido.id}")
    db.session.commit()
    return pedido, True


def corregir_corporativo(cliente: Cliente, pedido: Pedido, partidas: list[dict], notas: str | None):
    if pedido.cliente_id != cliente.id:
        raise NoEncontrado("Pedido no encontrado.")
    if pedido.estado != "devuelto":
        raise TransicionInvalida("Solo se corrigen pedidos devueltos para corrección.")
    for d in list(pedido.detalles):
        pedido.detalles.remove(d)
    db.session.flush()
    _partidas_corporativas(cliente, partidas, pedido, promociones_vigentes())
    pedido.notas = notas
    transicionar(pedido, "en_revision", "Corregido y reenviado por el cliente")
    auditar("pedido.corregir", "pedido", pedido.id, despues={"partidas": len(partidas)})
    notificar_personal("pedido.aprobar", "pedido_reenviado", "pedido", pedido.id,
                       f"Pedido {pedido.folio} corregido y reenviado.", enlace=f"/admin/pedidos/{pedido.id}")
    db.session.commit()
    return pedido


def decidir_corporativo(pedido: Pedido, decision: str, motivo: str | None, aceptar_excepciones: bool = False):
    usuario_id, _ = actor_ids()
    if pedido.canal != "corporativo":
        raise AppError("Solo los pedidos corporativos requieren aprobación.")
    if pedido.estado != "en_revision":
        raise TransicionInvalida("El pedido no está en revisión.")
    if decision in {"rechazado", "devuelto"}:
        if not motivo or len(motivo.strip()) < 5:
            raise AppError("El motivo es obligatorio para rechazar o devolver.")
        db.session.add(Aprobacion(pedido_id=pedido.id, decision=decision, motivo=motivo, usuario_id=usuario_id))
        transicionar(pedido, decision, motivo)
        auditar(f"pedido.{decision}", "pedido", pedido.id, despues={"motivo": motivo})
        db.session.commit()
        return pedido
    if decision != "aprobado":
        raise AppError("Decisión inválida.")
    if any(d.excepcion for d in pedido.detalles) and not aceptar_excepciones:
        raise Conflicto("El pedido contiene excepciones por puesto; confirma explícitamente que las autorizas.",
                        codigo="excepciones_sin_aceptar")
    cp = (pedido.direccion_envio or {}).get("cp")
    sucursales = ranking_sucursales(cp, pedido.sucursal_recoger_id)
    division = current_app.config["PERMITIR_DIVISION"] and pedido.modalidad == "envio"
    asignar_y_reservar(pedido, sucursales, division, None)
    db.session.add(Aprobacion(pedido_id=pedido.id, decision="aprobado", motivo=motivo, usuario_id=usuario_id))
    pago = Pago(pedido_id=pedido.id, metodo="credito_corporativo", estado="pendiente", monto=pedido.total)
    db.session.add(pago)
    asignar_folio(pago, "PAG")
    confirmar(pedido, motivo or "Aprobado")
    auditar("pedido.aprobado", "pedido", pedido.id, despues={"sucursales": [a.sucursal_id for a in pedido.asignaciones]})
    db.session.commit()
    return pedido


def verificar_dueno(pedido: Pedido, cliente: Cliente):
    if pedido.cliente_id != cliente.id:
        raise NoEncontrado("Pedido no encontrado.")


def sucursales_de(pedido: Pedido) -> set[int]:
    ids = {a.sucursal_id for a in pedido.asignaciones}
    if pedido.sucursal_recoger_id:
        ids.add(pedido.sucursal_recoger_id)
    return ids
