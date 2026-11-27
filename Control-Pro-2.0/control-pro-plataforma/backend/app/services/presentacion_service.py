"""Modo presentación: una cuenta temporal de aprobador para enseñar el sistema a una persona externa, protegida.

- La cuenta solo funciona dentro de su ventana de horario (`desde` → `hasta`): fuera de ella no entra y, si ya estaba
  dentro, su sesión deja de valer en la siguiente petición.
- Una sola sesión a la vez: un nuevo inicio de sesión cierra cualquier otro dispositivo.
- Todo lo que abre y hace queda en la bitácora (`presentacion.*`).
- Opcionalmente solo consulta: no puede aprobar, rechazar ni modificar nada.
- La interfaz pone una marca de agua con su nombre y correo y bloquea copiar, imprimir y capturar (ver
  frontend/src/components/ModoPresentacion.tsx).

La configuración vive en `configuracion['presentacion']`; solo hay una presentación activa a la vez.
"""
import re
import secrets
from datetime import datetime, timedelta

from flask import g, has_request_context, request
from sqlalchemy import func, or_, select

from ..errors import AppError, NoEncontrado
from ..extensions import db
from ..models import Aprobacion, Auditoria, Configuracion, Pedido, Rol, SesionAuth, Usuario, ahora
from ..security.auth import hash_password
from .comun import auditar

CLAVE = "presentacion"
# Último pulso de la pestaña de la cuenta de presentación (el pulso de 2 s de la interfaz solo corre con la pestaña visible).
CLAVE_PULSO = "presentacion_pulso"
# Peticiones que no se registran en la bitácora (se repiten cada pocos segundos y no dicen qué vio la persona).
SIN_REGISTRO = ("/api/actividad", "/api/auth/actividad", "/api/auth/refresh", "/api/auth/sesion", "/api/presentacion/vista",
                "/api/presentacion/evento", "/api/auth/login", "/api/auth/portal/login")  # el inicio de sesión ya es «entrada»


def config() -> dict | None:
    """Presentación configurada (vigente o no). Se lee una vez por petición."""
    if has_request_context() and "presentacion_cfg" in g:
        return g.presentacion_cfg
    c = db.session.get(Configuracion, CLAVE)
    valor = c.valor if c and isinstance(c.valor, dict) else None
    if has_request_context():
        g.presentacion_cfg = valor
    return valor


def _fecha(iso: str) -> datetime:
    return datetime.fromisoformat(iso)


def es_presentacion(usuario_id: int | None) -> bool:
    c = config()
    return bool(c and usuario_id and c.get("usuario_id") == usuario_id)


def ventana_vigente(t: datetime | None = None) -> tuple[datetime, datetime, str] | None:
    """La ventana en curso (desde, hasta, tipo): el horario acordado o, si hay, la ventana de pruebas (que no toca el
    horario acordado)."""
    c = config()
    if not c:
        return None
    t = t or ahora()
    ventanas = [(c["desde"], c["hasta"], "acordada")]
    if c.get("prueba"):
        ventanas.append((c["prueba"]["desde"], c["prueba"]["hasta"], "prueba"))
    return next(((_fecha(d), _fecha(h), tipo) for d, h, tipo in ventanas if _fecha(d) <= t <= _fecha(h)), None)


def en_ventana(t: datetime | None = None) -> bool:
    return ventana_vigente(t) is not None


def en_prueba(t: datetime | None = None) -> bool:
    c = config()
    p = (c or {}).get("prueba")
    t = t or ahora()
    return bool(p and _fecha(p["desde"]) <= t <= _fecha(p["hasta"]))


def motivo_rechazo(usuario_id: int) -> str | None:
    """Para la cuenta de presentación fuera de su horario: el código de sesión con que se rechaza."""
    if es_presentacion(usuario_id) and not en_ventana():
        return "sesion_expirada"
    return None


def _fue_de_presentacion(usuario_id: int) -> bool:
    """La cuenta es (o fue) una cuenta temporal de presentación."""
    if es_presentacion(usuario_id):
        return True
    return db.session.scalar(select(Auditoria.id).where(
        Auditoria.accion == "presentacion.crear", Auditoria.entidad == "usuario", Auditoria.entidad_id == usuario_id,
    ).limit(1)) is not None


