"""S1 · El aprobador corporativo (lado Salud Digna) queda limitado al canal corporativo en el backend.

No ve ni opera pedidos, clientes, PDF ni devoluciones de la tienda; los demás roles conservan su acceso.
Toda la suite se ejecuta solo sobre una base desechable (scripts/pytest_desechable.py).
"""
from sqlalchemy import text

from app.extensions import db

from .conftest import clave, inventario, variante_id
from .flujos import almacen_de, comprar_envio, pagar_y_validar, surtir_y_empacar
from .test_aprobador import _solicitud, _var

SKU = "MAS-002-N-UNITALLA"
CODIGO = {"Sucursal Toluca": "TOL", "Sucursal Querétaro": "QRO", "Sucursal Puebla": "PUE"}


def _tienda(como, app):
    """Pedido de la tienda (cliente persona) pendiente de pago, con inventario reservado."""
    r = comprar_envio(como("cliente"), app, [(SKU, 1)])
    assert r.status_code == 201, r.get_json()
    return r.get_json()


def _corporativo(como):
    emp = como("empresa")
    empleados = {e["nombre"]: e["id"] for e in emp.get("/api/cuenta/empleados").get_json()}
    return _solicitud(emp, [{"empleado_id": empleados["Ana López"], "variante_id": _var(como)("MAN-001", "Unitalla"),
                             "cantidad": 1}])


def _ids(api, url):
    return {p["id"] for p in api.get(url).get_json()["items"]}


def _cliente_id(como, correo):
    return next(c["id"] for c in como("admin").get(f"/api/admin/clientes?q={correo}").get_json()["items"] if c["correo"] == correo)


def _reembolsos(app, pedido_id):
    with app.app_context():
        return db.session.execute(text("select count(*) from reembolso where pedido_id = :p"), {"p": pedido_id}).scalar()


# ---------------------------------------------------------------- pedidos

def test_listado_y_busqueda_solo_corporativos(como, app):
    tienda, corp = _tienda(como, app), _corporativo(como)
    aprob = como("aprobador")
    for url in ("/api/admin/pedidos?por_pagina=100", "/api/admin/pedidos?canal=corporativo&por_pagina=100"):
        items = aprob.get(url).get_json()["items"]
        assert corp["id"] in {p["id"] for p in items} and {p["canal"] for p in items} == {"corporativo"}
    assert aprob.get("/api/admin/pedidos?canal=tienda").get_json()["total"] == 0
    for texto in ("cliente@demo.mx", "Andrea", tienda["folio"]):
        assert aprob.get(f"/api/admin/pedidos?q={texto}").get_json()["total"] == 0
    # el aprobador ve exactamente las solicitudes corporativas que ve la administración, de todas las sucursales
    admin = como("admin")
    assert _ids(aprob, "/api/admin/pedidos?por_pagina=100") == _ids(admin, "/api/admin/pedidos?canal=corporativo&por_pagina=100")


def test_pedido_de_tienda_no_existe_para_el_aprobador(como, app):
    p = _tienda(como, app)
    aprob, admin = como("aprobador"), como("admin")
    asig = admin.get(f"/api/admin/pedidos/{p['id']}").get_json()["asignaciones"][0]
    codigo = CODIGO[asig["sucursal"]["nombre"]]
    antes = inventario(app, codigo, SKU)
    assert aprob.get(f"/api/admin/pedidos/{p['id']}").status_code == 404
    assert aprob.get(f"/api/admin/pedidos/{p['id']}/pdf").status_code == 404
    assert aprob.post(f"/api/admin/pedidos/{p['id']}/decision", {"decision": "aprobado"}).status_code == 404
    partidas = [{"empleado_id": 1, "variante_id": variante_id(app, SKU), "cantidad": 1}]
    assert aprob.put(f"/api/admin/pedidos/{p['id']}/partidas", {"partidas": partidas, "motivo": "Cambio de talla"}).status_code == 404
    r = aprob.post(f"/api/admin/pedidos/{p['id']}/cancelar", {"motivo": "Intento desde el portal del aprobador"})
    assert r.status_code == 404 and r.get_json()["error"]["mensaje"] == "Pedido no encontrado."
    # nada cambió: estado, partidas, reserva e inventario, reembolsos
    d = admin.get(f"/api/admin/pedidos/{p['id']}").get_json()
    assert d["estado"] == p["estado"] == "pendiente_pago"
    assert all(x["cantidad_cancelada"] == 0 for x in d["detalles"])
    assert inventario(app, codigo, SKU) == antes and antes.reservado >= 1
    assert _reembolsos(app, p["id"]) == 0
    # un id inexistente responde igual: no se revela que el pedido de la tienda existe
    assert aprob.get("/api/admin/pedidos/999999").get_json() == aprob.get(f"/api/admin/pedidos/{p['id']}").get_json()


