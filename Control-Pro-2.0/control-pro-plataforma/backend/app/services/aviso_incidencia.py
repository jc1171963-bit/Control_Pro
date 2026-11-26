"""Avisos de incidencias (Etapa 2): qué evento avisa, a quién, con qué texto y a dónde lleva.

Separación (Fase 3 §8–§11):
- Evento: lo decide quien llama (cada función de este módulo es un evento del catálogo).
- Turno: lo calcula turno_service; aquí solo se usa para redactar la acción esperada, nunca se recalcula.
- Destinatario: `destinatarios_lurima` (grupo operativo, responsable o respaldo admin, sin el autor) o la sucursal dueña.
- Acción: el enlace a la incidencia (`enlace_lurima`, `enlace_sucursal`).

Un aviso por evento y destinatario: la clave del evento es única (`inc{id}_creada`, `inc{id}_seg{id}`) y
`uq_notif_evento` impide repetirla. Nada aquí hace commit: vive en la transacción de la acción que lo origina.
"""
from sqlalchemy import select

from ..extensions import db
from .comun import actor_ids, notificar_cliente, notificar_usuarios

TIPOS = {
    "articulo_faltante": "Artículo faltante", "articulo_danado": "Artículo dañado", "talla_incorrecta": "Talla incorrecta",
    "articulo_incorrecto": "Artículo incorrecto", "paquete_no_recibido": "Paquete no recibido", "otro": "Otro",
    "diferencia_recepcion": "Diferencia en recepción", "entrega_incompleta": "Entrega incompleta",
    "faltante_surtido": "Faltante al surtir", "incidencia_envio": "Incidencia de envío",
    "conformidad_talla": "Conformidad: talla", "conformidad_faltante": "Conformidad: faltante",
    "conformidad_incorrecto": "Conformidad: artículo incorrecto", "conformidad_danado": "Conformidad: dañado",
    "faltante_transferencia": "Faltante en transferencia",
}
# Cómo nació una incidencia automática (para que el aviso diga qué pasó, no solo el tipo)
ORIGEN = {
    "diferencia_recepcion": "detectada al registrar la recepción", "entrega_incompleta": "detectada al entregar a un empleado",
    "faltante_surtido": "detectada al surtir", "incidencia_envio": "registrada durante el envío",
    "faltante_transferencia": "detectada al recibir una transferencia",
}
PERMISO = "incidencia.gestionar"


def tipo_legible(tipo: str) -> str:
    return TIPOS.get(tipo) or tipo.replace("_", " ").capitalize()


def _extracto(texto: str | None, n: int = 120) -> str:
    texto = " ".join((texto or "").split())
    return texto if len(texto) <= n else texto[: n - 1].rstrip() + "…"


def _cita(texto: str | None) -> str:
    """«“texto”.» como frase completa; sin punto extra si la cita ya cierra con puntuación."""
    t = _extracto(texto)
    return f"“{t}”" + ("" if t[-1:] in (".", "?", "!", "…") else ".")


def _contenido(s, sujeto: str = "") -> str:
    """Lo que dice una entrada: su texto citado o, si solo trae archivos, cuántos."""
    if (s.comentario or "").strip():
        return _cita(s.comentario)
    return f"{sujeto}envió {len(s.adjuntos or [])} archivo(s)."


def _pedido(inc):
    from ..models import Pedido
    return db.session.get(Pedido, inc.pedido_id) if inc.pedido_id else None


def _contexto(inc) -> str:
    """«INC-… · PED-… · Cliente» (o la transferencia) para el personal."""
    p = _pedido(inc)
    if p:
        return f"{inc.folio} · {p.folio} · {p.cliente.razon_social or p.cliente.nombre}"  # como los demás avisos
    return f"{inc.folio} · transferencia #{inc.transferencia_id}" if inc.transferencia_id else inc.folio


def enlace_lurima(inc) -> str:
    # Página de detalle (3B.3); los avisos antiguos con ?abrir=<id> los redirige el frontend
    return f"/admin/incidencias/{inc.id}"


def enlace_sucursal(inc) -> str:
    from .devolucion_service import de_sucursal
    # El detalle /cuenta/incidencias/<id> es del portal de empresas; el cliente de tienda llega por su pedido
    return f"/cuenta/incidencias/{inc.id}" if de_sucursal(inc) else f"/cuenta/pedidos/{inc.pedido_id}"


