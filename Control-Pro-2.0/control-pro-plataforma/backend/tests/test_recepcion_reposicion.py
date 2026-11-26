"""Recepción con fotos por artículo, sin choque con la entrega a cada empleado, y reposición de la incidencia con su
propio paquete y guía de envío."""
from .test_empaque_por_persona import _de, _solicitud
from .test_flujos import FIRMA
from .test_pulido import _subir


def _entregado(como, bata_m=1):
    """Solicitud surtida en un solo paquete, despachada y entregada en la sucursal."""
    emp, alm, a = _solicitud(como, bata_m)
    aid = a["id"]
    alm.post(f"/api/admin/surtido/{aid}/registrar",
             {"partidas": [{"asignacion_detalle_id": d["id"], "surtida": d["cantidad"]} for d in a["detalles"]]})
    r = alm.post(f"/api/admin/surtido/{aid}/paquetes",
                 {"partidas": [{"asignacion_detalle_id": d["id"], "cantidad": d["cantidad"]} for d in a["detalles"]]})
    paq = r.get_json()["paquetes"][0]["id"]
    assert alm.post(f"/api/admin/paquetes/{paq}/despachar", {"paqueteria": "Local", "guia": f"ORI-{paq}"}).status_code == 200
    assert alm.post(f"/api/admin/paquetes/{paq}/eventos", {"estado": "entregado", "descripcion": "Recibió compras"}).status_code == 200
    return emp, alm, a, paq


def _bata_m(a):
    return next(d for d in _de(a, "Rosario Ramírez") if d["talla"] == "M")


def test_recepcion_con_foto_y_reposicion_con_guia(como):
    emp, alm, a, paq = _entregado(como)
    pedido_id = a["pedido_id"]
    bata_m = _bata_m(a)
    foto = _subir(emp)
    partidas = [{"pedido_detalle_id": d["pedido_detalle_id"], "recibida": d["cantidad"]} for d in a["detalles"]
                if d["id"] != bata_m["id"]]

    # Con problema, «en buen estado» debe ser menor a lo esperado (si no, la entrega pediría una pieza que no sirve)
    r = emp.post(f"/api/cuenta/paquetes/{paq}/recepcion", {"completa": False, "partidas": partidas + [
        {"pedido_detalle_id": bata_m["pedido_detalle_id"], "recibida": 1, "problema": "danado"}]})
    assert r.status_code == 400 and r.get_json()["error"]["codigo"] == "recibida_con_problema"

    # La bata M de Rosario llegó rota: se reporta con su foto
    r = emp.post(f"/api/cuenta/paquetes/{paq}/recepcion", {"completa": False, "partidas": partidas + [
        {"pedido_detalle_id": bata_m["pedido_detalle_id"], "recibida": 0, "problema": "danado", "nota": "Manga rota",
         "evidencias": [foto]}]})
    assert r.status_code == 201, r.get_json()
    det = r.get_json()
    rec = next(pq for pq in det["paquetes"] if pq["id"] == paq)["recepcion"]
    assert next(x for x in rec["detalles"] if x["pedido_detalle_id"] == bata_m["pedido_detalle_id"])["evidencias"] == [foto]
    inc = next(i for i in det["incidencias"] if i["tipo"] == "diferencia_recepcion")
    assert inc["evidencias"] == [foto] and "Manga rota" in inc["descripcion"]

    # Sin choque: la entrega de Rosario ya solo pide la bata G (la M llega en la reposición)
    rosario = next(e for e in det["entregas_individuales"] if e["empleado"]["nombre"] == "Rosario Ramírez")
    assert [d["pedido_detalle_id"] for d in rosario["detalles"]] != [] and all(
        d["pedido_detalle_id"] != bata_m["pedido_detalle_id"] for d in rosario["detalles"])
    r = emp.post(f"/api/cuenta/entregas/{rosario['id']}", {"firma": FIRMA, "registrado_por": "Laura Compras"})
    assert r.status_code == 200 and r.get_json()["estado"] == "entregada"
    det = emp.get(f"/api/cuenta/pedidos/{pedido_id}").get_json()
    assert [i["tipo"] for i in det["incidencias"]] == ["diferencia_recepcion"]  # no se duplicó por la entrega

    # La distribuidora prepara la reposición sugerida y la envía con su propia guía
    admin = como("admin")
    vista = next(i for i in admin.get("/api/admin/incidencias").get_json()["items"] if i["id"] == inc["id"])
    assert vista["reposicion_sugerida"] == [{"pedido_detalle_id": bata_m["pedido_detalle_id"], "cantidad": 1}]
    r = admin.post(f"/api/admin/incidencias/{inc['id']}/reposicion", {"partidas": vista["reposicion_sugerida"]})
    assert r.status_code == 201, r.get_json()
    inc = r.get_json()
    assert inc["estado"] == "en_atencion" and len(inc["reposiciones"]) == 1
    rep = inc["reposiciones"][0]
    assert rep["estado"] == "preparado" and rep["reposicion"]["folio"] == inc["folio"]
    assert [g["empleado"]["nombre"] for g in rep["individuales"]] == ["Rosario Ramírez"]
    # El surtido original no cambia por la reposición
    asig = alm.get(f"/api/admin/surtido/{a['id']}").get_json()
    assert all(d["despachada"] == d["cantidad"] for d in asig["detalles"])
    # Una reposición no acepta piezas del empaque normal
    assert alm.post(f"/api/admin/surtido/{a['id']}/paquetes/{rep['id']}/agregar",
                    {"partidas": [{"asignacion_detalle_id": bata_m["id"], "cantidad": 1}]}).status_code == 409

    assert alm.post(f"/api/admin/paquetes/{rep['id']}/despachar", {"paqueteria": "Estafeta", "guia": "REP-0001"}).status_code == 200
    assert alm.post(f"/api/admin/paquetes/{rep['id']}/eventos", {"estado": "entregado", "descripcion": "Recibió compras"}).status_code == 200

    # La sucursal ve la reposición en su solicitud, con su guía, y recibe a Rosario su bata M
    det = emp.get(f"/api/cuenta/pedidos/{pedido_id}").get_json()
    vista = next(pq for pq in det["paquetes"] if pq["id"] == rep["id"])
    assert vista["reposicion"]["folio"] == inc["folio"] and vista["envio"]["guia"] == "REP-0001"
    inc_suc = next(i for i in det["incidencias"] if i["id"] == inc["id"])
    assert inc_suc["reposiciones"][0]["envio"]["guia"] == "REP-0001"
    assert any("REP-0001" in (s["comentario"] or "") for s in inc_suc["seguimiento"])
    r = emp.post(f"/api/cuenta/paquetes/{rep['id']}/recepcion", {"completa": True})
    assert r.status_code == 201, r.get_json()
    det = r.get_json()
    inc_suc = next(i for i in det["incidencias"] if i["id"] == inc["id"])
    assert inc_suc["estado"] == "resuelta" and rep["folio"] in inc_suc["resolucion"]
    nueva = next(e for e in det["entregas_individuales"] if e["paquete_id"] == rep["id"])
    assert nueva["empleado"]["nombre"] == "Rosario Ramírez" and nueva["detalles"][0]["esperada"] == 1
    assert emp.post(f"/api/cuenta/entregas/{nueva['id']}", {"firma": FIRMA, "registrado_por": "Laura Compras"}).status_code == 200
    assert emp.post(f"/api/cuenta/incidencias/{inc['id']}/confirmar").status_code == 200


