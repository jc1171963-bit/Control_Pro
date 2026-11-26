"""Turno de atención de las incidencias (Fase 3): núcleo puro y su uso coherente en serializador, filtros y contadores."""
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.services import turno_service as ts

T0 = datetime(2026, 11, 20, 10, 0, tzinfo=timezone.utc)
FOLIO = "PAQ-2026-000123"


def seg(i, anterior, nuevo, comentario=None, quien="lurima", minutos=None, adjuntos=None, creado="auto"):
    """Entrada de seguimiento en memoria. `minutos` desde T0 (por omisión, el id); `creado=None` = sin fecha."""
    return SimpleNamespace(id=i, estado_anterior=anterior, estado_nuevo=nuevo, comentario=comentario,
                           adjuntos=adjuntos or [], usuario_id=7 if quien == "lurima" else None,
                           cliente_id=3 if quien == "sucursal" else None,
                           creado=(T0 + timedelta(minutes=i if minutos is None else minutos)) if creado == "auto" else creado)


def creacion(quien="sucursal"):
    return seg(1, None, "abierta", "Incidencia registrada", quien)


def turno(estado, entradas, repos=(), corporativa=True):
    return ts.calcular(estado, corporativa, entradas, list(repos), T0)


# ---------------------------------------------------------------- precedencia

def test_cerrada_e_interna():
    assert turno("cerrada", [creacion(), seg(2, "resuelta", "cerrada", "Solución confirmada", "sucursal")]).codigo == "cerrada"
    assert turno("cerrada", []).actor is None
    # Sin pedido corporativo (tienda, transferencia, devolución): no hay turno entre empresas
    assert turno("en_atencion", [creacion("lurima"), seg(2, "abierta", "en_atencion", "Revisando")], corporativa=False).codigo == "interna"


def test_resuelta_pide_confirmacion_aunque_la_sucursal_escriba_despues():
    entradas = [creacion(), seg(2, "abierta", "resuelta", "Se cambió la talla"),
                seg(3, "resuelta", "resuelta", "Gracias, lo revisamos", "sucursal")]
    t = turno("resuelta", entradas)
    assert (t.codigo, t.actor, t.desde) == ("sucursal_confirmar", "sucursal", entradas[1].creado)


def test_reposicion_por_etapas():
    base = [creacion(), seg(2, "abierta", "en_atencion", "Ocupo evidencia")]
    for estado in ("preparado", "despachado", "en_transito", "incidencia", "listo_para_recoger"):
        assert turno("en_atencion", base, [(estado, False)]).codigo == "lurima_reposicion", estado
    assert turno("en_atencion", base, [("entregado", False)]).codigo == "sucursal_recibir"
    # Ya recibida (con diferencias) o cancelada: deja de contar y decide el seguimiento
    assert turno("en_atencion", base, [("entregado", True)]).codigo == "sucursal_responder"
    assert turno("en_atencion", base, [("cancelado", False)]).codigo == "sucursal_responder"
    # Recibir tiene precedencia sobre otra reposición todavía en camino
    assert turno("en_atencion", base, [("en_transito", False), ("entregado", False)]).codigo == "sucursal_recibir"


def test_sin_mensajes_humanos_atiende_lurima():
    for quien in ("sucursal", "lurima"):  # manual o automática, de cualquiera de los dos lados
        t = turno("abierta", [creacion(quien)])
        assert (t.codigo, t.desde) == ("lurima_atender", creacion().creado)
    # Lurima la toma sin escribir nada
    assert turno("en_atencion", [creacion(), seg(2, "abierta", "en_atencion")]).codigo == "lurima_atender"


def test_ultimo_mensaje_decide():
    lurima = [creacion(), seg(2, "abierta", "en_atencion", "Ocupo evidencia")]
    assert turno("en_atencion", lurima).codigo == "sucursal_responder"
    respuesta = lurima + [seg(3, "en_atencion", "en_atencion", None, "sucursal", adjuntos=["/api/archivos/privados/1"])]
    t = turno("en_atencion", respuesta)
    assert (t.codigo, t.desde) == ("lurima_responder", respuesta[-1].creado)  # solo con una foto también es respuesta
    reabierta = [creacion(), seg(2, "abierta", "resuelta", "Listo"),
                 seg(3, "resuelta", "en_atencion", "Reabierta por la sucursal: no le queda", "sucursal")]
    assert turno("en_atencion", reabierta).codigo == "lurima_responder"


