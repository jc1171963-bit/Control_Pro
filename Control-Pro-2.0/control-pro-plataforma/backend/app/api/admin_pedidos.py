"""Pedidos (consulta, aprobación corporativa, cancelación, cierre) y surtido por sucursal."""
from flask import Blueprint, jsonify, request
from sqlalchemy import or_, select

from ..errors import NoEncontrado, SinPermiso
from ..extensions import db
from ..models import AsignacionSurtido, Cliente, EntregaIndividual, Paquete, Pedido
from ..schemas import (AceptarPropuestaSchema, AcuerdoPagoSchema, DecisionSchema, DespachoSchema, EdicionDistribuidorSchema,
                       EntregaSucursalSchema, EventoSchema, MotivoSchema, NotaSchema, PagoResueltoSchema, PaqueteSchema,
                       PropuestaSchema, SurtidoSchema, cargar)
from ..security.auth import (canales_permitidos, es_global, filtro_sucursal, requiere_usuario, sucursales_permitidas,
                             verificar_alcance)
from ..services import logistica_service as log
from ..services import negociacion_service as neg
from ..services import pedido_service as ped
from ..services.comun import paginar
from . import serial
from .util import arg_int, cuerpo, pagina

bp = Blueprint("admin_pedidos", __name__, url_prefix="/api/admin")


def _filtro_pedidos(q):
    q = q.where(Pedido.estado != "borrador")  # el borrador aún no se envía: solo lo ve la sucursal
    if (canales := canales_permitidos()) is not None:
        q = q.where(Pedido.canal.in_(canales))
    permitidas = sucursales_permitidas()
    if permitidas is None:
        return q
    ids = permitidas or {-1}
    return q.where(or_(Pedido.asignaciones.any(AsignacionSurtido.sucursal_id.in_(ids)), Pedido.sucursal_recoger_id.in_(ids)))


def _pedido(pedido_id, bloquear=False) -> Pedido:
    p = ped.bloquear_pedido(pedido_id) if bloquear else db.session.get(Pedido, pedido_id)
    canales = canales_permitidos()
    if not p or p.estado == "borrador" or (canales is not None and p.canal not in canales):
        raise NoEncontrado("Pedido no encontrado.")  # mismo 404: no revela pedidos de otro canal
    if not es_global():
        verificar_alcance(ped.sucursales_de(p) or None)
    return p


@bp.get("/pedidos")
@requiere_usuario("pedido.ver")
def pedidos():
    q = _filtro_pedidos(select(Pedido).join(Cliente).order_by(Pedido.id.desc()))
    if estado := request.args.get("estado"):
        q = q.where(Pedido.estado.in_(estado.split(",")))
    if canal := request.args.get("canal"):
        q = q.where(Pedido.canal == canal)
    if (sid := arg_int("sucursal_id")) is not None:
        verificar_alcance(sid)
        q = q.where(or_(Pedido.asignaciones.any(AsignacionSurtido.sucursal_id == sid), Pedido.sucursal_recoger_id == sid))
    if texto := request.args.get("q"):
        q = q.where(or_(Pedido.folio.ilike(f"%{texto}%"), Cliente.nombre.ilike(f"%{texto}%"),
                        Cliente.razon_social.ilike(f"%{texto}%"), Cliente.correo.ilike(f"%{texto}%")))
    if desde := request.args.get("desde"):
        q = q.where(Pedido.creado >= desde)
    if hasta := request.args.get("hasta"):
        q = q.where(Pedido.creado <= hasta + " 23:59:59")
    return jsonify(paginar(q.options(*serial.carga_resumen()), *pagina(), serial.pedido_resumen))


# Seguimiento de todas las solicitudes corporativas: cada etapa agrupa los estados en los que la solicitud espera lo mismo.
ETAPAS_SEGUIMIENTO = {
    "por_aprobar": ("en_revision",),
    "devueltas": ("devuelto",),
    "por_autorizar": ("aprobado",),
    "en_surtido": ("confirmado", "en_preparacion"),
    "en_camino": ("parcialmente_enviado", "enviado"),
    "en_entrega": ("parcialmente_entregado", "entregado"),
    "cerradas": ("cerrado",),
    "detenidas": ("rechazado", "cancelado", "expirado"),
}
_ACTIVAS = tuple(e for k, v in ETAPAS_SEGUIMIENTO.items() if k not in ("cerradas", "detenidas") for e in v)


