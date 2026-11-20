"""Negociación de una solicitud aprobada: la comercializadora propone (versiones), el Gerente de compras acepta la última;
el precio negociado es solo del pedido. Acuerdo de pago y «pago resuelto» (acuerdo definitivo) antes de autorizar."""
from decimal import Decimal

from app.extensions import db
from app.models import Variante

from .flujos import resolver_pago
from .test_aprobador import _solicitud, _var
from .test_autorizacion import _aprobada
from .test_pulido import _subir


def _proponer(api, pedido, partidas, version_vista=None, nota="Ajuste acordado con el Gerente"):
    return api.post(f"/api/admin/pedidos/{pedido['id']}/propuestas", {"partidas": partidas, "nota": nota, "version_vista": version_vista})


def _partida(det, **cambios):
    return {"pedido_detalle_id": det["id"], "empleado_id": det["empleado"]["id"], "variante_id": det["variante_id"],
            "cantidad": det["cantidad"], **cambios}


def test_propuestas_versionadas_precio_solo_del_pedido_y_aceptacion_de_la_ultima(app, como):
    suc, pedido = _aprobada(como)
    adm, aprob = como("admin"), como("aprobador")
    det = pedido["detalles"][0]
    assert det["precio_unitario"] == "180.00" and pedido["total"] == "360.00"
    # Solo la comercializadora propone
    for api in (aprob, como("finanzas")):
        assert _proponer(api, pedido, [_partida(det, precio_unitario="160.00")]).status_code == 403
    r = _proponer(adm, pedido, [_partida(det, precio_unitario="160.00")])
    assert r.status_code == 201, r.get_json()
    p = r.get_json()
    pend = p["negociacion"]["pendiente"]
    fila = pend["comparacion"]["filas"][0]
    assert fila["cambio"] == "modificada" and fila["antes"]["precio_unitario"] == "180.00" and fila["despues"]["precio_unitario"] == "160.00"
    assert pend["comparacion"]["diferencia"]["total"] == "-40.00"
    # Pendiente no toca lo vigente
    assert p["detalles"][0]["precio_unitario"] == "180.00" and p["total"] == "360.00"
    # Otra edición sobre una versión vieja se rechaza; la modificación crea la versión 2 (precio mayor al de catálogo)
    assert _proponer(adm, pedido, [_partida(det, cantidad=3)]).get_json()["error"]["codigo"] == "version_obsoleta"
    assert _proponer(adm, pedido, [_partida(det, precio_unitario="160.00")], version_vista=1).status_code == 400  # sin cambios
    r = _proponer(adm, pedido, [_partida(det, cantidad=3, precio_unitario="200.00")], version_vista=1)
    assert r.status_code == 201, r.get_json()
    pend = r.get_json()["negociacion"]["pendiente"]
    assert [v["numero"] for v in pend["versiones"]] == [1, 2]
    # Solo la última versión se acepta; autorizar con la propuesta pendiente no procede
    v1, v2 = (v["id"] for v in pend["versiones"])
    r = aprob.post(f"/api/admin/pedidos/{pedido['id']}/propuestas/aceptar", {"version_id": v1})
    assert r.status_code == 409 and r.get_json()["error"]["codigo"] == "version_obsoleta"
    r = adm.post(f"/api/admin/pedidos/{pedido['id']}/autorizar", {})
    assert r.status_code == 409 and r.get_json()["error"]["codigo"] == "propuesta_pendiente"
    r = aprob.post(f"/api/admin/pedidos/{pedido['id']}/propuestas/aceptar", {"version_id": v2})
    assert r.status_code == 200, r.get_json()
    p = r.get_json()
    assert p["detalles"][0]["id"] == det["id"]  # la partida se actualiza en su lugar
    assert p["detalles"][0]["precio_unitario"] == "200.00" and p["detalles"][0]["cantidad"] == 3 and p["total"] == "600.00"
    assert p["negociacion"]["pendiente"] is None and p["negociacion"]["propuestas"][0]["estado"] == "aceptada"
    # El catálogo no cambia y otra solicitud toma el precio de catálogo
    with app.app_context():
        assert db.session.get(Variante, det["variante_id"]).precio_base == Decimal("180.00")
    otra = _solicitud(suc, [{"empleado_id": det["empleado"]["id"], "variante_id": det["variante_id"], "cantidad": 1}])
    assert adm.get(f"/api/admin/pedidos/{otra['id']}").get_json()["detalles"][0]["precio_unitario"] == "180.00"
    # Una propuesta nueva después de aceptar; el administrador también puede aceptarla
    r = _proponer(adm, pedido, [_partida(p["detalles"][0], cantidad=4)])
    assert r.status_code == 201
    pend = r.get_json()["negociacion"]["pendiente"]
    assert pend["numero"] == 2 and pend["comparacion"]["antes"]["total"] == "600.00"
    assert adm.post(f"/api/admin/pedidos/{pedido['id']}/propuestas/aceptar",
                    {"version_id": pend["versiones"][-1]["id"]}).get_json()["total"] == "800.00"
    # La sucursal no ve la negociación ni los precios negociados en su vista
    assert "negociacion" not in suc.get(f"/api/cuenta/pedidos/{pedido['id']}").get_json()


