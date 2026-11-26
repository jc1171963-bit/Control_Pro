"""Avisos de incidencias (Etapa 2): evento → destinatarios → texto → enlace, sin duplicados ni avisos al autor."""
from types import SimpleNamespace

from flask import g

from app.extensions import db
from app.models import Usuario
from app.services import aviso_incidencia as av

from .test_pulido import _subir
from .test_recepcion_reposicion import _bata_m, _entregado

CODIGOS = {"Sucursal Toluca": "tol", "Sucursal Querétaro": "qro", "Sucursal Puebla": "pue"}


def _avisos(api, inc_id, panel=True):
    """Avisos de esta incidencia que ve `api` (por su enlace al detalle)."""
    base, enlace = ("/api/admin", f"/admin/incidencias/{inc_id}") if panel else ("/api/cuenta", f"/cuenta/incidencias/{inc_id}")
    items = api.get(f"{base}/notificaciones?por_pagina=100").get_json()["items"]
    return [n for n in items if n["enlace"] == enlace]


def _personal(como, codigo):
    """Quienes deben recibir (atención y el almacén que surtió) y quienes no (admin y otro almacén)."""
    otro = "tol" if codigo != "tol" else "qro"
    return ({"atencion": como("atencion"), "enc": como(f"enc_{codigo}"), "alm": como(f"alm_{codigo}")},
            {"admin": como("admin"), "otro_enc": como(f"enc_{otro}"), "otro_alm": como(f"alm_{otro}")})


def _con_problema(emp, a, paq, bata_m):
    partidas = [{"pedido_detalle_id": d["pedido_detalle_id"], "recibida": 0 if d["id"] == bata_m["id"] else d["cantidad"],
                 "problema": "faltante" if d["id"] == bata_m["id"] else None} for d in a["detalles"]]
    det = emp.post(f"/api/cuenta/paquetes/{paq}/recepcion", {"completa": False, "partidas": partidas}).get_json()
    return next(i for i in det["incidencias"] if i["tipo"] == "diferencia_recepcion")


# ---------------------------------------------------------------- creación y destinatarios

def test_creacion_manual_y_automatica_llegan_al_grupo_correcto(como):
    emp, alm, a, paq = _entregado(como)
    reciben, no_reciben = _personal(como, CODIGOS[a["sucursal"]["nombre"]])

    auto = _con_problema(emp, a, paq, _bata_m(a))
    manual = emp.post(f"/api/cuenta/pedidos/{a['pedido_id']}/incidencias",
                      {"tipo": "articulo_danado", "descripcion": "La camisa llegó con una mancha."}).get_json()
    for inc, como_nacio in ((auto, "detectada al registrar la recepción"), (manual, "reportada por la sucursal")):
        for quien, api in reciben.items():
            avisos = _avisos(api, inc["id"])
            assert len(avisos) == 1, (quien, avisos)
            titulo, detalle = avisos[0]["mensaje"].split("\n")
            assert titulo.startswith("Nueva incidencia") and "_" not in titulo  # tipo legible, nunca el código
            assert inc["folio"] in detalle and como_nacio in detalle
        for quien, api in no_reciben.items():  # admin no por ser global; otro almacén no la puede ver
            assert _avisos(api, inc["id"]) == [], quien
        assert _avisos(emp, inc["id"], panel=False) == []  # la sucursal no se avisa a sí misma
    assert "Diferencia en recepción" in _avisos(reciben["atencion"], auto["id"])[0]["mensaje"]
    assert "Artículo dañado" in _avisos(reciben["atencion"], manual["id"])[0]["mensaje"]


