"""Área del cliente: perfil, direcciones, carrito, favoritos, checkout, pedidos, pagos, devoluciones,
notificaciones y funciones corporativas (empleados, pedidos por empleado, recepción y entregas individuales)."""
from flask import Blueprint, current_app, g, jsonify, request
from sqlalchemy import func, select, update

from ..errors import AppError, Conflicto, NoEncontrado
from ..extensions import db
from ..models import (Carrito, CarritoItem, Devolucion, Direccion, EmpleadoCorporativo, EntregaIndividual, Favorito,
                      Notificacion, Paquete, Pedido, Producto, Variante)
from ..schemas import (CantidadSchema, CarritoItemSchema, CheckoutSchema, CorreccionCorporativaSchema,
                       DevolucionSolicitudSchema, DireccionSchema, EmpleadoSchema, EntregaIndividualSchema,
                       GuiaRetornoSchema, IncidenciaSchema, MotivoSchema, PagoTransferenciaSchema,
                       PedidoCorporativoSchema, PerfilSchema, RecepcionSchema, cargar)
from ..security.auth import requiere_cliente
from ..services import devolucion_service as dev_srv
from ..services import logistica_service as log_srv
from ..services import pago_service as pago_srv
from ..services import pedido_service as ped_srv
from ..services.comun import auditar, paginar
from ..services.precios import precio_con_descuento, promociones_vigentes, totales
from . import serial
from .tienda import existencias
from .util import cuerpo, int_keys, obtener, pagina

bp = Blueprint("cuenta", __name__, url_prefix="/api/cuenta")


# ---------------------------------------------------------------- perfil y direcciones

@bp.get("/perfil")
@requiere_cliente()
def perfil():
    return jsonify(serial.cliente(g.cliente))


@bp.patch("/perfil")
@requiere_cliente()
def editar_perfil():
    d = cargar(PerfilSchema, cuerpo())
    for k, v in d.items():
        setattr(g.cliente, k, v)
    auditar("cliente.perfil", "cliente", g.cliente.id, despues=d)
    db.session.commit()
    return jsonify(serial.cliente(g.cliente))


def _mi_direccion(direccion_id) -> Direccion:
    d = db.session.get(Direccion, direccion_id)
    if not d or d.cliente_id != g.cliente.id or not d.activo:
        raise NoEncontrado("Dirección no encontrada.")
    return d


def _predeterminar(d: Direccion):
    db.session.execute(update(Direccion).where(Direccion.cliente_id == d.cliente_id, Direccion.id != d.id)
                       .values(predeterminada=False))
    db.session.flush()
    d.predeterminada = True


@bp.get("/direcciones")
@requiere_cliente()
def direcciones():
    ds = db.session.scalars(select(Direccion).where(Direccion.cliente_id == g.cliente.id, Direccion.activo.is_(True))
                            .order_by(Direccion.predeterminada.desc(), Direccion.id))
    return jsonify([serial.direccion(d) for d in ds])


@bp.post("/direcciones")
@requiere_cliente()
def crear_direccion():
    datos = cargar(DireccionSchema, cuerpo())
    pred = datos.pop("predeterminada")
    hay = db.session.scalar(select(func.count()).select_from(Direccion).where(Direccion.cliente_id == g.cliente.id,
                                                                              Direccion.activo.is_(True)))
    d = Direccion(cliente_id=g.cliente.id, **datos, predeterminada=False)
    db.session.add(d)
    db.session.flush()
    if pred or not hay:
        _predeterminar(d)
    db.session.commit()
    return jsonify(serial.direccion(d)), 201


@bp.put("/direcciones/<int:direccion_id>")
@requiere_cliente()
def editar_direccion(direccion_id):
    d = _mi_direccion(direccion_id)
    datos = cargar(DireccionSchema, cuerpo())
    pred = datos.pop("predeterminada")
    for k, v in datos.items():
        setattr(d, k, v)
    if pred:
        _predeterminar(d)
    db.session.commit()
    return jsonify(serial.direccion(d))


@bp.delete("/direcciones/<int:direccion_id>")
@requiere_cliente()
def borrar_direccion(direccion_id):
    d = _mi_direccion(direccion_id)
    d.activo, d.predeterminada = False, False  # baja lógica: los pedidos conservan su copia de la dirección
    db.session.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------- carrito

def _carrito() -> Carrito:
    c = db.session.scalars(select(Carrito).where(Carrito.cliente_id == g.cliente.id)).first()
    if not c:
        c = Carrito(cliente_id=g.cliente.id)
        db.session.add(c)
        db.session.flush()
    return c


