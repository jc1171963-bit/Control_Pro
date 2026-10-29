"""Autenticación, bloqueo, recuperación, permisos por rol y alcance por sucursal."""
from sqlalchemy import text

from app.extensions import db

from .conftest import PASSWORD, clave, sucursal_id, variante_id
from .flujos import comprar_envio


def test_salud(client):
    r = client.get("/api/salud")
    assert r.status_code == 200 and r.get_json()["base_de_datos"] == "ok"
    assert r.headers["X-Content-Type-Options"] == "nosniff"


def test_login_correcto_e_incorrecto(client):
    ok = client.post("/api/auth/login", json={"correo": "ADMIN@controlpro.mx", "password": PASSWORD})
    assert ok.status_code == 200 and ok.get_json()["cuenta"]["rol"]["codigo"] == "admin"
    assert "cp_refresh" in ok.headers.get("Set-Cookie", "") and "HttpOnly" in ok.headers["Set-Cookie"]
    mal = client.post("/api/auth/login", json={"correo": "admin@controlpro.mx", "password": "otra"})
    inexistente = client.post("/api/auth/login", json={"correo": "nadie@controlpro.mx", "password": "otra"})
    assert mal.status_code == inexistente.status_code == 401
    assert mal.get_json()["error"]["mensaje"] == inexistente.get_json()["error"]["mensaje"]


def test_bloqueo_tras_cinco_intentos(client):
    for _ in range(5):
        client.post("/api/auth/cliente/login", json={"correo": "cliente@demo.mx", "password": "incorrecta1"})
    r = client.post("/api/auth/cliente/login", json={"correo": "cliente@demo.mx", "password": PASSWORD})
    assert r.status_code == 423


def test_registro_y_correo_duplicado(client):
    datos = {"correo": "nuevo@demo.mx", "password": "Segura123", "nombre": "Nuevo Cliente"}
    assert client.post("/api/auth/cliente/registro", json=datos).status_code == 201
    r = client.post("/api/auth/cliente/registro", json={**datos, "correo": "NUEVO@demo.mx"})
    assert r.status_code == 409
    debil = client.post("/api/auth/cliente/registro", json={**datos, "correo": "x@demo.mx", "password": "solotexto"})
    assert debil.status_code == 422


def test_recuperacion_de_acceso_un_solo_uso(client):
    r = client.post("/api/auth/recuperar", json={"correo": "cliente@demo.mx", "tipo": "cliente"})
    token = r.get_json()["token_desarrollo"]
    assert client.post("/api/auth/restablecer", json={"token": token, "password": "NuevaClave9"}).status_code == 200
    assert client.post("/api/auth/restablecer", json={"token": token, "password": "OtraClave9"}).status_code == 400
    assert client.post("/api/auth/cliente/login", json={"correo": "cliente@demo.mx", "password": "NuevaClave9"}).status_code == 200
    # Respuesta idéntica para correos inexistentes (no revela cuentas)
    r2 = client.post("/api/auth/recuperar", json={"correo": "noexiste@demo.mx", "tipo": "cliente"})
    assert r2.status_code == 200 and "token_desarrollo" not in r2.get_json()


def test_logout_revoca_token(client, como):
    api = como("admin")
    assert api.get("/api/auth/yo").status_code == 200
    assert api.post("/api/auth/logout").status_code == 200
    assert api.get("/api/auth/yo").status_code == 401


def test_sin_token_y_tipo_de_cuenta(client, como):
    assert client.get("/api/admin/pedidos").status_code == 401
    cliente = como("cliente")
    assert cliente.get("/api/admin/pedidos").status_code == 403  # un token de cliente nunca entra al panel
    admin = como("admin")
    assert admin.get("/api/cuenta/carrito").status_code == 403


def test_permisos_por_rol(como, app):
    auditor = como("auditor")
    assert auditor.get("/api/admin/pedidos").status_code == 200
    r = auditor.post("/api/admin/inventario/entradas", {"sucursal_id": sucursal_id(app, "TOL"),
                     "variante_id": variante_id(app, "GOR-001-AM-UNITALLA"), "cantidad": 5, "motivo": "Compra",
                     "clave_idempotencia": clave()})
    assert r.status_code == 403
    almacen = como("alm_tol")
    r = almacen.post("/api/admin/inventario/ajustes", {"sucursal_id": sucursal_id(app, "TOL"),
                     "variante_id": variante_id(app, "GOR-001-AM-UNITALLA"), "cantidad": 1, "tipo": "merma",
                     "motivo": "Prenda dañada", "clave_idempotencia": clave()})
    assert r.status_code == 403  # los ajustes requieren al encargado
    assert como("finanzas").post("/api/admin/inventario/entradas", {}).status_code == 403


