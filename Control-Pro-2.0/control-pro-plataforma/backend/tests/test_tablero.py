"""Tablero ejecutivo del aprobador y simulador de actividad para demostraciones."""
from sqlalchemy import func, select

from app.extensions import db
from app.models import HistorialEstado, Pedido


def test_tablero_del_aprobador_con_actividad_simulada(app, como):
    from seeds.simular_actividad import borrar, simular
    with app.app_context():
        r = simular(semanas=8, solicitudes=60, semilla=7)
        assert r["solicitudes"] == 60
    aprob = como("aprobador")
    t = aprob.get("/api/admin/reportes/aprobador?dias=90").get_json()
    assert t["periodo"]["dias"] == 90 and len(t["semanas"]) == 12 and t["semanas"][-1]["actual"]
    assert t["enviadas"]["actual"] >= 55  # 60 simuladas en 8 semanas (alguna real puede sumarse)
    assert sum(s["enviadas"] for s in t["semanas"]) >= 55
    assert t["tiempo_aprobacion"]["promedio_h"] > 0 and t["tiempo_aprobacion"]["mediana_h"] > 0
    assert 0 <= t["tasa_aprobacion"]["actual"] <= 100
    estados = {e["estado"]: e for e in t["estados"]}
    assert sum(e["solicitudes"] for e in estados.values()) == t["enviadas"]["actual"]
    assert t["zonas"] == sorted(t["zonas"], key=lambda z: (-z["solicitudes"], -z["unidades"], z["nombre"]))
    assert aprob.get("/api/admin/reportes/aprobador?dias=7").get_json()["periodo"]["dias"] == 7
    assert aprob.get("/api/admin/reportes/aprobador?dias=999").get_json()["periodo"]["dias"] == 30
    assert como("auditor").get("/api/admin/reportes/aprobador").status_code == 403
    # Una solicitud simulada trae su historial completo para la línea de tiempo
    sim = next(p for p in aprob.get("/api/admin/pedidos?canal=corporativo&estado=cerrado&por_pagina=50").get_json()["items"]
               if p["folio"].startswith("SIM-"))
    hist = [h["nuevo"] for h in aprob.get(f"/api/admin/pedidos/{sim['id']}").get_json()["historial"]]
    assert hist == ["en_revision", "aprobado", "confirmado", "en_preparacion", "enviado", "entregado", "cerrado"]
    with app.app_context():
        assert borrar() == 60
        assert db.session.scalar(select(func.count()).select_from(Pedido).where(Pedido.folio.like("SIM-%"))) == 0
        assert db.session.scalar(select(func.count()).select_from(HistorialEstado).where(
            HistorialEstado.entidad == "pedido", HistorialEstado.motivo == "Fuera de la dotación autorizada")) == 0
