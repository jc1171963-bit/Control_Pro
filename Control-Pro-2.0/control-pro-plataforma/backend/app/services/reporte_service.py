"""Indicadores y reportes calculados directamente de la base de datos.

Distinción clave:
- Pedidos recibidos: todo pedido creado en el periodo (cualquier estado).
- Ventas registradas: total de pedidos confirmados (pago validado o aprobación corporativa), sin cancelados.
- Pagos confirmados: dinero validado, neto de reembolsos realizados.
"""
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import and_, case, func, select

from ..extensions import db
from ..models import (AsignacionDetalle, AsignacionSurtido, Cliente, Devolucion, EntregaIndividual, Incidencia, Inventario,
                      MovimientoInventario, Pago, Paquete, Pedido, PedidoDetalle, Producto, Reembolso, Sucursal, Variante)
from ..security.auth import sucursales_permitidas
from . import turno_service as turno_srv

CONFIRMADOS = ("confirmado", "en_preparacion", "parcialmente_enviado", "enviado", "parcialmente_entregado",
               "entregado", "cerrado")


def rango(desde: str | None, hasta: str | None):
    hoy = datetime.now(timezone.utc).date()
    d = datetime.fromisoformat(desde).date() if desde else hoy - timedelta(days=29)
    h = datetime.fromisoformat(hasta).date() if hasta else hoy
    return (datetime.combine(d, time.min, tzinfo=timezone.utc), datetime.combine(h, time.max, tzinfo=timezone.utc))


def _pedidos_en_alcance(sucursal_id: int | None):
    """Subconsulta de ids de pedido visibles (por sucursal asignada o de recolección)."""
    permitidas = sucursales_permitidas()
    ids = None
    if sucursal_id:
        ids = {sucursal_id} if permitidas is None or sucursal_id in permitidas else {-1}
    elif permitidas is not None:
        ids = permitidas or {-1}
    if ids is None:
        return None
    return select(AsignacionSurtido.pedido_id).where(AsignacionSurtido.sucursal_id.in_(ids)).union(
        select(Pedido.id).where(Pedido.sucursal_recoger_id.in_(ids)))


