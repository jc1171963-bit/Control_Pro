"""Catálogo, carrito, checkout con reservas, división entre sucursales, concurrencia, expiración, cancelación,
ajustes y transferencias."""
import threading
from datetime import timedelta

from sqlalchemy import text

from app.extensions import db

from .conftest import Api, PASSWORD, clave, conciliado, direccion_cliente, fijar_existencia, inventario, sucursal_id, variante_id
from .flujos import agregar, comprar_envio, comprar_recoger


def test_catalogo_busqueda_filtros_orden(client):
    r = client.get("/api/tienda/productos?q=bata").get_json()
    assert r["total"] >= 2 and all("bata" in p["nombre"].lower() or "mandil" in p["nombre"].lower() for p in r["items"])
    r = client.get("/api/tienda/productos?categoria=calzado&orden=precio_desc").get_json()
    precios = [float(p["precio_desde"]) for p in r["items"]]
    assert precios == sorted(precios, reverse=True) and r["total"] == 2
    r = client.get("/api/tienda/productos?talla=27&color=Negro").get_json()
    assert {p["sku_base"] for p in r["items"]} == {"BOT-001", "ZAP-001"}
    assert client.get("/api/tienda/productos?categoria=no-existe").status_code == 404
    inicio = client.get("/api/tienda/inicio").get_json()
    assert inicio["destacados"] and inicio["promociones"][0]["sku_base"] == "POL-001"


def test_ficha_con_promocion_y_disponibilidad(client):
    p = client.get("/api/tienda/productos/polo-corporativa-pique").get_json()
    v = p["variantes"][0]
    assert v["precio_base"] == "250.00" and v["descuento"] == "37.50" and v["precio_final"] == "212.50"
    assert len(p["disponibilidad_sucursal"]) == 3 and p["imagenes"]
    assert client.get("/api/tienda/productos/inexistente").status_code == 404


def test_carrito_valida_existencias(como, app):
    fijar_existencia(app, "TOL", "GOR-001-G-UNITALLA", 2)
    fijar_existencia(app, "QRO", "GOR-001-G-UNITALLA", 1)
    fijar_existencia(app, "PUE", "GOR-001-G-UNITALLA", 0)
    c = como("cliente")
    vid = variante_id(app, "GOR-001-G-UNITALLA")
    assert c.post("/api/cuenta/carrito/items", {"variante_id": vid, "cantidad": 3}).status_code == 201
    r = c.post("/api/cuenta/carrito/items", {"variante_id": vid, "cantidad": 1})
    assert r.status_code == 409 and r.get_json()["error"]["detalles"]["disponible"] == 3
    carrito = c.get("/api/cuenta/carrito").get_json()
    assert carrito["articulos"] == 3 and carrito["totales"]["costo_envio"] == "150.00"


def test_checkout_reserva_e_idempotencia(como, app):
    c = como("cliente")
    antes = inventario(app, "TOL", "CAM-001-AM-M")
    agregar(c, app, "CAM-001-AM-M", 2)
    k = clave()
    cuerpo = {"modalidad": "envio", "metodo_pago": "transferencia", "direccion_id": direccion_cliente(app), "clave_idempotencia": k}
    r1 = c.post("/api/cuenta/checkout", cuerpo)
    assert r1.status_code == 201, r1.get_json()
    p = r1.get_json()
    assert p["estado"] == "pendiente_pago" and p["sucursales"] == ["Sucursal Toluca"]  # CP 50080 → Toluca
    assert p["subtotal"] == "560.00" and p["costo_envio"] == "150.00" and p["total"] == "710.00"
    r2 = c.post("/api/cuenta/checkout", cuerpo)
    assert r2.status_code == 200 and r2.get_json()["id"] == p["id"]  # misma clave: mismo pedido
    despues = inventario(app, "TOL", "CAM-001-AM-M")
    assert despues.reservado == antes.reservado + 2 and despues.fisico == antes.fisico
    assert c.get("/api/cuenta/carrito").get_json()["articulos"] == 0
    assert conciliado(app)


def test_pago_con_tarjeta_no_disponible(como, app):
    c = como("cliente")
    r = comprar_envio(c, app, [("GOR-001-AM-UNITALLA", 1)], metodo="tarjeta_pasarela")
    assert r.status_code == 400 and r.get_json()["error"]["codigo"] == "metodo_no_disponible"