def test_acuerdo_de_pago_y_pago_resuelto_condicionan_la_autorizacion(como):
    _, pedido = _aprobada(como)
    adm, aprob = como("admin"), como("aprobador")
    url = f"/api/admin/pedidos/{pedido['id']}"
    acuerdo = {"forma": "Transferencia", "condiciones": "50% al autorizar, 50% a la entrega", "fecha_pago": "2026-12-01"}
    assert aprob.post(f"{url}/acuerdo-pago", acuerdo).status_code == 403
    r = adm.post(f"{url}/acuerdo-pago", acuerdo)
    assert r.status_code == 201
    a1 = r.get_json()["negociacion"]["acuerdo_vigente_id"]
    assert aprob.post(f"{url}/pago-resuelto", {"acuerdo_id": a1}).status_code == 403  # solo la comercializadora
    assert adm.post(f"{url}/pago-resuelto", {"acuerdo_id": a1 + 999}).status_code == 409
    assert adm.post(f"{url}/pago-resuelto", {"acuerdo_id": a1}).get_json()["negociacion"]["pago_resuelto"]["vigente"]
    # Si el acuerdo cambia, el pago deja de estar resuelto
    r = adm.post(f"{url}/acuerdo-pago", {**acuerdo, "fecha_pago": "2026-12-10"})
    assert r.get_json()["negociacion"]["pago_resuelto"]["vigente"] is False
    assert adm.post(f"{url}/autorizar", {}).get_json()["error"]["codigo"] == "pago_no_resuelto"
    # El Gerente consulta el historial de acuerdos
    assert len(aprob.get(url).get_json()["negociacion"]["acuerdos"]) == 2
    # Si se aceptan nuevas condiciones, también hay que volver a resolverlo
    adm.post(f"{url}/pago-resuelto", {"acuerdo_id": r.get_json()["negociacion"]["acuerdo_vigente_id"]})
    det = pedido["detalles"][0]
    v = _proponer(adm, pedido, [_partida(det, descuento_unitario="20.00")]).get_json()["negociacion"]["pendiente"]["versiones"][-1]
    p = aprob.post(f"{url}/propuestas/aceptar", {"version_id": v["id"]}).get_json()
    assert p["total"] == "320.00" and p["negociacion"]["pago_resuelto"]["vigente"] is False
    assert adm.post(f"{url}/autorizar", {}).get_json()["error"]["codigo"] == "pago_no_resuelto"
    resolver_pago(adm, pedido)
    assert adm.post(f"{url}/autorizar", {}).get_json()["estado"] == "confirmado"
    # Autorizado: ya no se negocia ni cambia el acuerdo
    assert adm.post(f"{url}/acuerdo-pago", acuerdo).status_code == 409
    assert _proponer(adm, pedido, [_partida(det, cantidad=5)]).status_code == 409


def test_documentos_de_pago_son_internos_y_no_se_borran(como):
    suc, pedido = _aprobada(como)
    adm, aprob = como("admin"), como("aprobador")
    url = _subir(adm, nombre="transferencia.png")
    r = adm.post(f"/api/admin/pedidos/{pedido['id']}/documentos", {"nombre": "Comprobante de anticipo", "tipo": "pago", "url": url})
    assert r.status_code == 201, r.get_json()
    doc = r.get_json()
    # El Gerente lo consulta; la sucursal no lo ve ni lo descarga
    assert any(d["id"] == doc["id"] for d in aprob.get(f"/api/admin/pedidos/{pedido['id']}/expediente").get_json()["documentos"])
    assert aprob.get(url).status_code == 200
    assert all(d["id"] != doc["id"] for d in suc.get(f"/api/cuenta/pedidos/{pedido['id']}/expediente").get_json()["documentos"])
    assert suc.get(url).status_code == 404
    # Solo la comercializadora adjunta documentos de pago, y se conservan
    url2 = _subir(aprob, nombre="otro.png")
    assert aprob.post(f"/api/admin/pedidos/{pedido['id']}/documentos", {"nombre": "Pago", "tipo": "pago", "url": url2}).status_code == 403
    url3 = _subir(suc, nombre="mio.png")
    assert suc.post(f"/api/cuenta/pedidos/{pedido['id']}/documentos", {"nombre": "Pago", "tipo": "pago", "url": url3}).status_code == 403
    assert adm.delete(f"/api/admin/pedidos/{pedido['id']}/documentos/{doc['id']}").status_code == 403


def test_partida_con_incidencia_y_cancelacion_con_propuesta_pendiente(como):
    suc, pedido = _aprobada(como)
    adm = como("admin")
    det = pedido["detalles"][0]
    r = suc.post(f"/api/cuenta/pedidos/{pedido['id']}/incidencias",
                 {"tipo": "seguimiento", "descripcion": "Duda sobre la talla de esta prenda", "pedido_detalle_id": det["id"]})
    assert r.status_code == 201, r.get_json()
    otra = _var(como)("PIN-001", "Unitalla")
    r = _proponer(adm, pedido, [_partida(det, variante_id=otra)])
    assert r.status_code == 409 and r.get_json()["error"]["codigo"] == "partida_con_incidencia"
    assert _proponer(adm, pedido, [_partida(det, cantidad=1)]).status_code == 201  # la cantidad sí se puede cambiar
    r = adm.post(f"/api/admin/pedidos/{pedido['id']}/cancelar", {"motivo": "La sucursal ya no lo requiere"})
    assert r.status_code == 200
    prop = r.get_json()["negociacion"]["propuestas"][0]
    assert prop["estado"] == "descartada" and prop["motivo_descarte"] == "Pedido cancelado"
