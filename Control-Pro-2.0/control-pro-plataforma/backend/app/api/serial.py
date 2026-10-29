"""Serialización a JSON. Los montos se envían como texto para no perder precisión."""
from decimal import Decimal

from sqlalchemy import select

from ..extensions import db
from ..models import HistorialEstado, Inventario


def m(valor) -> str | None:
    return None if valor is None else str(Decimal(valor).quantize(Decimal("0.01")))


def f(valor):
    return valor.isoformat() if valor else None


def sucursal(s, completo=False):
    if not s:
        return None
    d = {"id": s.id, "codigo": s.codigo, "nombre": s.nombre, "ciudad": s.ciudad, "direccion": s.direccion,
         "estado": s.estado, "cp": s.cp, "telefono": s.telefono, "correo": s.correo, "horario": s.horario,
         "permite_recoger": s.permite_recoger, "activo": s.activo}
    if completo:
        d["responsable"] = {"id": s.responsable.id, "nombre": s.responsable.nombre} if s.responsable else None
        d["zonas"] = [{"cp_prefijo": z.cp_prefijo, "prioridad": z.prioridad} for z in s.zonas]
    return d


def usuario(u):
    return {"id": u.id, "correo": u.correo, "nombre": u.nombre, "activo": u.activo,
            "rol": {"codigo": u.rol.codigo, "nombre": u.rol.nombre, "alcance_global": u.rol.alcance_global},
            "permisos": sorted(u.codigos_permiso), "sucursales": [{"id": s.id, "nombre": s.nombre} for s in u.sucursales],
            "ultimo_acceso": f(u.ultimo_acceso), "bloqueado_hasta": f(u.bloqueado_hasta)}


def cliente(c):
    return {"id": c.id, "correo": c.correo, "nombre": c.nombre, "telefono": c.telefono, "tipo": c.tipo,
            "razon_social": c.razon_social, "rfc": c.rfc, "activo": c.activo, "creado": f(c.creado)}


def direccion(d):
    return {"id": d.id, **d.como_dict(), "predeterminada": d.predeterminada}


def variante(v, existencias: dict | None = None, precio=None):
    d = {"id": v.id, "sku": v.sku, "talla": v.talla, "color": v.color, "color_hex": v.color_hex,
         "precio_base": m(v.precio_base), "activo": v.activo}
    if precio:
        d["precio"], d["descuento"], d["promocion"] = m(precio[0]), m(precio[1]), precio[2]
        d["precio_final"] = m(precio[0] - precio[1])
    if existencias is not None:
        d["disponible"] = existencias.get(v.id, 0)
    return d


def producto_resumen(p, precios=None, existencias=None):
    variantes = [v for v in p.variantes if v.activo]
    finales = [precios[v.id][0] - precios[v.id][1] for v in variantes] if precios else [v.precio_base for v in variantes]
    base = [v.precio_base for v in variantes]
    return {"id": p.id, "slug": p.slug, "nombre": p.nombre, "sku_base": p.sku_base,
            "categoria": {"id": p.categoria.id, "nombre": p.categoria.nombre, "slug": p.categoria.slug},
            "imagen": p.imagenes[0].url if p.imagenes else None, "destacado": p.destacado,
            "precio_desde": m(min(finales)) if finales else None, "precio_base_desde": m(min(base)) if base else None,
            "tallas": sorted({v.talla for v in variantes}, key=_orden_talla),
            "colores": sorted({(v.color, v.color_hex) for v in variantes}),
            "disponible": sum(existencias.get(v.id, 0) for v in variantes) if existencias is not None else None,
            "nuevo": False}


ORDEN_TALLAS = ["XCH", "XS", "CH", "S", "M", "G", "L", "XG", "XL", "XXL", "UNITALLA", "UNI"]


def _orden_talla(t: str):
    tt = t.upper()
    if tt in ORDEN_TALLAS:
        return (0, ORDEN_TALLAS.index(tt), tt)
    try:
        return (1, float(tt), tt)
    except ValueError:
        return (2, 0, tt)


