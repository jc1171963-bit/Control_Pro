"""Empaque por persona: el paquete grande lleva un paquete individual por empleado y las piezas de una persona nunca se
reparten entre dos paquetes grandes."""
from .conftest import clave
from .flujos import almacen_de, autorizar


def _catalogo(como):
    prod = {p["sku_base"]: p for p in como("admin").get("/api/admin/productos?por_pagina=100").get_json()["items"]}
    return lambda sku_base, talla: next(v["id"] for v in prod[sku_base]["variantes"] if v["talla"] == talla)


def _solicitud(como):
    """Rosario: 2 batas (dos tallas = dos partidas); Carlos: 1 camisa."""
    emp, aprob = como("empresa"), como("aprobador")
    var = _catalogo(como)
    empleados = {e["nombre"]: e["id"] for e in emp.get("/api/cuenta/empleados").get_json()}
    dir_emp = emp.get("/api/cuenta/direcciones").get_json()[0]["id"]
    partidas = [{"empleado_id": empleados["Rosario Ramírez"], "variante_id": var("BAT-003", "M"), "cantidad": 1},
                {"empleado_id": empleados["Rosario Ramírez"], "variante_id": var("BAT-003", "G"), "cantidad": 1},
                {"empleado_id": empleados["Carlos Mendoza"], "variante_id": var("CAM-003", "G"), "cantidad": 1}]
    r = emp.post("/api/cuenta/pedidos-corporativos", {"modalidad": "envio", "direccion_id": dir_emp, "partidas": partidas,
                                                      "clave_idempotencia": clave()})
    assert r.status_code == 201, r.get_json()
    pedido = aprob.post(f"/api/admin/pedidos/{r.get_json()['id']}/decision", {"decision": "aprobado"}).get_json()
    pedido = autorizar(como("admin"), pedido)
    asig = next(a for a in pedido["asignaciones"]
                if sum(1 for d in a["detalles"] if d["empleado"] == "Rosario Ramírez") == 2)
    alm = almacen_de(como, asig["sucursal"]["nombre"])
    a = alm.post(f"/api/admin/surtido/{asig['id']}/iniciar").get_json()
    return emp, alm, a


def _de(a, nombre):
    return [d for d in a["detalles"] if d["empleado"] == nombre]


def test_no_se_divide_a_una_persona_y_se_agrupa_por_nombre(como):
    emp, alm, a = _solicitud(como)
    aid = a["id"]
    partidas = [{"asignacion_detalle_id": d["id"], "surtida": d["cantidad"]} for d in a["detalles"]]
    assert alm.post(f"/api/admin/surtido/{aid}/registrar", {"partidas": partidas}).status_code == 200
    rosario = _de(a, "Rosario Ramírez")

    # Solo una de las dos batas de Rosario: se rechaza y el mensaje dice qué falta agregar
    r = alm.post(f"/api/admin/surtido/{aid}/paquetes", {"partidas": [{"asignacion_detalle_id": rosario[0]["id"], "cantidad": 1}]})
    assert r.status_code == 409 and r.get_json()["error"]["codigo"] == "persona_dividida"
    assert "Rosario Ramírez" in r.get_json()["error"]["mensaje"]
    assert alm.get(f"/api/admin/surtido/{aid}").get_json()["paquetes"] == []  # nada quedó a medias

    # Todo junto: un paquete grande con un paquete individual por persona, ordenados por nombre
    r = alm.post(f"/api/admin/surtido/{aid}/paquetes",
                 {"partidas": [{"asignacion_detalle_id": d["id"], "cantidad": d["cantidad"]} for d in a["detalles"]]})
    assert r.status_code == 201, r.get_json()
    paq = r.get_json()["paquetes"][0]
    nombres = [g["empleado"]["nombre"] for g in paq["individuales"]]
    assert nombres == sorted(nombres) and set(nombres) == {"Carlos Mendoza", "Rosario Ramírez"}
    ind_rosario = next(g for g in paq["individuales"] if g["empleado"]["nombre"] == "Rosario Ramírez")
    assert ind_rosario["total_piezas"] == 2 and len(ind_rosario["piezas"]) == 2 and ind_rosario["empleado"]["puesto"]
    assert all(p["empleado_id"] == ind_rosario["empleado"]["id"] for p in ind_rosario["piezas"])

    # La sucursal ve la misma agrupación en su solicitud
    det = emp.get(f"/api/cuenta/pedidos/{a['pedido_id']}").get_json()
    vista = next(pq for pq in det["paquetes"] if pq["id"] == paq["id"])
    assert [g["empleado"]["nombre"] for g in vista["individuales"]] == nombres


