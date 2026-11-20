"""Incidencias de una solicitud corporativa: conversación entre la sucursal y el personal, «Mis incidencias», resolución
por la comercializadora, confirmación (cierre) o reapertura por la sucursal. Nada se borra del historial."""
from .test_aprobador import _solicitud, _var


def _incidencia(como):
    suc = como("empresa")
    var, empleados = _var(como), {e["nombre"]: e["id"] for e in suc.get("/api/cuenta/empleados").get_json()}
    p = _solicitud(suc, [{"empleado_id": empleados["Ana López"], "variante_id": var("MAN-001", "Unitalla"), "cantidad": 1}])
    r = suc.post(f"/api/cuenta/pedidos/{p['id']}/incidencias", {"tipo": "seguimiento", "descripcion": "La talla no corresponde a lo pedido."})
    assert r.status_code == 201, r.get_json()
    return suc, p, r.get_json()


def test_conversacion_resolucion_reapertura_y_cierre_por_la_sucursal(como):
    suc, p, inc = _incidencia(como)
    aten = como("atencion")
    base = f"/api/cuenta/incidencias/{inc['id']}"
    # Mis incidencias: la ve con el folio de su solicitud
    mias = suc.get("/api/cuenta/incidencias").get_json()["items"]
    assert any(i["id"] == inc["id"] and i["pedido_folio"] == p["folio"] for i in mias)
    # El personal responde; la sucursal contesta y el personal lo ve como respuesta por atender
    assert aten.patch(f"/api/admin/incidencias/{inc['id']}", {"estado": "en_atencion", "comentario": "Envíanos una foto"}).status_code == 200
    assert suc.post(f"{base}/mensajes", {"texto": "x"}).status_code == 400
    r = suc.post(f"{base}/mensajes", {"texto": "Ya la subimos al expediente"})
    assert r.status_code == 201 and r.get_json()["estado"] == "en_atencion"
    admin_inc = next(i for i in aten.get("/api/admin/incidencias").get_json()["items"] if i["id"] == inc["id"])
    assert admin_inc["respondio_sucursal"] and "cerrada" not in admin_inc["transiciones"]
    # Resolver exige la resolución en la misma acción; el personal no la cierra
    assert aten.patch(f"/api/admin/incidencias/{inc['id']}", {"estado": "resuelta"}).status_code == 400
    assert aten.patch(f"/api/admin/incidencias/{inc['id']}", {"estado": "resuelta", "comentario": "Se envió la talla G"}).status_code == 200
    r = aten.patch(f"/api/admin/incidencias/{inc['id']}", {"estado": "cerrada"})
    assert r.status_code == 409 and r.get_json()["error"]["codigo"] == "cierre_por_sucursal"
    # La sucursal reabre con motivo y vuelve a En atención
    assert suc.post(f"{base}/reabrir", {"motivo": "corto"}).status_code == 400
    r = suc.post(f"{base}/reabrir", {"motivo": "La talla G tampoco le queda al empleado"})
    assert r.status_code == 200 and r.get_json()["estado"] == "en_atencion"
    assert suc.post(f"{base}/confirmar").status_code == 409  # solo se confirma una resuelta
    assert aten.patch(f"/api/admin/incidencias/{inc['id']}", {"estado": "resuelta", "comentario": "Se cambió por talla EG"}).status_code == 200
    r = suc.post(f"{base}/confirmar")
    assert r.status_code == 200 and r.get_json()["estado"] == "cerrada"
    # Cerrada es final y el historial conserva todo, con el personal como «Control Pro» para la sucursal
    assert suc.post(f"{base}/mensajes", {"texto": "Otra cosa"}).status_code == 409
    assert suc.post(f"{base}/reabrir", {"motivo": "Sigue sin quedarle bien"}).status_code == 409
    seg = suc.get(base).get_json()["seguimiento"]
    comentarios = [s["comentario"] for s in seg]
    assert "Ya la subimos al expediente" in comentarios and "Se envió la talla G" in comentarios
    assert any(c and c.startswith("Reabierta por la sucursal") for c in comentarios)
    assert seg[-1]["nuevo"] == "cerrada" and seg[-1]["actor"] == "Sucursal"
    assert {s["actor"] for s in seg if s["comentario"] == "Envíanos una foto"} == {"Control Pro"}
    detalle = aten.get("/api/admin/incidencias?estado=cerrada").get_json()["items"]
    assert next(i for i in detalle if i["id"] == inc["id"])["resolucion"] == "Se cambió por talla EG"


def test_otra_cuenta_no_ve_ni_escribe_en_la_incidencia(como):
    _, _, inc = _incidencia(como)
    otra = como("cliente")
    assert all(i["id"] != inc["id"] for i in otra.get("/api/cuenta/incidencias").get_json()["items"])
    base = f"/api/cuenta/incidencias/{inc['id']}"
    assert otra.get(base).status_code == 404
    assert otra.post(f"{base}/mensajes", {"texto": "Hola, intento escribir"}).status_code == 404
    assert otra.post(f"{base}/reabrir", {"motivo": "Intento reabrir una ajena"}).status_code == 404
    assert otra.post(f"{base}/confirmar").status_code == 404
    assert como("auditor").patch(f"/api/admin/incidencias/{inc['id']}", {"comentario": "x"}).status_code == 403


def test_adjuntos_en_la_conversacion_y_descarga_con_alcance(como):
    from .test_pulido import _subir
    suc, _, inc = _incidencia(como)
    aten = como("atencion")
    base = f"/api/cuenta/incidencias/{inc['id']}"
    # La comercializadora pide una foto y adjunta su formato; la sucursal responde con la foto
    formato = _subir(aten, nombre="formato.png")
    r = aten.patch(f"/api/admin/incidencias/{inc['id']}", {"estado": "en_atencion", "comentario": "Envíanos una foto", "adjuntos": [formato]})
    assert r.status_code == 200, r.get_json()
    foto = _subir(suc, nombre="foto.png")
    assert suc.post(f"{base}/mensajes", {"adjuntos": [foto]}).status_code == 201  # solo archivo, sin texto
    ajeno = _subir(como("cliente"), nombre="ajeno.png")
    assert suc.post(f"{base}/mensajes", {"texto": "Otra", "adjuntos": [ajeno]}).status_code == 403  # no es suyo
    assert suc.post(f"{base}/mensajes", {"texto": "Muchas", "adjuntos": [foto] * 5}).status_code == 422
    seg = suc.get(base).get_json()["seguimiento"]
    assert [s["adjuntos"] for s in seg if s["adjuntos"]] == [[formato], [foto]]
    # Ambas partes descargan lo de la conversación; nadie más
    assert suc.get(formato).status_code == 200 and aten.get(foto).status_code == 200
    assert como("cliente").get(foto).status_code == 404
    assert como("enc_pue").get(foto).status_code == 404  # personal sin alcance sobre la solicitud
    assert como("admin").get(foto).status_code == 200
