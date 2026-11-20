"""Chat tipo WhatsApp: notas de voz, fotos, documentos y responder a un mensaje."""
import io

from .test_pulido import PNG, _pedido

WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 120
M4A = b"\x00\x00\x00\x20ftypM4A " + b"\x00" * 120


def _subir(api, datos, nombre):
    r = api.c.post("/api/archivos/chat", data={"archivo": (io.BytesIO(datos), nombre)}, headers=api._h(), content_type="multipart/form-data")
    return r


def test_audio_foto_y_respuesta(como):
    emp, p = _pedido(como)
    aprob, otra = como("aprobador"), como("cliente")
    c = aprob.post("/api/admin/conversaciones", {"tipo": "sucursal", "pedido_id": p["id"], "cliente_id": None}).get_json()
    cid = c["id"]
    # Nota de voz de la sucursal (sin texto)
    r = _subir(emp, WEBM, "nota.webm")
    assert r.status_code == 201
    audio = r.get_json()["url"]
    m = emp.post(f"/api/cuenta/conversaciones/{cid}/mensajes", {"texto": "", "adjunto": {"url": audio, "tipo": "audio", "duracion": 12}}).get_json()
    assert m["tipo"] == "audio" and m["adjunto"] == {"url": audio, "tipo": "audio", "nombre": None, "duracion": 12}
    # Safari graba en M4A; un archivo que no es audio se rechaza aunque diga .webm
    assert _subir(emp, M4A, "nota.m4a").status_code == 201
    assert _subir(emp, b"no soy audio" * 10, "falso.webm").status_code == 400
    # El aprobador la escucha (con su tipo de contenido) y responde con una foto citando el audio
    r = aprob.c.get(audio, headers=aprob._h())
    assert r.status_code == 200 and r.mimetype == "audio/webm"
    foto = _subir(aprob, PNG, "talla.png").get_json()["url"]
    assert emp.c.get(foto, headers=emp._h()).status_code == 404  # aún no está en la conversación
    resp = aprob.post(f"/api/admin/conversaciones/{cid}/mensajes",
                      {"texto": "Esta es la talla correcta", "adjunto": {"url": foto, "tipo": "imagen"}, "responde_a": m["id"]}).get_json()
    assert resp["responde_a"] == {"id": m["id"], "propio": False, "autor": resp["responde_a"]["autor"], "tipo": "audio",
                                  "texto": "🎤 Mensaje de voz (0:12)", "adjunto_url": None}
    # La sucursal ve la foto (ya ligada a su conversación); otra cuenta no
    assert emp.c.get(foto, headers=emp._h()).status_code == 200
    assert otra.c.get(foto, headers=otra._h()).status_code == 404
    hilo = emp.get(f"/api/cuenta/conversaciones/{cid}/mensajes").get_json()["items"]
    assert hilo[-1]["tipo"] == "imagen" and hilo[-1]["responde_a"]["texto"] == "🎤 Mensaje de voz (0:12)"
    # Vista previa en la lista
    fila = next(x for x in aprob.get("/api/admin/conversaciones").get_json()["items"] if x["id"] == cid)
    assert fila["ultimo"]["texto"] == "📷 Foto: Esta es la talla correcta"
    # Validaciones: sin contenido, archivo ajeno o respuesta de otra conversación
    assert emp.post(f"/api/cuenta/conversaciones/{cid}/mensajes", {"texto": "  "}).status_code == 422
    ajena = _subir(aprob, PNG, "x.png").get_json()["url"]
    assert emp.post(f"/api/cuenta/conversaciones/{cid}/mensajes", {"adjunto": {"url": ajena, "tipo": "imagen"}}).status_code == 403
    otra_c = aprob.post("/api/admin/conversaciones", {"tipo": "distribuidora"}).get_json()
    assert aprob.post(f"/api/admin/conversaciones/{otra_c['id']}/mensajes", {"texto": "x", "responde_a": m["id"]}).status_code == 404
