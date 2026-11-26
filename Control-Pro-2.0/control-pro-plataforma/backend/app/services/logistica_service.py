"""Surtido por sucursal, empaque, despacho, eventos de envío, entrega en sucursal, recepción corporativa y
entregas individuales con conformidad.

Los eventos de envío son internos: no hay integración con paqueterías y cada evento queda marcado
`origen='interno'`. La interfaz `integrations.envios.ProveedorEnvio` permite conectar una paquetería después.
"""
from decimal import Decimal

from sqlalchemy import func, select

from ..errors import AppError, Conflicto, NoEncontrado, TransicionInvalida
from ..extensions import db
from ..models import (AsignacionDetalle, AsignacionSurtido, EntregaIndividual, EntregaIndividualDetalle, Envio,
                      EventoEnvio, Paquete, PaqueteDetalle, Pedido, PedidoDetalle, Recepcion, RecepcionDetalle,
                      ReservaInventario, ahora)
from . import aviso_incidencia
from . import inventario_service as inv_srv
from . import pedido_service as ped
from .comun import (actor_ids, asignar_folio, auditar, cambiar_estado, dinero, notificar_cliente, notificar_personal,
                    registrar_historial, registrar_incidencia)

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
    if pedido.estado == "aprobado":  # corporativo: solo la autorización de la distribuidora lo confirma
        raise TransicionInvalida("La distribuidora aún no autoriza este pedido; no puede surtirse.",
                                 codigo="autorizacion_pendiente")
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
        registrar_incidencia(tipo="faltante_surtido", prioridad="alta", pedido_id=pedido.id, sucursal_id=a.sucursal_id,
                             descripcion="Faltantes al surtir: " + "; ".join(faltas))
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
        normales = [p for p in a.paquetes if p.incidencia_id is None]  # las reposiciones no cambian el surtido
        entregados = all(p.estado in {"entregado", "cancelado"} for p in normales)
        _estado_asig(a, "entregada" if entregados and normales else "despachada")
    elif all(d.empacada == q for q, d in efectivo):
        _estado_asig(a, "empacada")


def _validar_por_persona(a: AsignacionSurtido, paq: Paquete, ids_en_paquete: set[int]):
    """Una persona, un paquete: el paquete grande lleva dentro un paquete individual por empleado, y las piezas de un
    mismo empleado nunca se reparten entre dos paquetes grandes.

    Reglas (por asignación, es decir, por almacén que surte):
    1. Si el paquete lleva piezas de un empleado, debe llevar TODAS sus piezas ya surtidas y aún sin empacar.
    2. Si el empleado ya tiene piezas en otro paquete que todavía no sale (`preparado`), lo nuevo se agrega a ese
       paquete en lugar de abrir otro.
    Lo que se surte después (pendiente de producción o surtido posterior) puede viajar en un envío posterior, pero
    también completo y en un solo paquete. Las piezas sin empleado (tienda en línea) pueden ir en cualquier paquete.
    Se llama con las cantidades `empacada` ya actualizadas y antes del commit: si falla, la petición se revierte.
    """
    detalles = {d.id: d for d in a.detalles}
    empleados = {detalles[i].pedido_detalle.empleado_id for i in ids_en_paquete if detalles[i].pedido_detalle.empleado_id}
    for emp_id in sorted(empleados):
        suyas = [d for d in a.detalles if d.pedido_detalle.empleado_id == emp_id]
        nombre = suyas[0].pedido_detalle.empleado.nombre if suyas[0].pedido_detalle.empleado else "el empleado"
        sueltas = [d for d in suyas if d.surtida > d.empacada]
        if sueltas:
            faltan = ", ".join(f"{d.surtida - d.empacada}× {d.pedido_detalle.nombre} ({d.pedido_detalle.talla})" for d in sueltas)
            raise Conflicto(f"No se puede dividir a {nombre}: todas sus piezas van juntas en su paquete individual. "
                            f"Agrega también: {faltan}.", codigo="persona_dividida",
                            detalles={"empleado_id": emp_id, "asignacion_detalle_ids": [d.id for d in sueltas]})
        ids_suyas = {d.id for d in suyas}
        otro = next((p for p in a.paquetes if p is not paq and p.estado == "preparado" and p.incidencia_id is None
                     and any(x.asignacion_detalle_id in ids_suyas for x in p.detalles)), None)
        if otro:
            raise Conflicto(f"{nombre} ya tiene piezas en el paquete {otro.folio}, que aún no sale. "
                            f"Agrégalas a ese paquete para que todo lo suyo vaya junto.", codigo="persona_en_otro_paquete",
                            detalles={"empleado_id": emp_id, "paquete_id": otro.id})


