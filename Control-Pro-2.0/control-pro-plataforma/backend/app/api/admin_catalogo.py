"""Administración del catálogo maestro: categorías, productos, variantes, habilitación por sucursal y promociones."""
from flask import Blueprint, jsonify, request
from sqlalchemy import or_, select

from ..errors import AppError, Conflicto, NoEncontrado
from ..extensions import db
from ..models import (Categoria, PedidoDetalle, Producto, ProductoImagen, ProductoPuesto, ProductoSucursal, Promocion,
                      Sucursal, Variante)
from ..schemas import CategoriaSchema, ProductoSchema, PromocionSchema, cargar
from ..security.auth import g, requiere_usuario, verificar_alcance
from ..services.comun import auditar, paginar
from . import serial
from .tienda import existencias
from .util import cuerpo, obtener, pagina

bp = Blueprint("admin_catalogo", __name__, url_prefix="/api/admin")


@bp.get("/categorias")
@requiere_usuario("inventario.ver")
def categorias():
    return jsonify([{"id": c.id, "nombre": c.nombre, "slug": c.slug, "padre_id": c.padre_id, "orden": c.orden,
                     "activo": c.activo} for c in db.session.scalars(select(Categoria).order_by(Categoria.orden, Categoria.nombre))])


@bp.post("/categorias")
@requiere_usuario("catalogo.gestionar")
def crear_categoria():
    d = cargar(CategoriaSchema, cuerpo())
    c = Categoria(**d)
    db.session.add(c)
    db.session.flush()
    auditar("categoria.crear", "categoria", c.id, despues=d)
    db.session.commit()
    return jsonify({"id": c.id, **d}), 201


@bp.put("/categorias/<int:cid>")
@requiere_usuario("catalogo.gestionar")
def editar_categoria(cid):
    c = obtener(Categoria, cid, "Categoría no encontrada.")
    d = cargar(CategoriaSchema, cuerpo())
    if d.get("padre_id") == c.id:
        raise AppError("Una categoría no puede ser su propia categoría padre.")
    for k, v in d.items():
        setattr(c, k, v)
    auditar("categoria.editar", "categoria", c.id, despues=d)
    db.session.commit()
    return jsonify({"id": c.id, **d})


@bp.get("/productos")
@requiere_usuario("inventario.ver")
def productos():
    q = select(Producto).order_by(Producto.nombre)
    if texto := request.args.get("q"):
        q = q.where(or_(Producto.nombre.ilike(f"%{texto}%"), Producto.sku_base.ilike(f"%{texto}%"),
                        Producto.variantes.any(Variante.sku.ilike(f"%{texto}%"))))
    if cat := request.args.get("categoria_id"):
        q = q.where(Producto.categoria_id == int(cat))
    if request.args.get("activos") == "1":
        q = q.where(Producto.activo.is_(True))
    return jsonify(paginar(q, *pagina(), lambda p: serial.producto_detalle(
        p, None, existencias([v.id for v in p.variantes]))))


@bp.get("/productos/<int:pid>")
@requiere_usuario("inventario.ver")
def producto(pid):
    p = obtener(Producto, pid, "Producto no encontrado.")
    return jsonify(serial.producto_detalle(p, None, existencias([v.id for v in p.variantes])))


def _aplicar_producto(p: Producto, d: dict):
    if not db.session.get(Categoria, d["categoria_id"]):
        raise NoEncontrado("Categoría no encontrada.")
    variantes = d.pop("variantes")
    puestos = d.pop("puestos")
    deshab = set(d.pop("sucursales_deshabilitadas"))
    imagenes = d.pop("imagenes")
    for k, v in d.items():
        setattr(p, k, v)
    existentes = {v.id: v for v in p.variantes}
    vistos = set()
    for vd in variantes:
        vid = vd.pop("id", None)
        if vid:
            v = existentes.get(vid)
            if not v:
                raise NoEncontrado(f"La variante {vid} no pertenece al producto.")
            for k, val in vd.items():
                setattr(v, k, val)
            vistos.add(vid)
        else:
            p.variantes.append(Variante(**vd))
    for vid, v in existentes.items():
        if vid not in vistos:
            v.activo = False  # las variantes nunca se borran: tienen historial de pedidos e inventario
    p.puestos = [ProductoPuesto(puesto=x.strip()) for x in sorted(set(puestos)) if x.strip()]
    sucs = {s.id for s in db.session.scalars(select(Sucursal))}
    if deshab - sucs:
        raise NoEncontrado("Sucursal inexistente en la habilitación.")
    p.sucursales = [ProductoSucursal(sucursal_id=sid, habilitado=False) for sid in sorted(deshab)]
    if imagenes:
        p.imagenes = [ProductoImagen(url=u, orden=i, alt=p.nombre) for i, u in enumerate(imagenes)]


