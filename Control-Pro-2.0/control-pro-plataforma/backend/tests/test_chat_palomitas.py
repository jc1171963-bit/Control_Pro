"""Chat estilo mensajería: enviado (una palomita), entregado (dos grises), leído (dos azules) y "escribiendo…"."""
from .test_pulido import _pedido


def test_palomitas_y_escribiendo(como):
    emp, p = _pedido(como)
    aprob = como("aprobador")
    c = aprob.post("/api/admin/conversaciones", {"tipo": "sucursal", "pedido_id": p["id"], "cliente_id": None}).get_json()
    m = aprob.post(f"/api/admin/conversaciones/{c['id']}/mensajes", {"texto": "¿Confirmas la talla M?"}).get_json()
    assert m["propio"] and m["estado"] == "enviado"
    hilo = lambda: aprob.get(f"/api/admin/conversaciones/{c['id']}/mensajes").get_json()  # noqa: E731
    assert hilo()["items"][-1]["estado"] == "enviado"
    # La app de la sucursal está abierta (pulso de actividad): el mensaje queda entregado, aún sin leer
    a = emp.get("/api/actividad").get_json()
    assert a["mensajes"]["no_leidos"] == 1
    ultimo = hilo()["items"][-1]
    assert ultimo["estado"] == "entregado" and ultimo["entregado_en"] and ultimo["leido_en"] is None
    # El aprobador ve en su lista el último mensaje con sus palomitas
    lista = aprob.get("/api/admin/conversaciones").get_json()["items"]
    fila = next(x for x in lista if x["id"] == c["id"])
    assert fila["ultimo"] == {"texto": "¿Confirmas la talla M?", "propio": True, "autor": fila["ultimo"]["autor"], "estado": "entregado"}
    # La sucursal escribe: el aprobador lo ve; al enviar deja de "escribir"
    cid = emp.get("/api/cuenta/conversaciones").get_json()["items"][0]["id"]
    assert cid == c["id"]
    assert emp.post(f"/api/cuenta/conversaciones/{cid}/escribiendo").status_code == 200
    assert hilo()["conversacion"]["escribiendo"] is True
    # Al abrir la conversación la sucursal lo lee: dos palomitas azules con la hora de lectura
    vista = emp.get(f"/api/cuenta/conversaciones/{cid}/mensajes").get_json()
    assert vista["items"][-1]["propio"] is False and "estado" not in vista["items"][-1]
    leido = hilo()["items"][-1]
    assert leido["estado"] == "leido" and leido["leido_en"]
    r = emp.post(f"/api/cuenta/conversaciones/{cid}/mensajes", {"texto": "Sí, talla M."}).get_json()
    assert r["estado"] == "enviado"
    h = hilo()
    assert h["conversacion"]["escribiendo"] is False and h["items"][-1]["texto"] == "Sí, talla M."
    # Como el aprobador acaba de abrir el hilo, la respuesta de la sucursal ya cuenta como leída
    assert emp.get(f"/api/cuenta/conversaciones/{cid}/mensajes").get_json()["items"][-1]["estado"] == "leido"
