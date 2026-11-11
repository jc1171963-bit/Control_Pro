"""Cuentas de sucursal (clientes empresa): alta, datos generales, dirección de entrega, acceso y contraseña.

Cada sucursal tiene una sola cuenta. La sucursal solo administra a sus empleados; todo lo demás lo gestiona el
distribuidor desde aquí (permiso `cliente.gestionar`).
"""
from flask import Blueprint, jsonify, request
from sqlalchemy import func, or_, select

from ..errors import AppError, Conflicto, NoEncontrado
from ..extensions import db
from ..models import Carrito, Cliente, Direccion, Division, EmpleadoCorporativo, Pedido, Zona
from ..schemas import (CuentaSucursalSchema, DireccionSucursalSchema, DivisionSchema, EdicionCuentaSucursalSchema,
                       NuevaPasswordSchema, ZonaSchema, cargar)
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


def division_json(d: Division | None) -> dict | None:
    return {"id": d.id, "nombre": d.nombre, "responsable": d.responsable, "correo": d.correo, "telefono": d.telefono} if d else None


def zona_json(z: Zona | None) -> dict | None:
    if not z:
        return None
    return {"id": z.id, "nombre": z.nombre, "gerente": z.gerente, "correo": z.correo, "telefono": z.telefono,
            "vacante": not z.gerente, "division": division_json(z.division)}


def _zona_valida(zona_id: int | None) -> int | None:
    if zona_id is not None and not db.session.get(Zona, zona_id):
        raise NoEncontrado("Zona no encontrada.")
    return zona_id


def _direccion(c: Cliente) -> Direccion | None:
    return db.session.scalars(select(Direccion).where(Direccion.cliente_id == c.id, Direccion.activo.is_(True))
                              .order_by(Direccion.predeterminada.desc(), Direccion.id)).first()


def _resumen(c: Cliente) -> dict:
    solicitudes = select(Pedido).where(Pedido.cliente_id == c.id, Pedido.canal == "corporativo", Pedido.estado != "borrador")
    d = serial.cliente(c)
    d.update({
        "zona": zona_json(c.zona),
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
    q = (select(Cliente).where(Cliente.tipo == "empresa").outerjoin(Zona, Zona.id == Cliente.zona_id)
         .outerjoin(Division, Division.id == Zona.division_id)
         .order_by(Cliente.activo.desc(), Division.nombre.nulls_last(), Zona.nombre.nulls_last(), Cliente.razon_social, Cliente.id))
    if texto := request.args.get("q"):
        q = q.where(or_(Cliente.razon_social.ilike(f"%{texto}%"), Cliente.nombre.ilike(f"%{texto}%"),
                        Cliente.correo.ilike(f"%{texto}%")))
    if (activo := request.args.get("activo")) in {"1", "0"}:
        q = q.where(Cliente.activo.is_(activo == "1"))
    if division := request.args.get("division"):
        q = q.where(Division.id.is_(None) if division == "-" else Division.id == int(division))
    if zona := request.args.get("zona"):
        q = q.where(Zona.id == int(zona))
    if estado := request.args.get("estado"):
        q = q.where(Cliente.id.in_(select(Direccion.cliente_id).where(Direccion.activo.is_(True), Direccion.estado == estado)))
    return jsonify(paginar(q, *pagina(), _resumen))


@bp.get("/organizacion")
@requiere_usuario("cliente.ver")
def organizacion():
    """Divisiones con sus zonas, responsables, contacto y número de sucursales (filtros, agrupación y directorio)."""
    conteo = {zid: (total, activas) for zid, total, activas in db.session.execute(
        select(Cliente.zona_id, func.count(), func.count().filter(Cliente.activo.is_(True)))
        .where(Cliente.tipo == "empresa").group_by(Cliente.zona_id)).all()}
    estados: dict = {}
    for zid, estado in db.session.execute(select(Cliente.zona_id, Direccion.estado).join(Direccion, Direccion.cliente_id == Cliente.id)
                                          .where(Cliente.tipo == "empresa", Direccion.activo.is_(True)).distinct()).all():
        estados.setdefault(zid, set()).add(estado)

    def zona_completa(z: Zona) -> dict:
        total, activas = conteo.get(z.id, (0, 0))
        return {**zona_json(z), "total": total, "activas": activas, "estados": sorted(estados.get(z.id, ()))}

    divisiones = db.session.scalars(select(Division).order_by(Division.nombre)).unique().all()
    sin_division = db.session.scalars(select(Zona).where(Zona.division_id.is_(None)).order_by(Zona.nombre)).unique().all()
    salida = [{**division_json(d), "zonas": [zona_completa(z) for z in d.zonas]} for d in divisiones]
    if sin_division:
        salida.append({"id": None, "nombre": "Sin división", "responsable": None, "correo": None, "telefono": None,
                       "zonas": [zona_completa(z) for z in sin_division]})
    for d in salida:
        d["total"] = sum(z["total"] for z in d["zonas"])
        d["activas"] = sum(z["activas"] for z in d["zonas"])
    total, activas = conteo.get(None, (0, 0))
    return jsonify({"divisiones": salida, "sin_zona": {"total": total, "activas": activas},
                    "estados": sorted({e for v in estados.values() for e in v})})


@bp.post("/organizacion/divisiones")
@requiere_usuario("cliente.gestionar")
def crear_division():
    d = cargar(DivisionSchema, cuerpo())
    div = Division(**d)
    db.session.add(div)
    db.session.flush()
    auditar("division.crear", "division", div.id, despues=d)
    db.session.commit()
    return jsonify(division_json(div)), 201


@bp.put("/organizacion/divisiones/<int:division_id>")
@requiere_usuario("cliente.gestionar")
def editar_division(division_id):
    div = db.session.get(Division, division_id)
    if not div:
        raise NoEncontrado("División no encontrada.")
    d = cargar(DivisionSchema, cuerpo())
    antes = division_json(div)
    for k, v in d.items():
        setattr(div, k, v)
    auditar("division.editar", "division", div.id, antes=antes, despues=d)
    db.session.commit()
    return jsonify(division_json(div))


@bp.post("/organizacion/zonas")
@requiere_usuario("cliente.gestionar")
def crear_zona():
    d = cargar(ZonaSchema, cuerpo())
    if d["division_id"] is not None and not db.session.get(Division, d["division_id"]):
        raise NoEncontrado("División no encontrada.")
    z = Zona(**d)
    db.session.add(z)
    db.session.flush()
    auditar("zona.crear", "zona", z.id, despues=d)
    db.session.commit()
    return jsonify(zona_json(z)), 201


@bp.put("/organizacion/zonas/<int:zona_id>")
@requiere_usuario("cliente.gestionar")
def editar_zona(zona_id):
    z = db.session.get(Zona, zona_id)
    if not z:
        raise NoEncontrado("Zona no encontrada.")
    d = cargar(ZonaSchema, cuerpo())
    if d["division_id"] is not None and not db.session.get(Division, d["division_id"]):
        raise NoEncontrado("División no encontrada.")
    antes = zona_json(z)
    for k, v in d.items():
        setattr(z, k, v)
    auditar("zona.editar", "zona", z.id, antes=antes, despues=d)
    db.session.commit()
    db.session.refresh(z)
    return jsonify(zona_json(z))


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
                telefono=d.get("telefono"), tipo="empresa", razon_social=d["razon_social"].strip(), rfc=d.get("rfc") or None,
                zona_id=_zona_valida(d.get("zona_id")))
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
    if "zona_id" in d:
        _zona_valida(d["zona_id"])
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