def test_mensaje_ambiguo_de_lurima_pasa_el_turno_a_la_sucursal():
    # Criterio provisional aprobado (Fase 3 §6): sin intención guardada, un aviso informativo cuenta como petición
    entradas = [creacion(), seg(2, "abierta", "en_atencion", "Ocupo evidencia", "lurima"),
                seg(3, "en_atencion", "en_atencion", "Aquí está", "sucursal"),
                seg(4, "en_atencion", "en_atencion", "Lo revisamos con almacén")]
    assert turno("en_atencion", entradas).codigo == "sucursal_responder"
    # Varios usuarios de Lurima siguen siendo «Lurima»
    otro = seg(5, "en_atencion", "en_atencion", "Confirmamos mañana")
    otro.usuario_id = 99
    assert turno("en_atencion", entradas + [otro]).codigo == "sucursal_responder"


def test_evento_de_lurima_posterior_al_mensaje_devuelve_el_turno():
    entradas = [creacion(), seg(2, "abierta", "en_atencion", "Ocupo evidencia"), seg(3, "en_atencion", "abierta")]
    t = turno("abierta", entradas)
    assert (t.codigo, t.desde) == ("lurima_atender", entradas[-1].creado)
    # Notas automáticas de reposición también (reposición cancelada o recibida con diferencias)
    cancelada = [creacion(), seg(2, "abierta", "en_atencion", "Ocupo evidencia"),
                 seg(3, "en_atencion", "en_atencion", f"Se canceló la reposición {FOLIO} antes de salir.")]
    assert turno("en_atencion", cancelada, [("cancelado", False)]).codigo == "lurima_atender"
    # Un evento anterior al último mensaje no cuenta
    antes = [creacion(), seg(2, "abierta", "en_atencion"), seg(3, "en_atencion", "en_atencion", "Ocupo evidencia")]
    assert turno("en_atencion", antes).codigo == "sucursal_responder"


def test_cambio_de_responsable_no_cambia_turno_ni_actividad():
    entradas = [creacion(), seg(2, "abierta", "en_atencion", "Ocupo evidencia")]
    solo_responsable = seg(3, "en_atencion", "en_atencion", minutos=60)
    t = turno("en_atencion", entradas + [solo_responsable])
    assert t.codigo == "sucursal_responder" and t.ultima_actividad == entradas[-1].creado


def test_sistema_y_creacion_no_son_humanos():
    sistema = seg(2, "abierta", "abierta", "Ajuste automático", quien="sistema")
    assert not ts.es_humana(sistema) and not ts.es_humana(creacion())
    assert turno("abierta", [creacion(), sistema]).codigo == "lurima_atender"


def test_mensaje_humano_que_empieza_como_nota_no_se_confunde():
    humano = seg(2, "abierta", "en_atencion", "Reposición pendiente: ¿nos confirman la talla?")
    assert ts.es_humana(humano)
    assert turno("en_atencion", [creacion(), humano]).codigo == "sucursal_responder"


# ---------------------------------------------------------------- orden cronológico y fechas

def test_orden_por_fecha_y_no_por_id():
    # La respuesta de la sucursal tiene id menor pero es posterior
    entradas = [creacion(), seg(9, "abierta", "en_atencion", "Ocupo evidencia", minutos=5),
                seg(4, "en_atencion", "en_atencion", "Ya la subimos", "sucursal", minutos=10)]
    assert turno("en_atencion", entradas).codigo == "lurima_responder"
    assert [s.id for s in ts.ordenar(entradas)] == [1, 9, 4]


def test_misma_fecha_desempata_por_id():
    # Misma transacción → mismo now(): manda el orden de inserción
    entradas = [creacion(), seg(2, "abierta", "en_atencion", "Ocupo evidencia", minutos=5),
                seg(3, "en_atencion", "en_atencion", "Aquí está", "sucursal", minutos=5)]
    assert turno("en_atencion", entradas).codigo == "lurima_responder"
    assert turno("en_atencion", list(reversed(entradas))).codigo == "lurima_responder"


