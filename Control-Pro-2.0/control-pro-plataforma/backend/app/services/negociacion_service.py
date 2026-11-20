"""Negociación de condiciones y acuerdo de pago de un pedido corporativo aprobado (antes de autorizarlo).

- La comercializadora (`pedido.negociar`) propone; cada cambio es una versión nueva y las anteriores se conservan.
- Una propuesta pendiente NO toca las condiciones vigentes. El Gerente de compras (`pedido.aceptar_propuesta`) acepta
  solo la última versión; al aceptarla, las partidas vigentes se actualizan por id (no se borran y recrean).
- Los precios negociados son del pedido: el catálogo nunca cambia. Pueden ser mayores o menores que el de catálogo.
- «Pago resuelto» = acuerdo definitivo de cómo y cuándo se pagará. Vale para el acuerdo vigente y las condiciones
  vigentes al marcarlo: si después cambia cualquiera de los dos, hay que volver a marcarlo antes de autorizar.
Quien llama ya bloqueó el pedido (`SELECT … FOR UPDATE`), lo que serializa toda escritura sobre él.
"""
from decimal import Decimal

from sqlalchemy import func, select

from ..errors import AppError, Conflicto, TransicionInvalida
from ..extensions import db
from ..models import (AcuerdoPago, EmpleadoCorporativo, Incidencia, Pedido, PedidoDetalle, PropuestaPartida, PropuestaPedido,
                      PropuestaVersion, Variante, ahora)
from .comun import actor_ids, auditar, dinero, notificar_cliente, notificar_personal, registrar_historial
from .precios import precio_con_descuento, promociones_vigentes, totales

EXCEPCION_PROPUESTA = "Propuesta por la comercializadora al negociar la solicitud"


def _exigir_negociable(pedido: Pedido):
    if pedido.canal != "corporativo":
        raise AppError("Solo se negocian solicitudes de sucursal.")
    if pedido.estado != "aprobado":
        raise TransicionInvalida("Solo se negocian solicitudes aprobadas pendientes de autorización.",
                                 detalles={"estado": pedido.estado})


def pendiente(pedido: Pedido) -> PropuestaPedido | None:
    return db.session.scalars(select(PropuestaPedido).where(PropuestaPedido.pedido_id == pedido.id,
                                                            PropuestaPedido.estado == "pendiente")).first()


# ---------------------------------------------------------------- partidas

def _copia_vigente(d: PedidoDetalle) -> PropuestaPartida:
    return PropuestaPartida(pedido_detalle_id=d.id, empleado_id=d.empleado_id, variante_id=d.variante_id, sku=d.sku,
                            nombre=d.nombre, talla=d.talla, color=d.color,
                            empleado_nombre=d.empleado.nombre if d.empleado else None, cantidad=d.cantidad,
                            precio_unitario=d.precio_unitario, descuento_unitario=d.descuento_unitario, importe=d.importe,
                            precio_catalogo=dinero(d.variante.precio_base), excepcion=d.excepcion)


def _con_incidencia(pedido: Pedido) -> set[int]:
    return set(db.session.scalars(select(Incidencia.pedido_detalle_id).where(
        Incidencia.pedido_id == pedido.id, Incidencia.pedido_detalle_id.is_not(None))))


def _validar_incidencias(pedido: Pedido, partidas: list[PropuestaPartida]):
    """Una partida con incidencia no se elimina ni cambia de producto: la incidencia quedaría apuntando a otra cosa."""
    nuevas = {p.pedido_detalle_id: p for p in partidas if p.pedido_detalle_id}
    vigentes = {d.id: d for d in pedido.detalles}
    for pid in _con_incidencia(pedido):
        p = nuevas.get(pid)
        if pid in vigentes and (not p or p.variante_id != vigentes[pid].variante_id):
            raise Conflicto(f"La partida de {vigentes[pid].nombre} talla {vigentes[pid].talla} tiene una incidencia: "
                            "no se puede quitar ni cambiar de producto (sí su cantidad o precio).", codigo="partida_con_incidencia")


