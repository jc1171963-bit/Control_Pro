"""Permisos de padrón de empleados y conversaciones entre el aprobador, las sucursales y la distribuidora."""
from datetime import timedelta

from flask import current_app
from sqlalchemy import exists, func, or_, select
from sqlalchemy.dialects.postgresql import insert

from ..errors import AppError, Conflicto, NoEncontrado, SinPermiso, TransicionInvalida
from ..extensions import db
from ..models import Cliente, Conversacion, Mensaje, Notificacion, Pedido, PermisoPadron, Rol, Usuario, ahora
from .comun import actor_ids, auditar, notificar_cliente, notificar_personal

ENLACE_PERMISOS_APROBADOR = "/aprobador/permisos"
ENLACE_PADRON_SUCURSAL = "/cuenta/empleados"


def notificar_aprobadores(evento: str, entidad: str, entidad_id: int, mensaje: str, enlace: str | None = None):
    """Avisa solo a las cuentas con rol aprobador (el administrador opera del lado de la distribuidora)."""
    ids = db.session.scalars(select(Usuario.id).join(Rol, Usuario.rol_id == Rol.id)
                             .where(Rol.codigo == "aprobador", Usuario.activo.is_(True)))
    for usuario_id in ids:
        db.session.execute(insert(Notificacion).values(
            usuario_id=usuario_id, evento=evento, entidad=entidad, entidad_id=entidad_id, mensaje=mensaje[:300],
            enlace=enlace).on_conflict_do_nothing(constraint="uq_notif_evento"))


def es_aprobador(usuario) -> bool:
    return bool(usuario) and usuario.rol.codigo == "aprobador"


# ---------------------------------------------------------------- permisos de padrón

def estado_efectivo(p: PermisoPadron) -> str:
    if p.estado == "aprobado" and p.vigente_hasta and p.vigente_hasta <= ahora():
        return "vencido"
    return p.estado


def permiso_vigente(cliente_id: int) -> PermisoPadron | None:
    return db.session.scalars(select(PermisoPadron).where(
        PermisoPadron.cliente_id == cliente_id, PermisoPadron.estado == "aprobado", PermisoPadron.vigente_hasta > ahora())
        .order_by(PermisoPadron.vigente_hasta.desc())).first()


def permiso_pendiente(cliente_id: int) -> PermisoPadron | None:
    return db.session.scalars(select(PermisoPadron).where(
        PermisoPadron.cliente_id == cliente_id, PermisoPadron.estado == "pendiente")).first()


def exigir_permiso_padron(cliente: Cliente):
    """Las sucursales (empresa) modifican su padrón solo con un permiso aprobado y vigente."""
    if cliente.tipo == "empresa" and not permiso_vigente(cliente.id):
        raise SinPermiso("Para modificar tu padrón de empleados necesitas un permiso vigente del aprobador. Solicítalo "
                         "desde la sección Empleados.", codigo="permiso_padron_requerido")


def _nombre(cliente: Cliente) -> str:
    return cliente.razon_social or cliente.nombre


def solicitar_permiso(cliente: Cliente, motivo: str) -> PermisoPadron:
    db.session.execute(select(Cliente.id).where(Cliente.id == cliente.id).with_for_update())  # una solicitud a la vez
    if permiso_vigente(cliente.id):
        raise Conflicto("Ya tienes un permiso vigente para modificar tu padrón.", codigo="permiso_vigente")
    if permiso_pendiente(cliente.id):
        raise Conflicto("Ya tienes una solicitud de permiso en revisión.", codigo="permiso_pendiente")
    p = PermisoPadron(cliente_id=cliente.id, motivo=motivo.strip(), estado="pendiente")
    db.session.add(p)
    db.session.flush()
    auditar("permiso_padron.solicitar", "permiso_padron", p.id, despues={"motivo": p.motivo})
    notificar_aprobadores("permiso_padron_solicitado", "permiso_padron", p.id,
                          f"{_nombre(cliente)} solicita permiso para modificar su padrón de empleados: {p.motivo}",
                          enlace=ENLACE_PERMISOS_APROBADOR)
    db.session.commit()
    return p


def _bloquear(permiso_id: int) -> PermisoPadron:
    p = db.session.scalars(select(PermisoPadron).where(PermisoPadron.id == permiso_id).with_for_update(of=PermisoPadron)).first()
    if not p:
        raise NoEncontrado("Solicitud de permiso no encontrada.")
    return p