def _respuesta_carrito(c: Carrito):
    promos = promociones_vigentes()
    exist = existencias([i.variante_id for i in c.items])
    items, subtotal, descuento, avisos = [], 0, 0, []
    for i in c.items:
        v = i.variante
        precio, desc, promo = precio_con_descuento(v, promos)
        disponible = exist.get(v.id, 0)
        activo = v.activo and v.producto.activo
        if not activo:
            avisos.append(f"{v.producto.nombre} ya no está disponible.")
        elif i.cantidad > disponible:
            avisos.append(f"{v.producto.nombre} ({v.talla}): solo hay {disponible} disponible(s).")
        items.append({"id": i.id, "variante_id": v.id, "cantidad": i.cantidad, "producto": v.producto.nombre,
                      "slug": v.producto.slug, "imagen": v.producto.imagenes[0].url if v.producto.imagenes else None,
                      "sku": v.sku, "talla": v.talla, "color": v.color, "color_hex": v.color_hex,
                      "precio": serial.m(precio), "descuento": serial.m(desc), "promocion": promo,
                      "importe": serial.m((precio - desc) * i.cantidad), "disponible": disponible, "activo": activo})
        subtotal += precio * i.cantidad
        descuento += desc * i.cantidad
    t = totales(subtotal, descuento, "envio")
    return {"items": items, "avisos": avisos, "articulos": sum(i.cantidad for i in c.items),
            "totales": {k: serial.m(v) for k, v in t.items()},
            "envio_gratis_desde": serial.m(current_app.config["ENVIO_GRATIS_DESDE"]),
            "costo_envio": serial.m(current_app.config["COSTO_ENVIO"]),
            "reserva_horas": current_app.config["RESERVA_HORAS"]}


def _validar_existencia(variante_id: int, cantidad: int):
    v = db.session.get(Variante, variante_id)
    if not v or not v.activo or not v.producto.activo:
        raise NoEncontrado("Producto no disponible.")
    disponible = existencias([variante_id]).get(variante_id, 0)
    if cantidad > disponible:
        raise Conflicto(f"Solo hay {disponible} unidad(es) disponible(s) de esta talla.", codigo="sin_existencias",
                        detalles={"disponible": disponible})


@bp.get("/carrito")
@requiere_cliente()
def ver_carrito():
    c = _carrito()
    db.session.commit()
    return jsonify(_respuesta_carrito(c))


@bp.post("/carrito/items")
@requiere_cliente()
def agregar_item():
    d = cargar(CarritoItemSchema, cuerpo())
    c = _carrito()
    existente = next((i for i in c.items if i.variante_id == d["variante_id"]), None)
    nueva = (existente.cantidad if existente else 0) + d["cantidad"]
    if nueva > 99:
        raise AppError("Máximo 99 unidades por artículo.")
    _validar_existencia(d["variante_id"], nueva)
    if existente:
        existente.cantidad = nueva
    else:
        c.items.append(CarritoItem(variante_id=d["variante_id"], cantidad=d["cantidad"]))
    db.session.commit()
    return jsonify(_respuesta_carrito(c)), 201


@bp.patch("/carrito/items/<int:item_id>")
@requiere_cliente()
def cambiar_cantidad(item_id):
    d = cargar(CantidadSchema, cuerpo())
    c = _carrito()
    item = next((i for i in c.items if i.id == item_id), None)
    if not item:
        raise NoEncontrado("Artículo no encontrado en tu carrito.")
    _validar_existencia(item.variante_id, d["cantidad"])
    item.cantidad = d["cantidad"]
    db.session.commit()
    return jsonify(_respuesta_carrito(c))


@bp.delete("/carrito/items/<int:item_id>")
@requiere_cliente()
def quitar_item(item_id):
    c = _carrito()
    item = next((i for i in c.items if i.id == item_id), None)
    if not item:
        raise NoEncontrado("Artículo no encontrado en tu carrito.")
    c.items.remove(item)
    db.session.commit()
    return jsonify(_respuesta_carrito(c))


# ---------------------------------------------------------------- favoritos

@bp.get("/favoritos")
@requiere_cliente()
def favoritos():
    from .tienda import _resumenes
    ids = db.session.scalars(select(Favorito.producto_id).where(Favorito.cliente_id == g.cliente.id)).all()
    prods = db.session.scalars(select(Producto).where(Producto.id.in_(ids or [-1]), Producto.activo.is_(True))).unique().all()
    return jsonify(_resumenes(prods))


@bp.put("/favoritos/<int:producto_id>")
@requiere_cliente()
def agregar_favorito(producto_id):
    obtener(Producto, producto_id, "Producto no encontrado.")
    if not db.session.get(Favorito, (g.cliente.id, producto_id)):
        db.session.add(Favorito(cliente_id=g.cliente.id, producto_id=producto_id))
        db.session.commit()
    return jsonify({"ok": True})