def _agregar_partidas(a: AsignacionSurtido, paq: Paquete, partidas: list[dict]) -> int:
    detalles = {d.id: d for d in a.detalles}
    existentes = {x.asignacion_detalle_id: x for x in paq.detalles}
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
        if d.id in existentes:
            existentes[d.id].cantidad += cant
        else:
            existentes[d.id] = PaqueteDetalle(asignacion_detalle_id=d.id, cantidad=cant)
            paq.detalles.append(existentes[d.id])
        total += cant
    if total == 0:
        raise AppError("El paquete debe contener al menos un artículo.")
    _validar_por_persona(a, paq, set(existentes))
    return total


def crear_paquete(a: AsignacionSurtido, partidas: list[dict], peso_kg: Decimal | None = None) -> Paquete:
    if a.estado not in {"en_surtido", "empacada"}:
        raise TransicionInvalida("Inicia el surtido antes de empacar.")
    paq = Paquete(asignacion_id=a.id, estado="preparado", peso_kg=peso_kg)
    total = _agregar_partidas(a, paq, partidas)
    db.session.add(paq)
    asignar_folio(paq, "PAQ")
    _actualizar_asignacion(a)
    notificar_cliente(a.pedido.cliente_id, f"paquete_preparado_{paq.id}", "paquete", paq.id,
                      f"Se preparó el paquete {paq.folio} de tu {'solicitud' if a.pedido.canal == 'corporativo' else 'pedido'} "
                      f"{a.pedido.folio} ({total} artículo(s)).", f"/cuenta/pedidos/{a.pedido_id}")
    auditar("paquete.crear", "paquete", paq.id, despues={"unidades": total}, sucursal_id=a.sucursal_id)
    db.session.commit()
    return paq


def agregar_a_paquete(a: AsignacionSurtido, paq: Paquete, partidas: list[dict]) -> Paquete:
    """Agrega piezas a un paquete que aún no sale (para completar el paquete individual de una persona)."""
    if paq.asignacion_id != a.id:
        raise NoEncontrado("El paquete no pertenece a esta asignación.")
    if paq.incidencia_id:
        raise TransicionInvalida("Es un paquete de reposición; su contenido se define desde la incidencia.")
    if paq.estado != "preparado":
        raise TransicionInvalida("Solo se pueden agregar piezas a un paquete que aún no sale.")
    if a.estado not in {"en_surtido", "empacada"}:
        raise TransicionInvalida("La asignación no está en surtido.")
    total = _agregar_partidas(a, paq, partidas)
    _actualizar_asignacion(a)
    auditar("paquete.agregar", "paquete", paq.id, despues={"unidades": total}, sucursal_id=a.sucursal_id)
    db.session.commit()
    return paq


def _salida(paq: Paquete, a: AsignacionSurtido, pedido: Pedido):
    invs = inv_srv.bloquear_varios([(a.sucursal_id, pd.asignacion_detalle.pedido_detalle.variante_id)
                                    for pd in paq.detalles])
    for pd in paq.detalles:
        d = pd.asignacion_detalle
        inv = invs[(a.sucursal_id, d.pedido_detalle.variante_id)]
        inv.comprometido -= pd.cantidad
        motivo = f"Reposición {paq.folio} ({pedido.folio})" if paq.incidencia_id else f"Salida de {paq.folio} ({pedido.folio})"
        inv_srv.movimiento(inv, "salida_venta", -pd.cantidad, motivo, "paquete", paq.id)
        if not paq.incidencia_id:  # la reposición es mercancía adicional: no avanza el surtido original
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
    if paq.incidencia_id:
        _nota_incidencia(paq.incidencia, f"Reposición {paq.folio} enviada con {paqueteria.strip()}, guía {guia.strip()}.")
    aviso, enlace = aviso_incidencia.aviso_paquete(
        paq, pedido, f"Tu paquete {paq.folio} salió con {paqueteria}, guía {guia}.",
        paq.incidencia_id and f"La reposición de {paq.incidencia.folio} salió\nPaquete {paq.folio} con {paqueteria}, guía {guia}.")
    notificar_cliente(pedido.cliente_id, f"paquete_despachado_{paq.id}", "paquete", paq.id, aviso, enlace)
    auditar("paquete.despachar", "paquete", paq.id, despues={"paqueteria": paqueteria, "guia": guia},
            sucursal_id=a.sucursal_id)
    db.session.commit()
    return paq


