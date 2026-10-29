"""Flujos completos: tienda con envío, recoger con efectivo, faltantes al surtir, devolución con reembolso,
canal corporativo con aprobación, recepción y entregas individuales, cierre y reportes."""
import base64

from .conftest import clave, conciliado, fijar_existencia, inventario, sucursal_id
from .flujos import almacen_de, comprar_envio, comprar_recoger, pagar_y_validar, surtir_y_empacar

FIRMA = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 300).decode()


def test_flujo_tienda_envio_completo(como, app):
    c, fin, aten = como("cliente"), como("finanzas"), como("atencion")
    p = comprar_envio(c, app, [("BAT-001-B-M", 2), ("POL-001-AM-G", 3)]).get_json()
    assert p["estado"] == "pendiente_pago"
    # Primer pago rechazado → vuelve a pendiente; segundo pago validado → confirmado
    pago = c.post(f"/api/cuenta/pedidos/{p['id']}/pagos", {"referencia": "SPEI-000", "clave_idempotencia": clave()}).get_json()
    assert c.get(f"/api/cuenta/pedidos/{p['id']}").get_json()["estado"] == "pago_en_revision"
    assert fin.post(f"/api/admin/pagos/{pago['id']}/rechazar", {"motivo": "No aparece en el estado de cuenta"}).status_code == 200
    assert c.get(f"/api/cuenta/pedidos/{p['id']}").get_json()["estado"] == "pendiente_pago"
    pagar_y_validar(c, fin, p["id"])
    det = c.get(f"/api/cuenta/pedidos/{p['id']}").get_json()
    assert det["estado"] == "confirmado" and det["saldo"] == "0.00"

    pedido_admin = como("admin").get(f"/api/admin/pedidos/{p['id']}").get_json()
    asig = pedido_admin["asignaciones"][0]
    alm = almacen_de(como, asig["sucursal"]["nombre"])
    paq = surtir_y_empacar(alm, asig["id"])
    assert c.get(f"/api/cuenta/pedidos/{p['id']}").get_json()["estado"] == "en_preparacion"
    r = alm.post(f"/api/admin/paquetes/{paq}/despachar", {"paqueteria": "Paquetería Local", "guia": "GUIA-0001"})
    assert r.status_code == 200 and r.get_json()["envio"]["rastreo_externo"] is False
    assert c.get(f"/api/cuenta/pedidos/{p['id']}").get_json()["estado"] == "enviado"
    alm.post(f"/api/admin/paquetes/{paq}/eventos", {"estado": "en_transito", "descripcion": "Salió a ruta"})
    r = alm.post(f"/api/admin/paquetes/{paq}/eventos", {"estado": "entregado", "descripcion": "Recibió Andrea Morales"})
    assert r.status_code == 200
    det = c.get(f"/api/cuenta/pedidos/{p['id']}").get_json()
    assert det["estado"] == "entregado" and all(x["cantidad_entregada"] == x["cantidad"] for x in det["detalles"])
    assert alm.post(f"/api/admin/paquetes/{paq}/eventos", {"estado": "entregado", "descripcion": "otra vez"}).status_code == 409

    # Devolución de 1 polo: autorización → recepción → inspección (apta) → reembolso → cierre
    polo = next(x for x in det["detalles"] if x["sku"] == "POL-001-AM-G")
    sin_evid = c.post(f"/api/cuenta/pedidos/{p['id']}/devoluciones", {"motivo": "talla_incorrecta",
                      "descripcion": "La talla G me queda grande", "evidencias": [], "partidas": [{"pedido_detalle_id": polo["id"], "cantidad": 1}]})
    assert sin_evid.status_code == 422
    exceso = c.post(f"/api/cuenta/pedidos/{p['id']}/devoluciones", {"motivo": "talla_incorrecta", "descripcion": "La talla G me queda grande",
                    "evidencias": ["Foto de la etiqueta"], "partidas": [{"pedido_detalle_id": polo["id"], "cantidad": 4}]})
    assert exceso.status_code == 409
    dev = c.post(f"/api/cuenta/pedidos/{p['id']}/devoluciones", {"motivo": "talla_incorrecta", "descripcion": "La talla G me queda grande",
                 "evidencias": ["Foto de la etiqueta"], "partidas": [{"pedido_detalle_id": polo["id"], "cantidad": 1}]}).get_json()
    suc = asig["sucursal"]["id"]
    assert aten.post(f"/api/admin/devoluciones/{dev['id']}/autorizar", {"sucursal_id": suc}).status_code == 200
    antes = inventario(app, {"Sucursal Toluca": "TOL", "Sucursal Querétaro": "QRO", "Sucursal Puebla": "PUE"}[asig["sucursal"]["nombre"]], "POL-001-AM-G")
    assert alm.post(f"/api/admin/devoluciones/{dev['id']}/recibir", {}).status_code == 200
    ddet = dev["detalles"][0]["id"]
    r = alm.post(f"/api/admin/devoluciones/{dev['id']}/inspeccionar", {"resultados": {str(ddet): {"aptas": 1, "merma": 0}}})
    assert r.status_code == 200 and r.get_json()["monto_reembolso"] == "212.50"
    despues = inventario(app, {"Sucursal Toluca": "TOL", "Sucursal Querétaro": "QRO", "Sucursal Puebla": "PUE"}[asig["sucursal"]["nombre"]], "POL-001-AM-G")
    assert despues.fisico == antes.fisico + 1
    # El pedido no se puede cerrar con la devolución abierta
    assert aten.post(f"/api/admin/pedidos/{p['id']}/cerrar", {}).status_code == 409
    reemb = next(x for x in fin.get("/api/admin/reembolsos?estado=pendiente").get_json()["items"] if x["devolucion_id"] == dev["id"])
    assert fin.post(f"/api/admin/reembolsos/{reemb['id']}/realizar", {"referencia": "SPEI-DEV-1"}).status_code == 200
    assert aten.post(f"/api/admin/devoluciones/{dev['id']}/cerrar", {}).status_code == 200
    r = aten.post(f"/api/admin/pedidos/{p['id']}/cerrar", {"nota": "Conciliado"})
    assert r.status_code == 200 and r.get_json()["estado"] == "cerrado"
    hist = [h["nuevo"] for h in r.get_json()["historial"]]
    assert hist[:3] == ["pendiente_pago", "pago_en_revision", "pendiente_pago"] and hist[-1] == "cerrado"
    assert conciliado(app)


