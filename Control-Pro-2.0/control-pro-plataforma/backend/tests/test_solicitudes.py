"""Flujo de solicitudes de sucursal: tienda oculta, borrador persistente, recepción por artículo, entrega con quién la
registra, conformidad separada e historial de incidencias."""
import base64

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.extensions import db

from .conftest import clave, conciliado
from .flujos import almacen_de, surtir_y_empacar

FIRMA = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 300).decode()


def _catalogo(como):
    prod = {p["sku_base"]: p for p in como("admin").get("/api/admin/productos?por_pagina=100").get_json()["items"]}
    return lambda sku_base, talla: next(v["id"] for v in prod[sku_base]["variantes"] if v["talla"] == talla)


def _empleados(emp):
    return {e["nombre"]: e["id"] for e in emp.get("/api/cuenta/empleados").get_json()}


def test_tienda_oculta_por_configuracion(app, client, como):
    assert client.get("/api/tienda/configuracion").get_json() == {"canal_tienda": True}
    app.config["CANAL_TIENDA"] = False
    try:
        assert client.get("/api/tienda/configuracion").get_json() == {"canal_tienda": False}
        c = como("cliente")
        vid = _catalogo(como)("CAM-001", "M")
        r = c.post("/api/cuenta/carrito/items", {"variante_id": vid, "cantidad": 1})
        assert r.status_code == 409 and r.get_json()["error"]["codigo"] == "canal_no_disponible"
        r = c.post("/api/cuenta/checkout", {"modalidad": "recoger", "metodo_pago": "efectivo", "sucursal_id": 1,
                                             "clave_idempotencia": clave()})
        assert r.status_code == 409
        persona = {"correo": "persona@demo.mx", "password": "Segura123", "nombre": "Una Persona"}
        assert client.post("/api/auth/cliente/registro", json=persona).status_code == 400
        empresa = {**persona, "correo": "sucursal.nueva@demo.mx", "tipo": "empresa", "razon_social": "Sucursal Norte"}
        assert client.post("/api/auth/cliente/registro", json=empresa).status_code == 400  # las da de alta el distribuidor
        assert client.get("/api/tienda/productos?por_pagina=1").status_code == 200  # el catálogo sigue disponible
    finally:
        app.config["CANAL_TIENDA"] = True


def test_borrador_persistente_y_envio(como):
    emp, admin = como("empresa"), como("admin")
    var, empleados = _catalogo(como), _empleados(emp)
    dir_emp = emp.get("/api/cuenta/direcciones").get_json()[0]["id"]
    # Un borrador puede guardarse vacío y no es visible para el panel interno
    r = emp.post("/api/cuenta/pedidos-corporativos", {"modalidad": "envio", "direccion_id": dir_emp, "partidas": [],
                                                      "borrador": True, "clave_idempotencia": clave()})
    assert r.status_code == 201 and r.get_json()["estado"] == "borrador"
    b = r.get_json()
    assert admin.get(f"/api/admin/pedidos/{b['id']}").status_code == 404
    assert all(p["id"] != b["id"] for p in admin.get("/api/admin/pedidos").get_json()["items"])
    assert emp.post("/api/cuenta/pedidos-corporativos", {"modalidad": "envio", "direccion_id": dir_emp, "partidas": [],
                                                         "clave_idempotencia": clave()}).status_code == 422
    # Se guarda una partida fuera de la regla por puesto sin justificar: el borrador lo permite, el envío no
    partidas = [{"empleado_id": empleados["Rosario Ramírez"], "variante_id": var("BAT-003", "M"), "cantidad": 2},
                {"empleado_id": empleados["Juan Pérez"], "variante_id": var("BOT-003", "27"), "cantidad": 1}]
    r = emp.put(f"/api/cuenta/pedidos-corporativos/{b['id']}", {"partidas": partidas, "notas": "Dotación de noviembre"})
    assert r.status_code == 200 and r.get_json()["estado"] == "borrador" and len(r.get_json()["detalles"]) == 2
    r = emp.post(f"/api/cuenta/pedidos-corporativos/{b['id']}/enviar")
    assert r.status_code == 422 and r.get_json()["error"]["codigo"] == "partidas_invalidas"
    assert emp.get(f"/api/cuenta/pedidos/{b['id']}").get_json()["estado"] == "borrador"
    partidas[1]["excepcion"] = "Supervisa el área de mantenimiento a diario"
    r = emp.put(f"/api/cuenta/pedidos-corporativos/{b['id']}", {"partidas": partidas, "enviar": True})
    assert r.status_code == 200 and r.get_json()["estado"] == "en_revision"
    hist = [h["nuevo"] for h in r.get_json()["historial"]]
    assert hist == ["borrador", "en_revision"]
    assert admin.get(f"/api/admin/pedidos/{b['id']}").get_json()["estado"] == "en_revision"
    assert emp.post(f"/api/cuenta/pedidos-corporativos/{b['id']}/enviar").status_code == 409
    # Un borrador se puede descartar
    otro = emp.post("/api/cuenta/pedidos-corporativos", {"modalidad": "envio", "direccion_id": dir_emp, "partidas": [],
                                                         "borrador": True, "clave_idempotencia": clave()}).get_json()
    r = emp.post(f"/api/cuenta/pedidos/{otro['id']}/cancelar", {"motivo": "Ya no se necesita"})
    assert r.status_code == 200 and r.get_json()["estado"] == "cancelado"
    assert emp.get("/api/cuenta/resumen").get_json()["solicitudes"]["en_revision"] == 1


