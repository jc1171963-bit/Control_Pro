"""Inicio de sesión con bloqueo por intentos, registro de clientes y recuperación de acceso."""
import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from flask import current_app, request
from flask_jwt_extended import create_access_token, create_refresh_token
from sqlalchemy import and_, case, delete, func, or_, select, update

from ..errors import AppError, Conflicto, NoAutenticado
from ..extensions import db
from ..models import Carrito, Cliente, PushSuscripcion, SesionAuth, TokenRecuperacion, Usuario, ahora
from ..security.auth import (MENSAJES_SESION, hash_password, inactiva, ip_cliente, limite_inactividad, validar_fortaleza,
                             verificar_password)
from .comun import auditar
from ..integrations.correo import enviar_correo

MENSAJE_GENERICO = "Correo o contraseña incorrectos."


def _modelo(tipo: str):
    return Usuario if tipo == "usuario" else Cliente


def _buscar(tipo: str, correo: str):
    m = _modelo(tipo)
    return db.session.scalars(select(m).where(func.lower(m.correo) == correo.strip().lower())).first()


@dataclass(frozen=True)
class Vigente:
    """Generación vigente de una sesión, tomada bajo bloqueo: es todo lo que necesita la emisión de tokens."""
    sid: str
    gen: int
    emitida_en: datetime
    expira_absoluta: datetime
    actividad_en: datetime

    @classmethod
    def de(cls, s: SesionAuth) -> "Vigente":
        return cls(str(s.id), s.gen, s.gen_emitida_en, s.expira_absoluta, s.actividad_en)


def estado_de(v, t: datetime | None = None) -> dict:
    """Duraciones calculadas con el reloj del servidor (el navegador nunca recibe ni envía fechas)."""
    t = t or ahora()
    restante = v.actividad_en + limite_inactividad() - t
    margen_aviso = timedelta(minutes=current_app.config["SESION_INACTIVIDAD_MIN"] - current_app.config["SESION_AVISO_MIN"])

    def ms(d: timedelta) -> int:
        return max(0, int(d.total_seconds() * 1000))

    return {"estado": "activa", "restante_inactividad_ms": ms(restante), "aviso_en_ms": ms(restante - margen_aviso),
            "restante_absoluto_ms": ms(v.expira_absoluta - t)}


def bloquear_cuenta(modelo, cuenta_id: int):
    """Fila de la cuenta bloqueada (FOR UPDATE): serializa inicio de sesión, cambio de contraseña y desactivación.
    Orden de bloqueo en todo el sistema: cuenta → sesión, nunca al revés."""
    # `of=modelo`: Usuario carga su rol con un LEFT OUTER JOIN y PostgreSQL no bloquea el lado opcional de un join externo.
    return db.session.scalars(select(modelo).where(modelo.id == cuenta_id).with_for_update(of=modelo)
                              .execution_options(populate_existing=True)).first()


def revocar_sesiones_de_cuenta(tipo: str, cuenta_id: int, motivo: str, excepto_sid: str | None = None) -> int:
    """Revoca las sesiones vigentes de una cuenta en todos los dispositivos. SIN commit: corre en la transacción de
    quien cambia la contraseña o el estado, así que ambos se confirman juntos o ninguno. No toca las ya revocadas
    (conservan su motivo). Devuelve cuántas revocó.

    En la misma transacción borra las suscripciones push de las sesiones que revoca y las heredadas sin sid de la cuenta
    (limpieza de S2.5). La de `excepto_sid` se conserva: ese dispositivo sigue recibiendo avisos."""
    condiciones = [SesionAuth.tipo_cuenta == tipo, SesionAuth.cuenta_id == cuenta_id, SesionAuth.revocada_en.is_(None)]
    if (excepto := _clave(excepto_sid)) is not None:
        condiciones.append(SesionAuth.id != excepto)
    revocadas = db.session.execute(update(SesionAuth).where(*condiciones).values(revocada_en=ahora(), motivo=motivo)
                                   .returning(SesionAuth.id).execution_options(synchronize_session=False)).scalars().all()
    dueno = PushSuscripcion.usuario_id if tipo == "usuario" else PushSuscripcion.cliente_id
    db.session.execute(delete(PushSuscripcion).where(or_(
        PushSuscripcion.sid.in_(revocadas), and_(PushSuscripcion.sid.is_(None), dueno == cuenta_id)))
        .execution_options(synchronize_session=False))
    return len(revocadas)