def test_recoger_en_sucursal_con_efectivo_y_promocion_local(como, app):
    c = como("cliente")
    p = comprar_recoger(c, app, [("BOT-001-N-27", 1)], "PUE").get_json()
    assert p["descuento"] == "100.00" and p["total"] == "690.00" and p["costo_envio"] == "0.00"
    enc_pue, alm_pue = como("enc_pue"), como("alm_pue")
    assert enc_pue.post(f"/api/admin/pedidos/{p['id']}/efectivo", {"monto": "600.00", "clave_idempotencia": clave()}).status_code == 400
    r = enc_pue.post(f"/api/admin/pedidos/{p['id']}/efectivo", {"monto": "690.00", "clave_idempotencia": clave()})
    assert r.status_code == 201 and r.get_json()["estado"] == "confirmado"
    asig = como("admin").get(f"/api/admin/pedidos/{p['id']}").get_json()["asignaciones"][0]
    paq = surtir_y_empacar(alm_pue, asig["id"])
    assert alm_pue.post(f"/api/admin/paquetes/{paq}/despachar", {"paqueteria": "Local", "guia": "1234"}).status_code == 400
    assert alm_pue.post(f"/api/admin/paquetes/{paq}/listo").status_code == 200
    antes = inventario(app, "PUE", "BOT-001-N-27")
    r = alm_pue.post(f"/api/admin/paquetes/{paq}/entregar", {"recibio": "Andrea Morales", "identificacion": "INE ****1234"})
    assert r.status_code == 200
    despues = inventario(app, "PUE", "BOT-001-N-27")
    assert despues.fisico == antes.fisico - 1 and despues.comprometido == antes.comprometido - 1
    assert c.get(f"/api/cuenta/pedidos/{p['id']}").get_json()["estado"] == "entregado"
    assert conciliado(app)


