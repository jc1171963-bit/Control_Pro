"""Tienda pública: inicio, catálogo con búsqueda/filtros/orden, ficha de producto y sucursales."""
from collections import defaultdict

from flask import Blueprint, jsonify, request
from sqlalchemy import and_, func, or_, select, text

from ..errors import NoEncontrado
from ..extensions import db
from ..models import Categoria, Inventario, Producto, ProductoSucursal, Promocion, Sucursal, Variante
from ..services.precios import precio_con_descuento, promociones_vigentes
from . import serial
from .util import arg_int

bp = Blueprint("tienda", __name__, url_prefix="/api/tienda")


def existencias(variante_ids, por_sucursal=False):
    """Disponible = físico − reservado − comprometido, solo en sucursales activas donde el producto está habilitado."""
    if not variante_ids:
        return {}
    disp = func.greatest(Inventario.fisico - Inventario.reservado - Inventario.comprometido, 0)
    q = (select(Inventario.variante_id, Inventario.sucursal_id, disp)
         .join(Sucursal, Sucursal.id == Inventario.sucursal_id)
         .join(Variante, Variante.id == Inventario.variante_id)
         .outerjoin(ProductoSucursal, and_(ProductoSucursal.producto_id == Variante.producto_id,
                                           ProductoSucursal.sucursal_id == Inventario.sucursal_id))
         .where(Inventario.variante_id.in_(variante_ids), Sucursal.activo.is_(True),
                func.coalesce(ProductoSucursal.habilitado, True).is_(True)))
    if por_sucursal:
        r = defaultdict(dict)
        for vid, sid, d in db.session.execute(q):
            r[sid][vid] = int(d)
        return r
    total = defaultdict(int)
    for vid, _sid, d in db.session.execute(q):
        total[vid] += int(d)
    return total


def _contexto(productos):
    vids = [v.id for p in productos for v in p.variantes if v.activo]
    promos = promociones_vigentes()
    precios = {v.id: precio_con_descuento(v, promos) for p in productos for v in p.variantes}
    return precios, existencias(vids), promos


def _resumenes(productos):
    precios, exist, promos = _contexto(productos)
    en_promo = {prod.id for pr in promos if pr.sucursal_id is None for prod in pr.productos}
    salida = []
    for p in productos:
        r = serial.producto_resumen(p, precios, exist)
        r["en_promocion"] = p.id in en_promo
        salida.append(r)
    return salida


def _visibles():
    return select(Producto).join(Categoria).where(Producto.activo.is_(True), Categoria.activo.is_(True),
                                                  Producto.variantes.any(Variante.activo.is_(True)))


@bp.get("/categorias")
def categorias():
    cats = db.session.scalars(select(Categoria).where(Categoria.activo.is_(True)).order_by(Categoria.orden, Categoria.nombre))
    conteo = dict(db.session.execute(select(Producto.categoria_id, func.count()).where(Producto.activo.is_(True))
                                     .group_by(Producto.categoria_id)).all())
    return jsonify([{"id": c.id, "nombre": c.nombre, "slug": c.slug, "padre_id": c.padre_id, "productos": conteo.get(c.id, 0)}
                    for c in cats])


@bp.get("/inicio")
def inicio():
    destacados = db.session.scalars(_visibles().where(Producto.destacado.is_(True)).order_by(Producto.id).limit(8)).unique().all()
    novedades = db.session.scalars(_visibles().order_by(Producto.creado.desc(), Producto.id.desc()).limit(8)).unique().all()
    promos = [p for p in promociones_vigentes() if p.sucursal_id is None]
    ids_promo = {prod.id for pr in promos for prod in pr.productos}
    en_promo = db.session.scalars(_visibles().where(Producto.id.in_(ids_promo or {-1})).limit(8)).unique().all()
    return jsonify({
        "destacados": _resumenes(destacados), "novedades": _resumenes(novedades), "promociones": _resumenes(en_promo),
        "promociones_vigentes": [{"id": p.id, "nombre": p.nombre, "tipo": p.tipo, "valor": serial.m(p.valor),
                                  "fin": serial.f(p.fin)} for p in promos],
    })