def _buenas_en_sucursal(pdet_id: int, sin_paquete_id: int) -> int:
    """Piezas del artículo que llegaron en buen estado en los paquetes ya entregados, sin contar `sin_paquete_id`."""
    llegaron = db.session.scalar(
        select(func.coalesce(func.sum(PaqueteDetalle.cantidad), 0))
        .join(AsignacionDetalle, AsignacionDetalle.id == PaqueteDetalle.asignacion_detalle_id)
        .join(Paquete, Paquete.id == PaqueteDetalle.paquete_id)
        .where(AsignacionDetalle.pedido_detalle_id == pdet_id, Paquete.estado == "entregado", Paquete.id != sin_paquete_id))
    faltaron = db.session.scalar(
        select(func.coalesce(func.sum(RecepcionDetalle.esperada - RecepcionDetalle.recibida), 0))
        .join(Recepcion, Recepcion.id == RecepcionDetalle.recepcion_id)
        .where(RecepcionDetalle.pedido_detalle_id == pdet_id, Recepcion.paquete_id != sin_paquete_id))
    return llegaron - faltaron


def _mover_entregada(pdet: PedidoDetalle, paquete_id: int, antes: int, despues: int) -> int:
    """`cantidad_entregada` = piezas en buen estado en la sucursal, sin pasar del tope del artículo (H-1, R3).

    `antes`/`despues`: piezas buenas que aporta el paquete `paquete_id` antes y después del evento. Mientras nada pase
    del tope equivale a sumar o restar la diferencia (flujo normal); lo que excede el tope es reemplazo y no cuenta.
    Así una reposición de una pieza ya entregada no rompe `ck_pdet_entregada`, y si esa reposición no llega, lo que se
    resta es el reemplazo, no la pieza que ya tenía la sucursal. Devuelve cuánto cambió el contador."""
    tope = pdet.cantidad - pdet.cantidad_cancelada - pdet.cantidad_por_producir
    base = _buenas_en_sucursal(pdet.id, paquete_id)
    cambio = min(tope, base + despues) - min(tope, base + antes)
    pdet.cantidad_entregada = max(0, min(tope, pdet.cantidad_entregada + cambio))
    return cambio


def _marcar_entregado(paq: Paquete, a: AsignacionSurtido, pedido: Pedido):
    paq.estado = "entregado"
    partidas = []
    for pd in paq.detalles:
        cubre = _mover_entregada(pd.asignacion_detalle.pedido_detalle, paq.id, 0, pd.cantidad)
        partidas.append({"pedido_detalle_id": pd.asignacion_detalle.pedido_detalle_id, "cubre_faltante": cubre,
                         "reemplazo": pd.cantidad - cubre})
    if paq.incidencia_id or any(p["reemplazo"] for p in partidas):
        # Trazabilidad de H-1: qué parte cubrió un faltante (cuenta como entregada) y qué parte fue reemplazo.
        auditar("paquete.entrega_reposicion", "paquete", paq.id, despues={"partidas": partidas}, sucursal_id=a.sucursal_id)
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
        registrar_incidencia(tipo="incidencia_envio", prioridad="alta", pedido_id=pedido.id, paquete_id=paq.id,
                             sucursal_id=a.sucursal_id, descripcion=descripcion)
    else:
        _marcar_entregado(paq, a, pedido)
    avisos = {"en_transito": f"Tu paquete {paq.folio} va en camino ({envio.paqueteria}, guía {envio.guia}).",
              "entregado": f"El paquete {paq.folio} se entregó en tu sucursal. Registra la recepción.",
              "incidencia": f"Hubo una incidencia con el paquete {paq.folio}: {descripcion.strip()}"}
    de_reposicion = paq.incidencia_id and {
        "en_transito": f"La reposición de {paq.incidencia.folio} va en camino\nPaquete {paq.folio} ({envio.paqueteria}, guía {envio.guia}).",
        "entregado": f"La reposición de {paq.incidencia.folio} llegó a tu sucursal\nPaquete {paq.folio}. Registra su recepción.",
        "incidencia": f"Hubo un problema con el envío de la reposición de {paq.incidencia.folio}\n{descripcion.strip()}"}[estado]
    aviso, enlace = aviso_incidencia.aviso_paquete(paq, pedido, avisos[estado], de_reposicion)
    notificar_cliente(pedido.cliente_id, f"envio_{estado}_{paq.id}_{len(envio.eventos)}", "paquete", paq.id, aviso, enlace)
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
    aviso, enlace = aviso_incidencia.aviso_paquete(
        paq, pedido, f"Tu paquete {paq.folio} está listo para recoger en {a.sucursal.nombre}.",
        paq.incidencia_id and f"Tu reposición de {paq.incidencia.folio} está lista para recoger\nPaquete {paq.folio} en {a.sucursal.nombre}.")
    notificar_cliente(pedido.cliente_id, f"paquete_listo_{paq.id}", "paquete", paq.id, aviso, enlace)
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

