"""Cálculo de precios con promociones vigentes. Los precios del catálogo incluyen IVA."""
from decimal import Decimal

from flask import current_app
from sqlalchemy import select

from ..extensions import db
from ..models import Promocion, Variante, ahora
from .comun import dinero


def promociones_vigentes() -> list[Promocion]:
    t = ahora()
    return list(db.session.scalars(select(Promocion).where(Promocion.activo.is_(True), Promocion.inicio <= t,
                                                           Promocion.fin > t)))


def precio_con_descuento(variante: Variante, promos: list[Promocion], sucursal_recoger_id: int | None = None):
    """Devuelve (precio_unitario, descuento_unitario, nombre_promocion). Aplica la mejor promoción disponible."""
    precio = dinero(variante.precio_base)
    mejor, nombre = Decimal("0.00"), None
    for p in promos:
        if p.sucursal_id is not None and p.sucursal_id != sucursal_recoger_id:
            continue
        if variante.producto_id not in {prod.id for prod in p.productos}:
            continue
        desc = dinero(precio * p.valor / 100) if p.tipo == "porcentaje" else dinero(min(p.valor, precio))
        if desc > mejor:
            mejor, nombre = desc, p.nombre
    return precio, mejor, nombre


def totales(subtotal: Decimal, descuento: Decimal, modalidad: str, canal: str = "tienda"):
    cfg = current_app.config
    neto = subtotal - descuento
    if modalidad == "recoger" or canal == "corporativo" or neto >= cfg["ENVIO_GRATIS_DESDE"]:
        envio = Decimal("0.00")
    else:
        envio = dinero(cfg["COSTO_ENVIO"])
    total = dinero(neto + envio)
    impuestos = dinero(total - total / (1 + cfg["IVA_TASA"]))
    return {"subtotal": dinero(subtotal), "descuento": dinero(descuento), "costo_envio": envio,
            "impuestos": impuestos, "total": total}
