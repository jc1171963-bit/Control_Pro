"""Turno de atención de una incidencia: a quién le toca actuar y desde cuándo (Fase 3, §4–§6, §12).

Es una lectura derivada de lo que ya está guardado (estado, seguimiento y paquetes de reposición); no se persiste ni
cambia ningún estado. Es la única implementación: el serializador, los contadores y los filtros la consumen.

Orden cronológico del seguimiento: por `creado` y, a igual fecha (varias entradas en la misma transacción comparten
`now()`), por `id`. Una entrada sin fecha (aún no guardada) se considera la más reciente.
"""
import re
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select

from ..extensions import db

TURNOS = ("lurima_atender", "lurima_responder", "lurima_reposicion", "sucursal_responder", "sucursal_recibir",
          "sucursal_confirmar", "interna", "cerrada")
ACTOR = {"lurima_atender": "lurima", "lurima_responder": "lurima", "lurima_reposicion": "lurima", "interna": "lurima",
         "sucursal_responder": "sucursal", "sucursal_recibir": "sucursal", "sucursal_confirmar": "sucursal",
         "cerrada": None}

# Textos fijos con los que el código escribe notas automáticas a nombre del usuario que ejecutó la acción
# (logistica_service._nota_incidencia). shortcut: se reconocen por su texto completo; si cambian esos textos hay que
# actualizar esta lista (lo vigila test_turnos::test_notas_reales_se_reconocen). Persistir el tipo de entrada lo eliminaría.
_FOLIO = r"[A-Z]+-\d{4}-\d{6}"
NOTAS_AUTOMATICAS = tuple(re.compile(p) for p in (
    r"Se preparó la reposición .+\. Saldrá con su propia guía\.",
    rf"Reposición {_FOLIO} enviada con .+, guía .+\.",
    rf"Se canceló la reposición {_FOLIO} antes de salir\.",
    rf"La sucursal recibió completa la reposición {_FOLIO}\.",
))
# Reposición en curso: la gestiona Lurima (o el transporte). `listo_para_recoger` se trata como en curso: la especificación
# no lo define (ver el reporte de la etapa).
REPOSICION_EN_CURSO = {"preparado", "despachado", "en_transito", "incidencia", "listo_para_recoger"}


@dataclass(frozen=True)
class Turno:
    codigo: str
    actor: str | None              # "lurima" | "sucursal" | None (cerrada)
    desde: datetime | None         # desde cuándo está vigente este turno
    ultima_actividad: datetime | None


def lado(s) -> str:
    if s.cliente_id:
        return "sucursal"
    if s.usuario_id:
        return "lurima"
    return "sistema"


def ordenar(seguimiento) -> list:
    return sorted(seguimiento, key=lambda s: (s.creado is None, s.creado or datetime.min,
                                              s.id is None, s.id or 0))


def _texto(s) -> str:
    return (s.comentario or "").strip()


def es_nota_automatica(s) -> bool:
    return not s.adjuntos and any(p.fullmatch(_texto(s)) for p in NOTAS_AUTOMATICAS)


def es_humana(s) -> bool:
    """Mensaje de una persona: ni la creación, ni el sistema, ni un cambio sin contenido, ni una nota automática."""
    if s.estado_anterior is None or lado(s) == "sistema":
        return False
    if not _texto(s) and not s.adjuntos:
        return False
    return not es_nota_automatica(s)


def _evento_lurima(s) -> bool:
    """Acción de Lurima sin mensaje que devuelve el turno a Lurima: cambio de estado o nota automática.
    Un cambio de solo responsable no cuenta (escenario 22)."""
    if lado(s) != "lurima" or es_humana(s) or s.estado_anterior is None:
        return False
    return s.estado_anterior != s.estado_nuevo or es_nota_automatica(s)


def _es_actividad(s) -> bool:
    """Todo cuenta como actividad salvo el cambio de responsable sin estado ni contenido (administrativo)."""
    if s.estado_anterior is None or s.estado_anterior != s.estado_nuevo:
        return True
    return bool(_texto(s) or s.adjuntos)