PROBLEMAS_RECEPCION = {"faltante": "faltante", "danado": "dañado", "diferencia": "diferencia"}
PROBLEMAS_CONFORMIDAD = {"talla": "problema de talla", "faltante": "artículo faltante", "incorrecto": "artículo incorrecto",
                         "danado": "artículo dañado"}


def contenido_por_partida(paq: Paquete) -> dict[int, int]:
    """Unidades del paquete por partida del pedido (una partida = un artículo para un empleado)."""
    total: dict[int, int] = {}
    for pd in paq.detalles:
        pid = pd.asignacion_detalle.pedido_detalle_id
        total[pid] = total.get(pid, 0) + pd.cantidad
    return total


def _nota_incidencia(inc, comentario: str, estado: str | None = None, resolucion: str | None = None):
    """Agrega una entrada al seguimiento de la incidencia (y cambia su estado si se indica). No hace commit."""
    from ..models import IncidenciaSeguimiento
    from .devolucion_service import TRANSICIONES_INCIDENCIA
    anterior = inc.estado
    if estado and estado != inc.estado and estado in TRANSICIONES_INCIDENCIA.get(inc.estado, set()):
        if resolucion:
            inc.resolucion = resolucion
        cambiar_estado(inc, "incidencia", estado, TRANSICIONES_INCIDENCIA, comentario)
    usuario_id, cliente_id = actor_ids()
    s = IncidenciaSeguimiento(incidencia_id=inc.id, estado_anterior=anterior, estado_nuevo=inc.estado,
                              comentario=comentario, adjuntos=[], usuario_id=usuario_id, cliente_id=cliente_id)
    db.session.add(s)
    db.session.flush()
    return s


def _ajustar_entregas(paq: Paquete, faltan: dict[int, int]):
    """Lo que no llegó en buen estado no se entrega al empleado: se descuenta de su entrega individual (y de lo
    entregado en la solicitud). Así la entrega pide solo lo que de verdad está en la sucursal y no se abre una
    segunda incidencia por el mismo problema; lo que falta llega en la reposición, con su propia entrega."""
    contenido = contenido_por_partida(paq)
    for ent in db.session.scalars(select(EntregaIndividual).where(EntregaIndividual.paquete_id == paq.id)).all():
        for det in list(ent.detalles):
            menos = min(faltan.get(det.pedido_detalle_id, 0), det.esperada)
            if not menos:
                continue
            det.esperada -= menos
            n = contenido.get(det.pedido_detalle_id, 0)
            _mover_entregada(det.pedido_detalle, paq.id, n, n - menos)
            if det.esperada == 0:
                ent.detalles.remove(det)  # delete-orphan: se borra al guardar
        if not ent.detalles:
            db.session.delete(ent)


