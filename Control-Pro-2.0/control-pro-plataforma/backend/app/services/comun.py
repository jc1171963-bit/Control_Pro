"""Utilidades compartidas por los servicios: auditoría, historial de estados, notificaciones y folios."""
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

from flask import g, has_request_context
from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert

from ..errors import TransicionInvalida
from ..extensions import db
from ..models import Auditoria, HistorialEstado, Notificacion, Rol, Usuario
from ..models.seguridad import usuario_sucursal


def actor_ids() -> tuple[int | None, int | None]:
    if not has_request_context():
        return None, None
    u = getattr(g, "usuario", None)
    c = getattr(g, "cliente", None)
    return (u.id if u else None), (c.id if c else None)


def dinero(valor) -> Decimal:
    return Decimal(valor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _jsonable(valor):
    if isinstance(valor, Decimal):
        return str(valor)
    if isinstance(valor, datetime):
        return valor.isoformat()
    if isinstance(valor, dict):
        return {k: _jsonable(v) for k, v in valor.items()}
    if isinstance(valor, (list, tuple)):
        return [_jsonable(v) for v in valor]
    return valor


def auditar(accion: str, entidad: str, entidad_id: int | None, antes=None, despues=None, sucursal_id=None):
    from ..security.auth import ip_cliente
    usuario_id, cliente_id = actor_ids()
    db.session.add(Auditoria(
        usuario_id=usuario_id, cliente_id=cliente_id, accion=accion, entidad=entidad, entidad_id=entidad_id,
        sucursal_id=sucursal_id, antes=_jsonable(antes), despues=_jsonable(despues),
        ip=ip_cliente() if has_request_context() else None,
    ))


def cambiar_estado(obj, entidad: str, nuevo: str, transiciones: dict[str, set[str]], motivo: str | None = None):
    anterior = obj.estado
    if nuevo == anterior:
        return
    if nuevo not in transiciones.get(anterior, set()):
        raise TransicionInvalida(
            f"No se puede pasar de '{anterior}' a '{nuevo}'.",
            detalles={"entidad": entidad, "estado_actual": anterior, "permitidos": sorted(transiciones.get(anterior, set()))},
        )
    obj.estado = nuevo
    registrar_historial(entidad, obj.id, anterior, nuevo, motivo)


def registrar_historial(entidad, entidad_id, anterior, nuevo, motivo=None):
    usuario_id, cliente_id = actor_ids()
    db.session.add(HistorialEstado(entidad=entidad, entidad_id=entidad_id, anterior=anterior, nuevo=nuevo,
                                   motivo=motivo, usuario_id=usuario_id, cliente_id=cliente_id))


def asignar_folio(obj, prefijo: str):
    """Folio legible a partir del id (se llama después de flush)."""
    db.session.flush()
    obj.folio = f"{prefijo}-{datetime.now().year}-{obj.id:06d}"


def notificar_cliente(cliente_id: int, evento: str, entidad: str, entidad_id: int, mensaje: str, enlace: str | None = None):
    db.session.execute(insert(Notificacion).values(
        cliente_id=cliente_id, evento=evento, entidad=entidad, entidad_id=entidad_id, mensaje=mensaje[:300],
        enlace=enlace,
    ).on_conflict_do_nothing(constraint="uq_notif_evento"))


def notificar_personal(permiso: str, evento: str, entidad: str, entidad_id: int, mensaje: str,
                       sucursal_id: int | None = None, enlace: str | None = None):
    """Notifica a los usuarios activos con el permiso: globales y, si se indica, los de esa sucursal."""
    from ..models import Permiso
    from ..models.seguridad import rol_permiso
    consulta = (select(Usuario.id).join(Rol, Usuario.rol_id == Rol.id)
                .join(rol_permiso, rol_permiso.c.rol_id == Rol.id)
                .join(Permiso, Permiso.id == rol_permiso.c.permiso_id)
                .where(Usuario.activo.is_(True), Permiso.codigo == permiso))
    if sucursal_id is not None:
        en_sucursal = select(usuario_sucursal.c.usuario_id).where(usuario_sucursal.c.sucursal_id == sucursal_id)
        consulta = consulta.where(or_(Rol.alcance_global.is_(True), Usuario.id.in_(en_sucursal)))
    else:
        consulta = consulta.where(Rol.alcance_global.is_(True))
    for usuario_id in db.session.scalars(consulta.distinct()):
        db.session.execute(insert(Notificacion).values(
            usuario_id=usuario_id, evento=evento, entidad=entidad, entidad_id=entidad_id, mensaje=mensaje[:300],
            enlace=enlace,
        ).on_conflict_do_nothing(constraint="uq_notif_evento"))


def paginar(consulta, pagina: int, por_pagina: int, serializar):
    por_pagina = max(1, min(por_pagina, 100))
    pagina = max(1, pagina)
    from sqlalchemy import func
    total = db.session.scalar(select(func.count()).select_from(consulta.order_by(None).subquery()))
    filas = db.session.scalars(consulta.limit(por_pagina).offset((pagina - 1) * por_pagina)).unique().all()
    return {"items": [serializar(f) for f in filas], "total": total, "pagina": pagina, "por_pagina": por_pagina,
            "paginas": (total + por_pagina - 1) // por_pagina}
