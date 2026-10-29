"""Inicio de sesión con bloqueo por intentos, registro de clientes y recuperación de acceso."""
import hashlib
import secrets
from datetime import timedelta

from flask import current_app
from flask_jwt_extended import create_access_token, create_refresh_token
from sqlalchemy import func, select

from ..errors import AppError, Conflicto, NoAutenticado
from ..extensions import db
from ..models import Carrito, Cliente, TokenRecuperacion, Usuario, ahora
from ..security.auth import hash_password, validar_fortaleza, verificar_password
from .comun import auditar
from ..integrations.correo import enviar_correo

MENSAJE_GENERICO = "Correo o contraseña incorrectos."


def _modelo(tipo: str):
    return Usuario if tipo == "usuario" else Cliente


def _buscar(tipo: str, correo: str):
    m = _modelo(tipo)
    return db.session.scalars(select(m).where(func.lower(m.correo) == correo.strip().lower())).first()


def emitir_tokens(tipo: str, cuenta) -> dict:
    identidad = f"{'u' if tipo == 'usuario' else 'c'}:{cuenta.id}"
    claims = {"tipo": tipo}
    return {"access_token": create_access_token(identidad, additional_claims=claims),
            "refresh_token": create_refresh_token(identidad, additional_claims=claims)}


def login(tipo: str, correo: str, password: str):
    cuenta = _buscar(tipo, correo)
    if not cuenta or not cuenta.activo:
        verificar_password(password, "$2b$12$" + "x" * 53)  # tiempo similar para no revelar si existe
        raise NoAutenticado(MENSAJE_GENERICO)
    if cuenta.bloqueado_hasta and cuenta.bloqueado_hasta > ahora():
        raise AppError("Cuenta bloqueada temporalmente por intentos fallidos. Intenta más tarde o recupera tu acceso.",
                       status=423, codigo="cuenta_bloqueada")
    if not verificar_password(password, cuenta.hash_password):
        cuenta.intentos_fallidos += 1
        if cuenta.intentos_fallidos >= current_app.config["INTENTOS_MAXIMOS"]:
            cuenta.bloqueado_hasta = ahora() + timedelta(minutes=current_app.config["BLOQUEO_MINUTOS"])
            cuenta.intentos_fallidos = 0
            auditar("auth.bloqueo", tipo, cuenta.id)
        db.session.commit()
        raise NoAutenticado(MENSAJE_GENERICO)
    cuenta.intentos_fallidos = 0
    cuenta.bloqueado_hasta = None
    cuenta.ultimo_acceso = ahora()
    db.session.commit()
    return cuenta


def registrar_cliente(datos: dict) -> Cliente:
    validar_fortaleza(datos["password"])
    if _buscar("cliente", datos["correo"]):
        raise Conflicto("Ya existe una cuenta con ese correo.", codigo="correo_duplicado")
    c = Cliente(correo=datos["correo"].strip().lower(), hash_password=hash_password(datos["password"]),
                nombre=datos["nombre"].strip(), telefono=datos.get("telefono"), tipo=datos.get("tipo", "persona"),
                razon_social=datos.get("razon_social"), rfc=(datos.get("rfc") or None))
    if c.tipo == "empresa" and not c.razon_social:
        raise AppError("La razón social es obligatoria para cuentas corporativas.")
    db.session.add(c)
    db.session.flush()
    db.session.add(Carrito(cliente_id=c.id))
    auditar("cliente.registro", "cliente", c.id, despues={"correo": c.correo, "tipo": c.tipo})
    db.session.commit()
    return c


def solicitar_recuperacion(tipo: str, correo: str) -> str | None:
    """Siempre responde igual para no revelar si el correo existe. Devuelve el token solo en desarrollo."""
    cuenta = _buscar(tipo, correo)
    if not cuenta or not cuenta.activo:
        return None
    token = secrets.token_urlsafe(32)
    db.session.add(TokenRecuperacion(tipo_cuenta=tipo, cuenta_id=cuenta.id,
                                     hash_token=hashlib.sha256(token.encode()).hexdigest(),
                                     expira=ahora() + timedelta(minutes=current_app.config["RECUPERACION_MINUTOS"])))
    ruta = "/admin/restablecer" if tipo == "usuario" else "/cuenta/restablecer"
    enviar_correo(cuenta.correo, "Recupera tu acceso a Control Pro",
                  f"Para crear una nueva contraseña entra a {current_app.config['FRONTEND_URL']}{ruta}?token={token} "
                  f"(válido {current_app.config['RECUPERACION_MINUTOS']} minutos).")
    auditar("auth.recuperacion_solicitada", tipo, cuenta.id)
    db.session.commit()
    return token if current_app.config.get("EXPONER_TOKEN_RECUPERACION") else None


def restablecer(token: str, password: str):
    validar_fortaleza(password)
    registro = db.session.scalars(select(TokenRecuperacion).where(
        TokenRecuperacion.hash_token == hashlib.sha256(token.encode()).hexdigest()).with_for_update()).first()
    if not registro or registro.usado or registro.expira < ahora():
        raise AppError("El enlace no es válido o ya expiró.", codigo="token_invalido")
    cuenta = db.session.get(_modelo(registro.tipo_cuenta), registro.cuenta_id)
    cuenta.hash_password = hash_password(password)
    cuenta.intentos_fallidos, cuenta.bloqueado_hasta = 0, None
    registro.usado = True
    auditar("auth.password_restablecida", registro.tipo_cuenta, cuenta.id)
    db.session.commit()
    return registro.tipo_cuenta


def cambiar_password(cuenta, actual: str, nueva: str):
    if not verificar_password(actual, cuenta.hash_password):
        raise AppError("La contraseña actual no es correcta.", codigo="password_incorrecta")
    validar_fortaleza(nueva)
    cuenta.hash_password = hash_password(nueva)
    auditar("auth.password_cambiada", "usuario" if isinstance(cuenta, Usuario) else "cliente", cuenta.id)
    db.session.commit()
