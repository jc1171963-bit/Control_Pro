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
from ..models import (AsignacionDetalle, AsignacionSurtido, Devolucion, Incidencia, Inventario, MovimientoInventario,
                      Pago, Pedido, PedidoDetalle, Producto, Reembolso, Sucursal, Variante)
from ..security.auth import sucursales_permitidas

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
    base = [Pedido.creado.between(ini, fin)]
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
            "pendientes": sum(por_estado.get(k, 0) for k in ("en_revision", "devuelto", "pendiente_pago", "pago_en_revision")),
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