def test_entrada_sin_fecha_es_la_mas_reciente():
    entradas = [creacion(), seg(2, "abierta", "en_atencion", "Ocupo evidencia"),
                seg(3, "en_atencion", "en_atencion", "Aquí está", "sucursal", creado=None)]
    t = turno("en_atencion", entradas)
    assert t.codigo == "lurima_responder" and t.ultima_actividad == entradas[1].creado


def test_ultima_actividad():
    assert turno("abierta", []).ultima_actividad == T0  # sin seguimiento: la creación de la incidencia
    entradas = [creacion(), seg(2, "abierta", "en_atencion", "Ocupo evidencia", minutos=30)]
    assert turno("en_atencion", entradas).ultima_actividad == T0 + timedelta(minutes=30)
    # Las notas automáticas sí son actividad (aunque no sean mensajes)
    nota = seg(3, "en_atencion", "en_atencion", f"Reposición {FOLIO} enviada con Estafeta, guía REP-1.", minutos=90)
    assert turno("en_atencion", entradas + [nota], [("despachado", False)]).ultima_actividad == T0 + timedelta(minutes=90)


def test_datos_demo_de_la_fase_2():
    """Las 4 incidencias de la base demo (Fase 3, T-30), reconstruidas con su seguimiento real."""
    inc1 = [creacion(), seg(2, "abierta", "en_atencion", "Espero su evidencia"), seg(3, "en_atencion", "resuelta")]
    inc2 = [creacion(), seg(6, "abierta", "en_atencion", "Ocupo evidencia de daño")]
    inc4 = [creacion()]
    assert turno("resuelta", inc1).codigo == "sucursal_confirmar"
    assert turno("en_atencion", inc2).codigo == "sucursal_responder"
    assert turno("abierta", inc4).codigo == "lurima_atender"


def test_notas_reales_se_reconocen():
    """Cada nota que escribe logistica_service._nota_incidencia se reconoce como automática (vigila los textos fijos)."""
    fuente = (Path(ts.__file__).parent / "logistica_service.py").read_text(encoding="utf-8")
    plantillas = re.findall(r'_nota_incidencia\([^,]+, f"([^"]+)"', fuente)
    assert len(plantillas) == 4
    valores = {"paq.folio": FOLIO, "resumen": f"{FOLIO}, PAQ-2026-000124", "paqueteria.strip()": "Estafeta",
               "guia.strip()": "REP-0001"}
    for p in plantillas:
        texto = re.sub(r"\{([^}]+)\}", lambda m: valores[m.group(1)], p)
        assert ts.es_nota_automatica(seg(2, "en_atencion", "en_atencion", texto)), texto


def test_codigos_de_filtro():
    assert ts.codigos(None) is None and ts.codigos("") is None
    assert ts.codigos("sucursal_responder, lurima_atender") == {"sucursal_responder", "lurima_atender"}
    from app.errors import AppError
    with pytest.raises(AppError):
        ts.codigos("te_toca")


# ---------------------------------------------------------------- integración: mismo turno en todas partes

def _vistas(suc, aten, admin, inc_id, pedido_id):
    """El turno de la incidencia en cada lugar donde se entrega."""
    def en(lista):
        return next(i["turno"] for i in lista if i["id"] == inc_id)
    return {
        "cuenta_lista": en(suc.get("/api/cuenta/incidencias").get_json()["items"]),
        "cuenta_detalle": suc.get(f"/api/cuenta/incidencias/{inc_id}").get_json()["turno"],
        "cuenta_pedido": en(suc.get(f"/api/cuenta/pedidos/{pedido_id}").get_json()["incidencias"]),
        "admin_lista": en(aten.get("/api/admin/incidencias?estado=").get_json()["items"]),
        "admin_detalle": aten.get(f"/api/admin/incidencias/{inc_id}").get_json()["turno"],
        "admin_pedido": en(admin.get(f"/api/admin/pedidos/{pedido_id}").get_json()["incidencias"]),
    }