def dashboard(desde=None, hasta=None, sucursal_id=None) -> dict:
    ini, fin = rango(desde, hasta)
    alcance = _pedidos_en_alcance(sucursal_id)
    base = [Pedido.creado.between(ini, fin), Pedido.estado != "borrador"]
    if alcance is not None:
        base.append(Pedido.id.in_(alcance))

    por_estado = dict(db.session.execute(select(Pedido.estado, func.count()).where(*base).group_by(Pedido.estado)).all())
    ventas = db.session.scalar(select(func.coalesce(func.sum(Pedido.total), 0)).where(*base, Pedido.estado.in_(CONFIRMADOS)))
    n_ventas = sum(v for k, v in por_estado.items() if k in CONFIRMADOS)

    pago_cond = [Pago.validado_en.between(ini, fin), Pago.estado.in_(["confirmado", "reembolsado_parcial", "reembolsado"])]
    if alcance is not None:
        pago_cond.append(Pago.pedido_id.in_(alcance))
    pagos = db.session.scalar(select(func.coalesce(func.sum(Pago.monto), 0)).where(*pago_cond))
    reemb_cond = [Reembolso.estado == "realizado", Reembolso.tipo == "reembolso", Reembolso.realizado_en.between(ini, fin)]
    if alcance is not None:
        reemb_cond.append(Reembolso.pedido_id.in_(alcance))
    reembolsos = db.session.scalar(select(func.coalesce(func.sum(Reembolso.monto), 0)).where(*reemb_cond))
    por_validar = db.session.scalar(select(func.count()).select_from(Pago).where(
        Pago.estado == "en_proceso", *( [Pago.pedido_id.in_(alcance)] if alcance is not None else [])))

    top = db.session.execute(
        select(PedidoDetalle.sku, PedidoDetalle.nombre, PedidoDetalle.talla,
               func.sum(PedidoDetalle.cantidad - PedidoDetalle.cantidad_cancelada).label("unidades"),
               func.sum(PedidoDetalle.importe).label("importe"))
        .join(Pedido).where(*base, Pedido.estado.in_(CONFIRMADOS))
        .group_by(PedidoDetalle.sku, PedidoDetalle.nombre, PedidoDetalle.talla)
        .order_by(func.sum(PedidoDetalle.cantidad).desc()).limit(8)).all()

    serie = db.session.execute(
        select(func.date_trunc("day", Pedido.creado).label("dia"), func.count().label("pedidos"),
               func.coalesce(func.sum(case((Pedido.estado.in_(CONFIRMADOS), Pedido.total), else_=0)), 0).label("ventas"))
        .where(*base).group_by("dia").order_by("dia")).all()

    return {
        "periodo": {"desde": ini.date().isoformat(), "hasta": fin.date().isoformat()},
        "pedidos": {
            "recibidos": sum(por_estado.values()),
            "pendientes": sum(por_estado.get(k, 0) for k in ("en_revision", "devuelto", "aprobado", "pendiente_pago", "pago_en_revision")),
            "por_surtir": por_estado.get("confirmado", 0),
            "en_preparacion": por_estado.get("en_preparacion", 0),
            "en_camino": por_estado.get("parcialmente_enviado", 0) + por_estado.get("enviado", 0),
            "entregados": sum(por_estado.get(k, 0) for k in ("parcialmente_entregado", "entregado", "cerrado")),
            "cancelados": por_estado.get("cancelado", 0) + por_estado.get("expirado", 0) + por_estado.get("rechazado", 0),
            "por_estado": por_estado,
        },
        "ventas_registradas": {"pedidos": n_ventas, "importe": str(ventas)},
        "pagos_confirmados": {"bruto": str(pagos), "reembolsado": str(reembolsos), "neto": str(Decimal(pagos) - Decimal(reembolsos)),
                              "por_validar": por_validar},
        "mas_vendidos": [{"sku": r.sku, "nombre": r.nombre, "talla": r.talla, "unidades": int(r.unidades),
                          "importe": str(r.importe)} for r in top],
        "serie_diaria": [{"dia": r.dia.date().isoformat(), "pedidos": r.pedidos, "ventas": str(r.ventas)} for r in serie],
        "existencias_bajas": existencias_bajas(sucursal_id, limite=10),
        "devoluciones_abiertas": db.session.scalar(select(func.count()).select_from(Devolucion).where(
            Devolucion.estado.in_(["solicitada", "autorizada", "en_camino", "recibida", "inspeccionada"]),
            *([Devolucion.pedido_id.in_(alcance)] if alcance is not None else []))),
        "incidencias_abiertas": db.session.scalar(select(func.count()).select_from(Incidencia).where(
            Incidencia.estado.in_(["abierta", "en_atencion"]), *_filtro_incidencias(sucursal_id))),
        **turno_srv.resumen(select(Incidencia).where(*_filtro_incidencias(sucursal_id)), "lurima"),
        "movimientos_recientes": movimientos_recientes(sucursal_id, 8),
    }


def _filtro_incidencias(sucursal_id):
    permitidas = sucursales_permitidas()
    if sucursal_id:
        return [Incidencia.sucursal_id == sucursal_id]
    if permitidas is not None:
        return [Incidencia.sucursal_id.in_(permitidas or {-1})]
    return []


def _ids_sucursal(sucursal_id):
    permitidas = sucursales_permitidas()
    if sucursal_id:
        return {sucursal_id} if permitidas is None or sucursal_id in permitidas else {-1}
    return permitidas


def existencias_bajas(sucursal_id=None, limite=50) -> list[dict]:
    disponible = Inventario.fisico - Inventario.reservado - Inventario.comprometido
    q = (select(Inventario).join(Variante).where(Variante.activo.is_(True), disponible <= Inventario.minimo)
         .order_by(disponible, Inventario.sucursal_id).limit(limite))
    ids = _ids_sucursal(sucursal_id)
    if ids is not None:
        q = q.where(Inventario.sucursal_id.in_(ids or {-1}))
    return [{"sucursal": i.sucursal.nombre, "sucursal_id": i.sucursal_id, "variante_id": i.variante_id,
             "sku": i.variante.sku, "producto": i.variante.producto.nombre, "talla": i.variante.talla,
             "disponible": i.disponible, "minimo": i.minimo, "en_transito": i.en_transito}
            for i in db.session.scalars(q).unique()]