@bp.delete("/favoritos/<int:producto_id>")
@requiere_cliente()
def quitar_favorito(producto_id):
    fav = db.session.get(Favorito, (g.cliente.id, producto_id))
    if fav:
        db.session.delete(fav)
        db.session.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------- checkout y pedidos

@bp.post("/checkout")
@requiere_cliente()
def checkout():
    d = cargar(CheckoutSchema, cuerpo())
    pedido, nuevo = ped_srv.checkout(g.cliente, d["modalidad"], d["metodo_pago"], d["clave_idempotencia"],
                                     d.get("direccion_id"), d.get("sucursal_id"), d.get("notas"))
    return jsonify(serial.pedido(pedido)), (201 if nuevo else 200)


def _mi_pedido(pedido_id) -> Pedido:
    p = db.session.get(Pedido, pedido_id)
    if not p or p.cliente_id != g.cliente.id:
        raise NoEncontrado("Pedido no encontrado.")
    return p


@bp.get("/pedidos")
@requiere_cliente()
def mis_pedidos():
    q = select(Pedido).where(Pedido.cliente_id == g.cliente.id).order_by(Pedido.id.desc())
    if canal := request.args.get("canal"):
        q = q.where(Pedido.canal == canal)
    if estado := request.args.get("estado"):
        q = q.where(Pedido.estado == estado)
    return jsonify(paginar(q, *pagina(), serial.pedido_resumen))


@bp.get("/pedidos/<int:pedido_id>")
@requiere_cliente()
def mi_pedido(pedido_id):
    return jsonify(serial.pedido(_mi_pedido(pedido_id)))


@bp.post("/pedidos/<int:pedido_id>/pagos")
@requiere_cliente()
def registrar_pago(pedido_id):
    d = cargar(PagoTransferenciaSchema, cuerpo())
    _mi_pedido(pedido_id)
    pedido = ped_srv.bloquear_pedido(pedido_id)
    pago = pago_srv.registrar_transferencia(pedido, d["referencia"], d.get("comprobante_url"), d["clave_idempotencia"])
    return jsonify(serial.pago(pago)), 201


@bp.post("/pedidos/<int:pedido_id>/cancelar")
@requiere_cliente()
def cancelar_pedido(pedido_id):
    d = cargar(MotivoSchema, cuerpo())
    _mi_pedido(pedido_id)
    pedido = ped_srv.bloquear_pedido(pedido_id)
    ped_srv.cancelar(pedido, d["motivo"], por_cliente=True)
    return jsonify(serial.pedido(pedido))


@bp.post("/pedidos/<int:pedido_id>/devoluciones")
@requiere_cliente()
def solicitar_devolucion(pedido_id):
    d = cargar(DevolucionSolicitudSchema, cuerpo())
    pedido = ped_srv.bloquear_pedido(_mi_pedido(pedido_id).id)
    partidas = [{"pedido_detalle_id": int(p["pedido_detalle_id"]), "cantidad": int(p["cantidad"])} for p in d["partidas"]]
    dev = dev_srv.solicitar(g.cliente, pedido, d["motivo"], d["descripcion"], d["evidencias"], partidas)
    return jsonify(serial.devolucion(dev)), 201


@bp.get("/devoluciones")
@requiere_cliente()
def mis_devoluciones():
    q = select(Devolucion).where(Devolucion.cliente_id == g.cliente.id).order_by(Devolucion.id.desc())
    return jsonify(paginar(q, *pagina(), serial.devolucion))


@bp.post("/devoluciones/<int:dev_id>/en-camino")
@requiere_cliente()
def devolucion_en_camino(dev_id):
    d = cargar(GuiaRetornoSchema, cuerpo())
    dev = dev_srv.bloquear_devolucion(dev_id)
    return jsonify(serial.devolucion(dev_srv.marcar_en_camino(dev, g.cliente, d.get("guia"))))


@bp.post("/pedidos/<int:pedido_id>/incidencias")
@requiere_cliente()
def reportar_incidencia(pedido_id):
    d = cargar(IncidenciaSchema, cuerpo())
    _mi_pedido(pedido_id)
    inc = dev_srv.crear_incidencia(d["tipo"], d["descripcion"], d["prioridad"], pedido_id=pedido_id)
    return jsonify(serial.incidencia(inc)), 201


# ---------------------------------------------------------------- notificaciones

@bp.get("/notificaciones")
@requiere_cliente()
def notificaciones():
    q = select(Notificacion).where(Notificacion.cliente_id == g.cliente.id).order_by(Notificacion.id.desc())
    datos = paginar(q, *pagina(), serial.notificacion)
    datos["no_leidas"] = db.session.scalar(select(func.count()).select_from(Notificacion).where(
        Notificacion.cliente_id == g.cliente.id, Notificacion.leida.is_(False)))
    return jsonify(datos)