def producto_detalle(p, precios=None, existencias=None, por_sucursal=None):
    d = producto_resumen(p, precios, existencias)
    d.update({"descripcion": p.descripcion, "material": p.material, "cuidados": p.cuidados, "activo": p.activo,
              "imagenes": [{"url": i.url, "alt": i.alt} for i in p.imagenes],
              "puestos": sorted(pp.puesto for pp in p.puestos),
              "sucursales_deshabilitadas": sorted(ps.sucursal_id for ps in p.sucursales if not ps.habilitado),
              "variantes": [variante(v, existencias, precios.get(v.id) if precios else None)
                            for v in sorted(p.variantes, key=lambda x: (_orden_talla(x.talla), x.color))]})
    if por_sucursal is not None:
        d["disponibilidad_sucursal"] = por_sucursal
    return d


def inventario(i: Inventario):
    return {"sucursal_id": i.sucursal_id, "sucursal": i.sucursal.nombre, "variante_id": i.variante_id,
            "sku": i.variante.sku, "producto": i.variante.producto.nombre, "talla": i.variante.talla,
            "color": i.variante.color, "fisico": i.fisico, "reservado": i.reservado, "comprometido": i.comprometido,
            "en_transito": i.en_transito, "disponible": i.disponible, "minimo": i.minimo,
            "bajo": i.disponible <= i.minimo}


def movimiento(mv):
    return {"id": mv.id, "fecha": f(mv.creado), "sucursal_id": mv.sucursal_id, "variante_id": mv.variante_id,
            "sku": mv.variante.sku, "tipo": mv.tipo, "cantidad": mv.cantidad, "saldo": mv.saldo_resultante,
            "motivo": mv.motivo, "referencia": f"{mv.referencia_tipo}:{mv.referencia_id}" if mv.referencia_tipo else None,
            "usuario": mv.usuario.nombre if mv.usuario else "Sistema"}


def transferencia(t):
    return {"id": t.id, "folio": t.folio, "estado": t.estado, "motivo": t.motivo, "observaciones": t.observaciones,
            "origen": {"id": t.origen.id, "nombre": t.origen.nombre}, "destino": {"id": t.destino.id, "nombre": t.destino.nombre},
            "creado": f(t.creado), "actualizado": f(t.actualizado),
            "detalles": [{"id": d.id, "variante_id": d.variante_id, "sku": d.variante.sku,
                          "producto": d.variante.producto.nombre, "talla": d.variante.talla, "cantidad": d.cantidad,
                          "enviada": d.enviada, "recibida": d.recibida} for d in t.detalles]}


def historial(entidad, entidad_id):
    filas = db.session.scalars(select(HistorialEstado).where(HistorialEstado.entidad == entidad,
                                                             HistorialEstado.entidad_id == entidad_id)
                               .order_by(HistorialEstado.id)).unique()
    return [{"fecha": f(h.creado), "anterior": h.anterior, "nuevo": h.nuevo, "motivo": h.motivo,
             "actor": h.usuario.nombre if h.usuario else ("Cliente" if h.cliente_id else "Sistema")} for h in filas]


def pago(p):
    return {"id": p.id, "folio": p.folio, "pedido_id": p.pedido_id, "metodo": p.metodo, "estado": p.estado,
            "monto": m(p.monto), "monto_reembolsado": m(p.monto_reembolsado), "referencia": p.referencia,
            "comprobante_url": p.comprobante_url, "sucursal_id": p.sucursal_id, "motivo_rechazo": p.motivo_rechazo,
            "validado_en": f(p.validado_en), "creado": f(p.creado),
            "reembolsos": [reembolso(r) for r in p.reembolsos]}


def reembolso(r):
    return {"id": r.id, "pago_id": r.pago_id, "pedido_id": r.pedido_id, "devolucion_id": r.devolucion_id,
            "tipo": r.tipo, "monto": m(r.monto), "motivo": r.motivo, "estado": r.estado, "referencia": r.referencia,
            "realizado_en": f(r.realizado_en), "creado": f(r.creado)}


def paquete(pq, interno=True):
    d = {"id": pq.id, "folio": pq.folio, "estado": pq.estado, "peso_kg": m(pq.peso_kg), "creado": f(pq.creado),
         "sucursal": pq.asignacion.sucursal.nombre,
         "contenido": [{"sku": x.asignacion_detalle.pedido_detalle.sku, "nombre": x.asignacion_detalle.pedido_detalle.nombre,
                        "talla": x.asignacion_detalle.pedido_detalle.talla, "cantidad": x.cantidad,
                        "empleado": x.asignacion_detalle.pedido_detalle.empleado.nombre
                        if x.asignacion_detalle.pedido_detalle.empleado else None} for x in pq.detalles],
         "envio": None}
    if pq.envio:
        e = pq.envio
        d["envio"] = {"paqueteria": e.paqueteria, "guia": e.guia, "estado": e.estado, "proveedor": e.proveedor,
                      "rastreo_externo": e.proveedor != "manual",
                      "eventos": [{"estado": ev.estado, "descripcion": ev.descripcion, "origen": ev.origen,
                                   "fecha": f(ev.fecha)} for ev in e.eventos]}
    return d