def _borrar_push_de_sesion(sid) -> None:
    """Sin commit: va en la transacción que revoca la sesión (orden de bloqueo cuenta → sesión → suscripción)."""
    db.session.execute(delete(PushSuscripcion).where(PushSuscripcion.sid == sid).execution_options(synchronize_session=False))


def _tipo_de(cuenta) -> str:
    return "usuario" if isinstance(cuenta, Usuario) else "cliente"


def crear_sesion(tipo: str, cuenta, huella: str | None = None, reemplaza: tuple | None = None) -> Vigente:
    """Cada inicio de sesión abre una sesión con tope absoluto; sus tokens llevan su `sid` y la generación `gen`.

    Con la cuenta bloqueada se vuelve a comprobar que siga activa y, si se indica `huella` (la contraseña verificada al
    iniciar sesión), que no haya cambiado: así un cambio de contraseña o una desactivación concurrentes nunca dejan
    viva una sesión abierta con la credencial anterior.

    `reemplaza` = (sid, tipo, cuenta_id) de la sesión que este navegador tenía (su cookie de refresh, ya verificada). Si
    sigue vigente se revoca con motivo `reemplazo` y se borran sus suscripciones push, en la MISMA transacción que crea la
    nueva: o se confirman las dos cosas o ninguna. Un navegador tiene una sola sesión; los demás dispositivos no se tocan."""
    c = bloquear_cuenta(_modelo(tipo), cuenta.id)
    if not c or not c.activo or (huella is not None and c.hash_password != huella):
        db.session.rollback()
        raise NoAutenticado(MENSAJE_GENERICO)
    t = ahora()
    if reemplaza is not None:  # orden de bloqueo cuenta → sesión, como en el resto del sistema
        sid_previo, tipo_previo, cuenta_previa = reemplaza
        _revocar(sid_previo, t, "reemplazo", SesionAuth.tipo_cuenta == tipo_previo, SesionAuth.cuenta_id == cuenta_previa,
                 t <= SesionAuth.expira_absoluta, ~inactiva(SesionAuth, t))
    s = SesionAuth(id=uuid.uuid4(), tipo_cuenta=tipo, cuenta_id=cuenta.id, gen=1, gen_emitida_en=t, actividad_en=t,
                   expira_absoluta=t + timedelta(hours=current_app.config["SESION_MAXIMA_HORAS"]),
                   ip=ip_cliente(), agente=(request.headers.get("User-Agent") or "")[:300] or None)
    db.session.add(s)
    vigente = Vigente.de(s)
    db.session.commit()
    return vigente


class GeneracionFutura(NoAutenticado):
    """El refresh trae una generación que el servidor nunca emitió (p. ej. base restaurada): se rechaza sin tocar la sesión."""
    codigo = "token_invalido"


def _rechazo(codigo: str):
    db.session.rollback()
    return NoAutenticado(MENSAJES_SESION[codigo], codigo=codigo)


def _clave(sid) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(sid))
    except ValueError:
        return None


def _leer(sid, bloquear: bool) -> SesionAuth | None:
    clave = _clave(sid)
    if clave is None:
        return None
    consulta = select(SesionAuth).where(SesionAuth.id == clave)
    if bloquear:
        consulta = consulta.with_for_update()
    return db.session.scalars(consulta.execution_options(populate_existing=True)).first()


def _es_entero(gen) -> bool:
    return isinstance(gen, int) and not isinstance(gen, bool)


def _dentro_de_gracia(s: SesionAuth, t: datetime) -> bool:
    return t - s.gen_emitida_en <= timedelta(seconds=current_app.config["REFRESH_GRACIA_SEG"])