# ---------------------------------------------------------------- destinatarios de Lurima

def _gestores():
    """Usuarios activos con permiso de gestionar incidencias (con su rol y sus almacenes)."""
    from ..models import Permiso, Rol, Usuario
    from ..models.seguridad import rol_permiso
    return db.session.scalars(select(Usuario).join(Rol, Usuario.rol_id == Rol.id)
                              .join(rol_permiso, rol_permiso.c.rol_id == Rol.id)
                              .join(Permiso, Permiso.id == rol_permiso.c.permiso_id)
                              .where(Usuario.activo.is_(True), Permiso.codigo == PERMISO)).unique().all()


def _almacenes(inc) -> set[int]:
    """El almacén de la incidencia o, si no tiene, los que surtieron su pedido (misma regla de visibilidad de la lista)."""
    if inc.sucursal_id:
        return {inc.sucursal_id}
    p = _pedido(inc)
    if not p:
        return set()
    from .pedido_service import sucursales_de
    return sucursales_de(p)


def destinatarios_lurima(inc, conversacion: bool = False) -> list[int]:
    """1) En la conversación, el responsable asignado (si existe, está activo, puede gestionar y no es el autor).
    2) El grupo operativo: gestores globales y los de los almacenes de la incidencia, sin el rol admin.
    3) Respaldo: si tras quitar al autor no queda nadie, los administradores (sin el autor).
    Siempre sin el autor de la acción y sin repetir."""
    autor = actor_ids()[0]
    gestores = _gestores()
    if conversacion and inc.responsable_id and inc.responsable_id != autor and any(u.id == inc.responsable_id for u in gestores):
        return [inc.responsable_id]
    almacenes = _almacenes(inc)
    operativos = {u.id for u in gestores if u.rol.codigo != "admin"
                  and (u.rol.alcance_global or almacenes & {s.id for s in u.sucursales})} - {autor}
    if operativos:
        return sorted(operativos)
    return sorted({u.id for u in gestores if u.rol.codigo == "admin"} - {autor})


def _a_lurima(inc, evento: str, titulo: str, detalle: str, conversacion: bool = False):
    notificar_usuarios(destinatarios_lurima(inc, conversacion), evento, "incidencia", inc.id,
                       f"{titulo}\n{detalle}", enlace_lurima(inc))


def _a_sucursal(inc, evento: str, titulo: str, detalle: str):
    p = _pedido(inc)
    if p is None or actor_ids()[1] == p.cliente_id:  # sin sucursal, o la sucursal es la autora
        return
    notificar_cliente(p.cliente_id, evento, "incidencia", inc.id, f"{titulo}\n{detalle}", enlace_sucursal(inc))


def _turno(inc):
    """Turno ya con la entrada recién agregada (se guarda antes de leer el seguimiento)."""
    from .turno_service import turno_incidencia
    db.session.flush()
    db.session.expire(inc, ["seguimiento"])
    return turno_incidencia(inc)


# ---------------------------------------------------------------- eventos

def creada(inc):
    """E1–E8, E22: toda incidencia nueva, manual o automática, avisa a Lurima."""
    from ..models import Paquete
    usuario_id, cliente_id = actor_ids()
    if inc.tipo in ORIGEN:
        como = ORIGEN[inc.tipo]
    elif cliente_id:
        como = "reportada por la sucursal"
    else:
        como = "registrada por el personal" if usuario_id else "registrada por el sistema"
    paq = db.session.get(Paquete, inc.paquete_id) if inc.paquete_id else None
    if paq and paq.incidencia_id and paq.incidencia_id != inc.id:
        como += f" en la reposición de {paq.incidencia.folio}"
    prioridad = {"alta": " alta", "critica": " crítica"}.get(inc.prioridad, "")
    _a_lurima(inc, f"inc{inc.id}_creada", f"Nueva incidencia{prioridad}: {tipo_legible(inc.tipo)}",
              f"{_contexto(inc)} — {como}.")


def mensaje_de_sucursal(inc, s):
    """E9: la sucursal escribe (texto o archivos)."""
    if _turno(inc).codigo == "sucursal_confirmar":
        titulo, extra = "La sucursal escribió en una incidencia resuelta", " Aún no confirma la solución."
    else:
        titulo, extra = "La sucursal respondió a una incidencia", ""
    _a_lurima(inc, f"inc{inc.id}_seg{s.id}", titulo, f"{_contexto(inc)}: {_contenido(s)}{extra}", conversacion=True)


