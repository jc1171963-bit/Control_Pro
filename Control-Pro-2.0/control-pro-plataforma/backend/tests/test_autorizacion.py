"""Pedido corporativo: el aprobador aprueba (`aprobado`, sin apartar inventario; corre el plazo de 72 h) y solo la
autorización de la distribuidora —que cobra fuera del sistema— aparta lo disponible, deja el resto pendiente de
producción y lo libera al surtido. Sin autorización dentro del plazo, la solicitud vence."""
from datetime import timedelta

from sqlalchemy import select, text, update

from app.extensions import db
from app.models import Inventario, MovimientoInventario, Pedido, ahora

from .flujos import almacen_de, resolver_pago
from .test_aprobador import _solicitud, _var


def _aprobada(como, cantidad=2, sku=("MAN-001", "Unitalla")):
    suc, aprob = como("empresa"), como("aprobador")
    var, empleados = _var(como), {e["nombre"]: e["id"] for e in suc.get("/api/cuenta/empleados").get_json()}
    p = _solicitud(suc, [{"empleado_id": empleados["Ana López"], "variante_id": var(*sku), "cantidad": cantidad}])
    r = aprob.post(f"/api/admin/pedidos/{p['id']}/decision", {"decision": "aprobado"})
    assert r.status_code == 200, r.get_json()
    return suc, r.get_json()


def _reservas(app, pedido_id):
    with app.app_context():
        return db.session.execute(text(
            "select r.estado, r.expira from reserva_inventario r join asignacion_detalle ad on ad.id = r.asignacion_detalle_id "
            "join asignacion_surtido a on a.id = ad.asignacion_id where a.pedido_id = :p"), {"p": pedido_id}).all()


def _disponibles(app, variante_id, n):
    """Deja exactamente `n` unidades disponibles de la variante en todo el inventario (n en la primera fila, 0 en el resto)."""
    with app.app_context():
        filas = db.session.scalars(select(Inventario).where(Inventario.variante_id == variante_id)
                                   .order_by(Inventario.sucursal_id)).all()
        for i, inv in enumerate(filas):
            inv.fisico = inv.reservado + inv.comprometido + (n if i == 0 else 0)
        db.session.commit()


def _inventario(app, variante_id):
    with app.app_context():
        filas = db.session.scalars(select(Inventario).where(Inventario.variante_id == variante_id)).all()
        return [(i.fisico, i.reservado, i.comprometido) for i in filas]


def _avisos(api, folio):
    return {n["evento"] for n in api.get("/api/admin/notificaciones?por_pagina=50").get_json()["items"] if folio in n["mensaje"]}


def test_solo_la_autorizacion_de_la_distribuidora_aparta_y_libera_el_surtido(app, como):
    suc, pedido = _aprobada(como)
    assert pedido["estado"] == "aprobado" and pedido["pagos"] == []
    # Aprobar no aparta inventario; solo corre el plazo para autorizar
    assert pedido["asignaciones"] == [] and _reservas(app, pedido["id"]) == []
    with app.app_context():
        expira = db.session.get(Pedido, pedido["id"]).reserva_expira
    assert timedelta(hours=71) < expira - ahora() < timedelta(hours=73)
    # Solo quien tiene pedido.autorizar (admin) autoriza; ni el aprobador, ni finanzas, ni atención
    for rol in ("aprobador", "finanzas", "atencion"):
        assert como(rol).post(f"/api/admin/pedidos/{pedido['id']}/autorizar", {}).status_code == 403
    adm = como("admin")
    r = adm.post(f"/api/admin/pedidos/{pedido['id']}/autorizar", {})
    assert r.status_code == 409 and r.get_json()["error"]["codigo"] == "pago_no_resuelto"
    resolver_pago(adm, pedido)
    r = adm.post(f"/api/admin/pedidos/{pedido['id']}/autorizar", {"nota": "Transferencia SPEI recibida"})
    assert r.status_code == 200 and r.get_json()["estado"] == "confirmado"
    autorizado = r.get_json()
    assert autorizado["por_producir"] == 0 and autorizado["asignaciones"]
    assert adm.post(f"/api/admin/pedidos/{pedido['id']}/autorizar", {}).status_code == 409  # no se duplica
    assert _reservas(app, pedido["id"]) and all(e == "activa" and x is None for e, x in _reservas(app, pedido["id"]))
    # Ahora sí: aviso al almacén, la sucursal sabe que está confirmada y el surtido inicia
    asig = autorizado["asignaciones"][0]
    alm = almacen_de(como, asig["sucursal"]["nombre"])
    assert "asignacion_nueva" in _avisos(alm, pedido["folio"])
    assert any(n["evento"] == "pedido_confirmado" for n in suc.get("/api/cuenta/notificaciones").get_json()["items"])
    assert como("aprobador").post(f"/api/admin/surtido/{asig['id']}/iniciar").status_code == 403
    assert alm.post(f"/api/admin/surtido/{asig['id']}/iniciar").status_code == 200