def test_division_entre_sucursales(como, app):
    sku = "BOT-001-N-27"
    fijar_existencia(app, "TOL", sku, 2)
    fijar_existencia(app, "QRO", sku, 1)
    fijar_existencia(app, "PUE", sku, 2)
    c = como("cliente")
    r = comprar_envio(c, app, [(sku, 4)])
    assert r.status_code == 201, r.get_json()
    p = r.get_json()
    assert len(p["sucursales"]) == 2  # menor número de sucursales que cubren 4 unidades
    tot = sum(inventario(app, s, sku).reservado for s in ("TOL", "QRO", "PUE"))
    assert tot == 4


def test_sin_existencias_suficientes(como, app):
    sku = "BOT-001-N-23"
    for s in ("TOL", "QRO", "PUE"):
        fijar_existencia(app, s, sku, 1)
    c = como("cliente")
    agregar(c, app, sku, 3)
    fijar_existencia(app, "PUE", sku, 0)  # alguien más compró mientras tanto
    r = c.post("/api/cuenta/checkout", {"modalidad": "envio", "metodo_pago": "transferencia",
                                         "direccion_id": direccion_cliente(app), "clave_idempotencia": clave()})
    assert r.status_code == 409 and r.get_json()["error"]["codigo"] == "sin_existencias"
    assert sum(inventario(app, s, sku).reservado for s in ("TOL", "QRO", "PUE")) == 0


def test_recoger_no_se_divide(como, app):
    sku = "BOT-001-N-24"
    fijar_existencia(app, "TOL", sku, 5)
    fijar_existencia(app, "PUE", sku, 1)
    c = como("cliente")
    r = comprar_recoger(c, app, [(sku, 2)], "PUE")
    assert r.status_code == 409


def test_concurrencia_no_sobrevende(app, client):
    """20 clientes compran a la vez la última existencia (5 unidades en total): exactamente 5 pedidos."""
    sku = "ZAP-001-B-25"
    fijar_existencia(app, "TOL", sku, 3)
    fijar_existencia(app, "QRO", sku, 2)
    fijar_existencia(app, "PUE", sku, 0)
    vid = variante_id(app, sku)
    apis = []
    for i in range(20):
        correo = f"conc{i}@demo.mx"
        client.post("/api/auth/cliente/registro", json={"correo": correo, "password": "Segura123", "nombre": f"Cliente {i}"})
        tok = client.post("/api/auth/cliente/login", json={"correo": correo, "password": "Segura123"}).get_json()["access_token"]
        api = Api(app.test_client(), tok)
        api.post("/api/cuenta/direcciones", {"alias": "Casa", "destinatario": "X Y Z", "telefono": "7221002000",
                                            "calle": "Uno", "numero": "1", "colonia": "Centro", "ciudad": "Toluca",
                                            "estado": "México", "cp": "50000"})
        assert api.post("/api/cuenta/carrito/items", {"variante_id": vid, "cantidad": 1}).status_code == 201
        dir_id = api.get("/api/cuenta/direcciones").get_json()[0]["id"]
        apis.append((api, dir_id))
    resultados = []
    barrera = threading.Barrier(len(apis))

    def comprar(api, dir_id):
        barrera.wait()
        r = api.post("/api/cuenta/checkout", {"modalidad": "envio", "metodo_pago": "transferencia",
                                               "direccion_id": dir_id, "clave_idempotencia": clave()})
        resultados.append(r.status_code)

    hilos = [threading.Thread(target=comprar, args=a) for a in apis]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()
    assert sorted(resultados).count(201) == 5 and resultados.count(409) == 15, resultados
    assert inventario(app, "TOL", sku).reservado == 3 and inventario(app, "QRO", sku).reservado == 2
    assert conciliado(app)


def test_expiracion_libera_reservas(como, app):
    c = como("cliente")
    sku = "PAN-001-C-32"
    antes = inventario(app, "TOL", sku).reservado
    p = comprar_envio(c, app, [(sku, 2)]).get_json()
    with app.app_context():
        db.session.execute(text("update pedido set reserva_expira = now() - interval '1 minute' where id = :i"), {"i": p["id"]})
        db.session.commit()
    r = como("atencion").post("/api/admin/pedidos/expirar-reservas")
    assert r.get_json()["expirados"] == 1
    assert inventario(app, "TOL", sku).reservado == antes
    assert c.get(f"/api/cuenta/pedidos/{p['id']}").get_json()["estado"] == "expirado"
    # un pedido expirado ya no acepta pagos
    r = c.post(f"/api/cuenta/pedidos/{p['id']}/pagos", {"referencia": "SPEI-999", "clave_idempotencia": clave()})
    assert r.status_code == 409


