"""Contraseñas, identidad JWT y decoradores de autenticación/permisos."""
import uuid
from datetime import datetime, timedelta
from functools import wraps
from typing import Iterable

import bcrypt
from flask import g, has_request_context, request
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


MENSAJES_SESION = {
    "sesion_invalida": "Tu sesión ya no es válida. Inicia sesión de nuevo.",
    "sesion_revocada": "La sesión fue cerrada.",
    "sesion_expirada": "Tu sesión expiró. Inicia sesión de nuevo.",
    "sesion_inactiva": "Tu sesión se cerró por inactividad. Inicia sesión de nuevo.",
}

# Endpoints que resuelven la inactividad en su propia lógica (y no deben ser rechazados antes de ejecutarla):
# refresh, actividad y logout revocan con motivo `inactividad`; sesion solo informa. Lista cerrada: cualquier otra ruta,
# presente o futura, rechaza por omisión una sesión inactiva.
ENDPOINTS_CON_INACTIVIDAD_PROPIA = frozenset({"auth.refresh", "auth.actividad", "auth.sesion", "auth.logout"})


def limite_inactividad() -> timedelta:
    from flask import current_app
    return timedelta(minutes=current_app.config["SESION_INACTIVIDAD_MIN"])


def inactiva(s, t: datetime) -> bool:
    """Única frontera temporal de la inactividad: activa ⟺ t ≤ actividad_en + límite (en el límite exacto, activa)."""
    return t > s.actividad_en + limite_inactividad()


def motivo_rechazo_sesion(payload: dict, comprobar_inactividad: bool | None = None) -> str | None:
    """Por qué la sesión del token ya no sirve (código de error), o None si sigue vigente. Una consulta por clave primaria.

    Identidad, revocación y tope absoluto se comprueban siempre; la inactividad, salvo en ENDPOINTS_CON_INACTIVIDAD_PROPIA.
    """
    from ..models import SesionAuth, ahora
    if comprobar_inactividad is None:
        endpoint = request.endpoint if has_request_context() else None
        comprobar_inactividad = endpoint not in ENDPOINTS_CON_INACTIVIDAD_PROPIA
    try:
        sid = uuid.UUID(str(payload.get("sid")))
    except ValueError:
        return "sesion_invalida"  # tokens sin sesión (emitidos antes de S2): obligan a iniciar sesión de nuevo
    s = db.session.get(SesionAuth, sid)
    _, _, cuenta_id = str(payload.get("sub", "")).partition(":")
    if not s or s.tipo_cuenta != payload.get("tipo") or str(s.cuenta_id) != cuenta_id:
        return "sesion_invalida"
    if s.revocada_en is not None:
        return "sesion_revocada"
    t = ahora()
    if t > s.expira_absoluta:
        return "sesion_expirada"
    if comprobar_inactividad and inactiva(s, t):
        return "sesion_inactiva"  # solo lectura: la revocación la hacen refresh, actividad y logout
    if s.tipo_cuenta == "usuario":
        from ..services.presentacion_service import motivo_rechazo
        return motivo_rechazo(int(cuenta_id))  # cuenta de presentación fuera de su horario
    return None


def registrar_callbacks_jwt(jwt):
    @jwt.token_in_blocklist_loader
    def _revocado(_header, payload):
        g.motivo_sesion = motivo_rechazo_sesion(payload)
        return g.motivo_sesion is not None

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
        codigo = g.pop("motivo_sesion", None) or "sesion_invalida"
        return _error(MENSAJES_SESION[codigo], codigo)


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
    _exigir_lectura_en_presentacion(usuario)
    return usuario


# Lo que la cuenta de presentación en «solo consulta» sí puede enviar (sesión y registro de la propia presentación).
_ESCRITURA_PERMITIDA_PRESENTACION = ("/api/auth/", "/api/presentacion/")


def _exigir_lectura_en_presentacion(usuario):
    if request.method in ("GET", "HEAD", "OPTIONS") or request.path.startswith(_ESCRITURA_PERMITIDA_PRESENTACION):
        return
    from ..services import presentacion_service as pres
    c = pres.config()
    if c and c.get("solo_lectura") and pres.es_presentacion(usuario.id):
        raise SinPermiso("Modo presentación: puedes recorrer todo el sistema, pero no hacer cambios.", codigo="solo_consulta")


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


def canales_permitidos() -> set[str] | None:
    """None = todos los canales. El aprobador corporativo (lado Salud Digna) solo ve y opera el canal corporativo."""
    u = getattr(g, "usuario", None)
    return {"corporativo"} if u and u.rol.codigo == "aprobador" else None


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
