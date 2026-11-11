"""Cuentas de sucursal (clientes empresa): alta, datos generales, dirección de entrega, acceso y contraseña.

Cada sucursal tiene una sola cuenta. La sucursal solo administra a sus empleados; todo lo demás lo gestiona el
distribuidor desde aquí (permiso `cliente.gestionar`).
"""
from flask import Blueprint, jsonify, request
from sqlalchemy import func, or_, select

from ..errors import AppError, Conflicto, NoEncontrado
from ..extensions import db
from ..models import Carrito, Cliente, Direccion, EmpleadoCorporativo, Pedido
from ..schemas import (CuentaSucursalSchema, DireccionSucursalSchema, EdicionCuentaSucursalSchema, NuevaPasswordSchema,
                       cargar)
from ..security.auth import hash_password, requiere_usuario, validar_fortaleza
from ..services.comun import auditar, paginar
from . import serial
from .util import cuerpo, pagina

bp = Blueprint("admin_sucursales", __name__, url_prefix="/api/admin/cuentas-sucursal")

EN_CURSO = ("en_revision", "devuelto", "confirmado", "en_preparacion", "parcialmente_enviado", "enviado",
            "parcialmente_entregado", "entregado")


def _sucursal(cliente_id: int) -> Cliente:
    c = db.session.get(Cliente, cliente_id)
    if not c or c.tipo != "empresa":
        raise NoEncontrado("Sucursal no encontrada.")
    return c


def _direccion(c: Cliente) -> Direccion | None:
    return db.session.scalars(select(Direccion).where(Direccion.cliente_id == c.id, Direccion.activo.is_(True))
                              .order_by(Direccion.predeterminada.desc(), Direccion.id)).first()


def _resumen(c: Cliente) -> dict:
    solicitudes = select(Pedido).where(Pedido.cliente_id == c.id, Pedido.canal == "corporativo", Pedido.estado != "borrador")
    d = serial.cliente(c)
    d.update({
        "bloqueado_hasta": serial.f(c.bloqueado_hasta), "ultimo_acceso": serial.f(c.ultimo_acceso),
        "empleados_activos": db.session.scalar(select(func.count()).select_from(EmpleadoCorporativo).where(
            EmpleadoCorporativo.cliente_id == c.id, EmpleadoCorporativo.activo.is_(True))),
        "solicitudes": db.session.scalar(select(func.count()).select_from(solicitudes.subquery())),
        "en_curso": db.session.scalar(select(func.count()).select_from(
            solicitudes.where(Pedido.estado.in_(EN_CURSO)).subquery())),
        "por_revisar": db.session.scalar(select(func.count()).select_from(
            solicitudes.where(Pedido.estado == "en_revision").subquery())),
        "ultima_solicitud": serial.f(db.session.scalar(select(func.max(Pedido.creado)).where(
            Pedido.cliente_id == c.id, Pedido.canal == "corporativo", Pedido.estado != "borrador"))),
    })
    dir_ = _direccion(c)
    d["direccion"] = serial.direccion(dir_) if dir_ else None
    return d


def _correo_libre(correo: str, excepto: int | None = None):
    q = select(Cliente.id).where(func.lower(Cliente.correo) == correo.strip().lower())
    if excepto:
        q = q.where(Cliente.id != excepto)
    if db.session.scalar(q):
        raise Conflicto("Ya existe una cuenta con ese correo.", codigo="correo_duplicado")


@bp.get("")
@requiere_usuario("cliente.ver")
def lista():
    q = select(Cliente).where(Cliente.tipo == "empresa").order_by(Cliente.activo.desc(), Cliente.razon_social, Cliente.id)
    if texto := request.args.get("q"):
        q = q.where(or_(Cliente.razon_social.ilike(f"%{texto}%"), Cliente.nombre.ilike(f"%{texto}%"),
                        Cliente.correo.ilike(f"%{texto}%")))
    if (activo := request.args.get("activo")) in {"1", "0"}:
        q = q.where(Cliente.activo.is_(activo == "1"))
    return jsonify(paginar(q, *pagina(), _resumen))