def movimientos_recientes(sucursal_id=None, limite=20):
    q = select(MovimientoInventario).order_by(MovimientoInventario.id.desc()).limit(limite)
    ids = _ids_sucursal(sucursal_id)
    if ids is not None:
        q = q.where(MovimientoInventario.sucursal_id.in_(ids or {-1}))
    return [{"id": m.id, "fecha": m.creado.isoformat(), "sucursal_id": m.sucursal_id, "sku": m.variante.sku,
             "tipo": m.tipo, "cantidad": m.cantidad, "saldo": m.saldo_resultante, "motivo": m.motivo,
             "usuario": m.usuario.nombre if m.usuario else "Sistema"} for m in db.session.scalars(q).unique()]


def comparativa_sucursales(desde=None, hasta=None) -> list[dict]:
    ini, fin = rango(desde, hasta)
    ids = sucursales_permitidas()
    sucs = db.session.scalars(select(Sucursal).where(Sucursal.activo.is_(True), *([Sucursal.id.in_(ids or {-1})] if ids is not None else []))
                              .order_by(Sucursal.id)).all()
    salida = []
    for s in sucs:
        asig = select(AsignacionSurtido.id).join(Pedido).where(AsignacionSurtido.sucursal_id == s.id,
                                                               Pedido.creado.between(ini, fin))
        fila = db.session.execute(
            select(func.count(func.distinct(AsignacionSurtido.pedido_id)),
                   func.coalesce(func.sum(AsignacionDetalle.cantidad), 0),
                   func.coalesce(func.sum(AsignacionDetalle.despachada), 0),
                   func.coalesce(func.sum(AsignacionDetalle.faltante), 0),
                   func.coalesce(func.sum((PedidoDetalle.precio_unitario - PedidoDetalle.descuento_unitario) *
                                          (AsignacionDetalle.cantidad - AsignacionDetalle.faltante)), 0))
            .select_from(AsignacionDetalle).join(AsignacionSurtido).join(PedidoDetalle).join(Pedido)
            .where(AsignacionSurtido.id.in_(asig), AsignacionSurtido.estado != "cancelada",
                   Pedido.estado.in_(CONFIRMADOS))).one()
        inv = db.session.execute(select(func.coalesce(func.sum(Inventario.fisico), 0),
                                        func.coalesce(func.sum(Inventario.fisico * Variante.precio_base), 0))
                                 .join(Variante).where(Inventario.sucursal_id == s.id)).one()
        bajas = db.session.scalar(select(func.count()).select_from(Inventario).where(
            Inventario.sucursal_id == s.id, Inventario.fisico - Inventario.reservado - Inventario.comprometido <= Inventario.minimo))
        salida.append({"sucursal_id": s.id, "sucursal": s.nombre, "pedidos": fila[0], "unidades_asignadas": int(fila[1]),
                       "unidades_despachadas": int(fila[2]), "faltantes": int(fila[3]), "importe_surtido": str(fila[4]),
                       "existencia_unidades": int(inv[0]), "existencia_valor": str(inv[1]), "existencias_bajas": bajas})
    return salida


ETAPAS_SOLICITUD = {
    "por_revisar": ("en_revision",), "en_correccion": ("devuelto",), "por_autorizar": ("aprobado",), "en_surtido": ("confirmado", "en_preparacion"),
    "en_camino": ("parcialmente_enviado", "enviado"), "en_entrega": ("parcialmente_entregado", "entregado"),
    "cerradas": ("cerrado",), "rechazadas_canceladas": ("rechazado", "cancelado", "expirado"),
}