def registrar_recepcion(paq: Paquete, cliente_id: int, completa: bool, diferencias: str | None,
                        partidas: list[dict] | None = None, evidencias: list[str] | None = None):
    """Recepción física del paquete por la sucursal. No equivale a la entrega a cada empleado.

    `partidas` (opcional): [{pedido_detalle_id, recibida, problema, nota, evidencias}] por artículo. `recibida` son
    las piezas que llegaron EN BUEN ESTADO (las que se pueden entregar); si hay problema, debe ser menor a lo esperado.
    `evidencias`: fotos generales del paquete (caja golpeada, etiqueta, etc.).
    """
    a = paq.asignacion
    pedido = a.pedido
    if pedido.cliente_id != cliente_id or pedido.canal != "corporativo":
        raise NoEncontrado("Paquete no encontrado.")
    if paq.estado != "entregado":
        raise TransicionInvalida("El paquete aún no se entrega a tu empresa.")
    if db.session.scalars(select(Recepcion).where(Recepcion.paquete_id == paq.id)).first():
        raise Conflicto("La recepción de este paquete ya fue registrada.")
    esperado = contenido_por_partida(paq)
    detalles, lineas, faltan, fotos = [], [], {}, list(dict.fromkeys(evidencias or []))
    for p in partidas or []:
        pid = p["pedido_detalle_id"]
        if pid not in esperado:
            raise NoEncontrado("El artículo no viene en este paquete.")
        recibida, problema = p["recibida"], p.get("problema") or None
        if recibida < 0 or recibida > esperado[pid]:
            raise AppError(f"La cantidad recibida debe estar entre 0 y {esperado[pid]}.")
        if recibida < esperado[pid] and not problema:
            problema = "faltante"
        if problema and problema not in PROBLEMAS_RECEPCION:
            raise AppError("Tipo de problema inválido.")
        pdet = db.session.get(PedidoDetalle, pid)
        if problema and recibida >= esperado[pid]:
            raise AppError(f"{pdet.nombre} ({pdet.talla}): si hay un problema, en «en buen estado» anota solo las piezas "
                           f"que sí se pueden entregar (menos de {esperado[pid]}).", codigo="recibida_con_problema")
        nota = (p.get("nota") or "").strip() or None
        propias = list(dict.fromkeys(p.get("evidencias") or [])) if problema else []
        detalles.append(RecepcionDetalle(pedido_detalle_id=pid, esperada=esperado[pid], recibida=recibida,
                                         problema=problema, nota=nota, evidencias=propias))
        if problema:
            fotos += [u for u in propias if u not in fotos]
            faltan[pid] = esperado[pid] - recibida
            destinatario = pdet.empleado.nombre if pdet.empleado else "sin empleado"
            lineas.append((pdet, f"{pdet.nombre} ({pdet.talla}) para {destinatario}: {PROBLEMAS_RECEPCION[problema]}, "
                                 f"en buen estado {recibida} de {esperado[pid]}" + (f" — {nota}" if nota else "")))
    if detalles:
        completa = not lineas
        if lineas:
            extra = (diferencias or "").strip()
            diferencias = "; ".join(t for _, t in lineas) + (f". {extra}" if extra else "")
    if not completa and not (diferencias or "").strip():
        raise AppError("Describe las diferencias encontradas.")
    rec = Recepcion(paquete_id=paq.id, estado="completa" if completa else "parcial",
                    diferencias=None if completa else diferencias.strip(), cliente_id=cliente_id)
    rec.detalles = detalles
    db.session.add(rec)
    if fotos:
        from ..api.archivos import dueno_actual, vincular_a_pedido
        vincular_a_pedido(fotos, pedido.id, dueno_actual())
    if faltan:
        _ajustar_entregas(paq, faltan)
    if not completa:
        unico = lineas[0][0] if len(lineas) == 1 else None
        registrar_incidencia(tipo="diferencia_recepcion", prioridad="alta", pedido_id=pedido.id, paquete_id=paq.id,
                             sucursal_id=a.sucursal_id, descripcion=diferencias.strip(), evidencias=fotos,
                             pedido_detalle_id=unico.id if unico else None,
                             empleado_id=unico.empleado_id if unico else None)
    elif paq.incidencia_id and paq.incidencia.estado in {"abierta", "en_atencion"}:
        # La reposición llegó completa y en buen estado: la incidencia queda resuelta y la sucursal confirma el cierre.
        s = _nota_incidencia(paq.incidencia, f"La sucursal recibió completa la reposición {paq.folio}.", estado="resuelta",
                             resolucion=f"Reposición {paq.folio} recibida completa y en buen estado.")
        aviso_incidencia.reposicion_recibida(paq.incidencia, paq, s)
    auditar("recepcion.registrar", "paquete", paq.id, despues={"completa": completa, "diferencias": diferencias,
                                                               "partidas": partidas or [], "evidencias": fotos})
    db.session.commit()
    return rec