def test_alcance_entre_sucursales(como, app, client):
    tol = como("enc_tol")
    pue = sucursal_id(app, "PUE")
    assert tol.get(f"/api/admin/inventario?sucursal_id={pue}").status_code == 404
    r = tol.post("/api/admin/inventario/entradas", {"sucursal_id": pue, "variante_id": variante_id(app, "GOR-001-AM-UNITALLA"),
                                                     "cantidad": 3, "motivo": "Intento cruzado", "clave_idempotencia": clave()})
    assert r.status_code == 404
    r = tol.post("/api/admin/transferencias", {"origen_id": sucursal_id(app, "QRO"), "destino_id": pue,
                                                "motivo": "Intento cruzado", "partidas": [{"variante_id": 1, "cantidad": 1}]})
    assert r.status_code == 404
    # Inventario listado: solo filas de Toluca
    filas = tol.get("/api/admin/inventario?por_pagina=100").get_json()["items"]
    assert filas and {f["sucursal"] for f in filas} == {"Sucursal Toluca"}

    # Un pedido surtido por Querétaro no es visible para el encargado de Toluca
    cliente = como("cliente")
    from .flujos import agregar
    agregar(cliente, app, "CAM-001-AM-M", 1)
    with app.app_context():
        db.session.execute(text("update sucursal_zona set prioridad = 9"))
        db.session.commit()
    r = cliente.post("/api/cuenta/checkout", {"modalidad": "recoger", "metodo_pago": "efectivo",
                                              "sucursal_id": sucursal_id(app, "QRO"), "clave_idempotencia": clave()})
    assert r.status_code == 201
    pid = r.get_json()["id"]
    assert tol.get(f"/api/admin/pedidos/{pid}").status_code == 404
    assert como("enc_qro").get(f"/api/admin/pedidos/{pid}").status_code == 200
    assert pid not in [p["id"] for p in tol.get("/api/admin/pedidos").get_json()["items"]]
    # El cobro en efectivo tampoco lo puede registrar otra sucursal
    r = tol.post(f"/api/admin/pedidos/{pid}/efectivo", {"monto": "280.00", "clave_idempotencia": clave()})
    assert r.status_code == 404


def test_cliente_no_ve_pedidos_ajenos(como, app, client):
    cliente = como("cliente")
    r = comprar_envio(cliente, app, [("GOR-001-AM-UNITALLA", 1)])
    pid = r.get_json()["id"]
    client.post("/api/auth/cliente/registro", json={"correo": "otro@demo.mx", "password": "Segura123", "nombre": "Otro Cliente"})
    r = client.post("/api/auth/cliente/login", json={"correo": "otro@demo.mx", "password": "Segura123"})
    from .conftest import Api
    otro = Api(client, r.get_json()["access_token"])
    assert otro.get(f"/api/cuenta/pedidos/{pid}").status_code == 404
    assert otro.post(f"/api/cuenta/pedidos/{pid}/cancelar", {"motivo": "Intento ajeno"}).status_code == 404


def test_auditoria_inmutable(app, como):
    como("admin").put("/api/admin/sucursales/1", {})  # genera error 422, sin auditoría
    with app.app_context():
        db.session.execute(text("insert into auditoria (accion, entidad) values ('prueba', 'x')"))
        db.session.commit()
        import pytest
        from sqlalchemy.exc import DBAPIError
        with pytest.raises(DBAPIError):
            db.session.execute(text("update auditoria set accion = 'alterada'"))
        db.session.rollback()
        with pytest.raises(DBAPIError):
            db.session.execute(text("delete from movimiento_inventario"))
        db.session.rollback()


def test_campos_desconocidos_rechazados(como):
    r = como("cliente").post("/api/cuenta/carrito/items", {"variante_id": 1, "cantidad": 1, "precio": "1.00"})
    assert r.status_code == 422 and "precio" in r.get_json()["error"]["detalles"]