def resolver_permiso(permiso_id: int, decision: str, respuesta: str | None, horas: int | None = None) -> PermisoPadron:
    """El aprobador aprueba (por un número de horas), rechaza o revoca un permiso."""
    p = _bloquear(permiso_id)
    usuario_id, _ = actor_ids()
    respuesta = (respuesta or "").strip() or None
    if decision in ("aprobado", "rechazado"):
        if p.estado != "pendiente":
            raise TransicionInvalida("La solicitud de permiso ya fue atendida.")
        if decision == "rechazado" and (not respuesta or len(respuesta) < 5):
            raise AppError("Indica el motivo del rechazo (mínimo 5 caracteres).")
        p.estado, p.respuesta, p.resuelto_por_id, p.resuelto_en = decision, respuesta, usuario_id, ahora()
        if decision == "aprobado":
            horas = horas or current_app.config["PERMISO_PADRON_HORAS"]
            p.vigente_hasta = ahora() + timedelta(hours=horas)
            mensaje = (f"Tu permiso para modificar el padrón de empleados fue aprobado por {horas} h"
                       f"{f': {respuesta}' if respuesta else ''}.")
        else:
            mensaje = f"Tu solicitud de permiso para modificar el padrón fue rechazada: {respuesta}"
    elif decision == "revocado":
        if estado_efectivo(p) != "aprobado":
            raise TransicionInvalida("Solo se puede revocar un permiso vigente.")
        p.estado, p.terminado_en = "terminado", ahora()
        p.respuesta = respuesta or p.respuesta
        mensaje = f"El aprobador cerró tu permiso para modificar el padrón{f': {respuesta}' if respuesta else ''}."
    else:
        raise AppError("Decisión inválida.")
    auditar(f"permiso_padron.{decision}", "permiso_padron", p.id, despues={"respuesta": respuesta, "horas": horas})
    notificar_cliente(p.cliente_id, f"permiso_padron_{decision}", "permiso_padron", p.id, mensaje, enlace=ENLACE_PADRON_SUCURSAL)
    db.session.commit()
    return p


def cerrar_por_sucursal(cliente: Cliente, permiso_id: int) -> PermisoPadron:
    """La sucursal cancela su solicitud pendiente o da por terminados sus cambios (cierra el permiso vigente)."""
    p = _bloquear(permiso_id)
    if p.cliente_id != cliente.id:
        raise NoEncontrado("Solicitud de permiso no encontrada.")
    if p.estado == "pendiente":
        p.estado = "cancelado"
    elif estado_efectivo(p) == "aprobado":
        p.estado, p.terminado_en = "terminado", ahora()
        notificar_aprobadores("permiso_padron_terminado", "permiso_padron", p.id,
                              f"{_nombre(cliente)} terminó los cambios a su padrón de empleados.", enlace=ENLACE_PERMISOS_APROBADOR)
    else:
        raise TransicionInvalida("Este permiso ya no está activo.")
    auditar("permiso_padron.cerrar", "permiso_padron", p.id, despues={"estado": p.estado})
    db.session.commit()
    return p


def permiso_json(p: PermisoPadron | None):
    if not p:
        return None
    return {"id": p.id, "estado": estado_efectivo(p), "motivo": p.motivo, "respuesta": p.respuesta,
            "solicitado": p.creado.isoformat(), "resuelto_en": p.resuelto_en.isoformat() if p.resuelto_en else None,
            "vigente_hasta": p.vigente_hasta.isoformat() if p.vigente_hasta else None,
            "terminado_en": p.terminado_en.isoformat() if p.terminado_en else None,
            "resuelto_por": p.resuelto_por.nombre if p.resuelto_por else None,
            "sucursal": {"id": p.cliente.id, "nombre": _nombre(p.cliente), "correo": p.cliente.correo,
                         "zona": p.cliente.zona.nombre if p.cliente.zona else None}}


def estado_padron(cliente_id: int) -> dict:
    historial = db.session.scalars(select(PermisoPadron).where(PermisoPadron.cliente_id == cliente_id)
                                   .order_by(PermisoPadron.id.desc()).limit(10)).all()
    return {"vigente": permiso_json(permiso_vigente(cliente_id)), "pendiente": permiso_json(permiso_pendiente(cliente_id)),
            "historial": [permiso_json(p) for p in historial]}


def consulta_permisos(filtro: str | None, q: str | None):
    consulta = select(PermisoPadron).join(Cliente, PermisoPadron.cliente_id == Cliente.id)
    if filtro == "pendiente":
        consulta = consulta.where(PermisoPadron.estado == "pendiente")
    elif filtro == "vigente":
        consulta = consulta.where(PermisoPadron.estado == "aprobado", PermisoPadron.vigente_hasta > ahora())
    elif filtro == "atendido":
        consulta = consulta.where(PermisoPadron.estado != "pendiente")
    if q:
        patron = f"%{q.strip()}%"
        consulta = consulta.where(or_(Cliente.razon_social.ilike(patron), Cliente.nombre.ilike(patron), Cliente.correo.ilike(patron)))
    return consulta.order_by((PermisoPadron.estado == "pendiente").desc(), PermisoPadron.id.desc())


