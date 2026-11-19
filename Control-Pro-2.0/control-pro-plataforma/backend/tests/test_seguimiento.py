"""Seguimiento (trazabilidad) de todas las solicitudes corporativas a la vez."""
from app.extensions import db


def test_seguimiento_por_etapas_con_trazabilidad(app, como):
    from seeds.simular_actividad import borrar, simular
    with app.app_context():
        simular(semanas=6, solicitudes=40, semilla=11)
    aprob = como("aprobador")
    r = aprob.get("/api/admin/seguimiento").get_json()
    c = r["conteo"]
    assert r["etapa"] == "activas"
    assert c["todas"] == sum(c[k] for k in ("por_aprobar", "devueltas", "por_autorizar", "en_surtido", "en_camino", "en_entrega", "cerradas", "detenidas"))
    assert c["activas"] == r["total"] and c["activas"] == c["todas"] - c["cerradas"] - c["detenidas"]
    activos = {"en_revision", "devuelto", "aprobado", "confirmado", "en_preparacion", "parcialmente_enviado", "enviado", "parcialmente_entregado", "entregado"}
    assert all(x["estado"] in activos for x in r["items"])
    # Cada solicitud trae lo necesario para dibujar su trazabilidad
    x = r["items"][0]
    assert {"historial", "paquetes", "entregas_individuales", "folio", "cliente", "articulos"} <= set(x)
    assert x["historial"] and x["historial"][0]["nuevo"] == "en_revision"
    # Por omisión, primero la que lleva más tiempo sin avanzar
    ultimos = [max(h["fecha"] for h in i["historial"]) for i in r["items"]]
    assert ultimos == sorted(ultimos)
    # Filtro por etapa y búsqueda
    cerradas = aprob.get("/api/admin/seguimiento?etapa=cerradas&por_pagina=50").get_json()
    assert cerradas["total"] == c["cerradas"] and all(i["estado"] == "cerrado" for i in cerradas["items"])
    assert all(i["historial"][-1]["nuevo"] == "cerrado" for i in cerradas["items"])
    folio = cerradas["items"][0]["folio"]
    busq = aprob.get(f"/api/admin/seguimiento?etapa=todas&q={folio}").get_json()
    assert [i["folio"] for i in busq["items"]] == [folio]
    assert como("cliente").get("/api/admin/seguimiento").status_code in (401, 403)
    with app.app_context():
        borrar()
