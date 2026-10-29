"""Autenticación de personal interno y de clientes."""
from datetime import datetime, timezone

from flask import Blueprint, g, jsonify
from flask_jwt_extended import (get_jwt, get_jwt_identity, jwt_required, set_refresh_cookies, unset_jwt_cookies,
                                verify_jwt_in_request)

from ..extensions import db
from ..models import Cliente, TokenRevocado, Usuario
from ..schemas import (CambiarPasswordSchema, LoginSchema, RecuperarSchema, RegistroSchema, RestablecerSchema, cargar)
from ..security.auth import _cargar_cliente, _cargar_usuario
from ..services import auth_service
from . import serial
from .util import cuerpo

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _respuesta_sesion(tipo, cuenta, status=200):
    tokens = auth_service.emitir_tokens(tipo, cuenta)
    datos = serial.usuario(cuenta) if tipo == "usuario" else serial.cliente(cuenta)
    resp = jsonify({"access_token": tokens["access_token"], "tipo": tipo, "cuenta": datos})
    set_refresh_cookies(resp, tokens["refresh_token"])
    return resp, status


@bp.post("/login")
def login_usuario():
    d = cargar(LoginSchema, cuerpo())
    return _respuesta_sesion("usuario", auth_service.login("usuario", d["correo"], d["password"]))


@bp.post("/cliente/login")
def login_cliente():
    d = cargar(LoginSchema, cuerpo())
    return _respuesta_sesion("cliente", auth_service.login("cliente", d["correo"], d["password"]))


@bp.post("/cliente/registro")
def registro():
    d = cargar(RegistroSchema, cuerpo())
    return _respuesta_sesion("cliente", auth_service.registrar_cliente(d), 201)


@bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    tipo = get_jwt()["tipo"]
    modelo = Usuario if tipo == "usuario" else Cliente
    cuenta = db.session.get(modelo, int(get_jwt_identity().split(":")[1]))
    if not cuenta or not cuenta.activo:
        return jsonify({"error": {"codigo": "no_autenticado", "mensaje": "La cuenta no está activa."}}), 401
    # Rotación: el refresh usado se revoca y se emite uno nuevo.
    jwt_data = get_jwt()
    db.session.add(TokenRevocado(jti=jwt_data["jti"], expira=datetime.fromtimestamp(jwt_data["exp"], timezone.utc)))
    db.session.commit()
    return _respuesta_sesion(tipo, cuenta)


@bp.post("/logout")
def logout():
    """Revoca el access token (encabezado) y el refresh token (cookie) si vienen en la solicitud."""
    resp = jsonify({"ok": True})
    for opciones in ({"locations": ["headers"]}, {"locations": ["cookies"], "refresh": True}):
        try:
            verify_jwt_in_request(optional=True, **opciones)
            datos = get_jwt()
            if datos:
                db.session.merge(TokenRevocado(jti=datos["jti"], expira=datetime.fromtimestamp(datos["exp"], timezone.utc)))
                db.session.commit()
        except Exception:
            db.session.rollback()
    unset_jwt_cookies(resp)
    return resp


@bp.get("/yo")
@jwt_required()
def yo():
    if get_jwt().get("tipo") == "usuario":
        return jsonify({"tipo": "usuario", "cuenta": serial.usuario(_cargar_usuario())})
    return jsonify({"tipo": "cliente", "cuenta": serial.cliente(_cargar_cliente())})


@bp.post("/password")
@jwt_required()
def cambiar_password():
    d = cargar(CambiarPasswordSchema, cuerpo())
    cuenta = _cargar_usuario() if get_jwt().get("tipo") == "usuario" else _cargar_cliente()
    auth_service.cambiar_password(cuenta, d["actual"], d["nueva"])
    return jsonify({"ok": True})


@bp.post("/recuperar")
def recuperar():
    d = cargar(RecuperarSchema, cuerpo())
    token = auth_service.solicitar_recuperacion(d["tipo"], d["correo"])
    resp = {"mensaje": "Si el correo está registrado, enviamos instrucciones para recuperar el acceso."}
    if token:  # solo en desarrollo, mientras no haya SMTP
        resp["token_desarrollo"] = token
    return jsonify(resp)


@bp.post("/restablecer")
def restablecer():
    d = cargar(RestablecerSchema, cuerpo())
    tipo = auth_service.restablecer(d["token"], d["password"])
    return jsonify({"ok": True, "tipo": tipo})