def datos_para_interfaz(usuario_id: int) -> dict | None:
    """Lo que la interfaz necesita para la marca de agua y el aviso de fin de sesión."""
    if not es_presentacion(usuario_id):
        return None
    c = config()
    v = ventana_vigente()  # el aviso de la pantalla cuenta hacia el fin de la ventana en curso (prueba o acordada)
    desde, hasta = (v[0].isoformat(), v[1].isoformat()) if v else (c["desde"], c["hasta"])
    return {"nombre": c["nombre"], "correo": c["correo"], "empresa": c.get("empresa") or "LURIMA",
            "desde": desde, "hasta": hasta, "solo_lectura": bool(c.get("solo_lectura"))}


# Sin caracteres que se confunden al dictarla o teclearla (0/O/o, 1/l/I): 5 intentos fallidos bloquean la cuenta 15 min.
_ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"


def _contrasena() -> str:
    """12 caracteres al azar (~70 bits) en tres bloques de cuatro, con mayúscula, minúscula y número."""
    while True:
        s = "".join(secrets.choice(_ALFABETO) for _ in range(12))
        if any(c.isupper() for c in s) and any(c.islower() for c in s) and any(c.isdigit() for c in s):
            return "-".join(s[i:i + 4] for i in range(0, 12, 4))


def crear(nombre: str, correo: str, desde: datetime, horas: float, empresa: str = "LURIMA",
          solo_lectura: bool = False) -> tuple[Usuario, str]:
    """Crea (o renueva) la cuenta temporal de aprobador y devuelve (usuario, contraseña generada)."""
    correo = correo.strip().lower()
    if horas <= 0 or horas > 12:
        raise AppError("La presentación debe durar entre unos minutos y 12 horas.")
    rol = db.session.scalars(select(Rol).where(Rol.codigo == "aprobador")).first()
    if not rol:
        raise NoEncontrado("No existe el rol de aprobador.")
    u = db.session.scalars(select(Usuario).where(Usuario.correo == correo)).first()
    # Nunca se toma una cuenta real (le cambiaría la contraseña y al cerrar quedaría desactivada): solo se renuevan
    # cuentas que nacieron para una presentación.
    if u and not _fue_de_presentacion(u.id):
        raise AppError("Ese correo ya pertenece a una cuenta del sistema; usa un correo distinto para la presentación.")
    anterior = config()
    password = _contrasena()
    if not u:
        u = Usuario(correo=correo, nombre=nombre.strip(), rol_id=rol.id, hash_password=hash_password(password), activo=True)
        db.session.add(u)
    else:
        u.nombre, u.rol_id, u.activo = nombre.strip(), rol.id, True
        u.hash_password = hash_password(password)
        u.intentos_fallidos, u.bloqueado_hasta = 0, None
    db.session.flush()
    # Una sola cuenta de presentación viva: si la anterior no se cerró, se cierra ahora (si no, quedaría como un
    # aprobador normal, sin horario ni marca de agua).
    if anterior and anterior.get("usuario_id") != u.id:
        previa = db.session.get(Usuario, anterior["usuario_id"])
        if previa and previa.activo:
            from .auth_service import revocar_sesiones_de_cuenta
            previa.activo = False
            revocar_sesiones_de_cuenta("usuario", previa.id, "admin")
    hasta = desde + timedelta(hours=horas)
    c = db.session.get(Configuracion, CLAVE) or Configuracion(clave=CLAVE)
    c.valor = {"usuario_id": u.id, "nombre": u.nombre, "correo": correo, "empresa": empresa,
               "desde": desde.isoformat(), "hasta": hasta.isoformat(), "solo_lectura": solo_lectura}
    db.session.add(c)
    auditar("presentacion.crear", "usuario", u.id, despues={**c.valor})
    db.session.commit()
    if has_request_context():
        g.pop("presentacion_cfg", None)
    return u, password