@bp.get("/productos")
def productos():
    q = _visibles()
    texto = (request.args.get("q") or "").strip()
    if texto:
        ts = func.to_tsvector(text("'spanish'"), Producto.nombre + " " + func.coalesce(Producto.descripcion, ""))
        q = q.where(or_(ts.op("@@")(func.plainto_tsquery(text("'spanish'"), texto)),
                        Producto.nombre.ilike(f"%{texto}%"), Producto.sku_base.ilike(f"%{texto}%")))
    if slug := request.args.get("categoria"):
        cat = db.session.scalars(select(Categoria).where(Categoria.slug == slug)).first()
        if not cat:
            raise NoEncontrado("Categoría no encontrada.")
        hijos = db.session.scalars(select(Categoria.id).where(Categoria.padre_id == cat.id)).all()
        q = q.where(Producto.categoria_id.in_([cat.id, *hijos]))
    cond_var = [Variante.activo.is_(True)]
    if talla := request.args.get("talla"):
        cond_var.append(Variante.talla == talla)
    if color := request.args.get("color"):
        cond_var.append(Variante.color == color)
    if (pmin := request.args.get("precio_min")) not in (None, ""):
        cond_var.append(Variante.precio_base >= pmin)
    if (pmax := request.args.get("precio_max")) not in (None, ""):
        cond_var.append(Variante.precio_base <= pmax)
    if len(cond_var) > 1:
        q = q.where(Producto.variantes.any(and_(*cond_var)))
    if request.args.get("promocion") in {"1", "true"}:
        ids_promo = {prod.id for pr in promociones_vigentes() if pr.sucursal_id is None for prod in pr.productos}
        q = q.where(Producto.id.in_(ids_promo or {-1}))
    if request.args.get("disponible") in {"1", "true"}:
        disp = select(Variante.producto_id).join(Inventario, Inventario.variante_id == Variante.id).where(
            Inventario.fisico - Inventario.reservado - Inventario.comprometido > 0, Variante.activo.is_(True))
        q = q.where(Producto.id.in_(disp))

    precio_min_sq = (select(func.min(Variante.precio_base)).where(Variante.producto_id == Producto.id,
                                                                  Variante.activo.is_(True)).scalar_subquery())
    orden = request.args.get("orden", "relevancia")
    q = q.order_by({"precio_asc": precio_min_sq.asc(), "precio_desc": precio_min_sq.desc(),
                    "nuevos": Producto.creado.desc(), "nombre": Producto.nombre.asc()}.get(
        orden, Producto.destacado.desc()), Producto.id)

    pagina, por_pagina = arg_int("pagina", 1), min(arg_int("por_pagina", 12), 48)
    total = db.session.scalar(select(func.count()).select_from(q.order_by(None).subquery()))
    filas = db.session.scalars(q.limit(por_pagina).offset((max(pagina, 1) - 1) * por_pagina)).unique().all()

    facetas_q = select(Variante.talla, Variante.color, Variante.color_hex).join(Producto).where(
        Producto.activo.is_(True), Variante.activo.is_(True)).distinct()
    tallas, colores = set(), set()
    for t, c, h in db.session.execute(facetas_q):
        tallas.add(t)
        colores.add((c, h))
    return jsonify({"items": _resumenes(filas), "total": total, "pagina": pagina, "por_pagina": por_pagina,
                    "paginas": (total + por_pagina - 1) // por_pagina,
                    "facetas": {"tallas": sorted(tallas, key=serial._orden_talla),
                                "colores": [{"nombre": c, "hex": h} for c, h in sorted(colores)]}})


@bp.get("/productos/<slug>")
def producto(slug):
    p = db.session.scalars(_visibles().where(Producto.slug == slug)).unique().first()
    if not p:
        raise NoEncontrado("Producto no encontrado.")
    precios, exist, _ = _contexto([p])
    por_suc = existencias([v.id for v in p.variantes if v.activo], por_sucursal=True)
    sucs = db.session.scalars(select(Sucursal).where(Sucursal.activo.is_(True)).order_by(Sucursal.id))
    disponibilidad = [{"sucursal_id": s.id, "sucursal": s.nombre, "permite_recoger": s.permite_recoger,
                       "variantes": {str(k): v for k, v in por_suc.get(s.id, {}).items()}} for s in sucs]
    d = serial.producto_detalle(p, precios, exist, disponibilidad)
    d["variantes"] = [v for v in d["variantes"] if v["activo"]]
    relacionados = db.session.scalars(_visibles().where(Producto.categoria_id == p.categoria_id, Producto.id != p.id)
                                      .limit(4)).unique().all()
    d["relacionados"] = _resumenes(relacionados)
    return jsonify(d)


@bp.get("/sucursales")
def sucursales():
    sucs = db.session.scalars(select(Sucursal).where(Sucursal.activo.is_(True)).order_by(Sucursal.id))
    return jsonify([serial.sucursal(s) for s in sucs])