def test_cancelacion_libera_y_reembolsa(como, app):
    c, fin = como("cliente"), como("finanzas")
    sku = "PAN-001-AM-30"
    antes = inventario(app, "TOL", sku)
    p = comprar_envio(c, app, [(sku, 1)]).get_json()
    pago = c.post(f"/api/cuenta/pedidos/{p['id']}/pagos", {"referencia": "SPEI-1", "clave_idempotencia": clave()}).get_json()
    fin.post(f"/api/admin/pagos/{pago['id']}/validar", {"nota": "ok"})
    r = c.post(f"/api/cuenta/pedidos/{p['id']}/cancelar", {"motivo": "Ya no lo necesito"})
    assert r.status_code == 200 and r.get_json()["estado"] == "cancelado"
    assert inventario(app, "TOL", sku).reservado == antes.reservado
    reemb = fin.get("/api/admin/reembolsos?estado=pendiente").get_json()["items"]
    assert reemb and reemb[0]["monto"] == p["total"]
    r = fin.post(f"/api/admin/reembolsos/{reemb[0]['id']}/realizar", {"referencia": "DEV-SPEI-77"})
    assert r.status_code == 200
    pagos = c.get(f"/api/cuenta/pedidos/{p['id']}").get_json()["pagos"]
    assert pagos[0]["estado"] == "reembolsado"
    assert fin.post(f"/api/admin/reembolsos/{reemb[0]['id']}/realizar", {"referencia": "DUPLICADO"}).status_code == 409


def test_ajustes_respetan_reservas(como, app):
    enc = como("enc_tol")
    c = como("cliente")
    sku = "GOR-001-AM-UNITALLA"
    fijar_existencia(app, "TOL", sku, 2)
    fijar_existencia(app, "QRO", sku, 0)
    fijar_existencia(app, "PUE", sku, 0)
    comprar_envio(c, app, [(sku, 2)])
    r = enc.post("/api/admin/inventario/ajustes", {"sucursal_id": sucursal_id(app, "TOL"), "variante_id": variante_id(app, sku),
                                                    "cantidad": 1, "tipo": "merma", "motivo": "Prenda manchada",
                                                    "clave_idempotencia": clave()})
    assert r.status_code == 409
    k = clave()
    cuerpo = {"sucursal_id": sucursal_id(app, "TOL"), "variante_id": variante_id(app, sku), "cantidad": 4,
              "motivo": "Compra a proveedor", "clave_idempotencia": k}
    alm = como("alm_tol")
    assert alm.post("/api/admin/inventario/entradas", cuerpo).status_code == 201
    assert alm.post("/api/admin/inventario/entradas", cuerpo).status_code == 201  # reintento: mismo movimiento
    assert inventario(app, "TOL", sku).fisico == 6
    assert conciliado(app)


def test_transferencia_completa_y_parcial(como, app):
    sku = "CHA-001-AN-G"
    fijar_existencia(app, "QRO", sku, 10)
    fijar_existencia(app, "PUE", sku, 0)
    enc_qro, alm_pue, enc_pue = como("enc_qro"), como("alm_pue"), como("enc_pue")
    t = enc_pue.post("/api/admin/transferencias", {"origen_id": sucursal_id(app, "QRO"), "destino_id": sucursal_id(app, "PUE"),
                                                   "motivo": "Reabasto por alta demanda",
                                                   "partidas": [{"variante_id": variante_id(app, sku), "cantidad": 6}]}).get_json()
    assert t["estado"] == "solicitada"
    assert enc_pue.post(f"/api/admin/transferencias/{t['id']}/autorizar").status_code == 404  # autoriza el origen
    assert enc_qro.post(f"/api/admin/transferencias/{t['id']}/autorizar").status_code == 200
    det = t["detalles"][0]["id"]
    r = enc_qro.post(f"/api/admin/transferencias/{t['id']}/enviar", {"cantidades": {str(det): 6}})
    assert r.status_code == 200
    assert inventario(app, "QRO", sku).fisico == 4 and inventario(app, "PUE", sku).en_transito == 6
    r = alm_pue.post(f"/api/admin/transferencias/{t['id']}/recibir", {"cantidades": {str(det): 5}, "observaciones": "Faltó una pieza"})
    assert r.status_code == 200 and r.get_json()["estado"] == "recibida_parcial"
    pue = inventario(app, "PUE", sku)
    assert pue.fisico == 5 and pue.en_transito == 0
    incs = como("admin").get("/api/admin/incidencias").get_json()["items"]
    assert any(i["tipo"] == "faltante_transferencia" for i in incs)
    assert alm_pue.post(f"/api/admin/transferencias/{t['id']}/recibir", {}).status_code == 409
    assert conciliado(app)