@bp.post("/notificaciones/leer")
@requiere_cliente()
def leer_notificaciones():
    ids = cuerpo().get("ids")
    q = update(Notificacion).where(Notificacion.cliente_id == g.cliente.id)
    if ids:
        q = q.where(Notificacion.id.in_([int(i) for i in ids]))
    db.session.execute(q.values(leida=True))
    db.session.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------- corporativo

@bp.get("/empleados")
@requiere_cliente(empresa=True)
def empleados():
    q = select(EmpleadoCorporativo).where(EmpleadoCorporativo.cliente_id == g.cliente.id).order_by(EmpleadoCorporativo.nombre)
    return jsonify([_empleado(e) for e in db.session.scalars(q)])


def _empleado(e):
    return {"id": e.id, "numero": e.numero, "nombre": e.nombre, "puesto": e.puesto, "area": e.area, "activo": e.activo}


@bp.post("/empleados")
@requiere_cliente(empresa=True)
def crear_empleado():
    d = cargar(EmpleadoSchema, cuerpo())
    e = EmpleadoCorporativo(cliente_id=g.cliente.id, **d)
    db.session.add(e)
    db.session.flush()
    auditar("empleado.crear", "empleado", e.id, despues=d)
    db.session.commit()
    return jsonify(_empleado(e)), 201


@bp.put("/empleados/<int:empleado_id>")
@requiere_cliente(empresa=True)
def editar_empleado(empleado_id):
    e = db.session.get(EmpleadoCorporativo, empleado_id)
    if not e or e.cliente_id != g.cliente.id:
        raise NoEncontrado("Empleado no encontrado.")
    d = cargar(EmpleadoSchema, cuerpo())
    for k, v in d.items():
        setattr(e, k, v)
    auditar("empleado.editar", "empleado", e.id, despues=d)
    db.session.commit()
    return jsonify(_empleado(e))


@bp.get("/puestos-autorizados")
@requiere_cliente(empresa=True)
def puestos_autorizados():
    """Productos autorizados por puesto para armar el pedido corporativo."""
    from ..models import ProductoPuesto
    filas = db.session.execute(select(ProductoPuesto.puesto, ProductoPuesto.producto_id)).all()
    mapa: dict[str, list[int]] = {}
    for puesto, pid in filas:
        mapa.setdefault(puesto, []).append(pid)
    return jsonify(mapa)


@bp.post("/pedidos-corporativos")
@requiere_cliente(empresa=True)
def crear_pedido_corporativo():
    d = cargar(PedidoCorporativoSchema, cuerpo())
    pedido, nuevo = ped_srv.crear_corporativo(g.cliente, d["modalidad"], d["partidas"], d["clave_idempotencia"],
                                              d.get("direccion_id"), d.get("sucursal_id"), d.get("notas"))
    return jsonify(serial.pedido(pedido)), (201 if nuevo else 200)


@bp.put("/pedidos-corporativos/<int:pedido_id>")
@requiere_cliente(empresa=True)
def corregir_pedido_corporativo(pedido_id):
    d = cargar(CorreccionCorporativaSchema, cuerpo())
    pedido = ped_srv.bloquear_pedido(_mi_pedido(pedido_id).id)
    return jsonify(serial.pedido(ped_srv.corregir_corporativo(g.cliente, pedido, d["partidas"], d.get("notas"))))


@bp.post("/paquetes/<int:paquete_id>/recepcion")
@requiere_cliente(empresa=True)
def recepcion(paquete_id):
    d = cargar(RecepcionSchema, cuerpo())
    paq = log_srv.bloquear_paquete(paquete_id)
    log_srv.registrar_recepcion(paq, g.cliente.id, d["completa"], d.get("diferencias"))
    return jsonify(serial.pedido(paq.asignacion.pedido)), 201


@bp.get("/entregas/<int:entrega_id>")
@requiere_cliente(empresa=True)
def ver_entrega(entrega_id):
    e = obtener(EntregaIndividual, entrega_id, "Entrega no encontrada.")
    if db.session.get(Paquete, e.paquete_id).asignacion.pedido.cliente_id != g.cliente.id:
        raise NoEncontrado("Entrega no encontrada.")
    return jsonify(serial.entrega_individual(e, con_firma=True))


@bp.post("/entregas/<int:entrega_id>")
@requiere_cliente(empresa=True)
def registrar_entrega(entrega_id):
    d = cargar(EntregaIndividualSchema, cuerpo())
    e = db.session.scalars(select(EntregaIndividual).where(EntregaIndividual.id == entrega_id).with_for_update(of=EntregaIndividual)).first()
    if not e:
        raise NoEncontrado("Entrega no encontrada.")
    log_srv.registrar_entrega_individual(e, g.cliente.id, int_keys(d["cantidades"]), d["firma"], d.get("valoracion"),
                                         d.get("observaciones"))
    return jsonify(serial.entrega_individual(e))