def registrar_entrega_individual(ent: EntregaIndividual, cliente_id: int, cantidades: dict[int, int], firma: str,
                                 valoracion: int | None, observaciones: str | None, registrado_por: str):
    paq = db.session.get(Paquete, ent.paquete_id)
    pedido = paq.asignacion.pedido
    if pedido.cliente_id != cliente_id:
        raise NoEncontrado("Entrega no encontrada.")
    if not db.session.scalars(select(Recepcion).where(Recepcion.paquete_id == paq.id)).first():
        raise TransicionInvalida("Registra primero la recepción física del paquete.")
    if ent.estado != "pendiente":
        raise TransicionInvalida("Esta entrega ya fue registrada.")
    if len((registrado_por or "").strip()) < 3:
        raise AppError("Indica el nombre de la persona que entrega los artículos.")
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
    ent.firma, ent.observaciones, ent.entregado_en = firma, observaciones, ahora()
    ent.registrado_por = registrado_por.strip()
    if valoracion is not None:  # compatibilidad: la conformidad ahora se registra aparte
        ent.valoracion = valoracion
    ent.estado = "entregada" if completas else "con_incidencia"
    if not completas:
        faltan = [d for d in ent.detalles if d.entregada < d.esperada]
        registrar_incidencia(tipo="entrega_incompleta", prioridad="media", pedido_id=pedido.id, paquete_id=paq.id,
                             empleado_id=ent.empleado_id,
                             pedido_detalle_id=faltan[0].pedido_detalle_id if len(faltan) == 1 else None,
                             descripcion=f"Entrega incompleta a {ent.empleado.nombre}. {observaciones or ''}".strip())
    auditar("entrega_individual.registrar", "entrega_individual", ent.id,
            despues={"empleado": ent.empleado.nombre, "estado": ent.estado, "registrado_por": ent.registrado_por})
    db.session.commit()
    return ent


def registrar_conformidad(ent: EntregaIndividual, cliente_id: int, valoracion: int, comentario: str | None,
                          problema: str | None, pedido_detalle_id: int | None):
    """Conformidad del empleado con lo que recibió. Si reporta un problema se abre una incidencia ligada a él."""
    paq = db.session.get(Paquete, ent.paquete_id)
    pedido = paq.asignacion.pedido
    if pedido.cliente_id != cliente_id:
        raise NoEncontrado("Entrega no encontrada.")
    if ent.estado not in {"entregada", "con_incidencia"}:
        raise TransicionInvalida("Primero registra la entrega con la firma del empleado.")
    if ent.conformidad_en:
        raise Conflicto("La conformidad de esta entrega ya fue registrada.")
    if problema and problema not in PROBLEMAS_CONFORMIDAD:
        raise AppError("Tipo de problema inválido.")
    if pedido_detalle_id is not None and pedido_detalle_id not in {d.pedido_detalle_id for d in ent.detalles}:
        raise NoEncontrado("El artículo no pertenece a esta entrega.")
    comentario = (comentario or "").strip() or None
    if problema and not comentario:
        raise AppError("Describe el problema para darle seguimiento.")
    anterior = ent.estado
    ent.valoracion, ent.conformidad_comentario, ent.conformidad_en = valoracion, comentario, ahora()
    if problema:
        ent.estado = "con_incidencia"
        registrar_incidencia(tipo=f"conformidad_{problema}", prioridad="media", pedido_id=pedido.id, paquete_id=paq.id,
                             empleado_id=ent.empleado_id, pedido_detalle_id=pedido_detalle_id,
                             descripcion=f"{ent.empleado.nombre} reporta {PROBLEMAS_CONFORMIDAD[problema]}: {comentario}")
    elif anterior == "entregada":
        ent.estado = "confirmada"
    registrar_historial("entrega_individual", ent.id, anterior, ent.estado, comentario)
    auditar("entrega_individual.conformidad", "entrega_individual", ent.id,
            despues={"valoracion": valoracion, "problema": problema, "estado": ent.estado})
    db.session.commit()
    return ent


# ---------------------------------------------------------------- reposición de incidencias (envío adicional con guía)

def _afectadas(inc, pedido: Pedido) -> dict[int, int]:
    """Piezas que la incidencia dice que fallaron, por artículo (H-1, R1). Nunca incluye las canceladas (D3)."""
    if inc.tipo == "faltante_surtido":
        return {}  # D3: lo que faltó al surtir ya se canceló y se reembolsó; no se repone
    disp = {d.id: d.cantidad - d.cantidad_cancelada for d in pedido.detalles}
    paq = db.session.get(Paquete, inc.paquete_id) if inc.paquete_id else None
    if paq and inc.tipo == "diferencia_recepcion":
        rec = db.session.scalars(select(Recepcion).where(Recepcion.paquete_id == paq.id)).first()
        if rec:
            return {d.pedido_detalle_id: min(d.esperada - d.recibida, disp.get(d.pedido_detalle_id, 0))
                    for d in rec.detalles if d.recibida < d.esperada}
    contenido = contenido_por_partida(paq) if paq else {}
    if inc.pedido_detalle_id:
        pid = inc.pedido_detalle_id
        return {pid: min(disp.get(pid, 0), contenido.get(pid, disp.get(pid, 0)))}
    if paq:
        return {pid: min(n, disp.get(pid, 0)) for pid, n in contenido.items()}
    return disp