def _filtrada(api, ruta, turno_, inc_id):
    r = api.get(f"{ruta}?turno={turno_}")
    assert r.status_code == 200, r.get_json()
    return any(i["id"] == inc_id for i in r.get_json()["items"])


def test_turno_coherente_en_api_filtros_y_contadores(como):
    from .test_incidencias_sucursal import _incidencia
    suc, p, inc = _incidencia(como)
    aten, admin = como("atencion"), como("admin")
    base = f"/api/cuenta/incidencias/{inc['id']}"

    def comprobar(esperado):
        vistas = _vistas(suc, aten, admin, inc["id"], p["id"])
        assert set(vistas.values()) == {esperado}, vistas
        for ruta, api in (("/api/cuenta/incidencias", suc), ("/api/admin/incidencias", aten)):
            assert _filtrada(api, ruta, esperado, inc["id"])
            otro = "lurima_atender" if esperado != "lurima_atender" else "sucursal_responder"
            assert not _filtrada(api, ruta, otro, inc["id"])
        resumen = suc.get("/api/cuenta/resumen").get_json()
        tablero = admin.get("/api/admin/reportes/dashboard").get_json()
        if esperado != "cerrada":
            assert resumen["incidencias_por_turno"][esperado] >= 1 and tablero["incidencias_por_turno"][esperado] >= 1
        return resumen

    # Recién creada por la sucursal: atiende Lurima (ya no aparece «Respondió la sucursal» por la creación)
    assert inc["turno"] == "lurima_atender" and inc["respondio_sucursal"] is False
    comprobar("lurima_atender")
    antes = suc.get("/api/cuenta/resumen").get_json()["incidencias_te_esperan"]

    aten.patch(f"/api/admin/incidencias/{inc['id']}", {"estado": "en_atencion", "comentario": "Envíanos una foto"})
    resumen = comprobar("sucursal_responder")
    assert resumen["incidencias_te_esperan"] == antes + 1
    assert resumen["incidencias_te_esperan"] == sum(
        n for c, n in resumen["incidencias_por_turno"].items() if c.startswith("sucursal_"))

    assert suc.post(f"{base}/mensajes", {"texto": "Ya la subimos al expediente"}).status_code == 201
    comprobar("lurima_responder")
    vista = aten.get(f"/api/admin/incidencias/{inc['id']}").get_json()
    assert vista["respondio_sucursal"] is True and [s["lado"] for s in vista["seguimiento"]] == ["sucursal", "lurima", "sucursal"]
    assert vista["ultima_actividad"] == vista["seguimiento"][-1]["fecha"] == vista["turno_desde"]

    aten.patch(f"/api/admin/incidencias/{inc['id']}", {"estado": "resuelta", "comentario": "Se envió la talla G"})
    comprobar("sucursal_confirmar")
    assert suc.post(f"{base}/confirmar").status_code == 200
    assert set(_vistas(suc, aten, admin, inc["id"], p["id"]).values()) == {"cerrada"}
    assert _filtrada(suc, "/api/cuenta/incidencias", "cerrada", inc["id"])


def test_filtro_de_turno_invalido(como):
    assert como("empresa").get("/api/cuenta/incidencias?turno=te_toca").status_code == 400
    assert como("atencion").get("/api/admin/incidencias?turno=x").status_code == 400


