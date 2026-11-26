"""Etapa 3B.1: cada entrada del seguimiento dice si es un mensaje de una persona o un evento automático (`clase`) y quién
la escribió (`lado`). La regla es la de turno_service.es_humana: el serializador no tiene una propia."""
from app.extensions import db
from app.models import Incidencia
from app.services.turno_service import es_humana, ordenar

from .test_pulido import _subir
from .test_recepcion_reposicion import _bata_m, _entregado


def _entradas(api, url):
    return [(s["clase"], s["lado"], s["comentario"]) for s in api.get(url).get_json()["seguimiento"]]


def _coincide_con_es_humana(app, api, inc_id, url):
    """La clase que entrega la API es exactamente es_humana() de cada entrada, en el mismo orden."""
    with app.app_context():
        modelo = db.session.get(Incidencia, inc_id)
        esperado = ["mensaje" if es_humana(s) else "evento" for s in ordenar(modelo.seguimiento)]
    assert [s["clase"] for s in api.get(url).get_json()["seguimiento"]] == esperado


def test_mensajes_eventos_y_adjuntos(app, como):
    emp, alm, a, paq = _entregado(como)
    inc = emp.post(f"/api/cuenta/pedidos/{a['pedido_id']}/incidencias",
                   {"tipo": "articulo_danado", "descripcion": "La camisa llegó con una mancha."}).get_json()
    aten = como("atencion")
    admin_url, cuenta_url = f"/api/admin/incidencias/{inc['id']}", f"/api/cuenta/incidencias/{inc['id']}"

    aten.patch(admin_url, {"estado": "en_atencion"})                              # cambio de estado sin texto
    aten.patch(admin_url, {"comentario": "¿Nos mandan una foto?"})                 # mensaje de Lurima
    emp.post(f"{cuenta_url}/mensajes", {"texto": "Aquí va la foto"})               # mensaje de la sucursal
    emp.post(f"{cuenta_url}/mensajes", {"texto": "", "adjuntos": [_subir(emp)]})   # solo un archivo

    assert _entradas(aten, admin_url) == [
        ("evento", "sucursal", "Incidencia registrada"),
        ("evento", "lurima", None),
        ("mensaje", "lurima", "¿Nos mandan una foto?"),
        ("mensaje", "sucursal", "Aquí va la foto"),
        ("mensaje", "sucursal", None),
    ]
    # Mismo resultado en el portal de la sucursal (que ve «Distribuidora» en lugar del nombre, pero el mismo lado y clase)
    assert [(c, l) for c, l, _ in _entradas(emp, cuenta_url)] == [(c, l) for c, l, _ in _entradas(aten, admin_url)]
    _coincide_con_es_humana(app, aten, inc["id"], admin_url)


def test_notas_de_reposicion_son_eventos(app, como):
    emp, alm, a, paq = _entregado(como)
    bata = _bata_m(a)
    partidas = [{"pedido_detalle_id": d["pedido_detalle_id"], "recibida": 0 if d["id"] == bata["id"] else d["cantidad"],
                 "problema": "faltante" if d["id"] == bata["id"] else None} for d in a["detalles"]]
    det = emp.post(f"/api/cuenta/paquetes/{paq}/recepcion", {"completa": False, "partidas": partidas}).get_json()
    inc = next(i for i in det["incidencias"] if i["tipo"] == "diferencia_recepcion")
    admin = como("admin")
    url = f"/api/admin/incidencias/{inc['id']}"
    rep = admin.post(f"{url}/reposicion", {"partidas": [{"pedido_detalle_id": bata["pedido_detalle_id"], "cantidad": 1}]}
                     ).get_json()["reposiciones"][0]
    alm.post(f"/api/admin/paquetes/{rep['id']}/despachar", {"paqueteria": "Estafeta", "guia": "REP-0001"})
    alm.post(f"/api/admin/paquetes/{rep['id']}/eventos", {"estado": "entregado", "descripcion": "Recibió compras"})
    emp.post(f"/api/cuenta/paquetes/{rep['id']}/recepcion", {"completa": True})

    entradas = _entradas(admin, url)
    # Creación (automática, a nombre de la sucursal), preparación, envío y recepción completa: ninguno es un mensaje
    assert [c for c, _, _ in entradas] == ["evento"] * 4, entradas
    assert [l for _, l, _ in entradas] == ["sucursal", "lurima", "lurima", "sucursal"]
    _coincide_con_es_humana(app, admin, inc["id"], url)