def asignacion(a, con_pedido=False):
    d = {"id": a.id, "pedido_id": a.pedido_id, "estado": a.estado, "sucursal": {"id": a.sucursal.id, "nombre": a.sucursal.nombre},
         "creado": f(a.creado),
         "detalles": [{"id": x.id, "pedido_detalle_id": x.pedido_detalle_id, "sku": x.pedido_detalle.sku,
                       "nombre": x.pedido_detalle.nombre, "talla": x.pedido_detalle.talla, "color": x.pedido_detalle.color,
                       "empleado": x.pedido_detalle.empleado.nombre if x.pedido_detalle.empleado else None,
                       "cantidad": x.cantidad, "surtida": x.surtida, "empacada": x.empacada,
                       "despachada": x.despachada, "faltante": x.faltante} for x in a.detalles],
         "paquetes": [paquete(p) for p in a.paquetes]}
    if con_pedido:
        p = a.pedido
        d["pedido"] = {"id": p.id, "folio": p.folio, "estado": p.estado, "canal": p.canal, "modalidad": p.modalidad,
                       "cliente": p.cliente.razon_social or p.cliente.nombre, "direccion_envio": p.direccion_envio,
                       "sucursal_recoger_id": p.sucursal_recoger_id, "creado": f(p.creado)}
    return d


def pedido_resumen(p):
    return {"id": p.id, "folio": p.folio, "canal": p.canal, "estado": p.estado, "modalidad": p.modalidad,
            "metodo_pago": p.metodo_pago, "total": m(p.total), "creado": f(p.creado),
            "cliente": {"id": p.cliente.id, "nombre": p.cliente.razon_social or p.cliente.nombre},
            "articulos": sum(d.cantidad for d in p.detalles),
            "sucursales": sorted({a.sucursal.nombre for a in p.asignaciones if a.estado != "cancelada"}),
            "reserva_expira": f(p.reserva_expira)}


def pedido(p, interno=False):
    from ..models import Aprobacion, Devolucion, EntregaIndividual, Incidencia, Paquete, Recepcion
    d = pedido_resumen(p)
    d.update({
        "subtotal": m(p.subtotal), "descuento": m(p.descuento), "costo_envio": m(p.costo_envio),
        "impuestos": m(p.impuestos), "notas": p.notas, "direccion_envio": p.direccion_envio,
        "sucursal_recoger": sucursal(p.sucursal_recoger), "confirmado_en": f(p.confirmado_en),
        "detalles": [{"id": x.id, "variante_id": x.variante_id, "sku": x.sku, "nombre": x.nombre, "talla": x.talla,
                      "color": x.color, "cantidad": x.cantidad, "precio_unitario": m(x.precio_unitario),
                      "descuento_unitario": m(x.descuento_unitario), "importe": m(x.importe), "excepcion": x.excepcion,
                      "empleado": {"id": x.empleado.id, "nombre": x.empleado.nombre, "puesto": x.empleado.puesto}
                      if x.empleado else None,
                      "cantidad_cancelada": x.cantidad_cancelada, "cantidad_entregada": x.cantidad_entregada,
                      "cantidad_devuelta": x.cantidad_devuelta} for x in p.detalles],
        "pagos": [pago(x) for x in p.pagos],
        "paquetes": [paquete(pq) for a in p.asignaciones for pq in a.paquetes if pq.estado != "cancelado"],
        "historial": historial("pedido", p.id),
    })
    d["saldo"] = m(p.total - sum((x.monto for x in p.pagos if x.estado in {"confirmado", "reembolsado_parcial", "reembolsado"}), Decimal("0")))
    devs = db.session.scalars(select(Devolucion).where(Devolucion.pedido_id == p.id).order_by(Devolucion.id)).unique()
    d["devoluciones"] = [devolucion(x) for x in devs]
    if p.canal == "corporativo":
        d["aprobaciones"] = [{"decision": a.decision, "motivo": a.motivo, "usuario": a.usuario.nombre, "fecha": f(a.creado)}
                             for a in db.session.scalars(select(Aprobacion).where(Aprobacion.pedido_id == p.id)
                                                         .order_by(Aprobacion.id)).unique()]
        paq_ids = [pq["id"] for pq in d["paquetes"]]
        recs = {r.paquete_id: r for r in db.session.scalars(select(Recepcion).where(Recepcion.paquete_id.in_(paq_ids or [-1])))}
        for pq in d["paquetes"]:
            r = recs.get(pq["id"])
            pq["recepcion"] = {"estado": r.estado, "diferencias": r.diferencias, "fecha": f(r.creado)} if r else None
        d["entregas_individuales"] = [entrega_individual(e) for e in db.session.scalars(
            select(EntregaIndividual).where(EntregaIndividual.paquete_id.in_(paq_ids or [-1])).order_by(EntregaIndividual.id)).unique()]
    if interno:
        d["asignaciones"] = [asignacion(a) for a in p.asignaciones]
        d["cliente"] = cliente(p.cliente)
        d["incidencias"] = [incidencia(i) for i in db.session.scalars(
            select(Incidencia).where(Incidencia.pedido_id == p.id).order_by(Incidencia.id))]
    return d


