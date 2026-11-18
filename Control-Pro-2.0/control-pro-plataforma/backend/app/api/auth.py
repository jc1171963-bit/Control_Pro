"""Autenticación de personal interno y de clientes."""
from flask import Blueprint, g, jsonify
from flask_jwt_extended import (get_jwt, get_jwt_identity, jwt_required, set_refresh_cookies, unset_jwt_cookies,
                                verify_jwt_in_request)

from ..errors import SinPermiso
from ..extensions import db
from ..models import Cliente, Usuario
from ..schemas import (CambiarPasswordSchema, LoginSchema, RecuperarSchema, RegistroSchema, RestablecerSchema, cargar)
from ..security.auth import _cargar_cliente, _cargar_usuario
from ..services import auth_service
from . import serial
from .util import cuerpo

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _respuesta_sesion(tipo, cuenta, status=200, sesion=None, huella=None):
    """Sin `sesion` es un inicio de sesión: abre una nueva (con `huella`, la contraseña verificada). En la renovación se
    recibe la generación vigente ya rotada."""
    vigente = sesion or auth_service.crear_sesion(tipo, cuenta, huella)
    tokens = auth_service.emitir_tokens(tipo, cuenta, vigente)
    datos = serial.usuario(cuenta) if tipo == "usuario" else serial.cliente(cuenta)
    resp = jsonify({"access_token": tokens["access_token"], "tipo": tipo, "cuenta": datos,
                    "sesion": auth_service.estado_de(vigente)})
    set_refresh_cookies(resp, tokens["refresh_token"])
    return resp, status


@bp.post("/login")
def login_usuario():
    d = cargar(LoginSchema, cuerpo())
    cuenta, huella = auth_service.login("usuario", d["correo"], d["password"])
    return _respuesta_sesion("usuario", cuenta, huella=huella)


@bp.post("/cliente/login")
def login_cliente():
    d = cargar(LoginSchema, cuerpo())
    cuenta, huella = auth_service.login("cliente", d["correo"], d["password"])
    return _respuesta_sesion("cliente", cuenta, huella=huella)


@bp.post("/portal/login")
def login_portal():
    """Entrada única del portal Salud Digna: cuentas de sucursal y aprobador corporativo usan el mismo formulario."""
    d = cargar(LoginSchema, cuerpo())
    tipo = auth_service.tipo_portal(d["correo"])
    cuenta, huella = auth_service.login(tipo, d["correo"], d["password"])
    return _respuesta_sesion(tipo, cuenta, huella=huella)


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
    try:
        vigente = auth_service.rotar_sesion(get_jwt().get("sid"), get_jwt().get("gen"))
    except auth_service.GeneracionFutura as e:  # borra la cookie para que ese navegador no reintente en bucle
        resp = jsonify({"error": {"codigo": e.codigo, "mensaje": e.mensaje}})
        unset_jwt_cookies(resp)
        return resp, 401
    return _respuesta_sesion(tipo, cuenta, sesion=vigente)


@bp.post("/actividad")
@jwt_required(refresh=True)
def actividad():
    """Reporte de interacción humana (duración `inactivo_ms`). No rota ni emite tokens: un reporte perdido al cerrar una
    pestaña no puede desincronizar la cookie. Lo llama solo el módulo de actividad del frontend, nunca el polling."""
    d = cuerpo()
    return jsonify(auth_service.registrar_actividad(get_jwt().get("sid"), get_jwt().get("gen"), d.get("inactivo_ms")))


@bp.get("/sesion")
@jwt_required(refresh=True)
def sesion():
    """Estado de la sesión en duraciones del servidor. Solo lectura: no escribe, no rota y no extiende nada."""
    return jsonify(auth_service.estado_sesion(get_jwt().get("sid"), get_jwt().get("gen")))


@bp.post("/logout")
def logout():
    """Revoca la sesión del access token (encabezado) o del refresh (cookie); con ella mueren todos sus tokens."""
    resp = jsonify({"ok": True})
    for opciones in ({"locations": ["headers"]}, {"locations": ["cookies"], "refresh": True}):
        try:
            verify_jwt_in_request(optional=True, **opciones)
            datos = get_jwt()
            if datos.get("sid"):
                auth_service.revocar_sesion(datos["sid"])  # motivo `inactividad` si ya lo estaba; si no, `cierre`
        except Exception:  # token ausente, inválido o de una sesión ya cerrada: el cierre siempre responde 200
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
    if isinstance(cuenta, Cliente) and cuenta.tipo == "empresa":
        raise SinPermiso("La contraseña de la sucursal la administra el distribuidor.", codigo="administrado_por_distribuidor")
    auth_service.cambiar_password(cuenta, d["actual"], d["nueva"], sid_actual=get_jwt().get("sid"))  # conserva esta sesión
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