def test_aprobador_no_ejecuta_la_expiracion_global(como):
    assert como("aprobador").post("/api/admin/pedidos/expirar-reservas").status_code == 403
    assert como("admin").post("/api/admin/pedidos/expirar-reservas").status_code == 200


# ---------------------------------------------------------------- clientes

def test_clientes_solo_cuentas_de_sucursal(como):
    aprob = como("aprobador")
    items = aprob.get("/api/admin/clientes?por_pagina=100").get_json()["items"]
    assert items and {c["tipo"] for c in items} == {"empresa"}
    assert aprob.get("/api/admin/clientes?tipo=persona").get_json()["total"] == 0
    assert aprob.get("/api/admin/clientes?q=cliente@demo.mx").get_json()["total"] == 0
    persona, empresa = _cliente_id(como, "cliente@demo.mx"), _cliente_id(como, "empresa@demo.mx")
    assert aprob.get(f"/api/admin/clientes/{persona}").status_code == 404
    assert aprob.get(f"/api/admin/clientes/{empresa}").status_code == 200
    assert como("admin").get(f"/api/admin/clientes/{persona}").status_code == 200


# ---------------------------------------------------------------- devoluciones

def test_devoluciones_de_tienda_ocultas(como, app):
    c, fin = como("cliente"), como("finanzas")
    p = comprar_envio(c, app, [("CAM-003-G-M", 1)]).get_json()
    pagar_y_validar(c, fin, p["id"])
    asig = como("admin").get(f"/api/admin/pedidos/{p['id']}").get_json()["asignaciones"][0]
    alm = almacen_de(como, asig["sucursal"]["nombre"])
    paq = surtir_y_empacar(alm, asig["id"])
    alm.post(f"/api/admin/paquetes/{paq}/despachar", {"paqueteria": "Local", "guia": "G-S1-1"})
    alm.post(f"/api/admin/paquetes/{paq}/eventos", {"estado": "entregado", "descripcion": "Recibió el cliente"})
    det = c.get(f"/api/cuenta/pedidos/{p['id']}").get_json()["detalles"][0]
    evidencia = "/api/archivos/privados/evidencia-s1.png"
    dv = c.post(f"/api/cuenta/pedidos/{p['id']}/devoluciones", {
        "motivo": "producto_danado", "descripcion": "Costura abierta en la manga", "evidencias": [evidencia],
        "partidas": [{"pedido_detalle_id": det["id"], "cantidad": 1}]}).get_json()
    aprob = como("aprobador")
    lista = aprob.get("/api/admin/devoluciones?por_pagina=100")
    assert lista.status_code == 200 and dv["id"] not in {x["id"] for x in lista.get_json()["items"]}
    assert evidencia not in lista.get_data(as_text=True)
    r = aprob.get(f"/api/admin/devoluciones/{dv['id']}")
    assert r.status_code == 404 and evidencia not in r.get_data(as_text=True)
    assert r.get_json() == aprob.get("/api/admin/devoluciones/999999").get_json()  # sin revelar que existe
    assert como("atencion").get(f"/api/admin/devoluciones/{dv['id']}").get_json()["evidencias"] == [evidencia]


# ---------------------------------------------------------------- conversaciones y padrón