def _construir(pedido: Pedido, datos: list[dict]) -> list[PropuestaPartida]:
    vigentes = {d.id: d for d in pedido.detalles}
    promos = promociones_vigentes()
    vistas, errores, partidas = set(), [], []
    for i, p in enumerate(datos):
        pid = p.get("pedido_detalle_id")
        if pid is not None and (pid not in vigentes or pid in vistas):
            errores.append({"partida": i, "error": "La partida no pertenece a la solicitud o está repetida."})
            continue
        vistas.add(pid)
        emp = db.session.get(EmpleadoCorporativo, p["empleado_id"])
        if not emp or emp.cliente_id != pedido.cliente_id or not emp.activo:
            errores.append({"partida": i, "error": "Empleado no encontrado o inactivo."})
            continue
        v = db.session.get(Variante, p["variante_id"])
        if not v or not v.activo or not v.producto.activo:
            errores.append({"partida": i, "error": "Producto no disponible."})
            continue
        actual = vigentes.get(pid)
        mismo = actual is not None and actual.variante_id == v.id
        precio, desc = p.get("precio_unitario"), p.get("descuento_unitario")
        if precio is None and desc is None:  # sin precio indicado: se conserva el vigente; si es nuevo, catálogo y promoción
            precio, desc = (actual.precio_unitario, actual.descuento_unitario) if mismo else precio_con_descuento(
                v, promos, pedido.sucursal_recoger_id)[:2]
        elif precio is None:
            precio = actual.precio_unitario if mismo else dinero(v.precio_base)
        elif desc is None:
            desc = Decimal("0.00")
        precio, desc = dinero(precio), dinero(desc)
        if desc > precio:
            errores.append({"partida": i, "error": "El descuento no puede ser mayor que el precio."})
            continue
        autorizado = emp.puesto in {pp.puesto for pp in v.producto.puestos}
        excepcion = None
        if not autorizado:
            heredada = actual.excepcion if mismo and actual.empleado_id == emp.id else None
            excepcion = (p.get("excepcion") or "").strip() or heredada or EXCEPCION_PROPUESTA
        partidas.append(PropuestaPartida(
            pedido_detalle_id=pid, empleado_id=emp.id, variante_id=v.id, sku=v.sku, nombre=v.producto.nombre, talla=v.talla,
            color=v.color, empleado_nombre=emp.nombre, cantidad=p["cantidad"], precio_unitario=precio, descuento_unitario=desc,
            importe=dinero((precio - desc) * p["cantidad"]), precio_catalogo=dinero(v.precio_base), excepcion=excepcion))
    if errores:
        raise AppError("Hay partidas con errores.", detalles={"partidas": errores}, status=422, codigo="partidas_invalidas")
    if not partidas:
        raise AppError("La solicitud debe conservar al menos un artículo.")
    _validar_incidencias(pedido, partidas)
    return partidas


def _clave(p) -> tuple:
    return (p.pedido_detalle_id, p.empleado_id, p.variante_id, p.cantidad, dinero(p.precio_unitario), dinero(p.descuento_unitario))


def _version(propuesta: PropuestaPedido, numero: int, nota: str, partidas: list[PropuestaPartida], modalidad: str) -> PropuestaVersion:
    sub = sum((p.precio_unitario * p.cantidad for p in partidas), Decimal("0"))
    desc = sum((p.descuento_unitario * p.cantidad for p in partidas), Decimal("0"))
    t = totales(sub, desc, modalidad, "corporativo")
    usuario_id, _ = actor_ids()
    v = PropuestaVersion(propuesta_id=propuesta.id, numero=numero, nota=nota[:300], subtotal=t["subtotal"],
                         descuento=t["descuento"], total=t["total"], creado_por_usuario_id=usuario_id, partidas=partidas)
    db.session.add(v)
    return v


# ---------------------------------------------------------------- propuestas