def reabierta(inc, s, motivo: str):
    """E10."""
    _a_lurima(inc, f"inc{inc.id}_seg{s.id}", "La sucursal reabrió una incidencia",
              f"{_contexto(inc)}: {_cita(motivo)}", conversacion=True)


def confirmada(inc, s):
    """E11: informativo; solo al responsable asignado (si no hay, nadie: no requiere acción)."""
    autor = actor_ids()[0]
    if inc.responsable_id and inc.responsable_id != autor and inc.responsable_id in destinatarios_lurima(inc, True):
        notificar_usuarios([inc.responsable_id], f"inc{inc.id}_seg{s.id}", "incidencia", inc.id,
                           f"La sucursal confirmó la solución\n{_contexto(inc)}. La incidencia quedó cerrada.",
                           enlace_lurima(inc))


def actualizada_por_lurima(inc, s, anterior: str):
    """E12 (mensaje o archivos) y E15 (resolución). Un cambio de estado sin texto no avisa (E13, E14)."""
    if inc.estado == "resuelta" and anterior != "resuelta":
        _a_sucursal(inc, f"inc{inc.id}_seg{s.id}", f"Lurima resolvió tu incidencia {inc.folio}",
                    f"{_cita(inc.resolucion)} Revisa y confirma la solución.")
        return
    if not ((s.comentario or "").strip() or s.adjuntos):
        return
    contenido = _contenido(s, "Te ")
    turno = _turno(inc).codigo
    if turno == "sucursal_responder":
        titulo, extra = f"Lurima respondió a tu incidencia {inc.folio}", " Te toca responder."
    elif turno == "lurima_reposicion":
        titulo, extra = f"Lurima te escribió sobre la reposición de {inc.folio}", ""
    else:
        titulo, extra = f"Lurima te escribió en la incidencia {inc.folio}", ""
    _a_sucursal(inc, f"inc{inc.id}_seg{s.id}", titulo, f"{contenido}{extra}")


def asignada(inc, s):
    """E16: solo el nuevo responsable, si no se asignó a sí mismo."""
    autor = actor_ids()[0]
    if inc.responsable_id and inc.responsable_id != autor and inc.responsable_id in {u.id for u in _gestores()}:
        notificar_usuarios([inc.responsable_id], f"inc{inc.id}_seg{s.id}", "incidencia", inc.id,
                           f"Te asignaron una incidencia\n{_contexto(inc)} · {tipo_legible(inc.tipo)}.", enlace_lurima(inc))


# ---------------------------------------------------------------- reposición

def reposicion_preparada(inc, paquetes):
    """E17 (clave de evento existente: reposicion_<inc>_<paquete>)."""
    folios = ", ".join(p.folio for p in paquetes)
    _a_sucursal(inc, f"reposicion_{inc.id}_{paquetes[0].id}", f"Lurima está preparando la reposición de {inc.folio}",
                f"Paquete {folios}. Te avisaremos cuando salga.")


def reposicion_cancelada(inc, paq):
    """E18."""
    _a_sucursal(inc, f"reposicion_cancelada_{paq.id}", f"Se canceló el envío de reposición de {inc.folio}",
                f"El paquete {paq.folio} no saldrá. Lurima te informará cómo se atiende la incidencia.")


def reposicion_recibida(inc, paq, s):
    """E21: la sucursal recibió completa la reposición; la incidencia queda resuelta esperando su confirmación."""
    _a_lurima(inc, f"inc{inc.id}_seg{s.id}", "La sucursal recibió completa la reposición",
              f"{_contexto(inc)} · {paq.folio}. Falta que confirme la solución.", conversacion=True)


def aviso_paquete(paq, pedido, normal: str, reposicion: str | None = None) -> tuple[str, str]:
    """Texto y enlace de un aviso de paquete para la sucursal: si es una reposición, usa su texto y lleva a la incidencia
    (E19, E20, lista para recoger); si no, el aviso y el enlace de siempre."""
    if not paq.incidencia_id:
        return normal, f"/cuenta/pedidos/{pedido.id}"
    return reposicion or normal, enlace_sucursal(paq.incidencia)