def test_chat_y_padron_solo_con_cuentas_de_sucursal(como):
    aprob = como("aprobador")
    persona, empresa = _cliente_id(como, "cliente@demo.mx"), _cliente_id(como, "empresa@demo.mx")
    assert aprob.post("/api/admin/conversaciones", {"tipo": "sucursal", "cliente_id": persona}).status_code == 404
    r = aprob.post("/api/admin/conversaciones", {"tipo": "sucursal", "cliente_id": empresa})
    assert r.status_code == 200, r.get_json()
    corp = _corporativo(como)
    assert aprob.post("/api/admin/conversaciones", {"tipo": "sucursal", "pedido_id": corp["id"]}).status_code == 200
    assert aprob.get(f"/api/admin/cuentas-sucursal/{persona}/permiso-padron").status_code == 404
    assert aprob.get("/api/admin/cuentas-sucursal/999999/permiso-padron").status_code == 404
    assert aprob.get(f"/api/admin/cuentas-sucursal/{empresa}/permiso-padron").status_code == 200
    # la validación es solo del aprobador: la administración conserva el comportamiento anterior
    assert como("admin").get(f"/api/admin/cuentas-sucursal/{persona}/permiso-padron").status_code == 200


# ---------------------------------------------------------------- regresión de otros roles

def test_otros_roles_conservan_su_acceso(como, app):
    p = _tienda(como, app)
    admin = como("admin")
    for rol in ("admin", "finanzas", "atencion", "auditor"):
        assert como(rol).get(f"/api/admin/pedidos/{p['id']}").status_code == 200, rol
        assert p["id"] in _ids(como(rol), "/api/admin/pedidos?canal=tienda&por_pagina=100"), rol
    assert admin.get(f"/api/admin/pedidos/{p['id']}/pdf").status_code == 200
    # el PDF de un borrador conserva su comportamiento anterior para la administración; el aprobador recibe 404
    emp = como("empresa")
    dir_emp = emp.get("/api/cuenta/direcciones").get_json()[0]["id"]
    b = emp.post("/api/cuenta/pedidos-corporativos", {"modalidad": "envio", "direccion_id": dir_emp, "partidas": [],
                                                      "borrador": True, "clave_idempotencia": clave()}).get_json()
    assert admin.get(f"/api/admin/pedidos/{b['id']}/pdf").status_code == 200
    assert como("aprobador").get(f"/api/admin/pedidos/{b['id']}/pdf").status_code == 404
    # el encargado sigue limitado a su sucursal
    suc = admin.get(f"/api/admin/pedidos/{p['id']}").get_json()["asignaciones"][0]["sucursal"]["nombre"]
    propio = {"Sucursal Toluca": "enc_tol", "Sucursal Querétaro": "enc_qro", "Sucursal Puebla": "enc_pue"}
    ajeno = next(v for k, v in propio.items() if k != suc)
    assert como(propio[suc]).get(f"/api/admin/pedidos/{p['id']}").status_code == 200
    assert como(ajeno).get(f"/api/admin/pedidos/{p['id']}").status_code == 404
    # la administración cancela legítimamente un pedido de la tienda y se libera la reserva
    codigo = CODIGO[suc]
    reservado = inventario(app, codigo, SKU).reservado
    r = admin.post(f"/api/admin/pedidos/{p['id']}/cancelar", {"motivo": "Cancelado por la distribuidora"})
    assert r.status_code == 200 and r.get_json()["estado"] == "cancelado"
    assert inventario(app, codigo, SKU).reservado == reservado - 1


def test_aprobador_conserva_el_flujo_corporativo(como):
    aprob = como("aprobador")
    corp = _corporativo(como)
    assert aprob.get(f"/api/admin/pedidos/{corp['id']}").status_code == 200
    assert aprob.get(f"/api/admin/pedidos/{corp['id']}/pdf").status_code == 200
    r = aprob.post(f"/api/admin/pedidos/{corp['id']}/decision", {"decision": "aprobado"})
    assert r.status_code == 200 and r.get_json()["estado"] == "aprobado"
    r = aprob.post(f"/api/admin/pedidos/{corp['id']}/cancelar", {"motivo": "Duplicada con otra solicitud"})
    assert r.status_code == 200 and r.get_json()["estado"] == "cancelado"
    otra = _corporativo(como)
    r = aprob.post(f"/api/admin/pedidos/{otra['id']}/decision", {"decision": "devuelto", "motivo": "Falta el puesto"})
    assert r.status_code == 200 and r.get_json()["estado"] == "devuelto"
    todas = como("admin").get("/api/admin/cuentas-sucursal?por_pagina=100").get_json()["total"]
    assert aprob.get("/api/admin/cuentas-sucursal?por_pagina=100").get_json()["total"] == todas