def test_faltante_al_surtir_genera_incidencia_y_reembolso(como, app):
    c, fin = como("cliente"), como("finanzas")
    sku = "FIL-001-AR-M"
    for s in ("TOL", "QRO", "PUE"):
        fijar_existencia(app, s, sku, 0)
    fijar_existencia(app, "TOL", sku, 3)
    p = comprar_envio(c, app, [(sku, 3)]).get_json()
    pagar_y_validar(c, fin, p["id"])
    asig = como("admin").get(f"/api/admin/pedidos/{p['id']}").get_json()["asignaciones"][0]
    alm = como("alm_tol")
    a = alm.post(f"/api/admin/surtido/{asig['id']}/iniciar").get_json()
    d = a["detalles"][0]
    sin_motivo = alm.post(f"/api/admin/surtido/{asig['id']}/registrar", {"partidas": [{"asignacion_detalle_id": d["id"], "surtida": 2, "faltante": 1}]})
    assert sin_motivo.status_code == 400
    r = alm.post(f"/api/admin/surtido/{asig['id']}/registrar", {"partidas": [{"asignacion_detalle_id": d["id"], "surtida": 2,
                                                                              "faltante": 1, "motivo_faltante": "Prenda rota en anaquel"}]})
    assert r.status_code == 200
    inv = inventario(app, "TOL", sku)
    assert inv.fisico == 2 and inv.comprometido == 2
    reemb = fin.get("/api/admin/reembolsos?estado=pendiente").get_json()["items"]
    assert reemb[0]["monto"] == "330.00"
    alm.post(f"/api/admin/surtido/{asig['id']}/paquetes", {"partidas": [{"asignacion_detalle_id": d["id"], "cantidad": 2}]})
    assert alm.post(f"/api/admin/surtido/{asig['id']}/paquetes", {"partidas": [{"asignacion_detalle_id": d["id"], "cantidad": 1}]}).status_code == 409
    paq = alm.get(f"/api/admin/surtido/{asig['id']}").get_json()["paquetes"][0]["id"]
    alm.post(f"/api/admin/paquetes/{paq}/despachar", {"paqueteria": "Local", "guia": "GUIA-9"})
    alm.post(f"/api/admin/paquetes/{paq}/eventos", {"estado": "entregado", "descripcion": "Entregado en domicilio"})
    det = c.get(f"/api/cuenta/pedidos/{p['id']}").get_json()
    assert det["estado"] == "entregado"  # 2 entregadas + 1 cancelada por faltante
    aten = como("atencion")
    assert aten.post(f"/api/admin/pedidos/{p['id']}/cerrar", {}).status_code == 409  # incidencia y reembolso pendientes
    inc = next(i for i in aten.get("/api/admin/incidencias").get_json()["items"] if i["pedido_id"] == p["id"])
    assert aten.patch(f"/api/admin/incidencias/{inc['id']}", {"estado": "resuelta"}).status_code == 400  # falta resolución
    aten.patch(f"/api/admin/incidencias/{inc['id']}", {"estado": "resuelta", "comentario": "Se reembolsó la pieza faltante"})
    fin.post(f"/api/admin/reembolsos/{reemb[0]['id']}/realizar", {"referencia": "SPEI-FALT"})
    assert aten.post(f"/api/admin/pedidos/{p['id']}/cerrar", {}).status_code == 200
    assert conciliado(app)


def test_cancelar_tras_despacho_no_procede(como, app):
    c, fin = como("cliente"), como("finanzas")
    p = comprar_envio(c, app, [("GOR-001-AM-UNITALLA", 1)]).get_json()
    pagar_y_validar(c, fin, p["id"])
    asig = como("admin").get(f"/api/admin/pedidos/{p['id']}").get_json()["asignaciones"][0]
    alm = almacen_de(como, asig["sucursal"]["nombre"])
    paq = surtir_y_empacar(alm, asig["id"])
    alm.post(f"/api/admin/paquetes/{paq}/despachar", {"paqueteria": "Local", "guia": "G-77"})
    assert c.post(f"/api/cuenta/pedidos/{p['id']}/cancelar", {"motivo": "Cambio de opinión"}).status_code == 409
    assert como("atencion").post(f"/api/admin/pedidos/{p['id']}/cancelar", {"motivo": "Cambio de opinión"}).status_code == 409