def test_el_autor_no_se_avisa_y_admin_solo_como_respaldo(app, como):
    emp, alm, a, paq = _entregado(como)
    codigo = CODIGOS[a["sucursal"]["nombre"]]
    aten, enc = como("atencion"), como(f"enc_{codigo}")
    r = aten.post("/api/admin/incidencias", {"tipo": "otro", "descripcion": "Revisar etiqueta del paquete.",
                                             "pedido_id": a["pedido_id"]})
    assert r.status_code == 201, r.get_json()
    inc = r.get_json()
    assert _avisos(aten, inc["id"]) == []  # autor
    assert "registrada por el personal" in _avisos(enc, inc["id"])[0]["mensaje"]
    assert _avisos(como("admin"), inc["id"]) == []

    with app.test_request_context():
        usuarios = {u.correo: u for u in db.session.query(Usuario)}
        sin_almacen = SimpleNamespace(id=0, sucursal_id=None, pedido_id=None, responsable_id=None)
        admin = usuarios["admin@controlpro.mx"].id
        # Sin almacén solo atiende el grupo global; si el autor es el único, entra el administrador de respaldo
        assert av.destinatarios_lurima(sin_almacen) == [usuarios["atencion@controlpro.mx"].id]
        g.usuario = usuarios["atencion@controlpro.mx"]
        assert av.destinatarios_lurima(sin_almacen) == [admin]
        g.usuario = usuarios["admin@controlpro.mx"]  # el admin autor tampoco se avisa a sí mismo
        assert admin not in av.destinatarios_lurima(sin_almacen)
        # El responsable recibe la conversación; si no puede gestionar incidencias, vuelve el grupo
        del g.usuario
        resp = usuarios[f"encargado.{codigo}@controlpro.mx"].id
        con_resp = SimpleNamespace(id=0, sucursal_id=None, pedido_id=None, responsable_id=resp)
        assert av.destinatarios_lurima(con_resp, conversacion=True) == [resp]
        assert resp not in av.destinatarios_lurima(con_resp)  # sin almacén, la creación no le llega
        con_resp.responsable_id = usuarios["finanzas@controlpro.mx"].id
        assert av.destinatarios_lurima(con_resp, conversacion=True) == [usuarios["atencion@controlpro.mx"].id]


# ---------------------------------------------------------------- conversación, resolución y cierre

def test_conversacion_resolucion_y_confirmacion(app, como):
    emp, alm, a, paq = _entregado(como)
    codigo = CODIGOS[a["sucursal"]["nombre"]]
    aten, enc = como("atencion"), como(f"enc_{codigo}")
    inc = emp.post(f"/api/cuenta/pedidos/{a['pedido_id']}/incidencias",
                   {"tipo": "talla_incorrecta", "descripcion": "La bata de Rosario es talla M y pidió G."}).get_json()
    url = f"/api/admin/incidencias/{inc['id']}"

    # Cambio de estado sin texto: nadie se entera (no es un evento notificable)
    aten.patch(url, {"estado": "en_atencion"})
    assert _avisos(emp, inc["id"], panel=False) == []
    # Lurima pide algo: la sucursal recibe el aviso con el turno («te toca») y el enlace a la incidencia
    aten.patch(url, {"comentario": "¿Nos mandan una foto de la etiqueta?"})
    [aviso] = _avisos(emp, inc["id"], panel=False)
    assert aviso["mensaje"].startswith(f"Lurima respondió a tu incidencia {inc['folio']}") and "Te toca responder" in aviso["mensaje"]
    assert len(_avisos(aten, inc["id"])) == 1  # solo el de la creación: el autor no se avisa de su mensaje

    # La sucursal responde (texto y luego solo un archivo): avisa al grupo, un aviso por mensaje
    emp.post(f"/api/cuenta/incidencias/{inc['id']}/mensajes", {"texto": "Ya la subimos"})
    emp.post(f"/api/cuenta/incidencias/{inc['id']}/mensajes", {"texto": "", "adjuntos": [_subir(emp)]})
    respuestas = [n["mensaje"] for n in _avisos(enc, inc["id"]) if n["mensaje"].startswith("La sucursal respondió")]
    assert len(respuestas) == 2 and "“Ya la subimos”" in respuestas[1] and "envió 1 archivo(s)" in respuestas[0]
    assert len(_avisos(emp, inc["id"], panel=False)) == 1  # la sucursal no se avisa de lo suyo

    # Con responsable asignado: solo él recibe la conversación (y el aviso de asignación)
    with app.app_context():
        resp_id = db.session.query(Usuario).filter_by(correo=f"encargado.{codigo}@controlpro.mx").one().id
    aten.patch(url, {"responsable_id": resp_id})
    assert any(n["mensaje"].startswith("Te asignaron una incidencia") for n in _avisos(enc, inc["id"]))
    antes_aten = len(_avisos(aten, inc["id"]))
    emp.post(f"/api/cuenta/incidencias/{inc['id']}/mensajes", {"texto": "¿Alguna novedad?"})
    assert len(_avisos(aten, inc["id"])) == antes_aten

    # Resolución: la sucursal debe confirmar; al confirmar se avisa solo al responsable
    aten.patch(url, {"estado": "resuelta", "comentario": "Se envió la talla G."})
    resuelta = _avisos(emp, inc["id"], panel=False)[0]["mensaje"]
    assert resuelta.startswith(f"Lurima resolvió tu incidencia {inc['folio']}") and "confirma la solución" in resuelta
    emp.post(f"/api/cuenta/incidencias/{inc['id']}/reabrir", {"motivo": "La talla G tampoco le queda"})
    assert any(n["mensaje"].startswith("La sucursal reabrió una incidencia") for n in _avisos(enc, inc["id"]))
    aten.patch(url, {"estado": "resuelta", "comentario": "Se cambió por talla EG."})
    emp.post(f"/api/cuenta/incidencias/{inc['id']}/confirmar")
    assert any(n["mensaje"].startswith("La sucursal confirmó la solución") for n in _avisos(enc, inc["id"]))
    assert not any("confirmó" in n["mensaje"] for n in _avisos(aten, inc["id"]))

    # El mismo evento repetido (reintento) no crea un segundo aviso para la misma persona
    with app.test_request_context():
        from app.models import Incidencia, Notificacion
        modelo = db.session.get(Incidencia, inc["id"])
        antes = db.session.query(Notificacion).filter_by(entidad="incidencia", entidad_id=inc["id"]).count()
        av.creada(modelo)
        av.creada(modelo)
        assert db.session.query(Notificacion).filter_by(entidad="incidencia", entidad_id=inc["id"]).count() == antes
        db.session.rollback()