def guardar_version(pedido: Pedido, datos: list[dict], nota: str, version_vista: int | None) -> PropuestaPedido:
    """Crea una propuesta (con su versión 0 = copia de lo vigente) o agrega una versión a la pendiente."""
    _exigir_negociable(pedido)
    nota = (nota or "").strip()
    if len(nota) < 5:
        raise AppError("Describe el cambio propuesto (mínimo 5 caracteres).")
    prop = pendiente(pedido)
    if prop and version_vista != prop.versiones[-1].numero:
        raise Conflicto("La propuesta cambió mientras la editabas; recarga para ver la versión más reciente.",
                        codigo="version_obsoleta")
    partidas = _construir(pedido, datos)
    anterior = prop.versiones[-1].partidas if prop else [_copia_vigente(d) for d in pedido.detalles]
    if sorted(map(_clave, partidas), key=str) == sorted(map(_clave, anterior), key=str):
        raise AppError("No hay cambios respecto a " + ("la versión anterior." if prop else "las condiciones vigentes."))
    usuario_id, _ = actor_ids()
    if not prop:
        numero = (db.session.scalar(select(func.max(PropuestaPedido.numero)).where(PropuestaPedido.pedido_id == pedido.id)) or 0) + 1
        prop = PropuestaPedido(pedido_id=pedido.id, numero=numero, estado="pendiente",
                               version_base_pedido=pedido.version_condiciones, creado_por_usuario_id=usuario_id)
        db.session.add(prop)
        db.session.flush()
        _version(prop, 0, "Condiciones vigentes al iniciar la propuesta", anterior, pedido.modalidad)
    v = _version(prop, prop.versiones[-1].numero + 1 if prop.versiones else 1, nota, partidas, pedido.modalidad)
    db.session.flush()
    db.session.refresh(prop)
    registrar_historial("pedido", pedido.id, pedido.estado, pedido.estado,
                        f"Propuesta {prop.numero} (versión {v.numero}) de la comercializadora: {nota}"[:500])
    auditar("pedido.propuesta", "pedido", pedido.id, despues={"propuesta": prop.numero, "version": v.numero,
                                                               "total": str(v.total), "partidas": [_texto(p) for p in partidas]})
    cliente = pedido.cliente
    notificar_personal("pedido.aceptar_propuesta", f"propuesta_{prop.id}_v{v.numero}", "pedido", pedido.id,
                       f"Propuesta de condiciones para {pedido.folio} de {cliente.razon_social or cliente.nombre} "
                       f"(versión {v.numero}): revísala y acéptala si estás de acuerdo.", enlace=f"/admin/pedidos/{pedido.id}")
    db.session.commit()
    return prop


def descartar(pedido: Pedido, motivo: str) -> PropuestaPedido:
    _exigir_negociable(pedido)
    prop = pendiente(pedido)
    if not prop:
        raise TransicionInvalida("No hay una propuesta pendiente.")
    motivo = (motivo or "").strip()
    prop.estado, prop.motivo_descarte = "descartada", motivo[:300]
    registrar_historial("pedido", pedido.id, pedido.estado, pedido.estado, f"Propuesta {prop.numero} descartada: {motivo}"[:500])
    auditar("pedido.propuesta_descartar", "pedido", pedido.id, despues={"propuesta": prop.numero, "motivo": motivo})
    db.session.commit()
    return prop


def descartar_pendientes(pedido: Pedido, motivo: str):
    """Al cancelar o expirar el pedido, la propuesta pendiente se descarta (sin commit: lo hace quien llama)."""
    prop = pendiente(pedido)
    if prop:
        prop.estado, prop.motivo_descarte = "descartada", motivo[:300]


def _texto(p) -> str:
    return f"{p.cantidad}× {p.nombre} talla {p.talla} ({p.color}) para {p.empleado_nombre or 'sin empleado'} a ${p.precio_unitario}" + (
        f" − ${p.descuento_unitario}" if p.descuento_unitario else "")