def test_recepcion_por_articulo_entrega_y_conformidad(app, como):
    emp, aprob, aten = como("empresa"), como("aprobador"), como("atencion")
    var, empleados = _catalogo(como), _empleados(emp)
    dir_emp = emp.get("/api/cuenta/direcciones").get_json()[0]["id"]
    partidas = [{"empleado_id": empleados["Rosario Ramírez"], "variante_id": var("BAT-003", "M"), "cantidad": 2},
                {"empleado_id": empleados["Carlos Mendoza"], "variante_id": var("CAM-003", "G"), "cantidad": 1}]
    p = emp.post("/api/cuenta/pedidos-corporativos", {"modalidad": "envio", "direccion_id": dir_emp, "partidas": partidas,
                                                      "clave_idempotencia": clave()}).get_json()
    pedido = aprob.post(f"/api/admin/pedidos/{p['id']}/decision", {"decision": "aprobado"}).get_json()
    for asig in pedido["asignaciones"]:
        alm = almacen_de(como, asig["sucursal"]["nombre"])
        paq = surtir_y_empacar(alm, asig["id"])
        alm.post(f"/api/admin/paquetes/{paq}/despachar", {"paqueteria": "Castores", "guia": f"CAS-{paq}"})
        alm.post(f"/api/admin/paquetes/{paq}/eventos", {"estado": "entregado", "descripcion": "Recibió recepción"})
    det = emp.get(f"/api/cuenta/pedidos/{p['id']}").get_json()
    resumen = emp.get("/api/cuenta/resumen").get_json()
    assert resumen["paquetes_por_recibir"] == len(det["paquetes"]) and resumen["entregas_pendientes"] >= 2

    bata = next(d for d in det["detalles"] if d["sku"] == "BAT-003-B-M")
    camisa = next(d for d in det["detalles"] if d["sku"] == "CAM-003-G-G")
    paq_bata = next(pq for pq in det["paquetes"] if any(c["pedido_detalle_id"] == bata["id"] for c in pq["contenido"]))
    # Recepción por artículo: falta una bata → recepción parcial e incidencia ligada a la empleada y al artículo
    r = emp.post(f"/api/cuenta/paquetes/{paq_bata['id']}/recepcion", {"completa": True, "partidas": [
        {"pedido_detalle_id": 999999, "recibida": 1}]})
    assert r.status_code == 404  # el artículo no viene en el paquete
    assert camisa["empleado"]["nombre"] == "Carlos Mendoza"
    partidas_rec = [{"pedido_detalle_id": c["pedido_detalle_id"], "recibida": c["cantidad"]} for c in paq_bata["contenido"]]
    for x in partidas_rec:
        if x["pedido_detalle_id"] == bata["id"]:
            x["recibida"] -= 1
            x["nota"] = "Caja abierta"
    r = emp.post(f"/api/cuenta/paquetes/{paq_bata['id']}/recepcion", {"completa": True, "partidas": partidas_rec})
    assert r.status_code == 201
    rec = next(pq for pq in r.get_json()["paquetes"] if pq["id"] == paq_bata["id"])["recepcion"]
    assert rec["estado"] == "parcial" and any(x["problema"] == "faltante" for x in rec["detalles"])
    inc = next(i for i in r.get_json()["incidencias"] if i["tipo"] == "diferencia_recepcion")
    assert inc["articulo"]["pedido_detalle_id"] == bata["id"] and inc["empleado"]["nombre"] == "Rosario Ramírez"
    assert inc["seguimiento"][0]["comentario"] == "Incidencia registrada" and inc["seguimiento"][0]["actor"] == "Sucursal"
    for pq in det["paquetes"]:
        if pq["id"] != paq_bata["id"]:
            assert emp.post(f"/api/cuenta/paquetes/{pq['id']}/recepcion", {"completa": True}).status_code == 201

    # Entrega individual: se exige quién entrega; la conformidad es un evento aparte
    det = emp.get(f"/api/cuenta/pedidos/{p['id']}").get_json()
    ent_carlos = next(e for e in det["entregas_individuales"] if e["empleado"]["nombre"] == "Carlos Mendoza")
    ent_rosario = next(e for e in det["entregas_individuales"] if e["empleado"]["nombre"] == "Rosario Ramírez")
    assert emp.post(f"/api/cuenta/entregas/{ent_carlos['id']}", {"firma": FIRMA}).status_code == 422
    assert emp.post(f"/api/cuenta/entregas/{ent_carlos['id']}/conformidad", {"valoracion": 5}).status_code == 409
    r = emp.post(f"/api/cuenta/entregas/{ent_carlos['id']}", {"firma": FIRMA, "registrado_por": "Laura Compras"})
    assert r.status_code == 200 and r.get_json()["estado"] == "entregada" and r.get_json()["registrado_por"] == "Laura Compras"
    assert emp.get("/api/cuenta/resumen").get_json()["conformidades_pendientes"] >= 1
    r = emp.post(f"/api/cuenta/entregas/{ent_carlos['id']}/conformidad", {"valoracion": 5, "comentario": "Todo bien"})
    assert r.status_code == 200 and r.get_json()["estado"] == "confirmada" and r.get_json()["conformidad_en"]
    assert emp.post(f"/api/cuenta/entregas/{ent_carlos['id']}/conformidad", {"valoracion": 4}).status_code == 409
    # La firma se puede consultar: la sucursal y el personal interno con alcance; fuera de alcance, 404
    assert emp.get(f"/api/cuenta/entregas/{ent_carlos['id']}").get_json()["firma"] == FIRMA
    comp = como("admin").get(f"/api/admin/entregas/{ent_carlos['id']}").get_json()
    assert comp["firma"] == FIRMA and comp["registrado_por"] == "Laura Compras" and comp["valoracion"] == 5
    paq_carlos = next(pq for pq in det["paquetes"] if pq["id"] == ent_carlos["paquete_id"])
    otra = {"Sucursal Toluca": "enc_pue", "Sucursal Querétaro": "enc_tol", "Sucursal Puebla": "enc_tol"}[paq_carlos["sucursal"]]
    assert como(otra).get(f"/api/admin/entregas/{ent_carlos['id']}").status_code == 404
    # Rosario recibe y reporta un problema de talla: incidencia ligada a ella y al artículo
    r = emp.post(f"/api/cuenta/entregas/{ent_rosario['id']}", {"firma": FIRMA, "registrado_por": "Laura Compras"})
    assert r.status_code == 200
    assert emp.post(f"/api/cuenta/entregas/{ent_rosario['id']}/conformidad",
                    {"valoracion": 3, "problema": "talla"}).status_code == 400  # falta describir
    r = emp.post(f"/api/cuenta/entregas/{ent_rosario['id']}/conformidad",
                 {"valoracion": 3, "problema": "talla", "comentario": "La M le queda chica", "pedido_detalle_id": bata["id"]})
    assert r.status_code == 200 and r.get_json()["estado"] == "con_incidencia"
    det = emp.get(f"/api/cuenta/pedidos/{p['id']}").get_json()
    talla = next(i for i in det["incidencias"] if i["tipo"] == "conformidad_talla")
    assert talla["empleado"]["nombre"] == "Rosario Ramírez" and talla["articulo"]["sku"] == "BAT-003-B-M"

    # Historial de incidencias: cada actualización agrega una entrada y el historial no se puede alterar
    r = aten.patch(f"/api/admin/incidencias/{talla['id']}", {"estado": "en_atencion", "comentario": "Se enviará talla G"})
    r = aten.patch(f"/api/admin/incidencias/{talla['id']}", {"estado": "resuelta", "comentario": "Cambio entregado"})
    seg = r.get_json()["seguimiento"]
    assert [s["nuevo"] for s in seg] == ["abierta", "en_atencion", "resuelta"] and seg[1]["actor"] == "Mario Atención"
    vista_sucursal = next(i for i in emp.get(f"/api/cuenta/pedidos/{p['id']}").get_json()["incidencias"] if i["id"] == talla["id"])
    assert vista_sucursal["seguimiento"][1]["actor"] == "Control Pro"
    with app.app_context():
        with pytest.raises(DBAPIError):
            db.session.execute(text("update incidencia_seguimiento set comentario = 'x'"))
        db.session.rollback()
    assert conciliado(app)


def test_incidencia_de_sucursal_por_empleado(como):
    emp = como("empresa")
    var, empleados = _catalogo(como), _empleados(emp)
    dir_emp = emp.get("/api/cuenta/direcciones").get_json()[0]["id"]
    p = emp.post("/api/cuenta/pedidos-corporativos", {"modalidad": "envio", "direccion_id": dir_emp, "clave_idempotencia": clave(),
                                                      "partidas": [{"empleado_id": empleados["Ana López"], "variante_id": var("MAN-001", "Unitalla"), "cantidad": 1}]}).get_json()
    base = {"tipo": "articulo_faltante", "descripcion": "Falta el mandil de Ana en la solicitud", "prioridad": "media"}
    assert emp.post(f"/api/cuenta/pedidos/{p['id']}/incidencias", {**base, "empleado_id": empleados["Juan Pérez"]}).status_code == 404
    r = emp.post(f"/api/cuenta/pedidos/{p['id']}/incidencias", {**base, "pedido_detalle_id": p["detalles"][0]["id"]})
    assert r.status_code == 201 and r.get_json()["empleado"]["nombre"] == "Ana López"