def test_canal_corporativo_completo(como, app):
    emp = como("empresa")
    aprob, fin = como("aprobador"), como("finanzas")
    empleados = {e["nombre"]: e["id"] for e in emp.get("/api/cuenta/empleados").get_json()}
    prod = {p["sku_base"]: p for p in como("admin").get("/api/admin/productos?por_pagina=50").get_json()["items"]}
    var = lambda sku_base, talla: next(v["id"] for v in prod[sku_base]["variantes"] if v["talla"] == talla)
    dir_emp = emp.get("/api/cuenta/direcciones").get_json()[0]["id"]
    partidas = [
        {"empleado_id": empleados["Rosario Ramírez"], "variante_id": var("BAT-002", "M"), "cantidad": 1},
        {"empleado_id": empleados["Carlos Mendoza"], "variante_id": var("CAM-001", "G"), "cantidad": 2},
        {"empleado_id": empleados["Juan Pérez"], "variante_id": var("BOT-001", "27"), "cantidad": 1},  # no autorizado
    ]
    sin_just = emp.post("/api/cuenta/pedidos-corporativos", {"modalidad": "envio", "direccion_id": dir_emp,
                                                             "partidas": partidas, "clave_idempotencia": clave()})
    assert sin_just.status_code == 422 and sin_just.get_json()["error"]["codigo"] == "partidas_invalidas"
    partidas[2]["excepcion"] = "Realiza recorridos en el área de mantenimiento"
    p = emp.post("/api/cuenta/pedidos-corporativos", {"modalidad": "envio", "direccion_id": dir_emp, "partidas": partidas,
                                                      "clave_idempotencia": clave()}).get_json()
    assert p["estado"] == "en_revision" and p["costo_envio"] == "0.00"
    # Devolver para corrección → corregir → reenviar
    assert aprob.post(f"/api/admin/pedidos/{p['id']}/decision", {"decision": "devuelto"}).status_code == 400
    assert aprob.post(f"/api/admin/pedidos/{p['id']}/decision", {"decision": "devuelto", "motivo": "Falta el gorro de Carlos"}).status_code == 200
    partidas.append({"empleado_id": empleados["Carlos Mendoza"], "variante_id": var("GOR-001", "Unitalla"), "cantidad": 1})
    r = emp.put(f"/api/cuenta/pedidos-corporativos/{p['id']}", {"partidas": partidas, "notas": "Corregido"})
    assert r.status_code == 200 and r.get_json()["estado"] == "en_revision"
    assert aprob.post(f"/api/admin/pedidos/{p['id']}/decision", {"decision": "aprobado"}).status_code == 409  # excepción sin aceptar
    r = aprob.post(f"/api/admin/pedidos/{p['id']}/decision", {"decision": "aprobado", "aceptar_excepciones": True})
    assert r.status_code == 200 and r.get_json()["estado"] == "confirmado"
    pedido = r.get_json()
    credito = pedido["pagos"][0]
    assert credito["metodo"] == "credito_corporativo" and credito["estado"] == "pendiente"

    # Surtido y entrega de cada asignación
    for asig in pedido["asignaciones"]:
        alm = almacen_de(como, asig["sucursal"]["nombre"])
        paq = surtir_y_empacar(alm, asig["id"])
        alm.post(f"/api/admin/paquetes/{paq}/despachar", {"paqueteria": "Local", "guia": f"CORP-{paq}"})
        alm.post(f"/api/admin/paquetes/{paq}/eventos", {"estado": "entregado", "descripcion": "Recibió compras"})
    det = emp.get(f"/api/cuenta/pedidos/{p['id']}").get_json()
    assert det["estado"] == "entregado" and len(det["entregas_individuales"]) >= 3
    entrega = det["entregas_individuales"][0]
    # Sin recepción física no hay entrega individual
    assert emp.post(f"/api/cuenta/entregas/{entrega['id']}", {"firma": FIRMA}).status_code == 409
    for pq in det["paquetes"]:
        assert emp.post(f"/api/cuenta/paquetes/{pq['id']}/recepcion", {"completa": True}).status_code == 201
    assert emp.post(f"/api/cuenta/paquetes/{det['paquetes'][0]['id']}/recepcion", {"completa": True}).status_code == 409
    assert emp.post(f"/api/cuenta/entregas/{entrega['id']}", {"firma": "data:image/png;base64,xx"}).status_code == 400
    for i, e in enumerate(det["entregas_individuales"]):
        cantidades = {}
        if i == 1:  # al segundo empleado le falta una prenda
            cantidades = {str(e["detalles"][0]["pedido_detalle_id"]): e["detalles"][0]["esperada"] - 1}
        r = emp.post(f"/api/cuenta/entregas/{e['id']}", {"firma": FIRMA, "valoracion": 5, "cantidades": cantidades,
                                                         "observaciones": "Falta una pieza" if i == 1 else None})
        assert r.status_code == 200
        assert r.get_json()["estado"] == ("con_incidencia" if i == 1 else "entregada")
    aten = como("atencion")
    assert aten.post(f"/api/admin/pedidos/{p['id']}/cerrar", {}).status_code == 409  # incidencia abierta
    inc = next(i for i in aten.get("/api/admin/incidencias").get_json()["items"] if i["tipo"] == "entrega_incompleta")
    aten.patch(f"/api/admin/incidencias/{inc['id']}", {"estado": "resuelta", "comentario": "Pieza repuesta en sitio"})
    # Cobro del crédito corporativo
    assert fin.post(f"/api/admin/pagos/{credito['id']}/validar", {"nota": "FACT-CRED-01"}).status_code == 200
    r = aten.post(f"/api/admin/pedidos/{p['id']}/cerrar", {})
    assert r.status_code == 200, r.get_json()
    assert conciliado(app)