def ajustar(desde: datetime | None = None, horas: float | None = None, nombre: str | None = None,
            solo_lectura: bool | None = None) -> dict:
    """Cambia el horario, el nombre o «solo consulta» de la presentación abierta SIN tocar la contraseña (p. ej. si la
    reunión se alarga). `horas` es la duración total contada desde el inicio."""
    c = config()
    u = db.session.get(Usuario, c["usuario_id"]) if c else None
    if not u or not u.activo:
        raise AppError("No hay una presentación abierta; crea una con presentacion-crear.")
    inicio = desde or _fecha(c["desde"])
    duracion = horas if horas is not None else (_fecha(c["hasta"]) - _fecha(c["desde"])).total_seconds() / 3600
    if duracion <= 0 or duracion > 12:
        raise AppError("La presentación debe durar entre unos minutos y 12 horas.")
    valor = {**c, "desde": inicio.isoformat(), "hasta": (inicio + timedelta(hours=duracion)).isoformat()}
    if nombre and nombre.strip():
        u.nombre = valor["nombre"] = nombre.strip()
    if solo_lectura is not None:
        valor["solo_lectura"] = solo_lectura
    auditar("presentacion.ajustar", "usuario", u.id, antes={**c}, despues={**valor})
    db.session.get(Configuracion, CLAVE).valor = valor
    db.session.commit()
    if has_request_context():
        g.pop("presentacion_cfg", None)
    return valor


def ventana_de_prueba(horas: float | None) -> dict:
    """Abre una ventana de pruebas desde ahora (o la termina con `horas=None`) SIN tocar el horario acordado ni la
    contraseña: la cuenta funciona en cualquiera de las dos ventanas."""
    c = config()
    u = db.session.get(Usuario, c["usuario_id"]) if c else None
    if not u or not u.activo:
        raise AppError("No hay una presentación abierta; crea una con presentacion-crear.")
    valor = {k: v for k, v in c.items() if k != "prueba"}
    if horas is not None:
        if horas <= 0 or horas > 12:
            raise AppError("La ventana de pruebas debe durar entre unos minutos y 12 horas.")
        t = ahora()
        valor["prueba"] = {"desde": t.isoformat(), "hasta": (t + timedelta(hours=horas)).isoformat()}
    auditar("presentacion.prueba", "usuario", u.id, antes={**c}, despues={**valor})
    db.session.get(Configuracion, CLAVE).valor = valor
    db.session.commit()
    if has_request_context():
        g.pop("presentacion_cfg", None)
    return valor


def extender(minutos) -> dict:
    """Alarga la ventana en curso —la de pruebas o el horario acordado— sin tocar la contraseña (p. ej. si la reunión se
    alarga). Si el horario acordado ya terminó, lo reabre desde ahora."""
    if not isinstance(minutos, int) or isinstance(minutos, bool) or not 5 <= minutos <= 240:
        raise AppError("Indica entre 5 y 240 minutos.")
    c = config()
    u = db.session.get(Usuario, c["usuario_id"]) if c else None
    if not u or not u.activo:
        raise AppError("No hay una presentación abierta.")
    t = ahora()
    v = ventana_vigente(t)
    if v and v[2] == "prueba":
        inicio, nuevo = v[0], v[1] + timedelta(minutes=minutos)
        valor = {**c, "prueba": {**c["prueba"], "hasta": nuevo.isoformat()}}
    else:
        inicio = _fecha(c["desde"])
        if t < inicio:
            raise AppError("La presentación todavía no empieza.")
        nuevo = max(_fecha(c["hasta"]), t) + timedelta(minutes=minutos)
        valor = {**c, "hasta": nuevo.isoformat()}
    if nuevo - inicio > timedelta(hours=12):
        raise AppError("La ventana no puede pasar de 12 horas.")
    auditar("presentacion.extender", "usuario", u.id, antes={**c}, despues={**valor})
    db.session.get(Configuracion, CLAVE).valor = valor
    db.session.commit()
    if has_request_context():
        g.pop("presentacion_cfg", None)
    return valor


def cerrar() -> Usuario | None:
    """Termina la presentación ya: desactiva la cuenta y cierra sus sesiones en todos los dispositivos."""
    from .auth_service import revocar_sesiones_de_cuenta
    c = config()
    if not c:
        return None
    u = db.session.get(Usuario, c["usuario_id"])
    if u:
        u.activo = False
        revocar_sesiones_de_cuenta("usuario", u.id, "admin")
    valor = {k: v for k, v in c.items() if k != "prueba"}
    valor["hasta"] = min(_fecha(c["hasta"]), ahora()).isoformat()
    cfg = db.session.get(Configuracion, CLAVE)
    cfg.valor = valor
    auditar("presentacion.cerrar", "usuario", c["usuario_id"])
    db.session.commit()
    return u