def test_reposicion_y_nueva_incidencia_conservan_su_turno(como):
    from .test_recepcion_reposicion import _bata_m, _entregado
    emp, alm, a, paq = _entregado(como)
    bata_m = _bata_m(a)
    partidas = [{"pedido_detalle_id": d["pedido_detalle_id"], "recibida": 0 if d["id"] == bata_m["id"] else d["cantidad"],
                 "problema": "faltante" if d["id"] == bata_m["id"] else None} for d in a["detalles"]]
    det = emp.post(f"/api/cuenta/paquetes/{paq}/recepcion", {"completa": False, "partidas": partidas}).get_json()
    inc = next(i for i in det["incidencias"] if i["tipo"] == "diferencia_recepcion")
    assert inc["turno"] == "lurima_atender" and inc["reposicion_de"] is None  # automática: atiende Lurima

    admin = como("admin")
    url = f"/api/admin/incidencias/{inc['id']}"
    admin.patch(url, {"comentario": "Ocupo una foto de la manga"})
    assert admin.get(url).get_json()["turno"] == "sucursal_responder"
    rep = admin.post(f"{url}/reposicion", {"partidas": [{"pedido_detalle_id": bata_m["pedido_detalle_id"], "cantidad": 1}]}
                     ).get_json()["reposiciones"][0]
    assert admin.get(url).get_json()["turno"] == "lurima_reposicion"  # la nota automática no pasa el turno
    alm.post(f"/api/admin/paquetes/{rep['id']}/despachar", {"paqueteria": "Estafeta", "guia": "REP-0001"})
    assert admin.get(url).get_json()["turno"] == "lurima_reposicion"
    alm.post(f"/api/admin/paquetes/{rep['id']}/eventos", {"estado": "entregado", "descripcion": "Recibió compras"})
    assert admin.get(url).get_json()["turno"] == "sucursal_recibir"

    # Llega con diferencias: nace OTRA incidencia, relacionada con la original; cada una con su propio turno
    r = emp.post(f"/api/cuenta/paquetes/{rep['id']}/recepcion", {"completa": False, "partidas": [
        {"pedido_detalle_id": bata_m["pedido_detalle_id"], "recibida": 0, "problema": "faltante", "nota": "Tampoco llegó"}]})
    assert r.status_code == 201, r.get_json()
    incs = {i["id"]: i for i in r.get_json()["incidencias"]}
    nueva = next(i for i in incs.values() if i["id"] != inc["id"] and i["paquete_id"] == rep["id"])
    assert nueva["reposicion_de"] == {"id": inc["id"], "folio": inc["folio"]}
    assert nueva["turno"] == "lurima_atender" and nueva["reposiciones"] == []
    original = incs[inc["id"]]
    assert original["turno"] == "lurima_atender" and original["estado"] == "en_atencion"
    assert {s["comentario"] for s in nueva["seguimiento"]}.isdisjoint({"Ocupo una foto de la manga"})

    # La actividad de la nueva no mueve a la original
    admin.patch(f"/api/admin/incidencias/{nueva['id']}", {"comentario": "¿Nos mandan foto?"})
    assert admin.get(f"/api/admin/incidencias/{nueva['id']}").get_json()["turno"] == "sucursal_responder"
    assert admin.get(url).get_json()["turno"] == "lurima_atender"


def test_reposicion_recibida_completa_pide_confirmacion(como):
    from .test_recepcion_reposicion import _bata_m, _entregado
    emp, alm, a, paq = _entregado(como)
    bata_m = _bata_m(a)
    partidas = [{"pedido_detalle_id": d["pedido_detalle_id"], "recibida": 0 if d["id"] == bata_m["id"] else d["cantidad"],
                 "problema": "faltante" if d["id"] == bata_m["id"] else None} for d in a["detalles"]]
    det = emp.post(f"/api/cuenta/paquetes/{paq}/recepcion", {"completa": False, "partidas": partidas}).get_json()
    inc = next(i for i in det["incidencias"] if i["tipo"] == "diferencia_recepcion")
    admin = como("admin")
    rep = admin.post(f"/api/admin/incidencias/{inc['id']}/reposicion",
                     {"partidas": [{"pedido_detalle_id": bata_m["pedido_detalle_id"], "cantidad": 1}]}).get_json()["reposiciones"][0]
    alm.post(f"/api/admin/paquetes/{rep['id']}/despachar", {"paqueteria": "Estafeta", "guia": "REP-0002"})
    alm.post(f"/api/admin/paquetes/{rep['id']}/eventos", {"estado": "entregado", "descripcion": "Recibió compras"})
    det = emp.post(f"/api/cuenta/paquetes/{rep['id']}/recepcion", {"completa": True}).get_json()
    assert next(i for i in det["incidencias"] if i["id"] == inc["id"])["turno"] == "sucursal_confirmar"
