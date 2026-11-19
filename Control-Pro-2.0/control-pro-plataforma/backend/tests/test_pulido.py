"""Perfil de usuario, distintivo CNR, evidencias de incidencias, expediente por solicitud y pulso de actividad."""
import io

from .conftest import clave
from .test_aprobador import _solicitud, _var

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def _subir(api, ruta="/api/archivos/privados", nombre="evidencia.png"):
    r = api.c.post(ruta, data={"archivo": (io.BytesIO(PNG), nombre)}, headers=api._h(), content_type="multipart/form-data")
    assert r.status_code == 201, r.get_json()
    return r.get_json()["url"] if "url" in r.get_json() else r.get_json()


def _pedido(como):
    emp = como("empresa")
    var, empleados = _var(como), {e["nombre"]: e["id"] for e in emp.get("/api/cuenta/empleados").get_json()}
    return emp, _solicitud(emp, [{"empleado_id": empleados["Rosario Ramírez"], "variante_id": var("BAT-003", "M"), "cantidad": 1}])


def test_perfil_del_usuario(como):
    aprob = como("aprobador")
    r = aprob.patch("/api/auth/perfil", {"nombre": "Jesús A. Castillo", "telefono": "55 4293 9183", "area": "Compras corporativas", "cargo": "Gerente"})
    assert r.status_code == 200
    c = r.get_json()["cuenta"]
    assert (c["nombre"], c["telefono"], c["area"], c["cargo"]) == ("Jesús A. Castillo", "55 4293 9183", "Compras corporativas", "Gerente")
    assert aprob.get("/api/auth/yo").get_json()["cuenta"]["area"] == "Compras corporativas"
    assert aprob.patch("/api/auth/perfil", {"telefono": "abc"}).status_code == 422
    # La sucursal solo cambia su teléfono; su nombre lo administra el aprobador
    emp = como("empresa")
    assert emp.patch("/api/auth/perfil", {"telefono": "4421112233"}).get_json()["cuenta"]["telefono"] == "4421112233"
    assert emp.patch("/api/auth/perfil", {"nombre": "Otra"}).status_code == 403


def test_distintivo_cnr_y_logo(como, client):
    aprob, emp = como("aprobador"), como("empresa")
    cid = emp.get("/api/auth/yo").get_json()["cuenta"]["id"]
    assert emp.get("/api/auth/yo").get_json()["cuenta"]["cnr"] is False
    assert aprob.put(f"/api/admin/cuentas-sucursal/{cid}", {"cnr": True}).get_json()["cnr"] is True
    assert emp.get("/api/auth/yo").get_json()["cuenta"]["cnr"] is True
    _, p = _pedido(como)
    assert aprob.get(f"/api/admin/pedidos?canal=corporativo&q={p['folio']}").get_json()["items"][0]["cliente"]["cnr"] is True
    # Logo CNR: lo sube quien administra sucursales; se lee sin sesión
    assert client.get("/api/config/publica").get_json() == {"cnr_logo": None}
    assert emp.c.post("/api/admin/config/cnr-logo", data={"archivo": (io.BytesIO(PNG), "cnr.png")}, headers=emp._h(),
                      content_type="multipart/form-data").status_code in (401, 403)
    url = _subir(aprob, "/api/admin/config/cnr-logo", "cnr.png")["cnr_logo"]
    assert client.get("/api/config/publica").get_json()["cnr_logo"] == url and client.get(url).status_code == 200
    assert aprob.delete("/api/admin/config/cnr-logo").get_json() == {"cnr_logo": None}
    assert client.get(url).status_code == 404  # el archivo anterior se borra


def test_evidencia_en_incidencia_visible_para_la_sucursal(como):
    emp, p = _pedido(como)
    admin = como("admin")
    url = _subir(admin)
    assert emp.c.get(url, headers=emp._h()).status_code == 404  # aún no está ligada a su solicitud
    r = admin.post("/api/admin/incidencias", {"tipo": "Producto dañado", "descripcion": "La bata llegó con una mancha.",
                                              "pedido_id": p["id"], "evidencias": [url]})
    assert r.status_code == 201 and r.get_json()["evidencias"] == [url]
    assert emp.c.get(url, headers=emp._h()).status_code == 200  # ahora la sucursal dueña la ve
    # La sucursal adjunta su propia foto; no puede adjuntar archivos ajenos
    propia = _subir(emp)
    r = emp.post(f"/api/cuenta/pedidos/{p['id']}/incidencias", {"tipo": "Talla incorrecta", "descripcion": "Pidió M y llegó G.", "evidencias": [propia]})
    assert r.status_code == 201 and r.get_json()["evidencias"] == [propia]
    ajena = _subir(admin)
    assert emp.post(f"/api/cuenta/pedidos/{p['id']}/incidencias", {"tipo": "Otro", "descripcion": "Intento con archivo ajeno.", "evidencias": [ajena]}).status_code == 403
    assert emp.post(f"/api/cuenta/pedidos/{p['id']}/incidencias", {"tipo": "Otro", "descripcion": "Ruta inventada aquí.", "evidencias": ["/etc/passwd"]}).status_code == 422