@bp.get("/seguimiento")
@requiere_usuario("pedido.ver")
def seguimiento():
    """Trazabilidad de muchas solicitudes a la vez: el resumen de cada una y lo necesario para dibujar sus pasos
    (historial de estados, paquetes con guía y recepción, entregas a empleados y su conformidad), en pocas consultas.

    Filtros: `etapa` (una de ETAPAS_SEGUIMIENTO, `activas` por omisión o `todas`) y `q` (folio, sucursal o correo).
    Orden: `espera` (la que lleva más tiempo sin avanzar primero, por omisión) o `reciente`."""
    from sqlalchemy import func

    from ..models import HistorialEstado, Recepcion
    base = _filtro_pedidos(select(Pedido).join(Cliente)).where(Pedido.canal == "corporativo")
    if texto := (request.args.get("q") or "").strip():
        base = base.where(or_(Pedido.folio.ilike(f"%{texto}%"), Cliente.nombre.ilike(f"%{texto}%"),
                              Cliente.razon_social.ilike(f"%{texto}%"), Cliente.correo.ilike(f"%{texto}%")))
    # Conteo por etapa (con la búsqueda aplicada) para las pestañas
    sub = base.order_by(None).subquery()
    por_estado = dict(db.session.execute(select(sub.c.estado, func.count()).group_by(sub.c.estado)).all())
    conteo = {k: sum(por_estado.get(e, 0) for e in v) for k, v in ETAPAS_SEGUIMIENTO.items()}
    conteo["activas"] = sum(por_estado.get(e, 0) for e in _ACTIVAS)
    conteo["todas"] = sum(por_estado.values())

    etapa = request.args.get("etapa") or "activas"
    if etapa in ETAPAS_SEGUIMIENTO:
        base = base.where(Pedido.estado.in_(ETAPAS_SEGUIMIENTO[etapa]))
    elif etapa == "activas":
        base = base.where(Pedido.estado.in_(_ACTIVAS))
    ultimo_cambio = (select(func.max(HistorialEstado.creado))
                     .where(HistorialEstado.entidad == "pedido", HistorialEstado.entidad_id == Pedido.id).scalar_subquery())
    if request.args.get("orden") == "reciente":
        base = base.order_by(Pedido.id.desc())
    else:
        base = base.order_by(func.coalesce(ultimo_cambio, Pedido.creado).asc(), Pedido.id)

    resultado = paginar(base.options(*serial.carga_resumen()), *pagina(), serial.pedido_resumen)
    ids = [x["id"] for x in resultado["items"]]
    if ids:
        hist: dict[int, list] = {}
        for h in db.session.scalars(select(HistorialEstado).where(HistorialEstado.entidad == "pedido", HistorialEstado.entidad_id.in_(ids))
                                    .order_by(HistorialEstado.id)).unique():
            hist.setdefault(h.entidad_id, []).append({
                "fecha": serial.f(h.creado), "anterior": h.anterior, "nuevo": h.nuevo, "motivo": h.motivo,
                "actor": h.usuario.nombre if h.usuario else ("Sucursal" if h.cliente_id else "Sistema")})
        paquetes = db.session.execute(select(Paquete, AsignacionSurtido.pedido_id).join(AsignacionSurtido, Paquete.asignacion_id == AsignacionSurtido.id)
                                      .where(AsignacionSurtido.pedido_id.in_(ids), Paquete.estado != "cancelado")).unique().all()
        paq_ids = [pq.id for pq, _ in paquetes]
        recepciones = {r.paquete_id: r for r in db.session.scalars(select(Recepcion).where(Recepcion.paquete_id.in_(paq_ids or [-1])))}
        entregas: dict[int, list] = {}
        pedido_de_paquete = {pq.id: pid for pq, pid in paquetes}
        for e in db.session.scalars(select(EntregaIndividual).where(EntregaIndividual.paquete_id.in_(paq_ids or [-1]))):
            entregas.setdefault(pedido_de_paquete[e.paquete_id], []).append(
                {"estado": e.estado, "entregado_en": serial.f(e.entregado_en), "conformidad_en": serial.f(e.conformidad_en)})
        por_pedido: dict[int, list] = {}
        for pq, pid in paquetes:
            r = recepciones.get(pq.id)
            por_pedido.setdefault(pid, []).append({
                "id": pq.id, "estado": pq.estado,
                "envio": {"paqueteria": pq.envio.paqueteria, "guia": pq.envio.guia} if pq.envio else None,
                "recepcion": {"fecha": serial.f(r.creado)} if r else None})
        for x in resultado["items"]:
            x["historial"] = hist.get(x["id"], [])
            x["paquetes"] = por_pedido.get(x["id"], [])
            x["entregas_individuales"] = entregas.get(x["id"], [])
    resultado["conteo"] = conteo
    resultado["etapa"] = etapa
    return jsonify(resultado)