def entrega_individual(e, con_firma=False):
    d = {"id": e.id, "paquete_id": e.paquete_id, "estado": e.estado,
         "empleado": {"id": e.empleado.id, "nombre": e.empleado.nombre, "puesto": e.empleado.puesto, "numero": e.empleado.numero},
         "valoracion": e.valoracion, "observaciones": e.observaciones, "entregado_en": f(e.entregado_en),
         "tiene_firma": bool(e.firma),
         "detalles": [{"pedido_detalle_id": x.pedido_detalle_id, "sku": x.pedido_detalle.sku, "nombre": x.pedido_detalle.nombre,
                       "talla": x.pedido_detalle.talla, "esperada": x.esperada, "entregada": x.entregada} for x in e.detalles]}
    if con_firma:
        d["firma"] = e.firma
    return d


def devolucion(dv):
    return {"id": dv.id, "folio": dv.folio, "pedido_id": dv.pedido_id, "pedido_folio": dv.pedido.folio,
            "estado": dv.estado, "motivo": dv.motivo, "descripcion": dv.descripcion, "evidencias": dv.evidencias,
            "sucursal_recibe": sucursal(dv.sucursal_recibe), "guia_retorno": dv.guia_retorno, "resolucion": dv.resolucion,
            "monto_reembolso": m(dv.monto_reembolso), "creado": f(dv.creado),
            "detalles": [{"id": x.id, "pedido_detalle_id": x.pedido_detalle_id, "sku": x.pedido_detalle.sku,
                          "nombre": x.pedido_detalle.nombre, "talla": x.pedido_detalle.talla, "cantidad": x.cantidad,
                          "recibida": x.recibida, "resultado": x.resultado} for x in dv.detalles],
            "historial": historial("devolucion", dv.id)}


def incidencia(i):
    return {"id": i.id, "folio": i.folio, "tipo": i.tipo, "prioridad": i.prioridad, "estado": i.estado,
            "pedido_id": i.pedido_id, "paquete_id": i.paquete_id, "devolucion_id": i.devolucion_id,
            "transferencia_id": i.transferencia_id, "sucursal_id": i.sucursal_id, "descripcion": i.descripcion,
            "resolucion": i.resolucion, "responsable_id": i.responsable_id, "creado": f(i.creado),
            "actualizado": f(i.actualizado)}


def notificacion(n):
    return {"id": n.id, "evento": n.evento, "mensaje": n.mensaje, "enlace": n.enlace, "leida": n.leida, "fecha": f(n.creado)}


def auditoria(a):
    return {"id": a.id, "fecha": f(a.creado), "accion": a.accion, "entidad": a.entidad, "entidad_id": a.entidad_id,
            "sucursal_id": a.sucursal_id, "actor": a.usuario.nombre if a.usuario else (f"Cliente {a.cliente_id}" if a.cliente_id else "Sistema"),
            "antes": a.antes, "despues": a.despues, "ip": a.ip}
