"""Expediente de una solicitud: los documentos que se suben a mano (orden de compra, cotización, factura...) y los que
el sistema ya genera (PDF de la solicitud, comprobantes de entrega con firma, evidencias de incidencias y devoluciones,
guías de envío y recepciones), en un solo lugar y en orden cronológico."""
from sqlalchemy import select

from ..errors import NoEncontrado, SinPermiso
from ..extensions import db
from ..models import Devolucion, Documento, EntregaIndividual, Incidencia, Paquete, Pedido, Recepcion
from ..models import AsignacionSurtido
from .comun import auditar

TIPOS = {"orden_compra": "Orden de compra", "cotizacion": "Cotización", "factura": "Factura", "comprobante": "Comprobante", "pago": "Documento de pago",
         "evidencia": "Evidencia", "otro": "Documento"}


def _f(v):
    return v.isoformat() if v else None


def documento_json(d: Documento, interno: bool, puede_borrar: bool) -> dict:
    if d.usuario:
        autor = d.usuario.nombre if interno else "Distribuidora"
    else:
        autor = d.cliente.nombre if d.cliente else "Sucursal"
    return {"id": d.id, "nombre": d.nombre, "tipo": d.tipo, "tipo_nombre": TIPOS.get(d.tipo, "Documento"), "url": d.url,
            "autor": autor, "fecha": _f(d.creado), "puede_borrar": puede_borrar}


def expediente(p: Pedido, *, usuario=None, cliente=None) -> dict:
    interno = usuario is not None
    es_admin = bool(usuario and usuario.rol.codigo == "admin")
    q = select(Documento).where(Documento.pedido_id == p.id).order_by(Documento.id.desc())
    if cliente is not None:  # los documentos de pago son internos (comercializadora y Gerente de compras)
        q = q.where(Documento.visible_sucursal.is_(True))
    docs = db.session.scalars(q).unique().all()
    subidos = [documento_json(d, interno, puede_borrar=d.tipo != "pago" and (es_admin or (usuario is not None and d.subido_por_usuario == usuario.id)
                              or (cliente is not None and d.subido_por_cliente == cliente.id))) for d in docs]

    generados = [{"clave": "pdf", "tipo": "solicitud", "titulo": f"Solicitud {p.folio} (PDF)", "fecha": _f(p.creado),
                  "accion": "pdf"}]
    paquetes = db.session.scalars(select(Paquete).join(AsignacionSurtido, Paquete.asignacion_id == AsignacionSurtido.id)
                                  .where(AsignacionSurtido.pedido_id == p.id, Paquete.estado != "cancelado")).unique().all()
    paq_ids = [x.id for x in paquetes]
    for pq in paquetes:
        if pq.envio:
            generados.append({"clave": f"guia-{pq.id}", "tipo": "guia", "titulo": f"Guía {pq.envio.paqueteria} {pq.envio.guia}",
                              "detalle": f"Paquete {pq.folio}", "fecha": _f(pq.envio.despachado_en)})
    for r in db.session.scalars(select(Recepcion).where(Recepcion.paquete_id.in_(paq_ids or [-1]))):
        pq = next(x for x in paquetes if x.id == r.paquete_id)
        generados.append({"clave": f"recepcion-{r.id}", "tipo": "recepcion", "titulo": f"Acta de recepción · paquete {pq.folio}",
                          "detalle": "Con diferencias" if r.estado != "completa" else "Completa", "fecha": _f(r.creado)})
    for e in db.session.scalars(select(EntregaIndividual).where(EntregaIndividual.paquete_id.in_(paq_ids or [-1]),
                                                                EntregaIndividual.estado != "pendiente")).unique():
        generados.append({"clave": f"entrega-{e.id}", "tipo": "comprobante_entrega", "titulo": f"Comprobante de entrega · {e.empleado.nombre}",
                          "detalle": "Firmado por el empleado" if e.firma else "Sin firma", "fecha": _f(e.entregado_en),
                          "entrega_id": e.id, "accion": "comprobante"})
    for i in db.session.scalars(select(Incidencia).where(Incidencia.pedido_id == p.id)):
        for n, url in enumerate(i.evidencias or [], 1):
            generados.append({"clave": f"inc-{i.id}-{n}", "tipo": "evidencia", "titulo": f"Evidencia {n} · incidencia {i.folio}",
                              "detalle": i.tipo, "fecha": _f(i.creado), "url": url})
    for dv in db.session.scalars(select(Devolucion).where(Devolucion.pedido_id == p.id)).unique():
        for n, url in enumerate(dv.evidencias or [], 1):
            generados.append({"clave": f"dev-{dv.id}-{n}", "tipo": "evidencia", "titulo": f"Evidencia {n} · devolución {dv.folio}",
                              "detalle": dv.motivo, "fecha": _f(dv.creado), "url": url})
    generados.sort(key=lambda x: x.get("fecha") or "")
    return {"documentos": subidos, "generados": generados}


def agregar(p: Pedido, datos: dict, *, usuario=None, cliente=None) -> Documento:
    from ..api.archivos import vincular_a_pedido
    dueno = f"u{usuario.id}" if usuario else f"c{cliente.id}"
    de_pago = datos["tipo"] == "pago"
    if de_pago and (usuario is None or "pedido.negociar" not in usuario.codigos_permiso):
        raise SinPermiso("Los documentos de pago los adjunta la comercializadora.")
    # Un documento de pago solo lo descarga el personal con alcance sobre la solicitud, nunca la sucursal.
    vincular_a_pedido([datos["url"]], p.id, dueno, solo_interno=de_pago)
    d = Documento(pedido_id=p.id, nombre=datos["nombre"].strip(), tipo=datos["tipo"], url=datos["url"], visible_sucursal=not de_pago,
                  subido_por_usuario=usuario.id if usuario else None, subido_por_cliente=cliente.id if cliente else None)
    db.session.add(d)
    db.session.flush()
    auditar("documento.agregar", "pedido", p.id, despues={"documento": d.id, "nombre": d.nombre, "tipo": d.tipo})
    db.session.commit()
    return d


def eliminar(p: Pedido, documento_id: int, *, usuario=None, cliente=None):
    d = db.session.get(Documento, documento_id)
    if not d or d.pedido_id != p.id:
        raise NoEncontrado("Documento no encontrado.")
    propio = (usuario and (d.subido_por_usuario == usuario.id or usuario.rol.codigo == "admin")) or \
        (cliente and d.subido_por_cliente == cliente.id)
    if not propio:
        raise SinPermiso("Solo quien subió el documento puede quitarlo.")
    if d.tipo == "pago":
        raise SinPermiso("Los documentos de pago se conservan en el expediente.")
    auditar("documento.eliminar", "pedido", p.id, antes={"documento": d.id, "nombre": d.nombre})
    db.session.delete(d)
    db.session.commit()