# ---------------------------------------------------------------- reposición

def test_reposicion_avisa_a_la_sucursal_con_enlace_a_la_incidencia(como):
    emp, alm, a, paq = _entregado(como)
    bata_m = _bata_m(a)
    codigo = CODIGOS[a["sucursal"]["nombre"]]
    inc = _con_problema(emp, a, paq, bata_m)
    admin, enc = como("admin"), como(f"enc_{codigo}")
    partidas = {"partidas": [{"pedido_detalle_id": bata_m["pedido_detalle_id"], "cantidad": 1}]}

    rep = admin.post(f"/api/admin/incidencias/{inc['id']}/reposicion", partidas).get_json()["reposiciones"][0]
    admin.post(f"/api/admin/paquetes/{rep['id']}/cancelar-reposicion")
    rep = admin.post(f"/api/admin/incidencias/{inc['id']}/reposicion", partidas).get_json()["reposiciones"][-1]
    # Una nota de Lurima con la reposición en curso no le pide nada a la sucursal (lo dice el turno, no otra regla)
    admin.patch(f"/api/admin/incidencias/{inc['id']}", {"comentario": "Sale mañana temprano."})
    alm.post(f"/api/admin/paquetes/{rep['id']}/despachar", {"paqueteria": "Estafeta", "guia": "REP-0009"})
    alm.post(f"/api/admin/paquetes/{rep['id']}/eventos", {"estado": "en_transito", "descripcion": "En ruta"})
    alm.post(f"/api/admin/paquetes/{rep['id']}/eventos", {"estado": "entregado", "descripcion": "Recibió compras"})
    titulos = [n["mensaje"].split("\n")[0] for n in reversed(_avisos(emp, inc["id"], panel=False))]
    assert titulos == [f"Lurima está preparando la reposición de {inc['folio']}",
                       f"Se canceló el envío de reposición de {inc['folio']}",
                       f"Lurima está preparando la reposición de {inc['folio']}",
                       f"Lurima te escribió sobre la reposición de {inc['folio']}",
                       f"La reposición de {inc['folio']} salió",
                       f"La reposición de {inc['folio']} va en camino",
                       f"La reposición de {inc['folio']} llegó a tu sucursal"], titulos
    antes = len(_avisos(enc, inc["id"]))
    emp.post(f"/api/cuenta/paquetes/{rep['id']}/recepcion", {"completa": True})
    nuevos = _avisos(enc, inc["id"])[: len(_avisos(enc, inc["id"])) - antes]
    assert [n["mensaje"].split("\n")[0] for n in nuevos] == ["La sucursal recibió completa la reposición"]
    assert all("recibió completa" not in n["mensaje"] for n in _avisos(emp, inc["id"], panel=False))
    # Los avisos de paquetes que no son reposición siguen yendo a la solicitud
    normales = [n for n in emp.get("/api/cuenta/notificaciones?por_pagina=100").get_json()["items"]
                if n["mensaje"].startswith("El paquete") or n["mensaje"].startswith("Tu paquete")]
    assert normales and all(n["enlace"] == f"/cuenta/pedidos/{a['pedido_id']}" for n in normales)