def aceptar(pedido: Pedido, version_id: int, aceptar_excepciones: bool = False) -> PropuestaPedido:
    _exigir_negociable(pedido)
    prop = pendiente(pedido)
    if not prop:
        raise TransicionInvalida("No hay una propuesta pendiente de aceptar.")
    ultima = prop.versiones[-1]
    if version_id != ultima.id or prop.version_base_pedido != pedido.version_condiciones:
        raise Conflicto("Esa versión ya no es la vigente de la propuesta; recarga para ver la más reciente.",
                        codigo="version_obsoleta")
    vigentes = {d.id: d for d in pedido.detalles}
    nuevas_excepciones = [p for p in ultima.partidas if p.excepcion and not (
        p.pedido_detalle_id in vigentes and vigentes[p.pedido_detalle_id].excepcion
        and vigentes[p.pedido_detalle_id].variante_id == p.variante_id and vigentes[p.pedido_detalle_id].empleado_id == p.empleado_id)]
    if nuevas_excepciones and not aceptar_excepciones:
        raise Conflicto("La propuesta incluye artículos fuera de la regla por puesto; confirma explícitamente que los autorizas.",
                        codigo="excepciones_sin_aceptar")
    for p in ultima.partidas:  # lo que dejó de estar disponible desde que se hizo la versión
        emp, v = db.session.get(EmpleadoCorporativo, p.empleado_id), db.session.get(Variante, p.variante_id)
        if not emp or not emp.activo or not v.activo or not v.producto.activo:
            raise Conflicto(f"{p.nombre} talla {p.talla} o su empleado ya no está disponible; la comercializadora debe "
                            "actualizar la propuesta.", codigo="propuesta_no_disponible")
    _validar_incidencias(pedido, ultima.partidas)
    if any(a.estado != "cancelada" for a in pedido.asignaciones):  # aprobadas antes de que la reserva pasara a la autorización
        from .pedido_service import _liberar_inventario
        _liberar_inventario(pedido, "liberada")
    antes = [_texto(_copia_vigente(d)) for d in pedido.detalles]
    quedan = {p.pedido_detalle_id for p in ultima.partidas if p.pedido_detalle_id}
    for d in [d for d in pedido.detalles if d.id not in quedan]:
        pedido.detalles.remove(d)
    for p in ultima.partidas:
        d = vigentes.get(p.pedido_detalle_id) if p.pedido_detalle_id else None
        if d is None:
            d = PedidoDetalle()
            pedido.detalles.append(d)
        d.empleado_id, d.variante_id, d.sku, d.nombre, d.talla, d.color = p.empleado_id, p.variante_id, p.sku, p.nombre, p.talla, p.color
        d.cantidad, d.precio_unitario, d.descuento_unitario, d.importe, d.excepcion = (
            p.cantidad, p.precio_unitario, p.descuento_unitario, p.importe, p.excepcion)
    pedido.subtotal, pedido.descuento, pedido.total = ultima.subtotal, ultima.descuento, ultima.total
    t = totales(ultima.subtotal, ultima.descuento, pedido.modalidad, "corporativo")
    pedido.costo_envio, pedido.impuestos = t["costo_envio"], t["impuestos"]
    pedido.version_condiciones += 1
    usuario_id, _ = actor_ids()
    prop.estado, prop.aceptada_por_usuario_id, prop.aceptada_en = "aceptada", usuario_id, ahora()
    db.session.flush()
    registrar_historial("pedido", pedido.id, pedido.estado, pedido.estado,
                        f"Propuesta {prop.numero} (versión {ultima.numero}) aceptada. Nuevo total: ${ultima.total}"[:500])
    auditar("pedido.propuesta_aceptar", "pedido", pedido.id, antes={"partidas": antes},
            despues={"propuesta": prop.numero, "version": ultima.numero, "total": str(ultima.total),
                     "partidas": [_texto(p) for p in ultima.partidas]})
    notificar_personal("orden.recibir", f"propuesta_{prop.id}_aceptada", "pedido", pedido.id,
                       f"Se aceptó la propuesta {prop.numero} de {pedido.folio}. Registra el acuerdo de pago para autorizarla.",
                       enlace=f"/admin/pedidos/{pedido.id}")
    # La sucursal ve sus artículos (sin precios, como en el resto del portal).
    resumen = "; ".join(f"{p.cantidad}× {p.nombre} talla {p.talla} para {p.empleado_nombre}" for p in ultima.partidas)
    notificar_cliente(pedido.cliente_id, f"pedido_condiciones_{pedido.version_condiciones}", "pedido", pedido.id,
                      f"Se actualizaron los artículos de tu solicitud {pedido.folio}: {resumen}", f"/cuenta/pedidos/{pedido.id}")
    db.session.commit()
    return prop


