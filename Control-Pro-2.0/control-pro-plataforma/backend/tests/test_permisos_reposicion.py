"""3B.4: la interfaz oculta el envío de la reposición a quien no tiene `surtido.operar`; el backend lo sigue rechazando.
Preparar la reposición sigue siendo de `incidencia.gestionar` (Atención la prepara; el almacén la envía)."""
from .test_recepcion_reposicion import _bata_m, _entregado


def test_atencion_prepara_pero_no_envia_ni_marca_entregada(como):
    emp, alm, a, paq = _entregado(como)
    bata_m = _bata_m(a)
    partidas = [{"pedido_detalle_id": d["pedido_detalle_id"], "recibida": 0 if d["id"] == bata_m["id"] else d["cantidad"],
                 "problema": "faltante" if d["id"] == bata_m["id"] else None} for d in a["detalles"]]
    det = emp.post(f"/api/cuenta/paquetes/{paq}/recepcion", {"completa": False, "partidas": partidas}).get_json()
    inc = next(i for i in det["incidencias"] if i["tipo"] == "diferencia_recepcion")
    aten = como("atencion")

    r = aten.post(f"/api/admin/incidencias/{inc['id']}/reposicion",
                  {"partidas": [{"pedido_detalle_id": bata_m["pedido_detalle_id"], "cantidad": 1}]})
    assert r.status_code == 201
    rep = r.get_json()["reposiciones"][0]

    assert aten.post(f"/api/admin/paquetes/{rep['id']}/despachar", {"paqueteria": "Estafeta", "guia": "REP-1"}).status_code == 403
    assert alm.post(f"/api/admin/paquetes/{rep['id']}/despachar", {"paqueteria": "Estafeta", "guia": "REP-1"}).status_code == 200
    entregado = {"estado": "entregado", "descripcion": "Reposición entregada en la sucursal"}
    assert aten.post(f"/api/admin/paquetes/{rep['id']}/eventos", entregado).status_code == 403
    assert alm.post(f"/api/admin/paquetes/{rep['id']}/eventos", entregado).status_code == 200