def test_sin_autorizacion_el_plazo_vence(app, como):
    suc, pedido = _aprobada(como)
    with app.app_context():
        db.session.execute(update(Pedido).where(Pedido.id == pedido["id"]).values(reserva_expira=ahora() - timedelta(minutes=1)))
        db.session.commit()
    adm = como("admin")
    r = adm.post(f"/api/admin/pedidos/{pedido['id']}/autorizar", {})
    assert r.status_code == 409 and r.get_json()["error"]["codigo"] == "reserva_vencida"
    assert como("atencion").post("/api/admin/pedidos/expirar-reservas", {}).get_json()["expirados"] == 1
    assert adm.get(f"/api/admin/pedidos/{pedido['id']}").get_json()["estado"] == "expirado"
    assert _reservas(app, pedido["id"]) == []
    assert any(n["evento"] == "pedido_expirado" for n in suc.get("/api/cuenta/notificaciones").get_json()["items"])
    assert "orden_expirada" in _avisos(adm, pedido["folio"])
    assert adm.post(f"/api/admin/pedidos/{pedido['id']}/autorizar", {}).status_code == 409


def test_sin_existencias_suficientes_aparta_lo_disponible_y_el_resto_queda_por_producir(app, como):
    suc, pedido = _aprobada(como, cantidad=5)
    vid = pedido["detalles"][0]["variante_id"]
    _disponibles(app, vid, 3)  # pide 5, hay 3
    with app.app_context():
        mermas = db.session.scalar(select(db.func.count()).select_from(MovimientoInventario).where(MovimientoInventario.tipo == "merma"))
    resolver_pago(como("admin"), pedido)
    r = como("admin").post(f"/api/admin/pedidos/{pedido['id']}/autorizar", {})
    assert r.status_code == 200, r.get_json()
    p = r.get_json()
    assert p["estado"] == "confirmado" and p["por_producir"] == 2 and p["detalles"][0]["cantidad_por_producir"] == 2
    assert sum(d["cantidad"] for a in p["asignaciones"] for d in a["detalles"]) == 3
    assert all(f >= r_ + c for f, r_, c in _inventario(app, vid))  # nunca más reservado que existencias
    assert sum(r_ for _, r_, _ in _inventario(app, vid)) == 3
    with app.app_context():  # lo pendiente no genera mermas ni salidas
        assert db.session.scalar(select(db.func.count()).select_from(MovimientoInventario)
                                 .where(MovimientoInventario.tipo == "merma")) == mermas
    assert "Pendiente de producción: 2" in p["historial"][-1]["motivo"]
    # La sucursal no ve lo pendiente de producción (sin decisión de visibilidad)
    assert "por_producir" not in suc.get(f"/api/cuenta/pedidos/{p['id']}").get_json()


def test_sin_ninguna_existencia_se_autoriza_completo_y_al_cancelar_se_anula_lo_pendiente(app, como):
    suc, pedido = _aprobada(como, cantidad=4)
    vid = pedido["detalles"][0]["variante_id"]
    _disponibles(app, vid, 0)
    adm = como("admin")
    resolver_pago(adm, pedido)
    r = adm.post(f"/api/admin/pedidos/{pedido['id']}/autorizar", {})
    assert r.status_code == 200, r.get_json()
    p = r.get_json()
    assert p["estado"] == "confirmado" and p["por_producir"] == 4 and p["asignaciones"] == []
    r = adm.post(f"/api/admin/pedidos/{p['id']}/cancelar", {"motivo": "La sucursal ya no lo necesita"})
    assert r.status_code == 200 and r.get_json()["estado"] == "cancelado"
    assert r.get_json()["por_producir"] == 0 and r.get_json()["detalles"][0]["cantidad_cancelada"] == 4