def conteo_permisos() -> dict:
    return {"pendientes": db.session.scalar(select(func.count()).select_from(PermisoPadron).where(PermisoPadron.estado == "pendiente")),
            "vigentes": db.session.scalar(select(func.count()).select_from(PermisoPadron).where(
                PermisoPadron.estado == "aprobado", PermisoPadron.vigente_hasta > ahora()))}


# ---------------------------------------------------------------- conversaciones

def lado_de(usuario=None, cliente=None) -> str:
    if cliente is not None:
        return "contraparte"
    return "aprobador" if es_aprobador(usuario) else "contraparte"


def visibles(usuario=None, cliente=None):
    """Conversaciones que puede ver quien consulta."""
    consulta = select(Conversacion)
    if cliente is not None:
        return consulta.where(Conversacion.tipo == "sucursal", Conversacion.cliente_id == cliente.id)
    if es_aprobador(usuario):
        return consulta
    return consulta.where(Conversacion.tipo == "distribuidora")


def obtener(conversacion_id: int, usuario=None, cliente=None) -> Conversacion:
    c = db.session.scalars(visibles(usuario, cliente).where(Conversacion.id == conversacion_id)).first()
    if not c:
        raise NoEncontrado("Conversación no encontrada.")
    return c


def abrir(tipo: str, pedido_id: int | None, cliente_id: int | None, usuario=None, cliente=None) -> Conversacion:
    """Obtiene o crea la conversación. La sucursal solo abre la suya con el aprobador; la distribuidora solo la suya."""
    if cliente is not None:
        tipo, cliente_id = "sucursal", cliente.id
    elif not es_aprobador(usuario):
        tipo = "distribuidora"
    if tipo not in ("sucursal", "distribuidora"):
        raise AppError("Tipo de conversación inválido.")
    if pedido_id is not None:
        pedido = db.session.get(Pedido, pedido_id)
        if not pedido or pedido.canal != "corporativo" or (cliente is not None and pedido.cliente_id != cliente.id):
            raise NoEncontrado("Solicitud no encontrada.")
        cliente_id = pedido.cliente_id
    if tipo == "sucursal":
        if not cliente_id:
            raise AppError("Indica la sucursal de la conversación.")
        destino = db.session.get(Cliente, cliente_id)
        if not destino or destino.tipo != "empresa":  # solo con cuentas de sucursal, nunca con clientes de la tienda
            raise NoEncontrado("Sucursal no encontrada.")
    elif pedido_id is None:
        cliente_id = None  # canal general con la distribuidora
    db.session.execute(insert(Conversacion).values(tipo=tipo, cliente_id=cliente_id, pedido_id=pedido_id)
                       .on_conflict_do_nothing(constraint="uq_conversacion"))
    db.session.commit()
    c = db.session.scalars(select(Conversacion).where(
        Conversacion.tipo == tipo, Conversacion.cliente_id.is_not_distinct_from(cliente_id),
        Conversacion.pedido_id.is_not_distinct_from(pedido_id))).one()
    return c


def _no_leidos_expr(lado: str):
    leido = Conversacion.leido_aprobador_en if lado == "aprobador" else Conversacion.leido_contraparte_en
    return (select(func.count()).select_from(Mensaje).where(
        Mensaje.conversacion_id == Conversacion.id, Mensaje.lado != lado,
        or_(leido.is_(None), Mensaje.creado > leido)).correlate(Conversacion).scalar_subquery())


def listar(usuario=None, cliente=None, tipo: str | None = None):
    lado = lado_de(usuario, cliente)
    consulta = visibles(usuario, cliente)
    if tipo:
        consulta = consulta.where(Conversacion.tipo == tipo)
    filas = db.session.execute(consulta.add_columns(_no_leidos_expr(lado)).order_by(
        Conversacion.ultimo_mensaje_en.desc().nulls_last(), Conversacion.id.desc()).limit(200)).all()
    return [conversacion_json(c, lado, n) for c, n in filas]


def total_no_leidos(usuario=None, cliente=None) -> int:
    lado = lado_de(usuario, cliente)
    sub = visibles(usuario, cliente).with_only_columns(_no_leidos_expr(lado).label("n")).subquery()
    return int(db.session.scalar(select(func.coalesce(func.sum(sub.c.n), 0))) or 0)


