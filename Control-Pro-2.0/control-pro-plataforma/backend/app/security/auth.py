"""Contraseñas, identidad JWT y decoradores de autenticación/permisos."""
from functools import wraps
from typing import Iterable

import bcrypt
from flask import g, request
from flask_jwt_extended import get_jwt, get_jwt_identity, verify_jwt_in_request

from ..errors import NoAutenticado, NoEncontrado, SinPermiso
from ..extensions import db

BCRYPT_COSTO = 12


def hash_password(plano: str) -> str:
    return bcrypt.hashpw(plano.encode("utf-8"), bcrypt.gensalt(BCRYPT_COSTO)).decode("utf-8")


def verificar_password(plano: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plano.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def validar_fortaleza(plano: str) -> None:
    from ..errors import AppError
    if len(plano) < 8 or not any(c.isdigit() for c in plano) or not any(c.isalpha() for c in plano):
        raise AppError("La contraseña debe tener al menos 8 caracteres e incluir letras y números.",
                       codigo="password_debil", status=422)


def registrar_callbacks_jwt(jwt):
    from ..models import TokenRevocado

    @jwt.token_in_blocklist_loader
    def _revocado(_header, payload):
        return db.session.get(TokenRevocado, payload["jti"]) is not None

    def _error(mensaje, codigo="no_autenticado"):
        from flask import jsonify
        return jsonify({"error": {"codigo": codigo, "mensaje": mensaje}}), 401

    @jwt.unauthorized_loader
    def _sin_token(_motivo):
        return _error("Inicia sesión para continuar.")

    @jwt.expired_token_loader
    def _expirado(_h, _p):
        return _error("Tu sesión expiró.", "token_expirado")

    @jwt.invalid_token_loader
    def _invalido(_motivo):
        return _error("Token inválido.", "token_invalido")

    @jwt.revoked_token_loader
    def _revocado_resp(_h, _p):
        return _error("La sesión fue cerrada.", "token_revocado")


def _cargar_usuario():
    from ..models import Usuario
    verify_jwt_in_request()
    if get_jwt().get("tipo") != "usuario":
        raise SinPermiso("Esta sección es solo para personal interno.")
    usuario = db.session.get(Usuario, int(get_jwt_identity().split(":")[1]))
    if not usuario or not usuario.activo:
        raise NoAutenticado("La cuenta no está activa.")
    g.usuario = usuario
    g.cliente = None
    return usuario


def _cargar_cliente():
    from ..models import Cliente
    verify_jwt_in_request()
    if get_jwt().get("tipo") != "cliente":
        raise SinPermiso("Esta sección es solo para clientes de la tienda.")
    cliente = db.session.get(Cliente, int(get_jwt_identity().split(":")[1]))
    if not cliente or not cliente.activo:
        raise NoAutenticado("La cuenta no está activa.")
    g.cliente = cliente
    g.usuario = None
    return cliente


def requiere_usuario(*permisos: str):
    """Exige personal interno con TODOS los permisos indicados."""
    def deco(fn):
        @wraps(fn)
        def envoltura(*args, **kwargs):
            usuario = _cargar_usuario()
            faltan = [p for p in permisos if p not in usuario.codigos_permiso]
            if faltan:
                raise SinPermiso("No tienes permiso para realizar esta operación.", detalles={"requiere": faltan})
            return fn(*args, **kwargs)
        return envoltura
    return deco


def requiere_cliente(empresa: bool = False):
    def deco(fn):
        @wraps(fn)
        def envoltura(*args, **kwargs):
            cliente = _cargar_cliente()
            if empresa and cliente.tipo != "empresa":
                raise SinPermiso("Función disponible solo para cuentas corporativas.")
            return fn(*args, **kwargs)
        return envoltura
    return deco


def tiene_permiso(codigo: str) -> bool:
    u = getattr(g, "usuario", None)
    return bool(u and codigo in u.codigos_permiso)


# ---------------------------------------------------------------- alcance por sucursal

def es_global() -> bool:
    u = getattr(g, "usuario", None)
    return bool(u and u.alcance_global)


def sucursales_permitidas() -> set[int] | None:
    """None = todas (alcance global)."""
    if es_global():
        return None
    return g.usuario.sucursal_ids


def verificar_alcance(sucursal_ids: int | Iterable[int | None] | None) -> None:
    """Responde 404 si ninguna de las sucursales del recurso pertenece al usuario (no revela que existe)."""
    permitidas = sucursales_permitidas()
    if permitidas is None:
        return
    if sucursal_ids is None:
        raise NoEncontrado("Registro no encontrado.")
    ids = {sucursal_ids} if isinstance(sucursal_ids, int) else {s for s in sucursal_ids if s is not None}
    if not ids & permitidas:
        raise NoEncontrado("Registro no encontrado.")


def filtro_sucursal(columna):
    """Condición SQL para limitar una consulta a las sucursales del usuario (o None si es global)."""
    permitidas = sucursales_permitidas()
    if permitidas is None:
        return None
    return columna.in_(permitidas or {-1})


def ip_cliente() -> str | None:
    return (request.headers.get("X-Forwarded-For", request.remote_addr) or "").split(",")[0].strip() or None