@bp.get("/<int:cliente_id>")
@requiere_usuario("cliente.ver")
def detalle(cliente_id):
    c = _sucursal(cliente_id)
    d = _resumen(c)
    d["empleados"] = [{"id": e.id, "numero": e.numero, "nombre": e.nombre, "puesto": e.puesto, "area": e.area, "activo": e.activo}
                      for e in db.session.scalars(select(EmpleadoCorporativo).where(EmpleadoCorporativo.cliente_id == c.id)
                                                  .order_by(EmpleadoCorporativo.activo.desc(), EmpleadoCorporativo.nombre))]
    d["solicitudes_recientes"] = [serial.pedido_resumen(p) for p in db.session.scalars(
        select(Pedido).where(Pedido.cliente_id == c.id, Pedido.canal == "corporativo", Pedido.estado != "borrador")
        .order_by(Pedido.id.desc()).limit(10)).unique()]
    return jsonify(d)


@bp.post("")
@requiere_usuario("cliente.gestionar")
def crear():
    d = cargar(CuentaSucursalSchema, cuerpo())
    validar_fortaleza(d["password"])
    _correo_libre(d["correo"])
    c = Cliente(correo=d["correo"].strip().lower(), hash_password=hash_password(d["password"]), nombre=d["nombre"].strip(),
                telefono=d.get("telefono"), tipo="empresa", razon_social=d["razon_social"].strip(), rfc=d.get("rfc") or None)
    db.session.add(c)
    db.session.flush()
    db.session.add(Carrito(cliente_id=c.id))
    db.session.add(Direccion(cliente_id=c.id, predeterminada=True, **d["direccion"]))
    auditar("sucursal_cliente.crear", "cliente", c.id, despues={"razon_social": c.razon_social, "correo": c.correo})
    db.session.commit()
    return jsonify(_resumen(c)), 201


@bp.put("/<int:cliente_id>")
@requiere_usuario("cliente.gestionar")
def editar(cliente_id):
    c = _sucursal(cliente_id)
    d = cargar(EdicionCuentaSucursalSchema, cuerpo())
    if "correo" in d:
        _correo_libre(d["correo"], excepto=c.id)
        d["correo"] = d["correo"].strip().lower()
    antes = {k: getattr(c, k) for k in d}
    for k, v in d.items():
        setattr(c, k, v)
    auditar("sucursal_cliente.editar", "cliente", c.id, antes=antes, despues=d)
    db.session.commit()
    return jsonify(_resumen(c))


@bp.put("/<int:cliente_id>/direccion")
@requiere_usuario("cliente.gestionar")
def editar_direccion(cliente_id):
    c = _sucursal(cliente_id)
    d = cargar(DireccionSucursalSchema, cuerpo())
    dir_ = _direccion(c)
    antes = dir_.como_dict() if dir_ else None
    if not dir_:
        dir_ = Direccion(cliente_id=c.id, predeterminada=True)
        db.session.add(dir_)
    for k, v in d.items():
        setattr(dir_, k, v)
    auditar("sucursal_cliente.direccion", "cliente", c.id, antes=antes, despues=d)
    db.session.commit()
    return jsonify(_resumen(c))


@bp.post("/<int:cliente_id>/password")
@requiere_usuario("cliente.gestionar")
def cambiar_password(cliente_id):
    c = _sucursal(cliente_id)
    d = cargar(NuevaPasswordSchema, cuerpo())
    validar_fortaleza(d["password"])
    c.hash_password = hash_password(d["password"])
    c.intentos_fallidos, c.bloqueado_hasta = 0, None
    auditar("sucursal_cliente.password", "cliente", c.id)
    db.session.commit()
    return jsonify(_resumen(c))


@bp.post("/<int:cliente_id>/desbloquear")
@requiere_usuario("cliente.gestionar")
def desbloquear(cliente_id):
    c = _sucursal(cliente_id)
    if not c.bloqueado_hasta and not c.intentos_fallidos:
        raise AppError("La cuenta no está bloqueada.")
    c.intentos_fallidos, c.bloqueado_hasta = 0, None
    auditar("sucursal_cliente.desbloquear", "cliente", c.id)
    db.session.commit()
    return jsonify(_resumen(c))