def reposicion_maxima(inc) -> list[dict]:
    """Lo que todavía se puede reponer desde la incidencia, por artículo (H-1, R1 y R2): las piezas afectadas, menos
    lo que ya repuso esta incidencia (cualquier reposición no cancelada, aunque se haya recibido incompleta: lo que no
    llegó se repone desde la incidencia nueva) y lo que otras incidencias tienen en camino. Solo artículos con
    máximo > 0. Lo valida `preparar_reposicion` con el pedido bloqueado."""
    if not inc.pedido_id:
        return []
    pedido = db.session.get(Pedido, inc.pedido_id)
    afectadas = _afectadas(inc, pedido)
    if not afectadas:
        return []
    repos = db.session.scalars(
        select(Paquete).join(AsignacionSurtido, AsignacionSurtido.id == Paquete.asignacion_id)
        .where(AsignacionSurtido.pedido_id == pedido.id, Paquete.incidencia_id.is_not(None), Paquete.estado != "cancelado")
        .execution_options(populate_existing=True)).all()
    recibidos = set(db.session.scalars(select(Recepcion.paquete_id).where(
        Recepcion.paquete_id.in_([p.id for p in repos])))) if repos else set()
    usadas: dict[int, int] = {}
    for p in repos:
        # De otra incidencia solo cuenta mientras no se recibe. El paquete del que trata ESTA incidencia (una
        # reposición perdida o recibida con faltantes) es justo lo que hay que reponer: no se descuenta.
        en_camino = (p.id not in recibidos and p.id != inc.paquete_id
                     and not (p.estado == "entregado" and pedido.canal != "corporativo"))
        if p.incidencia_id == inc.id or en_camino:
            for pid, n in contenido_por_partida(p).items():
                usadas[pid] = usadas.get(pid, 0) + n
    return [{"pedido_detalle_id": pid, "cantidad": n - usadas.get(pid, 0)}
            for pid, n in afectadas.items() if n > usadas.get(pid, 0)]


def reposicion_sugerida(inc, maxima: list[dict] | None = None) -> list[dict]:
    """Lo que habría que reponer según la incidencia: lo que no llegó en buen estado en la recepción del paquete o,
    si la incidencia señala un artículo, una pieza de ese artículo. Nunca más que `reposicion_maxima`."""
    tope = {m["pedido_detalle_id"]: m["cantidad"] for m in (reposicion_maxima(inc) if maxima is None else maxima)}

    def acotar(items):
        return [{"pedido_detalle_id": pid, "cantidad": min(c, tope[pid])} for pid, c in items if tope.get(pid)]

    if inc.paquete_id:
        rec = db.session.scalars(select(Recepcion).where(Recepcion.paquete_id == inc.paquete_id)).first()
        if rec:
            sugerida = acotar((d.pedido_detalle_id, d.esperada - d.recibida) for d in rec.detalles if d.recibida < d.esperada)
            if sugerida:
                return sugerida
    if inc.pedido_detalle_id:
        return acotar([(inc.pedido_detalle_id, 1)])
    return []


