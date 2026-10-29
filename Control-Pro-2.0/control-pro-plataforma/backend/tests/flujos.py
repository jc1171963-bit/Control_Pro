"""Pasos reutilizables de los flujos de negocio para las pruebas."""
from .conftest import clave, direccion_cliente, sucursal_id, variante_id


def agregar(api, app, sku, cantidad=1):
    r = api.post("/api/cuenta/carrito/items", {"variante_id": variante_id(app, sku), "cantidad": cantidad})
    assert r.status_code == 201, r.get_json()
    return r.get_json()


def comprar_envio(api, app, items, metodo="transferencia", k=None):
    for sku, cant in items:
        agregar(api, app, sku, cant)
    r = api.post("/api/cuenta/checkout", {"modalidad": "envio", "metodo_pago": metodo,
                                          "direccion_id": direccion_cliente(app), "clave_idempotencia": k or clave()})
    return r


def comprar_recoger(api, app, items, codigo, metodo="efectivo"):
    for sku, cant in items:
        agregar(api, app, sku, cant)
    return api.post("/api/cuenta/checkout", {"modalidad": "recoger", "metodo_pago": metodo,
                                             "sucursal_id": sucursal_id(app, codigo), "clave_idempotencia": clave()})


def pagar_y_validar(cliente, finanzas, pedido_id):
    r = cliente.post(f"/api/cuenta/pedidos/{pedido_id}/pagos", {"referencia": "SPEI-123456", "clave_idempotencia": clave()})
    assert r.status_code == 201, r.get_json()
    pago_id = r.get_json()["id"]
    r = finanzas.post(f"/api/admin/pagos/{pago_id}/validar", {"nota": "Depósito verificado en estado de cuenta"})
    assert r.status_code == 200, r.get_json()
    return pago_id


def surtir_y_empacar(almacen, asignacion_id):
    r = almacen.post(f"/api/admin/surtido/{asignacion_id}/iniciar")
    assert r.status_code == 200, r.get_json()
    a = r.get_json()
    partidas = [{"asignacion_detalle_id": d["id"], "surtida": d["cantidad"]} for d in a["detalles"]]
    r = almacen.post(f"/api/admin/surtido/{asignacion_id}/registrar", {"partidas": partidas})
    assert r.status_code == 200, r.get_json()
    r = almacen.post(f"/api/admin/surtido/{asignacion_id}/paquetes",
                     {"partidas": [{"asignacion_detalle_id": d["id"], "cantidad": d["cantidad"]} for d in a["detalles"]]})
    assert r.status_code == 201, r.get_json()
    return r.get_json()["paquetes"][-1]["id"]


def almacen_de(como, nombre_sucursal):
    codigo = {"Sucursal Toluca": "tol", "Sucursal Querétaro": "qro", "Sucursal Puebla": "pue"}[nombre_sucursal]
    return como(f"alm_{codigo}")