def test_reposicion_preparada_se_puede_cancelar(como):
    emp, alm, a, paq = _entregado(como)
    bata_m = _bata_m(a)
    partidas = [{"pedido_detalle_id": d["pedido_detalle_id"], "recibida": 0 if d["id"] == bata_m["id"] else d["cantidad"],
                 "problema": "faltante" if d["id"] == bata_m["id"] else None} for d in a["detalles"]]
    det = emp.post(f"/api/cuenta/paquetes/{paq}/recepcion", {"completa": False, "partidas": partidas}).get_json()
    inc = next(i for i in det["incidencias"] if i["tipo"] == "diferencia_recepcion")
    admin = como("admin")
    # No se repone más de lo pedido ni artículos de otra solicitud
    assert admin.post(f"/api/admin/incidencias/{inc['id']}/reposicion",
                      {"partidas": [{"pedido_detalle_id": bata_m["pedido_detalle_id"], "cantidad": 9}]}).status_code == 400
    assert admin.post(f"/api/admin/incidencias/{inc['id']}/reposicion",
                      {"partidas": [{"pedido_detalle_id": 999999, "cantidad": 1}]}).status_code == 404
    rep = admin.post(f"/api/admin/incidencias/{inc['id']}/reposicion",
                     {"partidas": [{"pedido_detalle_id": bata_m["pedido_detalle_id"], "cantidad": 1}]}).get_json()["reposiciones"][0]
    r = admin.post(f"/api/admin/paquetes/{rep['id']}/cancelar-reposicion")
    assert r.status_code == 200 and r.get_json()["reposiciones"][0]["estado"] == "cancelado"
    # Se puede volver a preparar
    assert admin.post(f"/api/admin/incidencias/{inc['id']}/reposicion",
                      {"partidas": [{"pedido_detalle_id": bata_m["pedido_detalle_id"], "cantidad": 1}]}).status_code == 201