def registrar(accion: str, detalle: dict) -> None:
    """Agrega una línea a la bitácora de la presentación (sin interrumpir la petición si algo falla)."""
    try:
        if en_prueba():  # lo de la ventana de pruebas se distingue de la presentación real
            detalle = {**(detalle or {}), "prueba": True}
        auditar(f"presentacion.{accion}", "presentacion", None, despues=detalle)
        db.session.commit()
    except Exception:  # pragma: no cover - la bitácora nunca debe tumbar la petición
        db.session.rollback()


def registrar_intento_fuera_de_horario(usuario: Usuario) -> None:
    """Alguien con la contraseña correcta intentó entrar fuera del horario acordado: queda en la bitácora."""
    from ..security.auth import ip_cliente
    en_peticion = has_request_context()
    try:
        db.session.add(Auditoria(usuario_id=usuario.id, accion="presentacion.intento_fuera_de_horario",
                                 entidad="presentacion",
                                 despues={"agente": request.headers.get("User-Agent", "")[:200] if en_peticion else ""},
                                 ip=ip_cliente() if en_peticion else None))
        db.session.commit()
    except Exception:  # pragma: no cover - la bitácora nunca debe tumbar la petición
        db.session.rollback()


def marcar_pulso(usuario_id: int) -> None:
    """La pestaña de la cuenta de presentación está abierta y visible (el pulso de 2 s de la interfaz solo corre así)."""
    try:
        p = db.session.get(Configuracion, CLAVE_PULSO) or Configuracion(clave=CLAVE_PULSO)
        p.valor = {"usuario_id": usuario_id, "en": ahora().isoformat()}
        db.session.add(p)
        db.session.commit()
    except Exception:  # pragma: no cover - nunca debe tumbar el pulso
        db.session.rollback()


_PEDIDO_EN_RUTA = re.compile(r"/pedidos/(\d+)")