def test_expediente_de_la_solicitud(como):
    emp, p = _pedido(como)
    aprob, otra = como("aprobador"), como("cliente")
    exp = emp.get(f"/api/cuenta/pedidos/{p['id']}/expediente").get_json()
    assert exp["documentos"] == [] and exp["generados"][0]["accion"] == "pdf"
    url = _subir(emp, nombre="orden.png")
    d = emp.post(f"/api/cuenta/pedidos/{p['id']}/documentos", {"nombre": "Orden de compra 4512", "tipo": "orden_compra", "url": url})
    assert d.status_code == 201 and d.get_json()["tipo_nombre"] == "Orden de compra"
    # El aprobador lo ve con autor y sube la cotización; la sucursal ve ambos y la descarga
    vista = aprob.get(f"/api/admin/pedidos/{p['id']}/expediente").get_json()["documentos"]
    assert vista[0]["nombre"] == "Orden de compra 4512" and vista[0]["puede_borrar"] is False
    cot = _subir(aprob, nombre="cotizacion.png")
    did = aprob.post(f"/api/admin/pedidos/{p['id']}/documentos", {"nombre": "Cotización LURIMA", "tipo": "cotizacion", "url": cot}).get_json()["id"]
    docs = emp.get(f"/api/cuenta/pedidos/{p['id']}/expediente").get_json()["documentos"]
    assert {x["nombre"] for x in docs} == {"Orden de compra 4512", "Cotización LURIMA"}
    assert next(x for x in docs if x["id"] == did)["autor"] == "Control Pro" and emp.c.get(cot, headers=emp._h()).status_code == 200
    # Solo quien lo subió lo quita; otra cuenta no ve el expediente
    assert emp.delete(f"/api/cuenta/pedidos/{p['id']}/documentos/{did}").status_code == 403
    assert aprob.delete(f"/api/admin/pedidos/{p['id']}/documentos/{did}").status_code == 200
    assert otra.get(f"/api/cuenta/pedidos/{p['id']}/expediente").status_code == 404
    assert emp.post(f"/api/cuenta/pedidos/{p['id']}/documentos", {"nombre": "x", "url": url}).status_code == 422


def test_pulso_de_actividad(como):
    emp, p = _pedido(como)
    aprob = como("aprobador")
    a = aprob.get("/api/actividad").get_json()
    assert a["notificaciones"]["no_leidas"] >= 1 and a["mensajes"] is not None  # la solicitud nueva le avisó
    antes = emp.get("/api/actividad").get_json()
    c = aprob.post("/api/admin/conversaciones", {"tipo": "sucursal", "pedido_id": p["id"], "cliente_id": None}).get_json()
    aprob.post(f"/api/admin/conversaciones/{c['id']}/mensajes", {"texto": "¿Confirmas la talla?"})
    despues = emp.get("/api/actividad").get_json()
    assert despues["mensajes"]["no_leidos"] == antes["mensajes"]["no_leidos"] + 1 and despues["mensajes"]["ultimo"] != antes["mensajes"]["ultimo"]
    assert como("auditor").get("/api/actividad").get_json()["mensajes"] is None


def test_pdf_de_la_sucursal_sin_importes(como):
    emp, p = _pedido(como)
    r = emp.c.get(f"/api/cuenta/pedidos/{p['id']}/pdf", headers=emp._h())
    assert r.status_code == 200 and r.data.startswith(b"%PDF") and r.mimetype == "application/pdf"
    assert como("cliente").c.get(f"/api/cuenta/pedidos/{p['id']}/pdf", headers=como("cliente")._h()).status_code == 404
    assert como("aprobador").c.get(f"/api/admin/pedidos/{p['id']}/pdf", headers=como("aprobador")._h()).status_code == 200