# ---------------------------------------------------------------- acuerdo de pago

def acuerdo_vigente(pedido: Pedido) -> AcuerdoPago | None:
    return db.session.scalars(select(AcuerdoPago).where(AcuerdoPago.pedido_id == pedido.id)
                              .order_by(AcuerdoPago.version.desc()).limit(1)).first()


def pago_resuelto_vigente(pedido: Pedido) -> bool:
    a = acuerdo_vigente(pedido)
    return bool(a and pedido.pago_resuelto_acuerdo_id == a.id and pedido.pago_resuelto_condiciones == pedido.version_condiciones)


def registrar_acuerdo(pedido: Pedido, forma: str, condiciones: str, fecha_pago, observaciones: str | None) -> AcuerdoPago:
    _exigir_negociable(pedido)
    previo = acuerdo_vigente(pedido)
    usuario_id, _ = actor_ids()
    a = AcuerdoPago(pedido_id=pedido.id, version=(previo.version + 1) if previo else 1, forma=forma.strip(),
                    condiciones=condiciones.strip(), fecha_pago=fecha_pago, observaciones=(observaciones or "").strip() or None,
                    registrado_por_usuario_id=usuario_id)
    db.session.add(a)
    db.session.flush()
    registrar_historial("pedido", pedido.id, pedido.estado, pedido.estado,
                        f"Acuerdo de pago {'actualizado' if previo else 'registrado'} (versión {a.version}): "
                        f"{a.forma}, pago el {a.fecha_pago:%d/%m/%Y}"[:500])
    auditar("pedido.acuerdo_pago", "pedido", pedido.id, despues={"version": a.version, "forma": a.forma,
                                                                  "fecha_pago": a.fecha_pago.isoformat()})
    db.session.commit()
    return a


def marcar_pago_resuelto(pedido: Pedido, acuerdo_id: int):
    _exigir_negociable(pedido)
    a = acuerdo_vigente(pedido)
    if not a:
        raise TransicionInvalida("Registra primero el acuerdo de pago.", codigo="sin_acuerdo_pago")
    if acuerdo_id != a.id:
        raise Conflicto("El acuerdo de pago cambió; revisa la versión vigente antes de marcarlo como resuelto.",
                        codigo="version_obsoleta")
    if pendiente(pedido):
        raise TransicionInvalida("Hay una propuesta de condiciones pendiente: acéptala o descártala antes de resolver el pago.",
                                 codigo="propuesta_pendiente")
    usuario_id, _ = actor_ids()
    pedido.pago_resuelto_acuerdo_id, pedido.pago_resuelto_condiciones = a.id, pedido.version_condiciones
    pedido.pago_resuelto_en, pedido.pago_resuelto_por_usuario_id = ahora(), usuario_id
    registrar_historial("pedido", pedido.id, pedido.estado, pedido.estado,
                        f"Pago resuelto: acuerdo definitivo (versión {a.version}) de cómo y cuándo se pagará")
    auditar("pedido.pago_resuelto", "pedido", pedido.id, despues={"acuerdo_version": a.version,
                                                                   "condiciones": pedido.version_condiciones})
    db.session.commit()


def exigir_para_autorizar(pedido: Pedido):
    if pendiente(pedido):
        raise TransicionInvalida("Hay una propuesta de condiciones pendiente: debe aceptarse o descartarse antes de autorizar.",
                                 codigo="propuesta_pendiente")
    if not pago_resuelto_vigente(pedido):
        raise TransicionInvalida("Antes de autorizar, registra el acuerdo de pago y márcalo como resuelto.",
                                 codigo="pago_no_resuelto")


# ---------------------------------------------------------------- vista (personal interno)