def test_reportes_y_exportaciones(como, app):
    c, fin = como("cliente"), como("finanzas")
    p = comprar_envio(c, app, [("CAM-001-AM-M", 2)]).get_json()
    pagar_y_validar(c, fin, p["id"])
    comprar_envio(c, app, [("GOR-001-AM-UNITALLA", 1)])  # pedido sin pagar: no es venta
    admin = como("admin")
    d = admin.get("/api/admin/reportes/dashboard").get_json()
    assert d["pedidos"]["recibidos"] == 2 and d["ventas_registradas"]["pedidos"] == 1
    assert d["ventas_registradas"]["importe"] == p["total"] and d["pagos_confirmados"]["neto"] == p["total"]
    assert d["mas_vendidos"][0]["sku"] == "CAM-001-AM-M"
    comp = admin.get("/api/admin/reportes/sucursales").get_json()
    assert len(comp) == 3 and sum(x["pedidos"] for x in comp) == 1
    assert len(como("enc_tol").get("/api/admin/reportes/sucursales").get_json()) == 1
    csv = admin.get("/api/admin/reportes/exportar/pedidos")
    assert csv.status_code == 200 and p["folio"] in csv.get_data(as_text=True)
    xlsx = admin.get("/api/admin/reportes/exportar/inventario?formato=xlsx")
    assert xlsx.status_code == 200 and xlsx.data[:2] == b"PK"
    tol_csv = como("enc_tol").get("/api/admin/reportes/exportar/inventario").get_data(as_text=True)
    assert "Sucursal Puebla" not in tol_csv and "Sucursal Toluca" in tol_csv
    pdf = admin.get(f"/api/admin/pedidos/{p['id']}/pdf")
    assert pdf.status_code == 200 and pdf.data[:4] == b"%PDF"
    audit = admin.get("/api/admin/auditoria?entidad=pedido").get_json()
    assert audit["total"] >= 2


def test_notificaciones_sin_duplicados(como, app):
    c = como("cliente")
    p = comprar_envio(c, app, [("GOR-001-AM-UNITALLA", 1)]).get_json()
    notifs = c.get("/api/cuenta/notificaciones").get_json()
    assert notifs["no_leidas"] >= 1 and any(n["evento"] == "pedido_creado" for n in notifs["items"])
    c.post("/api/cuenta/notificaciones/leer", {})
    assert c.get("/api/cuenta/notificaciones").get_json()["no_leidas"] == 0
    pago = c.post(f"/api/cuenta/pedidos/{p['id']}/pagos", {"referencia": "SPEI-555", "clave_idempotencia": clave()}).get_json()
    fin = como("finanzas")
    assert any(n["evento"] == "pago_por_validar" for n in fin.get("/api/admin/notificaciones").get_json()["items"])
    # Reintento con la misma clave: no duplica el pago
    r = c.post(f"/api/cuenta/pedidos/{p['id']}/pagos", {"referencia": "SPEI-555", "clave_idempotencia": "x" * 8})
    assert r.status_code == 409  # el pedido ya está en revisión de pago