def panel_solicitudes(dias: int = 30) -> dict:
    """Indicadores del flujo de solicitudes de sucursal (canal corporativo), sin montos."""
    alcance = _pedidos_en_alcance(None)
    cond = [Pedido.canal == "corporativo", Pedido.estado != "borrador"]
    if alcance is not None:
        cond.append(Pedido.id.in_(alcance))
    ids = select(Pedido.id).where(*cond)
    por_estado = dict(db.session.execute(select(Pedido.estado, func.count()).where(*cond).group_by(Pedido.estado)).all())
    hoy = datetime.now(timezone.utc)
    inicio_mes = hoy.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    desde = datetime.combine(hoy.date() - timedelta(days=dias - 1), time.min, tzinfo=timezone.utc)

    unidades = db.session.execute(select(
        func.coalesce(func.sum(PedidoDetalle.cantidad - PedidoDetalle.cantidad_cancelada), 0),
        func.coalesce(func.sum(PedidoDetalle.cantidad_entregada), 0))
        .where(PedidoDetalle.pedido_id.in_(ids), Pedido.id == PedidoDetalle.pedido_id,
               Pedido.estado.notin_(["rechazado", "cancelado", "expirado"]))).one()
    paquetes = select(Paquete.id).join(AsignacionSurtido).where(AsignacionSurtido.pedido_id.in_(ids))
    entregas = db.session.execute(select(EntregaIndividual.estado, EntregaIndividual.conformidad_en, EntregaIndividual.valoracion)
                                  .where(EntregaIndividual.paquete_id.in_(paquetes))).all()
    valoraciones = [v for _, c, v in entregas if c and v]

    sucursales = dict(db.session.execute(select(Cliente.activo, func.count()).where(Cliente.tipo == "empresa")
                                         .group_by(Cliente.activo)).all())
    con_curso = db.session.scalar(select(func.count(func.distinct(Pedido.cliente_id))).where(
        *cond, Pedido.estado.in_(ETAPAS_SOLICITUD["por_revisar"] + ETAPAS_SOLICITUD["en_correccion"] + ETAPAS_SOLICITUD["en_surtido"]
                                 + ETAPAS_SOLICITUD["en_camino"] + ETAPAS_SOLICITUD["en_entrega"])))

    top_sucursales = db.session.execute(
        select(func.coalesce(Cliente.razon_social, Cliente.nombre).label("nombre"), func.count(func.distinct(Pedido.id)).label("solicitudes"),
               func.coalesce(func.sum(PedidoDetalle.cantidad - PedidoDetalle.cantidad_cancelada), 0).label("unidades"))
        .select_from(Pedido).join(Cliente, Cliente.id == Pedido.cliente_id).join(PedidoDetalle, PedidoDetalle.pedido_id == Pedido.id)
        .where(*cond).group_by(Cliente.id, Cliente.razon_social, Cliente.nombre).order_by(func.count(func.distinct(Pedido.id)).desc())
        .limit(6)).all()
    top_productos = db.session.execute(
        select(PedidoDetalle.nombre, func.sum(PedidoDetalle.cantidad - PedidoDetalle.cantidad_cancelada).label("unidades"))
        .where(PedidoDetalle.pedido_id.in_(ids)).group_by(PedidoDetalle.nombre)
        .order_by(func.sum(PedidoDetalle.cantidad - PedidoDetalle.cantidad_cancelada).desc()).limit(6)).all()
    serie = dict(db.session.execute(select(func.date_trunc("day", Pedido.creado).label("dia"), func.count())
                                    .where(*cond, Pedido.creado >= desde).group_by("dia")).all())

    return {
        "sucursales": {"activas": sucursales.get(True, 0), "inactivas": sucursales.get(False, 0),
                       "con_solicitudes_en_curso": con_curso},
        "solicitudes": {"total": sum(por_estado.values()),
                        "este_mes": db.session.scalar(select(func.count()).select_from(Pedido).where(*cond, Pedido.creado >= inicio_mes)),
                        "por_etapa": {k: sum(por_estado.get(e, 0) for e in v) for k, v in ETAPAS_SOLICITUD.items()}},
        "unidades": {"solicitadas": int(unidades[0]), "entregadas": int(unidades[1])},
        "paquetes_en_camino": db.session.scalar(select(func.count()).select_from(Paquete).where(
            Paquete.id.in_(paquetes), Paquete.estado.in_(["despachado", "en_transito"]))),
        "entregas": {"registradas": sum(1 for e, _, _ in entregas if e != "pendiente"),
                     "pendientes": sum(1 for e, _, _ in entregas if e == "pendiente"),
                     "conformidades_pendientes": sum(1 for e, c, _ in entregas if e == "entregada" and not c),
                     "valoracion_promedio": round(sum(valoraciones) / len(valoraciones), 1) if valoraciones else None},
        "incidencias_abiertas": db.session.scalar(select(func.count()).select_from(Incidencia).where(
            Incidencia.pedido_id.in_(ids), Incidencia.estado.in_(["abierta", "en_atencion"]))),
        "top_sucursales": [{"nombre": r.nombre, "solicitudes": r.solicitudes, "unidades": int(r.unidades)} for r in top_sucursales],
        "top_productos": [{"nombre": r.nombre, "unidades": int(r.unidades)} for r in top_productos],
        "serie": [{"dia": (desde.date() + timedelta(days=i)).isoformat(),
                   "solicitudes": next((n for d, n in serie.items() if d.date() == desde.date() + timedelta(days=i)), 0)}
                  for i in range(dias)],
    }