@bp.get("/pedidos/<int:pedido_id>")
@requiere_usuario("pedido.ver")
def pedido(pedido_id):
    return jsonify(serial.pedido(_pedido(pedido_id), interno=True))


@bp.post("/pedidos/<int:pedido_id>/decision")
@requiere_usuario("pedido.aprobar")
def decidir(pedido_id):
    d = cargar(DecisionSchema, cuerpo())
    p = _pedido(pedido_id, bloquear=True)
    ped.decidir_corporativo(p, d["decision"], d.get("motivo"), d["aceptar_excepciones"])
    return jsonify(serial.pedido(p, interno=True))


@bp.post("/pedidos/<int:pedido_id>/autorizar")
@requiere_usuario("pedido.autorizar")
def autorizar(pedido_id):
    d = cargar(NotaSchema, cuerpo())
    p = _pedido(pedido_id, bloquear=True)
    ped.autorizar_corporativo(p, d.get("nota"))
    return jsonify(serial.pedido(p, interno=True))


@bp.put("/pedidos/<int:pedido_id>/partidas")
@requiere_usuario("pedido.aprobar")
def editar_partidas(pedido_id):
    d = cargar(EdicionDistribuidorSchema, cuerpo())
    p = _pedido(pedido_id, bloquear=True)
    ped.editar_por_distribuidor(p, d["partidas"], d["motivo"])
    return jsonify(serial.pedido(p, interno=True))


# ---------------------------------------------------------------- negociación y acuerdo de pago (antes de autorizar)

@bp.post("/pedidos/<int:pedido_id>/propuestas")
@requiere_usuario("pedido.negociar")
def proponer(pedido_id):
    d = cargar(PropuestaSchema, cuerpo())
    p = _pedido(pedido_id, bloquear=True)
    neg.guardar_version(p, d["partidas"], d["nota"], d["version_vista"])
    return jsonify(serial.pedido(p, interno=True)), 201


@bp.post("/pedidos/<int:pedido_id>/propuestas/descartar")
@requiere_usuario("pedido.negociar")
def descartar_propuesta(pedido_id):
    d = cargar(MotivoSchema, cuerpo())
    p = _pedido(pedido_id, bloquear=True)
    neg.descartar(p, d["motivo"])
    return jsonify(serial.pedido(p, interno=True))


@bp.post("/pedidos/<int:pedido_id>/propuestas/aceptar")
@requiere_usuario("pedido.aceptar_propuesta")
def aceptar_propuesta(pedido_id):
    d = cargar(AceptarPropuestaSchema, cuerpo())
    p = _pedido(pedido_id, bloquear=True)
    neg.aceptar(p, d["version_id"], d["aceptar_excepciones"])
    return jsonify(serial.pedido(p, interno=True))


@bp.post("/pedidos/<int:pedido_id>/acuerdo-pago")
@requiere_usuario("pedido.negociar")
def acuerdo_pago(pedido_id):
    d = cargar(AcuerdoPagoSchema, cuerpo())
    p = _pedido(pedido_id, bloquear=True)
    neg.registrar_acuerdo(p, d["forma"], d["condiciones"], d["fecha_pago"], d.get("observaciones"))
    return jsonify(serial.pedido(p, interno=True)), 201


@bp.post("/pedidos/<int:pedido_id>/pago-resuelto")
@requiere_usuario("pedido.negociar")
def pago_resuelto(pedido_id):
    d = cargar(PagoResueltoSchema, cuerpo())
    p = _pedido(pedido_id, bloquear=True)
    neg.marcar_pago_resuelto(p, d["acuerdo_id"])
    return jsonify(serial.pedido(p, interno=True))


@bp.post("/pedidos/<int:pedido_id>/cancelar")
@requiere_usuario("pedido.cancelar")
def cancelar(pedido_id):
    d = cargar(MotivoSchema, cuerpo())
    p = _pedido(pedido_id, bloquear=True)
    ped.cancelar(p, d["motivo"], por_cliente=False)
    return jsonify(serial.pedido(p, interno=True))


@bp.post("/pedidos/<int:pedido_id>/cerrar")
@requiere_usuario("pedido.cerrar")
def cerrar(pedido_id):
    d = cargar(NotaSchema, cuerpo())
    p = _pedido(pedido_id, bloquear=True)
    ped.cerrar(p, d.get("nota"))
    return jsonify(serial.pedido(p, interno=True))


@bp.post("/pedidos/expirar-reservas")
@requiere_usuario("pedido.cancelar")
def expirar():
    if canales_permitidos() is not None:  # mantenimiento global de ambos canales: no es del aprobador
        raise SinPermiso("No tienes permiso para realizar esta operación.")
    return jsonify({"expirados": ped.expirar_reservas()})