def _revocar_por_inactividad(s: SesionAuth, t: datetime):
    """Bajo el bloqueo: la inactividad es definitiva; ninguna gracia ni reporte posterior revive la sesión."""
    s.revocada_en, s.motivo = t, "inactividad"
    _borrar_push_de_sesion(s.id)
    db.session.commit()
    return NoAutenticado(MENSAJES_SESION["sesion_inactiva"], codigo="sesion_inactiva")


def rotar_sesion(sid: str, gen) -> Vigente:
    """Renovación con la fila bloqueada. Si la sesión está inactiva se revoca (prevalece sobre la gracia). Si no, según la
    generación presentada `p`:

    - p == gen: rota a gen+1.
    - p == gen-1 dentro de la gracia: reintento (respuesta perdida, recarga, pestañas a la vez); devuelve la misma
      generación vigente sin escribir nada, así que su refresh sale idéntico.
    - p == gen-1 fuera de la gracia o p <= gen-2: reutilización; revoca la sesión entera.
    - p > gen: generación nunca emitida; se rechaza sin modificar ni revocar la sesión.
    """
    s = _leer(sid, bloquear=True)
    if not s:
        raise _rechazo("sesion_invalida")
    if s.revocada_en is not None:  # revocada entre la validación del token y este bloqueo
        raise _rechazo("sesion_revocada")
    if ahora() > s.expira_absoluta:
        raise _rechazo("sesion_expirada")
    if not _es_entero(gen):
        raise _rechazo("sesion_invalida")
    if gen <= s.gen and inactiva(s, ahora()):  # una generación futura no altera la sesión, ni siquiera inactiva
        raise _revocar_por_inactividad(s, ahora())
    if gen == s.gen:
        s.gen += 1
        s.gen_emitida_en = ahora()
        vigente = Vigente.de(s)  # se toma antes del commit: nada posterior puede cambiar lo que se emite
        db.session.commit()
        return vigente
    if gen == s.gen - 1 and _dentro_de_gracia(s, ahora()):
        vigente = Vigente.de(s)
        db.session.rollback()  # no hay cambios: solo libera el bloqueo
        return vigente
    rastro = {"sid": str(s.id), "presentada": gen, "vigente": s.gen}
    tipo_cuenta, cuenta_id = s.tipo_cuenta, s.cuenta_id
    if gen > s.gen:
        db.session.rollback()  # la sesión queda intacta; solo queda constancia
        auditar("sesion.generacion_futura", tipo_cuenta, cuenta_id, despues=rastro)
        db.session.commit()
        raise GeneracionFutura("Este acceso ya no es válido. Inicia sesión de nuevo.")
    s.revocada_en, s.motivo = ahora(), "reutilizacion"
    _borrar_push_de_sesion(s.id)
    auditar("sesion.reutilizacion", tipo_cuenta, cuenta_id, despues=rastro)
    db.session.commit()
    raise NoAutenticado(MENSAJES_SESION["sesion_revocada"], codigo="sesion_revocada")


def _clasificar_sin_escribir(s: SesionAuth | None, gen, t: datetime) -> str | None:
    """Rechazos que no escriben nada, comunes a actividad y consulta (la reutilización solo la juzga el refresh)."""
    if not s:
        return "sesion_invalida"
    if s.revocada_en is not None:
        return "sesion_revocada"
    if t > s.expira_absoluta:
        return "sesion_expirada"
    if not _es_entero(gen) or not (gen == s.gen or (gen == s.gen - 1 and _dentro_de_gracia(s, t))):
        return "sesion_invalida"
    return None


