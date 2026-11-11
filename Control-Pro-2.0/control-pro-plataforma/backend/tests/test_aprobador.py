"""Rol aprobador: panel de indicadores, administración de cuentas de sucursal, edición de solicitudes con aviso a la
sucursal, cancelación y seguimiento del envío. La sucursal solo administra a sus empleados."""
from .conftest import Api, clave, conciliado
from .flujos import surtir_y_empacar

DIR = {"destinatario": "Recepción", "telefono": "4421112233", "calle": "Av. Universidad", "numero": "100",
       "colonia": "Centro", "ciudad": "Querétaro", "estado": "Querétaro", "cp": "76000"}


def _var(como):
    prod = {p["sku_base"]: p for p in como("admin").get("/api/admin/productos?por_pagina=100").get_json()["items"]}
    return lambda sku_base, talla: next(v["id"] for v in prod[sku_base]["variantes"] if v["talla"] == talla)


def _solicitud(emp, partidas):
    dir_emp = emp.get("/api/cuenta/direcciones").get_json()[0]["id"]
    return emp.post("/api/cuenta/pedidos-corporativos", {"modalidad": "envio", "direccion_id": dir_emp, "partidas": partidas,
                                                         "clave_idempotencia": clave()}).get_json()


def test_sucursal_solo_administra_empleados(como, client):
    emp = como("empresa")
    assert emp.patch("/api/cuenta/perfil", {"nombre": "Otro nombre"}).status_code == 403
    assert emp.post("/api/cuenta/direcciones", {**DIR, "alias": "Nueva"}).status_code == 403
    d = emp.get("/api/cuenta/direcciones").get_json()[0]
    assert emp.put(f"/api/cuenta/direcciones/{d['id']}", {**DIR, "alias": "X"}).status_code == 403
    assert emp.delete(f"/api/cuenta/direcciones/{d['id']}").status_code == 403
    assert emp.post("/api/auth/password", {"actual": "ControlPro2026", "nueva": "OtraClave99"}).status_code == 403
    r = client.post("/api/auth/recuperar", json={"correo": "empresa@demo.mx", "tipo": "cliente"}).get_json()
    assert "token_desarrollo" not in r  # la contraseña de la sucursal la restablece el distribuidor
    # Lo que sí puede: empleados
    r = emp.post("/api/cuenta/empleados", {"numero": "3001", "nombre": "Nuevo Empleado", "puesto": "Enfermería"})
    assert r.status_code == 201
    assert emp.put(f"/api/cuenta/empleados/{r.get_json()['id']}", {"numero": "3001", "nombre": "Nuevo Empleado", "puesto": "Staff"}).status_code == 200
    # Una solicitud enviada no la cancela la sucursal
    var, empleados = _var(como), {e["nombre"]: e["id"] for e in emp.get("/api/cuenta/empleados").get_json()}
    p = _solicitud(emp, [{"empleado_id": empleados["Ana López"], "variante_id": var("MAN-001", "Unitalla"), "cantidad": 1}])
    assert emp.post(f"/api/cuenta/pedidos/{p['id']}/cancelar", {"motivo": "Ya no se necesita"}).status_code == 403