# ---------------------------------------------------------------- surtido

@bp.get("/surtido")
@requiere_usuario("surtido.operar")
def asignaciones():
    q = select(AsignacionSurtido).join(Pedido).order_by(AsignacionSurtido.id.desc())
    cond = filtro_sucursal(AsignacionSurtido.sucursal_id)
    if cond is not None:
        q = q.where(cond)
    if (sid := arg_int("sucursal_id")) is not None:
        verificar_alcance(sid)
        q = q.where(AsignacionSurtido.sucursal_id == sid)
    estado = request.args.get("estado", "activas")
    if estado == "activas":
        q = q.where(AsignacionSurtido.estado.in_(["pendiente", "en_surtido", "empacada", "despachada"]),
                    Pedido.estado.notin_(["aprobado", "pendiente_pago", "pago_en_revision", "cancelado", "expirado"]))
    elif estado != "todas":
        q = q.where(AsignacionSurtido.estado == estado)
    return jsonify(paginar(q, *pagina(), lambda a: serial.asignacion(a, con_pedido=True)))


def _asig(aid, bloquear=True):
    a = log.bloquear_asignacion(aid) if bloquear else db.session.get(AsignacionSurtido, aid)
    if not a:
        raise NoEncontrado("Asignación no encontrada.")
    verificar_alcance(a.sucursal_id)
    return a


@bp.get("/surtido/<int:aid>")
@requiere_usuario("surtido.operar")
def asignacion(aid):
    return jsonify(serial.asignacion(_asig(aid, False), con_pedido=True))


@bp.post("/surtido/<int:aid>/iniciar")
@requiere_usuario("surtido.operar")
def iniciar(aid):
    return jsonify(serial.asignacion(log.iniciar_surtido(_asig(aid)), con_pedido=True))


@bp.post("/surtido/<int:aid>/registrar")
@requiere_usuario("surtido.operar")
def registrar(aid):
    d = cargar(SurtidoSchema, cuerpo())
    partidas = [{"asignacion_detalle_id": int(p["asignacion_detalle_id"]), "surtida": int(p.get("surtida", 0)),
                 "faltante": int(p.get("faltante", 0)), "motivo_faltante": p.get("motivo_faltante")} for p in d["partidas"]]
    return jsonify(serial.asignacion(log.registrar_surtido(_asig(aid), partidas), con_pedido=True))


@bp.post("/surtido/<int:aid>/paquetes")
@requiere_usuario("surtido.operar")
def paquete(aid):
    d = cargar(PaqueteSchema, cuerpo())
    partidas = [{"asignacion_detalle_id": int(p["asignacion_detalle_id"]), "cantidad": int(p["cantidad"])} for p in d["partidas"]]
    a = _asig(aid)
    log.crear_paquete(a, partidas, d.get("peso_kg"))
    return jsonify(serial.asignacion(a, con_pedido=True)), 201


def _paq(pid):
    p = log.bloquear_paquete(pid)
    verificar_alcance(p.asignacion.sucursal_id)
    return p


@bp.post("/paquetes/<int:pid>/despachar")
@requiere_usuario("surtido.operar")
def despachar(pid):
    d = cargar(DespachoSchema, cuerpo())
    p = log.despachar(_paq(pid), d["paqueteria"], d["guia"])
    return jsonify(serial.paquete(p))


@bp.post("/paquetes/<int:pid>/eventos")
@requiere_usuario("surtido.operar")
def evento(pid):
    d = cargar(EventoSchema, cuerpo())
    return jsonify(serial.paquete(log.registrar_evento(_paq(pid), d["estado"], d["descripcion"])))


@bp.post("/paquetes/<int:pid>/listo")
@requiere_usuario("surtido.operar")
def listo(pid):
    return jsonify(serial.paquete(log.listo_para_recoger(_paq(pid))))


@bp.post("/paquetes/<int:pid>/entregar")
@requiere_usuario("surtido.operar")
def entregar(pid):
    d = cargar(EntregaSucursalSchema, cuerpo())
    return jsonify(serial.paquete(log.entregar_en_sucursal(_paq(pid), d["recibio"], d["identificacion"])))


@bp.get("/entregas/<int:entrega_id>")
@requiere_usuario("pedido.ver")
def entrega(entrega_id):
    """Comprobante de una entrega individual con la firma del empleado (solo dentro del alcance del usuario)."""
    e = db.session.get(EntregaIndividual, entrega_id)
    if not e:
        raise NoEncontrado("Entrega no encontrada.")
    _pedido(db.session.get(Paquete, e.paquete_id).asignacion.pedido_id)
    return jsonify(serial.entrega_individual(e, con_firma=True))