def test_reposicion_con_diferencias_avisa_una_incidencia_nueva_relacionada(como):
    emp, alm, a, paq = _entregado(como)
    bata_m = _bata_m(a)
    inc = _con_problema(emp, a, paq, bata_m)
    admin, aten = como("admin"), como("atencion")
    rep = admin.post(f"/api/admin/incidencias/{inc['id']}/reposicion",
                     {"partidas": [{"pedido_detalle_id": bata_m["pedido_detalle_id"], "cantidad": 1}]}).get_json()["reposiciones"][0]
    alm.post(f"/api/admin/paquetes/{rep['id']}/despachar", {"paqueteria": "Estafeta", "guia": "REP-0010"})
    alm.post(f"/api/admin/paquetes/{rep['id']}/eventos", {"estado": "entregado", "descripcion": "Recibió compras"})
    antes_original = len(_avisos(aten, inc["id"]))
    det = emp.post(f"/api/cuenta/paquetes/{rep['id']}/recepcion", {"completa": False, "partidas": [
        {"pedido_detalle_id": bata_m["pedido_detalle_id"], "recibida": 0, "problema": "faltante"}]}).get_json()
    nueva = next(i for i in det["incidencias"] if i["paquete_id"] == rep["id"])
    [aviso] = _avisos(aten, nueva["id"])
    assert f"en la reposición de {inc['folio']}" in aviso["mensaje"]
    assert len(_avisos(aten, inc["id"])) == antes_original  # la original no recibe avisos por la nueva


def test_aviso_de_paquete_de_reposicion_lleva_a_la_incidencia(app):
    with app.test_request_context():
        pedido = SimpleNamespace(id=7)
        normal = SimpleNamespace(incidencia_id=None)
        assert av.aviso_paquete(normal, pedido, "Tu paquete está listo") == ("Tu paquete está listo", "/cuenta/pedidos/7")


# ---------------------------------------------------------------- centro de notificaciones y seguridad

def test_centro_solo_propias_y_destino_con_alcance(como):
    emp, alm, a, paq = _entregado(como)
    codigo = CODIGOS[a["sucursal"]["nombre"]]
    otro = "tol" if codigo != "tol" else "qro"
    inc = _con_problema(emp, a, paq, _bata_m(a))
    aten, ajeno = como("atencion"), como(f"enc_{otro}")
    [aviso] = _avisos(aten, inc["id"])
    # Marcar como leída una notificación ajena no tiene efecto; la propia sí
    ajeno.post("/api/admin/notificaciones/leer", {"ids": [aviso["id"]]})
    assert not _avisos(aten, inc["id"])[0]["leida"]
    sin_leer = aten.get("/api/admin/notificaciones?por_pagina=1").get_json()["no_leidas"]
    aten.post("/api/admin/notificaciones/leer", {"ids": [aviso["id"]]})
    assert _avisos(aten, inc["id"])[0]["leida"]
    assert aten.get("/api/admin/notificaciones?por_pagina=1").get_json()["no_leidas"] == sin_leer - 1
    # El destino del aviso respeta el alcance: quien no ve ese almacén no abre la incidencia
    assert aten.get(f"/api/admin/incidencias/{inc['id']}").status_code == 200
    assert ajeno.get(f"/api/admin/incidencias/{inc['id']}").status_code in (403, 404)
    assert como("cliente").get(f"/api/cuenta/incidencias/{inc['id']}").status_code in (403, 404)
    assert all(n["enlace"] != f"/admin/incidencias/{inc['id']}"
               for n in ajeno.get("/api/admin/notificaciones?por_pagina=100").get_json()["items"])