def en_vivo(limite: int = 300) -> dict:
    """Lo que muestra la pantalla «Presentación en vivo»: estado de la cuenta y su actividad, lo más reciente primero.

    La actividad une la bitácora de la cuenta, sus decisiones sobre solicitudes y los cambios hechos desde la
    distribuidora (se creó, se abrió una prueba, se extendió, se cerró)."""
    t = ahora()
    c = config()
    if not c:
        return {"configurada": False, "ahora": t.isoformat()}
    uid = c["usuario_id"]
    u = db.session.get(Usuario, uid)
    v = ventana_vigente(t)
    s = db.session.scalars(select(SesionAuth).where(
        SesionAuth.tipo_cuenta == "usuario", SesionAuth.cuenta_id == uid, SesionAuth.revocada_en.is_(None),
        SesionAuth.expira_absoluta > t).order_by(SesionAuth.actividad_en.desc()).limit(1)).first()
    p = db.session.get(Configuracion, CLAVE_PULSO)
    pulso = p.valor.get("en") if p and isinstance(p.valor, dict) and p.valor.get("usuario_id") == uid else None

    filas: list[tuple[datetime, dict]] = []
    for a in db.session.scalars(select(Auditoria).where(Auditoria.usuario_id == uid)
                                .order_by(Auditoria.id.desc()).limit(limite)):
        filas.append((a.creado, {"clave": f"a{a.id}", "accion": a.accion, "entidad": a.entidad,
                                 "entidad_id": a.entidad_id, "detalle": a.despues, "ip": a.ip, "sistema": False}))
    for a in db.session.scalars(select(Auditoria).where(
            Auditoria.entidad == "usuario", Auditoria.entidad_id == uid, Auditoria.accion.like("presentacion.%"),
            or_(Auditoria.usuario_id.is_(None), Auditoria.usuario_id != uid)).order_by(Auditoria.id.desc()).limit(50)):
        d = a.despues or {}
        filas.append((a.creado, {"clave": f"a{a.id}", "accion": a.accion, "entidad": a.entidad, "entidad_id": a.entidad_id,
                                 "detalle": {"hasta": d.get("hasta"), "prueba": d.get("prueba")}, "ip": None,
                                 "sistema": True}))
    for d in db.session.scalars(select(Aprobacion).where(Aprobacion.usuario_id == uid)
                                .order_by(Aprobacion.id.desc()).limit(100)):
        filas.append((d.creado, {"clave": f"d{d.id}", "accion": "presentacion.decision", "entidad": "pedido",
                                 "entidad_id": d.pedido_id, "detalle": {"decision": d.decision, "motivo": d.motivo},
                                 "ip": None, "sistema": False}))
    filas.sort(key=lambda x: x[0], reverse=True)
    actividad = [{**f, "fecha": fecha.isoformat()} for fecha, f in filas[:limite]]

    ids = set()
    for f in actividad:
        if f["entidad"] == "pedido" and f["entidad_id"]:
            ids.add(int(f["entidad_id"]))
        m = _PEDIDO_EN_RUTA.search(str((f["detalle"] or {}).get("ruta") or "")) if isinstance(f["detalle"], dict) else None
        if m:
            ids.add(int(m.group(1)))
    folios = {str(i): fo for i, fo in db.session.execute(select(Pedido.id, Pedido.folio).where(Pedido.id.in_(ids)))} \
        if ids else {}

    # Conteos desde que empezó la ventana en curso (o la última que empezó): «en esta sesión de presentación».
    inicios = [d for d in [_fecha(c["desde"])] + ([_fecha(c["prueba"]["desde"])] if c.get("prueba") else []) if d <= t]
    desde_conteo = v[0] if v else (max(inicios) if inicios else None)

    def contar(*condiciones):
        q = select(func.count()).select_from(Auditoria).where(Auditoria.usuario_id == uid, *condiciones)
        return db.session.scalar(q.where(Auditoria.creado >= desde_conteo) if desde_conteo else q)

    decisiones = select(func.count()).select_from(Aprobacion).where(Aprobacion.usuario_id == uid)
    conteos = {
        "pantallas": contar(Auditoria.accion == "presentacion.vista"),
        "acciones": contar(Auditoria.accion == "presentacion.peticion", Auditoria.despues["metodo"].astext != "GET",
                           Auditoria.despues["ruta"].astext.notlike("/api/auth/%")),  # entrar y salir no son acciones
        "alertas": contar(or_(Auditoria.accion.like("presentacion.evento.%"),
                              Auditoria.accion == "presentacion.intento_fuera_de_horario"),
                          Auditoria.accion != "presentacion.evento.fuera_de_ventana"),
        "salidas": contar(Auditoria.accion == "presentacion.evento.fuera_de_ventana",
                          Auditoria.despues["detalle"].astext.like("Salió%")),
        "decisiones": db.session.scalar(decisiones.where(Aprobacion.creado >= desde_conteo) if desde_conteo else decisiones),
    }
    return {
        "configurada": True,
        "ahora": t.isoformat(),
        "persona": {"nombre": c["nombre"], "correo": c["correo"], "empresa": c.get("empresa") or "LURIMA",
                    "solo_lectura": bool(c.get("solo_lectura"))},
        "cuenta_activa": bool(u and u.activo),
        "horario": {"desde": c["desde"], "hasta": c["hasta"]},
        "prueba": c.get("prueba"),
        "ventana": {"tipo": v[2], "desde": v[0].isoformat(), "hasta": v[1].isoformat()} if v else None,
        "sesion": {"inicio": s.creada.isoformat() if s.creada else None,
                   "actividad_en": s.actividad_en.isoformat() if s.actividad_en else None,
                   "agente": s.agente, "ip": s.ip} if s else None,
        "ultimo_pulso": pulso,
        "conteos": conteos,
        "conteo_desde": desde_conteo.isoformat() if desde_conteo else None,
        "actividad": actividad,
        "folios": folios,
    }


def bitacora(limite: int = 500) -> list[dict]:
    c = config()
    if not c:
        return []
    filas = db.session.scalars(select(Auditoria).where(Auditoria.usuario_id == c["usuario_id"])
                               .order_by(Auditoria.id.desc()).limit(limite)).all()
    return [{"fecha": a.creado.isoformat() if a.creado else None, "accion": a.accion, "detalle": a.despues, "ip": a.ip}
            for a in filas]