def _partida_json(p) -> dict:
    return {"pedido_detalle_id": p.pedido_detalle_id, "empleado_id": p.empleado_id, "empleado": p.empleado_nombre,
            "variante_id": p.variante_id, "sku": p.sku, "nombre": p.nombre, "talla": p.talla, "color": p.color,
            "cantidad": p.cantidad, "precio_unitario": str(p.precio_unitario), "descuento_unitario": str(p.descuento_unitario),
            "importe": str(p.importe), "precio_catalogo": str(p.precio_catalogo), "excepcion": p.excepcion}


def comparar(base: PropuestaVersion, nueva: PropuestaVersion) -> dict:
    nuevas = {p.pedido_detalle_id: p for p in nueva.partidas if p.pedido_detalle_id}
    filas = []
    for b in base.partidas:
        n = nuevas.get(b.pedido_detalle_id)
        cambio = "eliminada" if not n else ("sin_cambio" if _clave(n) == _clave(b) else "modificada")
        filas.append({"cambio": cambio, "antes": _partida_json(b), "despues": _partida_json(n) if n else None})
    filas += [{"cambio": "agregada", "antes": None, "despues": _partida_json(p)} for p in nueva.partidas if not p.pedido_detalle_id]
    tot = lambda v: {"subtotal": str(v.subtotal), "descuento": str(v.descuento), "total": str(v.total)}  # noqa: E731
    return {"filas": filas, "antes": tot(base), "despues": tot(nueva),
            "diferencia": {k: str(getattr(nueva, k) - getattr(base, k)) for k in ("subtotal", "descuento", "total")}}


def _f(x):
    return x.isoformat() if x else None


def _propuesta_json(p: PropuestaPedido) -> dict:
    ultima = p.versiones[-1]
    return {"id": p.id, "numero": p.numero, "estado": p.estado, "creado": _f(p.creado),
            "creado_por": p.creado_por.nombre if p.creado_por else None,
            "aceptada_por": p.aceptada_por.nombre if p.aceptada_por else None, "aceptada_en": _f(p.aceptada_en),
            "motivo_descarte": p.motivo_descarte,
            "versiones": [{"id": v.id, "numero": v.numero, "nota": v.nota, "creado": _f(v.creado), "total": str(v.total),
                           "creado_por": v.creado_por.nombre if v.creado_por else None} for v in p.versiones if v.numero > 0],
            "version_actual": {"id": ultima.id, "numero": ultima.numero, "partidas": [_partida_json(x) for x in ultima.partidas]},
            "comparacion": comparar(p.versiones[0], ultima)}


def resumen(pedido: Pedido) -> dict:
    props = db.session.scalars(select(PropuestaPedido).where(PropuestaPedido.pedido_id == pedido.id)
                               .order_by(PropuestaPedido.numero.desc())).all()
    acuerdos = db.session.scalars(select(AcuerdoPago).where(AcuerdoPago.pedido_id == pedido.id)
                                  .order_by(AcuerdoPago.version.desc())).all()
    vigente = acuerdos[0] if acuerdos else None
    pend = next((p for p in props if p.estado == "pendiente"), None)
    return {
        "version_condiciones": pedido.version_condiciones,
        "pendiente": _propuesta_json(pend) if pend else None,
        "propuestas": [_propuesta_json(p) for p in props if p.estado != "pendiente"],
        "acuerdos": [{"id": a.id, "version": a.version, "forma": a.forma, "condiciones": a.condiciones,
                      "fecha_pago": a.fecha_pago.isoformat(), "observaciones": a.observaciones, "creado": _f(a.creado),
                      "registrado_por": a.registrado_por.nombre if a.registrado_por else None} for a in acuerdos],
        "pago_resuelto": {"vigente": pago_resuelto_vigente(pedido), "en": _f(pedido.pago_resuelto_en),
                          "acuerdo_id": pedido.pago_resuelto_acuerdo_id} if pedido.pago_resuelto_en else None,
        "acuerdo_vigente_id": vigente.id if vigente else None,
    }