def test_aprobador_administra_cuentas_de_sucursal(como, client):
    aprob = como("aprobador")
    nueva = {"razon_social": "Clínica Norte", "nombre": "Recepción Norte", "correo": "norte@demo.mx", "password": "Segura123",
             "direccion": DIR}
    assert aprob.post("/api/admin/cuentas-sucursal", {**nueva, "password": "corta"}).status_code == 422
    r = aprob.post("/api/admin/cuentas-sucursal", nueva)
    assert r.status_code == 201 and r.get_json()["direccion"]["cp"] == "76000"
    suc = r.get_json()
    assert aprob.post("/api/admin/cuentas-sucursal", nueva).status_code == 409  # correo duplicado
    assert client.post("/api/auth/cliente/login", json={"correo": "norte@demo.mx", "password": "Segura123"}).status_code == 200
    # Editar datos y dirección
    r = aprob.put(f"/api/admin/cuentas-sucursal/{suc['id']}", {"razon_social": "Clínica Norte S.A.", "telefono": "4425556677"})
    assert r.get_json()["razon_social"] == "Clínica Norte S.A."
    r = aprob.put(f"/api/admin/cuentas-sucursal/{suc['id']}/direccion", {**DIR, "calle": "Calle Nueva"})
    assert r.get_json()["direccion"]["calle"] == "Calle Nueva"
    # Contraseña: el aprobador la cambia y la anterior deja de servir
    assert aprob.post(f"/api/admin/cuentas-sucursal/{suc['id']}/password", {"password": "NuevaClave77"}).status_code == 200
    assert client.post("/api/auth/cliente/login", json={"correo": "norte@demo.mx", "password": "Segura123"}).status_code == 401
    tok = client.post("/api/auth/cliente/login", json={"correo": "norte@demo.mx", "password": "NuevaClave77"}).get_json()["access_token"]
    # Desactivar: la sucursal pierde el acceso de inmediato
    aprob.put(f"/api/admin/cuentas-sucursal/{suc['id']}", {"activo": False})
    assert Api(client, tok).get("/api/cuenta/resumen").status_code == 401
    lista = aprob.get("/api/admin/cuentas-sucursal").get_json()["items"]
    norte = next(x for x in lista if x["id"] == suc["id"])
    assert norte["activo"] is False and next(x for x in lista if x["correo"] == "empresa@demo.mx")["empleados_activos"] >= 8
    # Desbloqueo tras intentos fallidos
    for _ in range(5):
        client.post("/api/auth/cliente/login", json={"correo": "empresa@demo.mx", "password": "mal"})
    emp_id = next(x["id"] for x in lista if x["correo"] == "empresa@demo.mx")
    assert client.post("/api/auth/cliente/login", json={"correo": "empresa@demo.mx", "password": "ControlPro2026"}).status_code == 423
    assert aprob.post(f"/api/admin/cuentas-sucursal/{emp_id}/desbloquear").status_code == 200
    assert client.post("/api/auth/cliente/login", json={"correo": "empresa@demo.mx", "password": "ControlPro2026"}).status_code == 200
    # Solo quien tiene el permiso administra cuentas
    assert como("auditor").post(f"/api/admin/cuentas-sucursal/{emp_id}/password", {"password": "Hackeo123"}).status_code == 403


def test_aprobador_edita_aprueba_y_da_seguimiento(como, app):
    emp, aprob = como("empresa"), como("aprobador")
    var, empleados = _var(como), {e["nombre"]: e["id"] for e in emp.get("/api/cuenta/empleados").get_json()}
    p = _solicitud(emp, [{"empleado_id": empleados["Rosario Ramírez"], "variante_id": var("BAT-003", "M"), "cantidad": 2},
                         {"empleado_id": empleados["Carlos Mendoza"], "variante_id": var("CAM-003", "G"), "cantidad": 1}])
    # Edita: cambia la talla y cantidad de Rosario, quita a Carlos y agrega un pin para Ana
    cambios = [{"empleado_id": empleados["Rosario Ramírez"], "variante_id": var("BAT-003", "G"), "cantidad": 1},
               {"empleado_id": empleados["Ana López"], "variante_id": var("PIN-001", "Unitalla"), "cantidad": 1}]
    assert aprob.put(f"/api/admin/pedidos/{p['id']}/partidas", {"partidas": cambios, "motivo": "x"}).status_code == 422
    r = aprob.put(f"/api/admin/pedidos/{p['id']}/partidas", {"partidas": cambios, "motivo": "Sin existencia en talla M"})
    assert r.status_code == 200 and {d["sku"] for d in r.get_json()["detalles"]} == {"BAT-003-B-G", "PIN-001-P-UNITALLA"}
    det = emp.get(f"/api/cuenta/pedidos/{p['id']}").get_json()
    assert any("Modificada por el distribuidor" in (h["motivo"] or "") for h in det["historial"])
    notifs = emp.get("/api/cuenta/notificaciones").get_json()["items"]
    aviso = next(n for n in notifs if n["evento"].startswith("pedido_modificado"))
    assert "se quitó" in aviso["mensaje"] and "Sin existencia en talla M" in aviso["mensaje"]
    # Aprueba y opera el envío completo desde su propia cuenta
    pedido = aprob.post(f"/api/admin/pedidos/{p['id']}/decision", {"decision": "aprobado"}).get_json()
    assert pedido["estado"] == "confirmado"
    for asig in pedido["asignaciones"]:
        paq = surtir_y_empacar(aprob, asig["id"])
        assert aprob.post(f"/api/admin/paquetes/{paq}/despachar", {"paqueteria": "Castores", "guia": f"CAS-{paq}"}).status_code == 200
        assert aprob.post(f"/api/admin/paquetes/{paq}/eventos", {"estado": "en_transito", "descripcion": "En ruta"}).status_code == 200
        assert aprob.post(f"/api/admin/paquetes/{paq}/eventos", {"estado": "entregado", "descripcion": "Recibió recepción"}).status_code == 200
    eventos = {n["evento"].split("_")[0] + "_" + n["evento"].split("_")[1] for n in emp.get("/api/cuenta/notificaciones?por_pagina=50").get_json()["items"]}
    assert {"pedido_confirmado", "pedido_en", "paquete_preparado", "envio_en", "envio_entregado"} <= eventos
    # Panel de indicadores del aprobador
    k = aprob.get("/api/admin/reportes/solicitudes").get_json()
    assert k["sucursales"]["activas"] >= 1 and k["solicitudes"]["total"] >= 1
    assert k["solicitudes"]["por_etapa"]["en_entrega"] >= 1 and k["top_productos"] and len(k["serie"]) == 30
    assert conciliado(app)