def registrar_actividad(sid: str, gen, inactivo_ms) -> dict:
    """Única vía que adelanta `actividad_en`: interacción humana medida por el navegador como duración (reloj monótono),
    nunca como fecha. Clasifica sobre la fila bloqueada, así que la respuesta refleja el estado confirmado aun con logout,
    refresh u otros reportes concurrentes. La actividad nunca retrocede ni revive una sesión inactiva."""
    s = _leer(sid, bloquear=True)
    t = ahora()
    motivo = _clasificar_sin_escribir(s, gen, t)
    if motivo:
        raise _rechazo(motivo)
    if inactiva(s, t):
        raise _revocar_por_inactividad(s, t)
    if not _es_entero(inactivo_ms) or inactivo_ms < 0:
        db.session.rollback()
        raise AppError("`inactivo_ms` debe ser un entero de milisegundos mayor o igual a cero.", status=422,
                       codigo="actividad_invalida")
    resultado = "sin_cambios"
    if inactivo_ms <= limite_inactividad().total_seconds() * 1000:  # una duración mayor ya no describe actividad válida
        candidata = max(t - timedelta(milliseconds=inactivo_ms), s.creada)
        if candidata > s.actividad_en:
            s.actividad_en, resultado = candidata, "registrada"
    estado = estado_de(Vigente.de(s), t)
    if resultado == "registrada":
        db.session.commit()
    else:
        db.session.rollback()  # nada que escribir: solo libera el bloqueo
    return {"resultado": resultado, "sesion": estado}


def estado_sesion(sid: str, gen) -> dict:
    """Consulta de solo lectura: nunca escribe, ni siquiera para revocar una sesión inactiva."""
    s = _leer(sid, bloquear=False)
    t = ahora()
    motivo = _clasificar_sin_escribir(s, gen, t) or ("sesion_inactiva" if inactiva(s, t) else None)
    if motivo:
        raise _rechazo(motivo)
    estado = estado_de(Vigente.de(s), t)
    db.session.rollback()
    return estado


def revocar_sesion(sid: str, motivo: str | None = None) -> None:
    """Revoca la sesión si sigue vigente. Sin `motivo` (cierre de sesión), queda `inactividad` si ya estaba inactiva y
    `cierre` si no, con la misma frontera que el resto del sistema."""
    clave = _clave(sid)
    if clave is None:
        return
    t = ahora()
    if motivo is None:
        motivo = case((SesionAuth.actividad_en + limite_inactividad() < t, "inactividad"), else_="cierre")
    _revocar(clave, t, motivo)
    db.session.commit()


def _revocar(clave, t: datetime, motivo, *condiciones) -> bool:
    """Sin commit: revoca la sesión si no estaba revocada (y cumple `condiciones`) y borra sus suscripciones push.
    Solo si esta llamada la revocó: una ya revocada no provoca más borrados."""
    r = db.session.execute(update(SesionAuth).where(SesionAuth.id == clave, SesionAuth.revocada_en.is_(None), *condiciones)
                           .values(revocada_en=t, motivo=motivo).execution_options(synchronize_session=False))
    if r.rowcount:
        _borrar_push_de_sesion(clave)
    return bool(r.rowcount)


def _csrf_refresh(sid: str, gen: int) -> str:
    clave = current_app.config["JWT_SECRET_KEY"].encode()
    return hmac.new(clave, f"{sid}.{gen}".encode(), hashlib.sha256).hexdigest()


def emitir_tokens(tipo: str, cuenta, v: Vigente) -> dict:
    """El access es nuevo en cada respuesta. El refresh es determinista: la misma generación produce exactamente el mismo
    token (y la misma cookie CSRF), lo que hace idempotente el reintento de una renovación cuya respuesta se perdió."""
    identidad = f"{'u' if tipo == 'usuario' else 'c'}:{cuenta.id}"
    claims = {"tipo": tipo, "sid": v.sid, "gen": v.gen}
    # Un access nunca vive más que la ventana de inactividad conocida ni que el tope absoluto (y no se extiende después).
    acceso_exp = min(ahora() + current_app.config["JWT_ACCESS_TOKEN_EXPIRES"], v.actividad_en + limite_inactividad(),
                     v.expira_absoluta)
    refresh_exp = min(v.emitida_en + current_app.config["JWT_REFRESH_TOKEN_EXPIRES"], v.expira_absoluta)
    return {"access_token": create_access_token(identidad, additional_claims={**claims, "exp": acceso_exp}),
            "refresh_token": create_refresh_token(identidad, additional_claims={
                **claims, "jti": f"{v.sid}.{v.gen}", "iat": v.emitida_en, "nbf": v.emitida_en, "exp": refresh_exp,
                "csrf": _csrf_refresh(v.sid, v.gen)})}