def calcular(estado: str, corporativa: bool, seguimiento, reposiciones, creado: datetime | None) -> Turno:
    """Núcleo puro. `reposiciones`: [(estado_del_paquete, tiene_recepcion)] de los paquetes de ESTA incidencia."""
    seg = ordenar(seguimiento)
    fechas = [s.creado for s in seg if s.creado is not None and _es_actividad(s)]
    ultima = max(fechas) if fechas else creado

    def turno(codigo, desde):
        return Turno(codigo, ACTOR[codigo], desde, ultima)

    def ultima_que(cond):
        return next((s.creado for s in reversed(seg) if cond(s)), None) or creado

    if estado == "cerrada":
        return turno("cerrada", ultima_que(lambda s: s.estado_nuevo == "cerrada"))
    if not corporativa:
        return turno("interna", ultima)
    if estado == "resuelta":
        return turno("sucursal_confirmar", ultima_que(lambda s: s.estado_nuevo == "resuelta" and s.estado_anterior != "resuelta"))
    vigentes = [(e, rec) for e, rec in reposiciones if e != "cancelado"]
    if any(e == "entregado" and not rec for e, rec in vigentes):
        return turno("sucursal_recibir", ultima)
    if any(e in REPOSICION_EN_CURSO for e, _ in vigentes):
        return turno("lurima_reposicion", ultima)

    humanas = [i for i, s in enumerate(seg) if es_humana(s)]
    if not humanas:
        return turno("lurima_atender", creado if not seg else seg[0].creado or creado)
    k = humanas[-1]
    posterior = next((s for s in seg[k + 1:] if _evento_lurima(s)), None)
    if posterior is not None:
        return turno("lurima_atender", posterior.creado)
    m = seg[k]
    return turno("sucursal_responder" if lado(m) == "lurima" else "lurima_responder", m.creado)


def _corporativas(incidencias) -> set[int]:
    from ..models import Pedido
    ids = {i.pedido_id for i in incidencias if i.pedido_id}
    if not ids:
        return set()
    return set(db.session.scalars(select(Pedido.id).where(Pedido.id.in_(ids), Pedido.canal == "corporativo")))


def _reposiciones(incidencias) -> dict[int, list[tuple[str, bool]]]:
    from ..models import Paquete, Recepcion
    ids = [i.id for i in incidencias]
    if not ids:
        return {}
    filas = db.session.execute(select(Paquete.incidencia_id, Paquete.estado, Recepcion.id)
                               .outerjoin(Recepcion, Recepcion.paquete_id == Paquete.id)
                               .where(Paquete.incidencia_id.in_(ids))).all()
    por_inc: dict[int, list] = {}
    for inc_id, estado, rec in filas:
        por_inc.setdefault(inc_id, []).append((estado, rec is not None))
    return por_inc


def turnos(incidencias) -> dict[int, Turno]:
    """Turno de varias incidencias con dos consultas en total (para listas y contadores)."""
    incidencias = list(incidencias)
    corp, repos = _corporativas(incidencias), _reposiciones(incidencias)
    return {i.id: calcular(i.estado, i.pedido_id in corp, i.seguimiento, repos.get(i.id, []), i.creado)
            for i in incidencias}


def turno_incidencia(inc) -> Turno:
    return turnos([inc])[inc.id]


def contar(consulta) -> dict[str, int]:
    """Incidencias no cerradas de `consulta` por turno (todas las claves, aunque valgan 0)."""
    from ..models import Incidencia
    cuenta = {c: 0 for c in TURNOS if c != "cerrada"}
    for t in turnos(db.session.scalars(consulta.where(Incidencia.estado != "cerrada")).unique().all()).values():
        cuenta[t.codigo] += 1
    return cuenta


def conteo_bandejas(consulta) -> dict:
    """Contadores para las bandejas de una lista: por turno (no cerradas), cerradas y todas, sobre la MISMA consulta
    que la lista (alcance, prioridad…), así que cada contador coincide con su filtro ?turno=."""
    from sqlalchemy import func
    from ..models import Incidencia
    base = consulta.order_by(None)
    contar_sql = lambda q: db.session.scalar(select(func.count()).select_from(q.subquery()))  # noqa: E731
    return {"por_turno": contar(consulta), "cerradas": contar_sql(base.where(Incidencia.estado == "cerrada")),
            "todas": contar_sql(base)}


def resumen(consulta, actor: str) -> dict:
    """Contadores para un inicio: por turno y cuántas esperan a `actor` ("sucursal" o "lurima")."""
    por_turno = contar(consulta)
    return {"incidencias_por_turno": por_turno,
            "incidencias_te_esperan": sum(n for c, n in por_turno.items() if ACTOR[c] == actor)}


def codigos(param: str | None) -> set[str] | None:
    """Lee el filtro `?turno=a,b`. None si no se pidió; error si trae un código desconocido."""
    if not param:
        return None
    pedidos = {x.strip() for x in param.split(",") if x.strip()}
    if not pedidos or pedidos - set(TURNOS):
        from ..errors import AppError
        raise AppError("Turno no válido.", detalles={"validos": list(TURNOS)})
    return pedidos


def filtrar(consulta, pedidos: set[str]):
    """La misma `consulta` (mismo orden, misma paginación) restringida a las incidencias cuyo turno está en `pedidos`.
    shortcut: calcula el turno en Python sobre todas las candidatas; con mucho volumen, pasar el cálculo a SQL."""
    from ..models import Incidencia
    candidatas = consulta if "cerrada" in pedidos else consulta.where(Incidencia.estado != "cerrada")
    filas = db.session.scalars(candidatas).unique().all()
    t = turnos(filas)
    return consulta.where(Incidencia.id.in_([i.id for i in filas if t[i.id].codigo in pedidos] or [-1]))