def test_lo_surtido_despues_se_agrega_al_paquete_que_aun_no_sale(como):
    emp, alm, a = _solicitud(como)
    aid = a["id"]
    rosario, carlos = _de(a, "Rosario Ramírez"), _de(a, "Carlos Mendoza")
    # La segunda bata de Rosario aún no se surte (p. ej. pendiente de producción)
    partidas = [{"asignacion_detalle_id": d["id"], "surtida": 0 if d["id"] == rosario[1]["id"] else d["cantidad"]} for d in a["detalles"]]
    assert alm.post(f"/api/admin/surtido/{aid}/registrar", {"partidas": partidas}).status_code == 200
    # La regla aplica a lo ya surtido: Rosario puede ir con la bata disponible
    r = alm.post(f"/api/admin/surtido/{aid}/paquetes", {"partidas": [
        {"asignacion_detalle_id": rosario[0]["id"], "cantidad": 1}, {"asignacion_detalle_id": carlos[0]["id"], "cantidad": 1}]})
    assert r.status_code == 201, r.get_json()
    paq_id = r.get_json()["paquetes"][0]["id"]

    # Llega la segunda bata: no puede abrir otro paquete grande mientras el primero no sale
    partidas = [{"asignacion_detalle_id": rosario[1]["id"], "surtida": 1}]
    assert alm.post(f"/api/admin/surtido/{aid}/registrar", {"partidas": partidas}).status_code == 200
    r = alm.post(f"/api/admin/surtido/{aid}/paquetes", {"partidas": [{"asignacion_detalle_id": rosario[1]["id"], "cantidad": 1}]})
    assert r.status_code == 409 and r.get_json()["error"]["codigo"] == "persona_en_otro_paquete"

    # Se agrega a su paquete individual dentro del mismo paquete grande
    r = alm.post(f"/api/admin/surtido/{aid}/paquetes/{paq_id}/agregar",
                 {"partidas": [{"asignacion_detalle_id": rosario[1]["id"], "cantidad": 1}]})
    assert r.status_code == 200, r.get_json()
    paq = next(p for p in r.get_json()["paquetes"] if p["id"] == paq_id)
    assert len(r.get_json()["paquetes"]) == 1
    ind = next(g for g in paq["individuales"] if g["empleado"]["nombre"] == "Rosario Ramírez")
    assert ind["total_piezas"] == 2

    # Un paquete que ya salió no acepta más piezas
    assert alm.post(f"/api/admin/paquetes/{paq_id}/despachar", {"paqueteria": "Local", "guia": f"EMP-{paq_id}"}).status_code == 200
    r = alm.post(f"/api/admin/surtido/{aid}/paquetes/{paq_id}/agregar",
                 {"partidas": [{"asignacion_detalle_id": rosario[1]["id"], "cantidad": 1}]})
    assert r.status_code == 409


def test_piezas_sin_empleado_van_al_final(app):
    from app.api.serial import individuales
    base = {"sku": "X", "talla": "M", "color": None, "cantidad": 1}
    contenido = [{**base, "pedido_detalle_id": 1, "nombre": "Polo", "empleado": None, "empleado_id": None, "puesto": None},
                 {**base, "pedido_detalle_id": 2, "nombre": "Bata", "empleado": "Zoila Ruiz", "empleado_id": 7, "puesto": "Enfermera"},
                 {**base, "pedido_detalle_id": 3, "nombre": "Botas", "empleado": "Ana López", "empleado_id": 3, "puesto": "Recepción", "cantidad": 2},
                 {**base, "pedido_detalle_id": 4, "nombre": "Blusa", "empleado": "Ana López", "empleado_id": 3, "puesto": "Recepción"}]
    g = individuales(contenido)
    assert [x["empleado"]["nombre"] if x["empleado"] else None for x in g] == ["Ana López", "Zoila Ruiz", None]
    assert g[0]["total_piezas"] == 3 and [p["nombre"] for p in g[0]["piezas"]] == ["Blusa", "Botas"]