@bp.post("/productos")
@requiere_usuario("catalogo.gestionar")
def crear_producto():
    d = cargar(ProductoSchema, cuerpo())
    p = Producto()
    with db.session.no_autoflush:
        _aplicar_producto(p, d)
    db.session.add(p)
    db.session.flush()
    auditar("producto.crear", "producto", p.id, despues={"sku": p.sku_base, "nombre": p.nombre})
    db.session.commit()
    return jsonify(serial.producto_detalle(p)), 201


@bp.put("/productos/<int:pid>")
@requiere_usuario("catalogo.gestionar")
def editar_producto(pid):
    p = obtener(Producto, pid, "Producto no encontrado.")
    antes = serial.producto_detalle(p)
    d = cargar(ProductoSchema, cuerpo())
    _aplicar_producto(p, d)
    db.session.flush()
    despues = serial.producto_detalle(p)
    auditar("producto.editar", "producto", p.id,
            antes={k: antes[k] for k in ("nombre", "activo", "variantes", "sucursales_deshabilitadas")},
            despues={k: despues[k] for k in ("nombre", "activo", "variantes", "sucursales_deshabilitadas")})
    db.session.commit()
    return jsonify(despues)


@bp.get("/promociones")
@requiere_usuario("inventario.ver")
def promociones():
    return jsonify([_promo(p) for p in db.session.scalars(select(Promocion).order_by(Promocion.inicio.desc()))])


def _promo(p):
    return {"id": p.id, "nombre": p.nombre, "tipo": p.tipo, "valor": serial.m(p.valor), "inicio": serial.f(p.inicio),
            "fin": serial.f(p.fin), "sucursal_id": p.sucursal_id, "activo": p.activo,
            "productos": [{"id": x.id, "nombre": x.nombre} for x in p.productos]}


def _aplicar_promo(p: Promocion, d: dict):
    if d.get("sucursal_id"):
        verificar_alcance(d["sucursal_id"])
    elif "catalogo.gestionar" not in g.usuario.codigos_permiso:
        raise AppError("Solo la administración central crea promociones globales; indica tu sucursal.")
    prods = db.session.scalars(select(Producto).where(Producto.id.in_(d.pop("productos")))).all()
    if not prods:
        raise NoEncontrado("Selecciona productos existentes.")
    for k, v in d.items():
        setattr(p, k, v)
    p.productos = list(prods)


@bp.post("/promociones")
@requiere_usuario("promocion.gestionar")
def crear_promocion():
    d = cargar(PromocionSchema, cuerpo())
    p = Promocion()
    _aplicar_promo(p, d)
    db.session.add(p)
    db.session.flush()
    auditar("promocion.crear", "promocion", p.id, despues=_promo(p), sucursal_id=p.sucursal_id)
    db.session.commit()
    return jsonify(_promo(p)), 201


@bp.put("/promociones/<int:prid>")
@requiere_usuario("promocion.gestionar")
def editar_promocion(prid):
    p = obtener(Promocion, prid, "Promoción no encontrada.")
    if p.sucursal_id:
        verificar_alcance(p.sucursal_id)
    elif "catalogo.gestionar" not in g.usuario.codigos_permiso:
        raise NoEncontrado("Promoción no encontrada.")
    antes = _promo(p)
    _aplicar_promo(p, cargar(PromocionSchema, cuerpo()))
    auditar("promocion.editar", "promocion", p.id, antes=antes, despues=_promo(p), sucursal_id=p.sucursal_id)
    db.session.commit()
    return jsonify(_promo(p))
