"""Pedido corporativo: el aprobador aprueba (`aprobado`, inventario reservado 72 h) y solo la autorización de la
distribuidora —que cobra fuera del sistema— lo confirma y lo libera al surtido. Sin autorización, la reserva vence."""
from datetime import timedelta

from sqlalchemy import text, update

from app.extensions import db
from app.models import Pedido, ahora

from .flujos import almacen_de
from .test_aprobador import _solicitud, _var


def _aprobada(como):
    suc, aprob = como("empresa"), como("aprobador")
    var, empleados = _var(como), {e["nombre"]: e["id"] for e in suc.get("/api/cuenta/empleados").get_json()}
    p = _solicitud(suc, [{"empleado_id": empleados["Ana López"], "variante_id": var("MAN-001", "Unitalla"), "cantidad": 2}])
    r = aprob.post(f"/api/admin/pedidos/{p['id']}/decision", {"decision": "aprobado"})
    assert r.status_code == 200, r.get_json()
    return suc, r.get_json()


def _reservas(app, pedido_id):
    with app.app_context():
        return db.session.execute(text(
            "select r.estado, r.expira from reserva_inventario r join asignacion_detalle ad on ad.id = r.asignacion_detalle_id "
            "join asignacion_surtido a on a.id = ad.asignacion_id where a.pedido_id = :p"), {"p": pedido_id}).all()


def _avisos(api, folio):
    return {n["evento"] for n in api.get("/api/admin/notificaciones?por_pagina=50").get_json()["items"] if folio in n["mensaje"]}


def test_solo_la_autorizacion_de_la_distribuidora_libera_el_surtido(app, como):
    suc, pedido = _aprobada(como)
    assert pedido["estado"] == "aprobado" and pedido["pagos"] == []
    reservas = _reservas(app, pedido["id"])
    assert reservas and all(e == "activa" and timedelta(hours=71) < x - ahora() < timedelta(hours=73) for e, x in reservas)
    asig = pedido["asignaciones"][0]
    alm = almacen_de(como, asig["sucursal"]["nombre"])
    # Sin autorizar: el almacén no recibe el aviso de surtido, no la ve por atender y no puede iniciarla
    assert "asignacion_nueva" not in _avisos(alm, pedido["folio"])
    assert all(a["id"] != asig["id"] for a in alm.get("/api/admin/surtido").get_json()["items"])
    r = alm.post(f"/api/admin/surtido/{asig['id']}/iniciar")
    assert r.status_code == 409 and r.get_json()["error"]["codigo"] == "autorizacion_pendiente"
    # Solo quien tiene pedido.autorizar (admin) autoriza; ni el aprobador, ni finanzas, ni almacén
    for rol in ("aprobador", "finanzas", "atencion"):
        assert como(rol).post(f"/api/admin/pedidos/{pedido['id']}/autorizar", {}).status_code == 403
    assert alm.post(f"/api/admin/pedidos/{pedido['id']}/autorizar", {}).status_code == 403
    adm = como("admin")
    r = adm.post(f"/api/admin/pedidos/{pedido['id']}/autorizar", {"nota": "Transferencia SPEI recibida"})
    assert r.status_code == 200 and r.get_json()["estado"] == "confirmado"
    assert adm.post(f"/api/admin/pedidos/{pedido['id']}/autorizar", {}).status_code == 409  # no se duplica
    assert all(e == "activa" and x is None for e, x in _reservas(app, pedido["id"]))  # ya no vence
    # Ahora sí: aviso al almacén, la sucursal sabe que está confirmada y el surtido inicia
    assert "asignacion_nueva" in _avisos(alm, pedido["folio"])
    assert any(n["evento"] == "pedido_confirmado" for n in suc.get("/api/cuenta/notificaciones").get_json()["items"])
    assert alm.post(f"/api/admin/surtido/{asig['id']}/iniciar").status_code == 200


def test_sin_autorizacion_la_reserva_vence_y_libera_el_inventario(app, como):
    suc, pedido = _aprobada(como)
    with app.app_context():
        db.session.execute(update(Pedido).where(Pedido.id == pedido["id"]).values(reserva_expira=ahora() - timedelta(minutes=1)))
        db.session.commit()
    adm = como("admin")
    r = adm.post(f"/api/admin/pedidos/{pedido['id']}/autorizar", {})
    assert r.status_code == 409 and r.get_json()["error"]["codigo"] == "reserva_vencida"
    assert como("atencion").post("/api/admin/pedidos/expirar-reservas", {}).get_json()["expirados"] == 1
    assert adm.get(f"/api/admin/pedidos/{pedido['id']}").get_json()["estado"] == "expirado"
    assert all(e == "expirada" for e, _ in _reservas(app, pedido["id"]))
    assert any(n["evento"] == "pedido_expirado" for n in suc.get("/api/cuenta/notificaciones").get_json()["items"])
    assert "orden_expirada" in _avisos(adm, pedido["folio"])
    assert adm.post(f"/api/admin/pedidos/{pedido['id']}/autorizar", {}).status_code == 409
