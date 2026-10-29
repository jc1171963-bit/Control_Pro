"""Administración: sucursales, usuarios, catálogo, promociones, archivos y devoluciones con merma o rechazo."""
import io
from datetime import datetime, timedelta, timezone

from .conftest import PASSWORD, clave, conciliado, inventario, sucursal_id
from .flujos import almacen_de, comprar_envio, pagar_y_validar, surtir_y_empacar


def test_crud_sucursal_y_alcance_de_usuarios(como, app, client):
    admin = como("admin")
    datos = {"codigo": "CDMX", "nombre": "Sucursal Ciudad de México", "direccion": "Av. Reforma 100", "ciudad": "CDMX",
             "estado": "Ciudad de México", "cp": "06600", "zonas": [{"cp_prefijo": "06", "prioridad": 1}]}
    r = admin.post("/api/admin/sucursales", datos)
    assert r.status_code == 201 and r.get_json()["zonas"][0]["cp_prefijo"] == "06"
    assert admin.post("/api/admin/sucursales", datos).status_code == 409  # código duplicado
    assert admin.post("/api/admin/sucursales", {**datos, "codigo": "X1", "cp": "123"}).status_code == 422
    assert como("enc_tol").post("/api/admin/sucursales", datos).status_code == 403
    nueva = r.get_json()["id"]
    u = {"correo": "nuevo.encargado@controlpro.mx", "nombre": "Nuevo Encargado", "rol": "encargado",
         "sucursales": [], "password": "Segura123"}
    assert admin.post("/api/admin/usuarios", u).status_code == 400  # rol de sucursal sin sucursal
    r = admin.post("/api/admin/usuarios", {**u, "sucursales": [nueva]})
    assert r.status_code == 201
    tok = client.post("/api/auth/login", json={"correo": u["correo"], "password": "Segura123"}).get_json()["access_token"]
    from .conftest import Api
    nuevo = Api(client, tok)
    assert nuevo.get(f"/api/admin/inventario?sucursal_id={sucursal_id(app, 'TOL')}").status_code == 404
    assert nuevo.get(f"/api/admin/inventario?sucursal_id={nueva}").status_code == 200
    # Un administrador no puede desactivarse a sí mismo
    yo = admin.get("/api/auth/yo").get_json()["cuenta"]
    r = admin.put(f"/api/admin/usuarios/{yo['id']}", {"correo": yo["correo"], "nombre": yo["nombre"], "rol": "admin", "activo": False})
    assert r.status_code == 400


def test_catalogo_crear_editar_y_deshabilitar_en_sucursal(como, app, client):
    admin = como("admin")
    cat = admin.get("/api/admin/categorias").get_json()[0]["id"]
    prod = {"sku_base": "SUD-001", "nombre": "Sudadera institucional", "slug": "sudadera-institucional", "categoria_id": cat,
            "descripcion": "Sudadera con capucha", "puestos": ["Administración"],
            "variantes": [{"sku": "SUD-001-AM-M", "talla": "M", "color": "Azul marino", "color_hex": "#1E3A5F", "precio_base": "450.00"},
                          {"sku": "SUD-001-AM-G", "talla": "G", "color": "Azul marino", "color_hex": "#1E3A5F", "precio_base": "450.00"}]}
    r = admin.post("/api/admin/productos", prod)
    assert r.status_code == 201, r.get_json()
    p = r.get_json()
    assert admin.post("/api/admin/productos", prod).status_code == 409
    vid = p["variantes"][0]["id"]
    alm = como("alm_tol")
    alm.post("/api/admin/inventario/entradas", {"sucursal_id": sucursal_id(app, "TOL"), "variante_id": vid, "cantidad": 5,
                                               "motivo": "Alta de producto", "clave_idempotencia": clave()})
    assert client.get("/api/tienda/productos/sudadera-institucional").get_json()["variantes"][0]["disponible"] == 5
    # Deshabilitar en Toluca: la tienda deja de ofrecer esas existencias
    editado = {**prod, "sucursales_deshabilitadas": [sucursal_id(app, "TOL")],
               "variantes": [{**prod["variantes"][0], "id": vid}]}
    r = admin.put(f"/api/admin/productos/{p['id']}", editado)
    assert r.status_code == 200
    ficha = client.get("/api/tienda/productos/sudadera-institucional").get_json()
    assert ficha["variantes"][0]["disponible"] == 0 and len(ficha["variantes"]) == 1  # la variante G quedó inactiva