def preparar_reposicion(inc, partidas: list[dict]) -> list[Paquete]:
    """Prepara el paquete de reposición de una incidencia: piezas nuevas del inventario disponible del almacén que
    surtió cada artículo, agrupadas por persona. Sale con su propia paquetería y guía (despacho normal); al llegar, la
    sucursal registra su recepción y entrega a cada empleado como con cualquier paquete.

    partidas: [{pedido_detalle_id, cantidad}]. Si los artículos los surtieron dos almacenes, se arma un paquete por
    almacén."""
    if not inc.pedido_id:
        raise AppError("Solo las incidencias de una solicitud se resuelven con reposición.")
    if inc.estado not in {"abierta", "en_atencion"}:
        raise TransicionInvalida("La incidencia ya está resuelta o cerrada.")
    pedido = ped.bloquear_pedido(inc.pedido_id)
    # Con el pedido bloqueado: dos preparaciones a la vez se ordenan y la segunda ya ve lo que apartó la primera.
    maxima = {m["pedido_detalle_id"]: m["cantidad"] for m in reposicion_maxima(inc)}
    por_asig: dict[int, list[tuple[AsignacionDetalle, int]]] = {}
    preferida = db.session.get(Paquete, inc.paquete_id).asignacion_id if inc.paquete_id else None
    vistos = set()
    for p in partidas:
        pid, cant = int(p["pedido_detalle_id"]), int(p["cantidad"])
        if cant <= 0:
            continue
        if pid in vistos:
            raise AppError("Cada artículo va una sola vez en la reposición.")
        vistos.add(pid)
        pdet = db.session.get(PedidoDetalle, pid)
        if not pdet or pdet.pedido_id != pedido.id:
            raise NoEncontrado("El artículo no pertenece a la solicitud.")
        if cant > maxima.get(pid, 0):
            tope = maxima.get(pid, 0)
            raise AppError(f"{pdet.nombre} ({pdet.talla}): " + (
                f"desde esta incidencia se pueden reponer como máximo {tope} pieza(s)." if tope else
                "no tiene piezas pendientes de reponer desde esta incidencia (no está afectada, ya se repuso o está "
                "cancelada)."), codigo="reposicion_excedida", detalles={"pedido_detalle_id": pid, "maximo": tope})
        opciones = [ad for a in pedido.asignaciones if a.estado != "cancelada" for ad in a.detalles if ad.pedido_detalle_id == pid]
        if not opciones:
            raise Conflicto(f"{pdet.nombre} ({pdet.talla}) no tiene almacén asignado.")
        ad = next((o for o in opciones if o.asignacion_id == preferida), opciones[0])
        por_asig.setdefault(ad.asignacion_id, []).append((ad, cant))
    if not por_asig:
        raise AppError("Indica al menos una pieza a reponer.")
    paquetes = []
    for aid, items in por_asig.items():
        a = bloquear_asignacion(aid)
        invs = inv_srv.bloquear_varios([(a.sucursal_id, ad.pedido_detalle.variante_id) for ad, _ in items])
        paq = Paquete(asignacion_id=a.id, estado="preparado", incidencia_id=inc.id)
        for ad, cant in sorted(items, key=lambda x: (x[0].pedido_detalle.empleado.nombre if x[0].pedido_detalle.empleado else "~")):
            inv = invs[(a.sucursal_id, ad.pedido_detalle.variante_id)]
            disponible = inv.fisico - inv.reservado - inv.comprometido
            if disponible < cant:
                raise Conflicto(f"Sin existencia suficiente de {ad.pedido_detalle.sku} en {a.sucursal.nombre} "
                                f"(disponible {disponible}, se necesitan {cant}).", codigo="sin_existencia")
            inv.comprometido += cant  # apartado hasta que salga el paquete
            paq.detalles.append(PaqueteDetalle(asignacion_detalle_id=ad.id, cantidad=cant))
        db.session.add(paq)
        asignar_folio(paq, "PAQ")
        paquetes.append(paq)
    resumen = ", ".join(p.folio for p in paquetes)
    _nota_incidencia(inc, f"Se preparó la reposición {resumen}. Saldrá con su propia guía.", estado="en_atencion")
    aviso_incidencia.reposicion_preparada(inc, paquetes)
    auditar("incidencia.reposicion", "incidencia", inc.id, despues={"paquetes": [p.id for p in paquetes],
                                                                     "partidas": partidas}, sucursal_id=inc.sucursal_id)
    db.session.commit()
    return paquetes


def cancelar_reposicion(paq: Paquete):
    """Cancela un paquete de reposición que aún no sale y libera lo apartado."""
    if not paq.incidencia_id:
        raise TransicionInvalida("Solo se cancelan aquí los paquetes de reposición.")
    if paq.estado != "preparado":
        raise TransicionInvalida("El paquete ya salió; no se puede cancelar.")
    a = bloquear_asignacion(paq.asignacion_id)
    invs = inv_srv.bloquear_varios([(a.sucursal_id, x.asignacion_detalle.pedido_detalle.variante_id) for x in paq.detalles])
    for x in paq.detalles:
        invs[(a.sucursal_id, x.asignacion_detalle.pedido_detalle.variante_id)].comprometido -= x.cantidad
    paq.estado = "cancelado"
    _nota_incidencia(paq.incidencia, f"Se canceló la reposición {paq.folio} antes de salir.")
    aviso_incidencia.reposicion_cancelada(paq.incidencia, paq)
    auditar("paquete.cancelar_reposicion", "paquete", paq.id, sucursal_id=a.sucursal_id)
    db.session.commit()
    return paq