def login(tipo: str, correo: str, password: str):
    """Devuelve (cuenta, huella): `huella` es la contraseña (hash) que se acaba de verificar. `crear_sesion` la compara
    con la cuenta bloqueada para que un cambio de contraseña concurrente no deje viva una sesión con la anterior."""
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
    if tipo == "usuario":
        from . import presentacion_service as pres
        if pres.es_presentacion(cuenta.id) and not pres.en_ventana():
            pres.registrar_intento_fuera_de_horario(cuenta)
            raise NoAutenticado("Este acceso de presentación solo funciona en el horario acordado.")
    huella = cuenta.hash_password
    cuenta.intentos_fallidos = 0
    cuenta.bloqueado_hasta = None
    cuenta.ultimo_acceso = ahora()
    db.session.commit()
    return cuenta, huella


def tipo_portal(correo: str) -> str:
    """Quién entra por el portal: una sucursal (cliente) o el aprobador corporativo (usuario con rol aprobador).
    El resto del personal interno entra por /admin/entrar; para ellos se responde como cuenta inexistente."""
    if _buscar("cliente", correo):
        return "cliente"
    u = _buscar("usuario", correo)
    return "usuario" if u and u.rol.codigo == "aprobador" else "cliente"


def registrar_cliente(datos: dict) -> Cliente:
    if not current_app.config["CANAL_TIENDA"]:
        raise AppError("Las cuentas de sucursal las da de alta el distribuidor.", codigo="canal_no_disponible")
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
    if tipo == "cliente" and cuenta.tipo == "empresa":
        return None  # la contraseña de una sucursal la restablece el distribuidor (misma respuesta para no revelar nada)
    token = secrets.token_urlsafe(32)
    db.session.add(TokenRecuperacion(tipo_cuenta=tipo, cuenta_id=cuenta.id,
                                     hash_token=hashlib.sha256(token.encode()).hexdigest(),
                                     expira=ahora() + timedelta(minutes=current_app.config["RECUPERACION_MINUTOS"])))
    ruta = "/admin/restablecer" if tipo == "usuario" else "/cuenta/restablecer"
    enviar_correo(cuenta.correo, "Recupera tu acceso",
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
    cuenta = bloquear_cuenta(_modelo(registro.tipo_cuenta), registro.cuenta_id)
    cuenta.hash_password = hash_password(password)
    cuenta.intentos_fallidos, cuenta.bloqueado_hasta = 0, None
    registro.usado = True
    # Restablecer supone que la cuenta pudo estar comprometida: se cierran TODAS sus sesiones.
    n = revocar_sesiones_de_cuenta(registro.tipo_cuenta, cuenta.id, "restablecimiento")
    auditar("auth.password_restablecida", registro.tipo_cuenta, cuenta.id, despues={"sesiones_revocadas": n})
    db.session.commit()
    return registro.tipo_cuenta


def cambiar_password(cuenta, actual: str, nueva: str, sid_actual: str | None = None):
    """Cambio por el propio titular: revoca sus demás sesiones (otros dispositivos) y conserva la actual."""
    cuenta = bloquear_cuenta(type(cuenta), cuenta.id)
    if not verificar_password(actual, cuenta.hash_password):
        db.session.rollback()
        raise AppError("La contraseña actual no es correcta.", codigo="password_incorrecta")
    validar_fortaleza(nueva)
    cuenta.hash_password = hash_password(nueva)
    n = revocar_sesiones_de_cuenta(_tipo_de(cuenta), cuenta.id, "password", excepto_sid=sid_actual)
    auditar("auth.password_cambiada", _tipo_de(cuenta), cuenta.id, despues={"sesiones_revocadas": n})
    db.session.commit()
