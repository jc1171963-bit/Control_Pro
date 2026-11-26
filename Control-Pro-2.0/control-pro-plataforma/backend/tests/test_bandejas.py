"""Etapa 3B.2: los contadores de las bandejas (`conteo`) salen de la misma consulta que la lista, así que cada número
coincide con el total de su filtro (?turno=, ?por_enviar=, ?prioridad=) y respeta el alcance de cada usuario."""
from .test_recepcion_reposicion import _bata_m, _entregado

TURNOS_ACTIVOS = ("lurima_atender", "lurima_responder", "lurima_reposicion", "sucursal_responder", "sucursal_recibir",
                  "sucursal_confirmar", "interna")
CODIGOS = {"Sucursal Toluca": "tol", "Sucursal Querétaro": "qro", "Sucursal Puebla": "pue"}


def _escenario(como):
    """Una solicitud surtida con: faltante automático (alta) con reposición preparada, una manual por atender y otra
    manual en la que Lurima ya pidió algo (le toca a la sucursal)."""
    emp, alm, a, paq = _entregado(como)
    bata = _bata_m(a)
    partidas = [{"pedido_detalle_id": d["pedido_detalle_id"], "recibida": 0 if d["id"] == bata["id"] else d["cantidad"],
                 "problema": "faltante" if d["id"] == bata["id"] else None} for d in a["detalles"]]
    det = emp.post(f"/api/cuenta/paquetes/{paq}/recepcion", {"completa": False, "partidas": partidas}).get_json()
    faltante = next(i for i in det["incidencias"] if i["tipo"] == "diferencia_recepcion")
    nueva = lambda tipo, texto: emp.post(f"/api/cuenta/pedidos/{a['pedido_id']}/incidencias",  # noqa: E731
                                         {"tipo": tipo, "descripcion": texto}).get_json()
    atender, responder = nueva("otro", "La etiqueta no coincide con la sucursal."), nueva("talla_incorrecta", "Talla equivocada en la bata.")
    aten, admin = como("atencion"), como("admin")
    aten.patch(f"/api/admin/incidencias/{responder['id']}", {"comentario": "¿Nos mandan foto de la etiqueta?"})
    admin.post(f"/api/admin/incidencias/{faltante['id']}/reposicion",
               {"partidas": [{"pedido_detalle_id": bata["pedido_detalle_id"], "cantidad": 1}]})
    return emp, a, {"faltante": faltante["id"], "atender": atender["id"], "responder": responder["id"]}


def _total(api, ruta, filtro):
    r = api.get(f"{ruta}?{filtro}")
    assert r.status_code == 200, r.get_json()
    return r.get_json()["total"]


def _coherente(api, ruta, extra=""):
    """Cada contador = total de su filtro, con los mismos filtros adicionales (prioridad)."""
    conteo = api.get(f"{ruta}?{extra}").get_json()["conteo"]
    for t in TURNOS_ACTIVOS:
        assert conteo["por_turno"].get(t, 0) == _total(api, ruta, f"turno={t}&{extra}"), (ruta, t, extra)
    assert conteo["cerradas"] == _total(api, ruta, f"turno=cerrada&{extra}")
    assert conteo["todas"] == _total(api, ruta, extra)
    assert conteo["todas"] == sum(conteo["por_turno"].values()) + conteo["cerradas"]  # nadie cuenta dos veces
    return conteo


def test_contadores_coinciden_con_los_filtros_en_ambos_portales(como):
    emp, a, inc = _escenario(como)
    aten = como("atencion")

    suc = _coherente(emp, "/api/cuenta/incidencias")
    assert suc["por_turno"]["sucursal_responder"] >= 1 and suc["por_turno"]["lurima_reposicion"] >= 1
    lur = _coherente(aten, "/api/admin/incidencias")
    assert lur["por_turno"]["lurima_atender"] >= 1
    # Mismo dato, mismo turno en ambos portales para las incidencias de esta solicitud
    vistas = {i["id"]: i["turno"] for i in emp.get("/api/cuenta/incidencias?por_pagina=100").get_json()["items"]}
    assert vistas[inc["faltante"]] == "lurima_reposicion" and vistas[inc["atender"]] == "lurima_atender"
    assert vistas[inc["responder"]] == "sucursal_responder"

    # Prioridad combinada con las bandejas: el conteo se recalcula con el filtro
    _coherente(aten, "/api/admin/incidencias", "prioridad=alta")
    alta = aten.get("/api/admin/incidencias?prioridad=alta").get_json()
    assert {i["id"] for i in alta["items"]} >= {inc["faltante"]} and all(i["prioridad"] == "alta" for i in alta["items"])
    _coherente(emp, "/api/cuenta/incidencias", "prioridad=media")

    # La sucursal cliente viene en cada incidencia (para las tarjetas del panel)
    detalle = aten.get(f"/api/admin/incidencias/{inc['atender']}").get_json()
    assert detalle["cliente"] and detalle["pedido_folio"]


def test_por_enviar_es_logistico_y_respeta_el_alcance(como):
    emp, a, inc = _escenario(como)
    aten = como("atencion")
    codigo = CODIGOS[a["sucursal"]["nombre"]]
    otro = "tol" if codigo != "tol" else "qro"

    conteo = aten.get("/api/admin/incidencias").get_json()["conteo"]
    por_enviar = aten.get("/api/admin/incidencias?por_enviar=1").get_json()
    assert conteo["por_enviar"] == por_enviar["total"]
    assert inc["faltante"] in {i["id"] for i in por_enviar["items"]}
    assert all(i["turno"] == "lurima_reposicion" for i in por_enviar["items"])  # no es un turno, pero vive dentro de uno

    # El almacén que surtió cuenta lo mismo que ve; otro almacén no cuenta lo que no puede ver
    alm = como(f"alm_{codigo}")
    c_alm = _coherente(alm, "/api/admin/incidencias")
    assert c_alm["por_enviar"] == _total(alm, "/api/admin/incidencias", "por_enviar=1") >= 1
    ajeno = como(f"alm_{otro}")
    c_ajeno = _coherente(ajeno, "/api/admin/incidencias")
    visibles = {i["id"] for i in ajeno.get("/api/admin/incidencias?por_pagina=100").get_json()["items"]}
    assert not visibles & set(inc.values())
    assert c_ajeno["todas"] == len(visibles)


def test_paginacion_no_altera_los_contadores(como):
    emp, a, inc = _escenario(como)
    aten = como("atencion")
    p1 = aten.get("/api/admin/incidencias?por_pagina=1&pagina=1").get_json()
    p2 = aten.get("/api/admin/incidencias?por_pagina=1&pagina=2").get_json()
    assert p1["conteo"] == p2["conteo"] and p1["total"] == p2["total"] >= 3
    assert p1["items"][0]["id"] != p2["items"][0]["id"]
    # Filtro inválido: 400 (la bandeja no inventa turnos)
    assert aten.get("/api/admin/incidencias?turno=te_toca").status_code == 400