def test_aprobador_cancela_solicitud(como):
    emp, aprob = como("empresa"), como("aprobador")
    var, empleados = _var(como), {e["nombre"]: e["id"] for e in emp.get("/api/cuenta/empleados").get_json()}
    p = _solicitud(emp, [{"empleado_id": empleados["Ana López"], "variante_id": var("MAN-001", "Unitalla"), "cantidad": 1}])
    r = aprob.post(f"/api/admin/pedidos/{p['id']}/cancelar", {"motivo": "Duplicada con otra solicitud"})
    assert r.status_code == 200 and r.get_json()["estado"] == "cancelado"
    aviso = next(n for n in emp.get("/api/cuenta/notificaciones").get_json()["items"] if n["evento"] == "pedido_cancelado")
    assert "Duplicada con otra solicitud" in aviso["mensaje"]


def test_carga_masiva_de_sucursales(app, como, client):
    from seeds.cargar_sucursales import cargar
    with app.app_context():
        r = cargar("ControlPro2026")
        assert (r["creadas"], r["existentes"], r["zonas"], r["divisiones"], r["direcciones_reales"]) == (236, 0, 30, 6, 9)
        assert cargar("ControlPro2026")["creadas"] == 0  # se puede repetir sin duplicar
    aprob = como("aprobador")
    org = aprob.get("/api/admin/cuentas-sucursal/organizacion").get_json()
    divisiones = {d["nombre"]: d for d in org["divisiones"]}
    assert set(divisiones) == {"Noroeste", "Norte", "Bajío", "Centro", "Sur", "Centroamérica"}
    assert divisiones["Noroeste"]["responsable"] == "Gerardo Fernández Torres" and divisiones["Noroeste"]["total"] == 35
    zonas = {z["nombre"]: z for d in org["divisiones"] for z in d["zonas"]}
    assert zonas["Nuevo León Metropolitana"]["gerente"] == "Jesús Martínez Gómez" and zonas["Nuevo León Metropolitana"]["total"] == 10
    assert zonas["CDMX Centro II"]["vacante"] and zonas["CDMX Centro II"]["telefono"] == "55 1914 4029"
    laguna = zonas["Laguna"]
    lista = aprob.get(f"/api/admin/cuentas-sucursal?zona={laguna['id']}&por_pagina=50").get_json()
    assert lista["total"] == 9 and {x["direccion"]["estado"] for x in lista["items"]} == {"Coahuila", "Durango"}
    assert lista["items"][0]["zona"]["division"]["nombre"] == "Norte"
    assert aprob.get(f"/api/admin/cuentas-sucursal?division={divisiones['Sur']['id']}&por_pagina=1").get_json()["total"] == 51
    # Domicilio real aplicado (deja de ser provisional)
    capu = next(x for x in aprob.get("/api/admin/cuentas-sucursal?q=Puebla CAPU").get_json()["items"])
    assert capu["direccion"]["cp"] == "72050" and capu["direccion"]["colonia"] == "Las Cuartillas"
    # El aprobador actualiza un gerente de zona (vacante cubierta)
    r = aprob.put(f"/api/admin/cuentas-sucursal/organizacion/zonas/{zonas['Guanajuato']['id']}",
                  {"nombre": "Guanajuato", "division_id": divisiones["Bajío"]["id"], "gerente": "Nueva Gerente", "correo": "nueva@salud-digna.org",
                   "telefono": "477 289 1873"})
    assert r.status_code == 200 and r.get_json()["vacante"] is False
    # Una sucursal cargada opera como cualquier otra y ve a su gerente de zona
    tok = client.post("/api/auth/cliente/login", json={"correo": "torreon.plaza.triana@sucursal.controlpro.mx", "password": "ControlPro2026"}).get_json()["access_token"]
    suc = Api(client, tok)
    assert suc.get("/api/cuenta/resumen").get_json()["zona"]["gerente"] == "Ángel Alfonso Palacios López"
    emp = suc.post("/api/cuenta/empleados", {"numero": "T-01", "nombre": "Laura Torres", "puesto": "Intendencia"}).get_json()
    var = _var(como)
    p = _solicitud(suc, [{"empleado_id": emp["id"], "variante_id": var("MAN-001", "Unitalla"), "cantidad": 2}])
    assert p["estado"] == "en_revision"
    assert aprob.post(f"/api/admin/pedidos/{p['id']}/decision", {"decision": "aprobado"}).get_json()["estado"] == "confirmado"