# ---------------------------------------------------------------- tablero ejecutivo del aprobador

def _horas(a, b):
    return (b - a).total_seconds() / 3600


def _mediana(valores):
    v = sorted(valores)
    if not v:
        return None
    m = len(v) // 2
    return v[m] if len(v) % 2 else (v[m - 1] + v[m]) / 2


def tablero_aprobador(dias: int = 30) -> dict:
    """Tablero ejecutivo del aprobador: tiempo de aprobación, ritmo semanal, mapa por estado y ranking de zonas y
    divisiones. Cada indicador se compara con el periodo inmediato anterior de la misma duración. Los hitos salen del
    historial de estados de cada solicitud (envío = primer paso a revisión; aprobación = primer «aprobado»)."""
    from ..models import Direccion, Division, HistorialEstado, Zona

    ahora_ = datetime.now(timezone.utc)
    fin = ahora_
    inicio = fin - timedelta(days=dias)
    inicio_ant = inicio - timedelta(days=dias)
    h = HistorialEstado
    hitos = (select(h.entidad_id.label("pid"),
                    func.min(case((h.nuevo == "en_revision", h.creado))).label("enviado"),
                    func.min(case((h.nuevo == "aprobado", h.creado))).label("aprobado"),
                    func.min(case((h.nuevo == "rechazado", h.creado))).label("rechazado"))
             .where(h.entidad == "pedido").group_by(h.entidad_id).subquery())
    unidades = (select(PedidoDetalle.pedido_id.label("pid"),
                       func.sum(PedidoDetalle.cantidad - PedidoDetalle.cantidad_cancelada).label("u"))
                .group_by(PedidoDetalle.pedido_id).subquery())
    filas = db.session.execute(
        select(Pedido.id, Pedido.cliente_id, Pedido.estado, hitos.c.enviado, hitos.c.aprobado, hitos.c.rechazado,
               func.coalesce(unidades.c.u, 0))
        .join(hitos, hitos.c.pid == Pedido.id).outerjoin(unidades, unidades.c.pid == Pedido.id)
        .where(Pedido.canal == "corporativo", Pedido.estado != "borrador", hitos.c.enviado.is_not(None))).all()

    # Sucursales: zona, división y estado (de su dirección principal)
    clientes = db.session.execute(
        select(Cliente.id, Cliente.activo, Zona.id, Zona.nombre, Division.id, Division.nombre)
        .outerjoin(Zona, Zona.id == Cliente.zona_id).outerjoin(Division, Division.id == Zona.division_id)
        .where(Cliente.tipo == "empresa")).all()
    estado_de = {}
    for cid, est in db.session.execute(select(Direccion.cliente_id, Direccion.estado).where(Direccion.activo.is_(True))
                                       .order_by(Direccion.predeterminada.desc(), Direccion.id.desc())):
        estado_de.setdefault(cid, est)
    info = {c[0]: {"activo": c[1], "zona": (c[2], c[3]), "division": (c[4], c[5]), "estado": estado_de.get(c[0])} for c in clientes}

    en = lambda t, a, b: t is not None and a <= t < b  # noqa: E731
    act = [f for f in filas if en(f.enviado, inicio, fin)]
    ant = [f for f in filas if en(f.enviado, inicio_ant, inicio)]

    def tiempos(a, b):
        return [_horas(f.enviado, f.aprobado) for f in filas if en(f.aprobado, a, b) and f.aprobado >= f.enviado]

    def tasa(a, b):
        decididas = [f for f in filas if en(f.aprobado or f.rechazado, a, b)]
        return round(100 * sum(1 for f in decididas if f.aprobado) / len(decididas), 1) if decididas else None

    t_act, t_ant = tiempos(inicio, fin), tiempos(inicio_ant, inicio)
    pendientes = [f for f in filas if f.estado == "en_revision"]

    # Ritmo semanal: 12 semanas (lunes a domingo) que terminan en la semana actual
    lunes = (fin - timedelta(days=fin.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    semanas = []
    for i in range(11, -1, -1):
        a = lunes - timedelta(weeks=i)
        b = a + timedelta(weeks=1)
        semanas.append({"inicio": a.date().isoformat(), "enviadas": sum(1 for f in filas if en(f.enviado, a, b)),
                        "aprobadas": sum(1 for f in filas if en(f.aprobado, a, b)), "actual": i == 0})

    def agrupar(clave):
        grupos = {}
        for cid, d in info.items():
            k = d[clave] if clave == "estado" else d[clave]
            if not k or (clave != "estado" and k[0] is None):
                continue
            g = grupos.setdefault(k, {"sucursales": 0, "solicitudes": 0, "anterior": 0, "unidades": 0, "por_revisar": 0})
            g["sucursales"] += 1
        for lista, campo in ((act, "solicitudes"), (ant, "anterior")):
            for f in lista:
                k = info.get(f.cliente_id, {}).get(clave)
                if k in grupos:
                    grupos[k][campo] += 1
                    if campo == "solicitudes":
                        grupos[k]["unidades"] += int(f[6])
        for f in pendientes:
            k = info.get(f.cliente_id, {}).get(clave)
            if k in grupos:
                grupos[k]["por_revisar"] += 1
        return grupos

    estados = [{"estado": k, **v} for k, v in sorted(agrupar("estado").items())]
    zonas = [{"id": k[0], "nombre": k[1], **v} for k, v in agrupar("zona").items()]
    divisiones = [{"id": k[0], "nombre": k[1], **v} for k, v in agrupar("division").items()]
    for lista in (zonas, divisiones):
        lista.sort(key=lambda x: (-x["solicitudes"], -x["unidades"], x["nombre"]))

    activas = lambda lista: len({f.cliente_id for f in lista})  # noqa: E731
    redondo = lambda x: round(x, 1) if x is not None else None  # noqa: E731
    return {
        "periodo": {"dias": dias, "desde": inicio.isoformat(), "hasta": fin.isoformat()},
        "tiempo_aprobacion": {"promedio_h": redondo(sum(t_act) / len(t_act)) if t_act else None,
                              "mediana_h": redondo(_mediana(t_act)), "aprobadas": len(t_act),
                              "anterior_promedio_h": redondo(sum(t_ant) / len(t_ant)) if t_ant else None},
        "enviadas": {"actual": len(act), "anterior": len(ant)},
        "unidades": {"actual": sum(int(f[6]) for f in act), "anterior": sum(int(f[6]) for f in ant)},
        "tasa_aprobacion": {"actual": tasa(inicio, fin), "anterior": tasa(inicio_ant, inicio)},
        "sucursales_activas": {"actual": activas(act), "anterior": activas(ant),
                               "total": sum(1 for d in info.values() if d["activo"])},
        "por_revisar": {"total": len(pendientes),
                        "mas_antigua_h": redondo(max((_horas(f.enviado, ahora_) for f in pendientes), default=0)) if pendientes else None},
        "semanas": semanas,
        "estados": estados,
        "zonas": zonas,
        "divisiones": divisiones,
    }