def test_promocion_vigencia_y_alcance(como, app, client):
    admin, enc_qro = como("admin"), como("enc_qro")
    prods = admin.get("/api/admin/productos?q=Gorra").get_json()["items"]
    ahora = datetime.now(timezone.utc)
    base = {"nombre": "Gorras locales", "tipo": "porcentaje", "valor": "20", "inicio": (ahora - timedelta(hours=1)).isoformat(),
            "fin": (ahora + timedelta(days=2)).isoformat(), "productos": [prods[0]["id"]]}
    assert enc_qro.post("/api/admin/promociones", base).status_code == 400  # global requiere administración central
    assert enc_qro.post("/api/admin/promociones", {**base, "sucursal_id": sucursal_id(app, "PUE")}).status_code == 404
    assert enc_qro.post("/api/admin/promociones", {**base, "sucursal_id": sucursal_id(app, "QRO")}).status_code == 201
    assert admin.post("/api/admin/promociones", {**base, "valor": "95"}).status_code == 422
    assert admin.post("/api/admin/promociones", {**base, "fin": (ahora - timedelta(days=2)).isoformat()}).status_code == 422
    # La promoción local no se aplica en la tienda general
    ficha = client.get(f"/api/tienda/productos/{prods[0]['slug']}").get_json()
    assert ficha["variantes"][0]["descuento"] == "0.00"


def test_archivos_privados_validan_contenido_y_dueno(como, client):
    c = como("cliente")
    falso = c.c.post("/api/archivos/privados", data={"archivo": (io.BytesIO(b"no soy imagen"), "comprobante.png")},
                     headers=c._h(), content_type="multipart/form-data")
    assert falso.status_code == 400
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
    r = c.c.post("/api/archivos/privados", data={"archivo": (io.BytesIO(png), "comprobante.png")}, headers=c._h(),
                 content_type="multipart/form-data")
    assert r.status_code == 201
    url = r.get_json()["url"]
    assert c.get(url).status_code == 200
    assert como("empresa").get(url).status_code == 404
    assert como("finanzas").get(url).status_code == 200
    assert client.get(url).status_code == 401


def test_devolucion_con_merma_y_rechazo(como, app):
    c, fin, aten = como("cliente"), como("finanzas"), como("atencion")
    p = comprar_envio(c, app, [("CAM-001-G-M", 2)]).get_json()
    pagar_y_validar(c, fin, p["id"])
    asig = como("admin").get(f"/api/admin/pedidos/{p['id']}").get_json()["asignaciones"][0]
    alm = almacen_de(como, asig["sucursal"]["nombre"])
    paq = surtir_y_empacar(alm, asig["id"])
    alm.post(f"/api/admin/paquetes/{paq}/despachar", {"paqueteria": "Local", "guia": "G-DEV-1"})
    alm.post(f"/api/admin/paquetes/{paq}/eventos", {"estado": "entregado", "descripcion": "Recibió el cliente"})
    d = c.get(f"/api/cuenta/pedidos/{p['id']}").get_json()["detalles"][0]
    sol = {"motivo": "producto_danado", "descripcion": "Costura abierta en la manga", "evidencias": ["/api/archivos/privados/x.png"],
           "partidas": [{"pedido_detalle_id": d["id"], "cantidad": 1}]}
    dev1 = c.post(f"/api/cuenta/pedidos/{p['id']}/devoluciones", sol).get_json()
    assert aten.post(f"/api/admin/devoluciones/{dev1['id']}/rechazar", {"motivo": "La evidencia no muestra daño"}).status_code == 200
    dev2 = c.post(f"/api/cuenta/pedidos/{p['id']}/devoluciones", sol).get_json()
    aten.post(f"/api/admin/devoluciones/{dev2['id']}/autorizar", {"sucursal_id": asig["sucursal"]["id"]})
    assert c.post(f"/api/cuenta/devoluciones/{dev2['id']}/en-camino", {"guia": "RET-1"}).status_code == 200
    otro = como("alm_pue") if asig["sucursal"]["nombre"] != "Sucursal Puebla" else como("alm_tol")
    assert otro.post(f"/api/admin/devoluciones/{dev2['id']}/recibir", {}).status_code == 404  # otra sucursal
    alm.post(f"/api/admin/devoluciones/{dev2['id']}/recibir", {})
    codigo = {"Sucursal Toluca": "TOL", "Sucursal Querétaro": "QRO", "Sucursal Puebla": "PUE"}[asig["sucursal"]["nombre"]]
    antes = inventario(app, codigo, "CAM-001-G-M").fisico
    det = dev2["detalles"][0]["id"]
    assert alm.post(f"/api/admin/devoluciones/{dev2['id']}/inspeccionar", {"resultados": {str(det): {"aptas": 1, "merma": 1}}}).status_code == 400
    r = alm.post(f"/api/admin/devoluciones/{dev2['id']}/inspeccionar", {"resultados": {str(det): {"aptas": 0, "merma": 1}}})
    assert r.status_code == 200 and r.get_json()["detalles"][0]["resultado"] == "merma"
    assert inventario(app, codigo, "CAM-001-G-M").fisico == antes  # la merma no regresa al inventario
    assert aten.post(f"/api/admin/devoluciones/{dev2['id']}/cerrar", {}).status_code == 409  # falta reembolso
    assert conciliado(app)