def mensajes(c: Conversacion, usuario=None, cliente=None, despues: int | None = None):
    lado = lado_de(usuario, cliente)
    consulta = select(Mensaje).where(Mensaje.conversacion_id == c.id)
    if despues:
        consulta = consulta.where(Mensaje.id > despues)
    filas = db.session.scalars(consulta.order_by(Mensaje.id).limit(500)).all()
    marca = ahora()
    if lado == "aprobador":
        c.leido_aprobador_en = marca
    else:
        c.leido_contraparte_en = marca
    db.session.commit()
    return [mensaje_json(m, lado) for m in filas]


def enviar(c: Conversacion, texto: str, usuario=None, cliente=None) -> Mensaje:
    texto = (texto or "").strip()
    if not texto or len(texto) > 2000:
        raise AppError("El mensaje debe tener entre 1 y 2000 caracteres.")
    lado = lado_de(usuario, cliente)
    db.session.execute(select(Conversacion.id).where(Conversacion.id == c.id).with_for_update())
    # Solo el primer mensaje de una racha sin leer genera aviso (no se inunda la campana con cada mensaje).
    leido_otro = c.leido_contraparte_en if lado == "aprobador" else c.leido_aprobador_en
    condiciones = [Mensaje.conversacion_id == c.id, Mensaje.lado == lado]
    if leido_otro is not None:
        condiciones.append(Mensaje.creado > leido_otro)
    racha = db.session.scalar(select(exists().where(*condiciones)))
    m = Mensaje(conversacion_id=c.id, texto=texto, lado=lado,
                autor_usuario_id=usuario.id if usuario is not None and cliente is None else None,
                autor_cliente_id=cliente.id if cliente is not None else None)
    db.session.add(m)
    db.session.flush()
    marca = ahora()
    c.ultimo_mensaje_en = marca
    if lado == "aprobador":
        c.leido_aprobador_en = marca
    else:
        c.leido_contraparte_en = marca
    if not racha:
        _avisar(c, m, lado)
    db.session.commit()
    return m


def _asunto(c: Conversacion) -> str:
    if c.pedido:
        return f"Solicitud {c.pedido.folio}"
    return "Conversación general"


def _avisar(c: Conversacion, m: Mensaje, lado: str):
    resumen = m.texto if len(m.texto) <= 120 else m.texto[:117] + "…"
    if lado == "aprobador":
        if c.tipo == "sucursal":
            notificar_cliente(c.cliente_id, "mensaje_nuevo", "mensaje", m.id, f"Mensaje del aprobador · {_asunto(c)}: {resumen}",
                              enlace=f"/cuenta/mensajes?c={c.id}")
        else:
            notificar_personal("orden.recibir", "mensaje_nuevo", "mensaje", m.id, f"Mensaje del aprobador · {_asunto(c)}: {resumen}",
                               enlace=f"/admin/mensajes?c={c.id}")
    else:
        origen = _nombre(c.cliente) if c.tipo == "sucursal" else "La distribuidora"
        notificar_aprobadores("mensaje_nuevo", "mensaje", m.id, f"{origen} · {_asunto(c)}: {resumen}",
                              enlace=f"/aprobador/mensajes?c={c.id}")


def _whatsapp(c: Conversacion, lado: str) -> str | None:
    cfg = current_app.config
    if lado == "aprobador":
        return (c.cliente.telefono if c.tipo == "sucursal" and c.cliente else cfg["WHATSAPP_DISTRIBUIDORA"]) or None
    return cfg["WHATSAPP_APROBADOR"] or None


def conversacion_json(c: Conversacion, lado: str, no_leidos: int = 0):
    if lado == "aprobador":
        con = _nombre(c.cliente) if c.tipo == "sucursal" else "Distribuidora"
    else:
        con = "Aprobador corporativo"
    return {"id": c.id, "tipo": c.tipo, "asunto": _asunto(c), "con": con, "no_leidos": int(no_leidos or 0),
            "ultimo_mensaje_en": c.ultimo_mensaje_en.isoformat() if c.ultimo_mensaje_en else None,
            "pedido": {"id": c.pedido.id, "folio": c.pedido.folio, "estado": c.pedido.estado} if c.pedido else None,
            "sucursal": {"id": c.cliente.id, "nombre": _nombre(c.cliente)} if c.cliente else None,
            "whatsapp": _whatsapp(c, lado)}


def mensaje_json(m: Mensaje, lado: str):
    if m.autor_cliente:
        autor = _nombre(m.autor_cliente)
    elif m.autor_usuario:
        autor = m.autor_usuario.nombre
    else:
        autor = "Cuenta eliminada"
    etiqueta = {"aprobador": "Aprobador"}.get(m.lado) or ("Sucursal" if m.autor_cliente_id else "Distribuidora")
    return {"id": m.id, "texto": m.texto, "creado": m.creado.isoformat(), "propio": m.lado == lado, "autor": autor,
            "rol": etiqueta}
