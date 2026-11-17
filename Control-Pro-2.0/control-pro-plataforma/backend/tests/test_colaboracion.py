"""Aprobador del lado de Salud Digna: entra por el portal, autoriza permisos de padrón, su aprobación llega a la
distribuidora y conversa con sucursales y distribuidora."""
from datetime import timedelta

from sqlalchemy import select, update

from app.extensions import db
from app.models import PermisoPadron, Rol, ahora
from app.security.permisos import sincronizar_roles

from .conftest import PASSWORD, Api
from .test_aprobador import _solicitud, _var


def _portal(client, correo):
    return client.post("/api/auth/portal/login", json={"correo": correo, "password": PASSWORD})


def test_portal_admite_sucursales_y_aprobador_pero_no_al_personal_interno(client):
    r = _portal(client, "empresa@demo.mx")
    assert r.status_code == 200 and r.get_json()["tipo"] == "cliente"
    r = _portal(client, "aprobador@controlpro.mx")
    assert r.status_code == 200 and r.get_json()["tipo"] == "usuario" and r.get_json()["cuenta"]["rol"]["codigo"] == "aprobador"
    assert _portal(client, "admin@controlpro.mx").status_code == 401  # la distribuidora entra por /admin/entrar
    assert client.post("/api/auth/portal/login", json={"correo": "aprobador@controlpro.mx", "password": "mal"}).status_code == 401


def test_permiso_de_padron_completo(app, como):
    suc, aprob = como("empresa"), como("aprobador")
    empleado = {"numero": "P-01", "nombre": "Pedro Paz", "puesto": "Enfermería"}
    assert suc.post("/api/cuenta/empleados", empleado).status_code == 403
    assert suc.get("/api/cuenta/permiso-padron").get_json()["vigente"] is None
    assert suc.post("/api/cuenta/permiso-padron", {"motivo": "x"}).status_code == 422
    p = suc.post("/api/cuenta/permiso-padron", {"motivo": "Ingresan dos enfermeras"}).get_json()
    assert p["estado"] == "pendiente"
    assert suc.post("/api/cuenta/permiso-padron", {"motivo": "Otra solicitud"}).status_code == 409
    # El aprobador la ve, recibe aviso y no puede rechazar sin motivo
    lista = aprob.get("/api/admin/permisos-padron?estado=pendiente").get_json()
    assert lista["conteo"]["pendientes"] == 1 and lista["items"][0]["sucursal"]["nombre"]
    assert any(n["evento"] == "permiso_padron_solicitado" for n in aprob.get("/api/admin/notificaciones").get_json()["items"])
    assert aprob.post(f"/api/admin/permisos-padron/{p['id']}/decision", {"decision": "rechazado"}).status_code == 400
    assert como("auditor").post(f"/api/admin/permisos-padron/{p['id']}/decision", {"decision": "aprobado"}).status_code == 403
    r = aprob.post(f"/api/admin/permisos-padron/{p['id']}/decision", {"decision": "aprobado", "horas": 2, "respuesta": "Adelante"})
    assert r.status_code == 200 and r.get_json()["estado"] == "aprobado"
    assert aprob.post(f"/api/admin/permisos-padron/{p['id']}/decision", {"decision": "aprobado"}).status_code == 409
    aviso = next(n for n in suc.get("/api/cuenta/notificaciones").get_json()["items"] if n["evento"] == "permiso_padron_aprobado")
    assert "2 h" in aviso["mensaje"]
    # Con permiso vigente modifica su padrón; al terminar se vuelve a bloquear
    nuevo = suc.post("/api/cuenta/empleados", empleado)
    assert nuevo.status_code == 201
    assert suc.post(f"/api/cuenta/permiso-padron/{p['id']}/cerrar").get_json()["estado"] == "terminado"
    assert suc.put(f"/api/cuenta/empleados/{nuevo.get_json()['id']}", {**empleado, "puesto": "Staff"}).status_code == 403
    # Un permiso vencido ya no sirve; el aprobador también puede revocar uno vigente
    p2 = suc.post("/api/cuenta/permiso-padron", {"motivo": "Baja de un empleado"}).get_json()
    aprob.post(f"/api/admin/permisos-padron/{p2['id']}/decision", {"decision": "aprobado"})
    with app.app_context():
        db.session.execute(update(PermisoPadron).where(PermisoPadron.id == p2["id"]).values(vigente_hasta=ahora() - timedelta(minutes=1)))
        db.session.commit()
    assert suc.get("/api/cuenta/permiso-padron").get_json()["historial"][0]["estado"] == "vencido"
    assert suc.post("/api/cuenta/empleados", {**empleado, "numero": "P-02"}).status_code == 403
    p3 = suc.post("/api/cuenta/permiso-padron", {"motivo": "Cambio de puesto"}).get_json()
    aprob.post(f"/api/admin/permisos-padron/{p3['id']}/decision", {"decision": "aprobado"})
    assert aprob.post(f"/api/admin/permisos-padron/{p3['id']}/decision", {"decision": "revocado", "respuesta": "Fuera de horario"}).status_code == 200
    assert suc.post("/api/cuenta/empleados", {**empleado, "numero": "P-03"}).status_code == 403
    # Rechazo con motivo
    p4 = suc.post("/api/cuenta/permiso-padron", {"motivo": "Altas temporales"}).get_json()
    r = aprob.post(f"/api/admin/permisos-padron/{p4['id']}/decision", {"decision": "rechazado", "respuesta": "No se autorizan temporales"})
    assert r.get_json()["estado"] == "rechazado"
    estado = aprob.get(f"/api/admin/cuentas-sucursal/{p4['sucursal']['id']}/permiso-padron").get_json()
    assert estado["vigente"] is None and estado["pendiente"] is None and len(estado["historial"]) == 4


def test_orden_aprobada_llega_a_la_distribuidora(como):
    suc, aprob = como("empresa"), como("aprobador")
    var, empleados = _var(como), {e["nombre"]: e["id"] for e in suc.get("/api/cuenta/empleados").get_json()}
    p = _solicitud(suc, [{"empleado_id": empleados["Ana López"], "variante_id": var("MAN-001", "Unitalla"), "cantidad": 2}])
    aprob.post(f"/api/admin/pedidos/{p['id']}/decision", {"decision": "aprobado"})
    for rol in ("finanzas", "admin", "enc_qro", "atencion"):
        avisos = como(rol).get("/api/admin/notificaciones?por_pagina=50").get_json()["items"]
        orden = next(n for n in avisos if n["evento"] == "orden_aprobada")
        assert p["folio"] in orden["mensaje"] and orden["enlace"] == f"/admin/pedidos/{p['id']}"
    assert not any(n["evento"] == "orden_aprobada" for n in aprob.get("/api/admin/notificaciones").get_json()["items"])
    assert any(n["evento"] == "pedido_confirmado" for n in suc.get("/api/cuenta/notificaciones").get_json()["items"])


def test_chat_entre_aprobador_sucursal_y_distribuidora(como, client):
    suc, aprob, fin = como("empresa"), como("aprobador"), como("finanzas")
    var, empleados = _var(como), {e["nombre"]: e["id"] for e in suc.get("/api/cuenta/empleados").get_json()}
    p = _solicitud(suc, [{"empleado_id": empleados["Ana López"], "variante_id": var("MAN-001", "Unitalla"), "cantidad": 1}])
    # La sucursal abre la conversación de su solicitud (siempre la misma) y escribe dos mensajes
    c = suc.post("/api/cuenta/conversaciones", {"pedido_id": p["id"]}).get_json()
    assert suc.post("/api/cuenta/conversaciones", {"pedido_id": p["id"]}).get_json()["id"] == c["id"]
    assert c["con"] == "Aprobador corporativo" and c["asunto"] == f"Solicitud {p['folio']}"
    assert suc.post(f"/api/cuenta/conversaciones/{c['id']}/mensajes", {"texto": ""}).status_code == 422
    suc.post(f"/api/cuenta/conversaciones/{c['id']}/mensajes", {"texto": "¿Pueden revisar la talla?"})
    suc.post(f"/api/cuenta/conversaciones/{c['id']}/mensajes", {"texto": "Es urgente"})
    # El aprobador: 2 sin leer y un solo aviso en la campana
    assert aprob.get("/api/admin/conversaciones/no-leidos").get_json()["no_leidos"] == 2
    avisos = [n for n in aprob.get("/api/admin/notificaciones").get_json()["items"] if n["evento"] == "mensaje_nuevo"]
    assert len(avisos) == 1 and avisos[0]["enlace"] == f"/aprobador/mensajes?c={c['id']}"
    hilo = aprob.get(f"/api/admin/conversaciones/{c['id']}/mensajes").get_json()
    assert [m["texto"] for m in hilo["items"]] == ["¿Pueden revisar la talla?", "Es urgente"] and not hilo["items"][0]["propio"]
    assert aprob.get("/api/admin/conversaciones/no-leidos").get_json()["no_leidos"] == 0
    r = aprob.post(f"/api/admin/conversaciones/{c['id']}/mensajes", {"texto": "Sí, la cambio a talla G"})
    assert r.status_code == 201 and r.get_json()["propio"] and r.get_json()["rol"] == "Aprobador"
    assert suc.get("/api/cuenta/conversaciones/no-leidos").get_json()["no_leidos"] == 1
    assert any(n["evento"] == "mensaje_nuevo" for n in suc.get("/api/cuenta/notificaciones").get_json()["items"])
    # La distribuidora no ve las conversaciones con sucursales, pero sí la suya con el aprobador
    assert fin.get(f"/api/admin/conversaciones/{c['id']}/mensajes").status_code == 404
    d = aprob.post("/api/admin/conversaciones", {"tipo": "distribuidora", "pedido_id": p["id"]}).get_json()
    assert d["con"] == "Distribuidora"
    aprob.post(f"/api/admin/conversaciones/{d['id']}/mensajes", {"texto": "Orden lista para contactar a la sucursal"})
    lista_fin = fin.get("/api/admin/conversaciones").get_json()
    assert [x["id"] for x in lista_fin["items"]] == [d["id"]] and lista_fin["no_leidos"] == 1
    assert fin.post(f"/api/admin/conversaciones/{d['id']}/mensajes", {"texto": "Recibido"}).status_code == 201
    # Una sucursal no abre conversaciones de solicitudes ajenas; el auditor no participa
    tok = client.post("/api/auth/cliente/login", json={"correo": "empresa@demo.mx", "password": PASSWORD}).get_json()["access_token"]
    assert Api(client, tok).get(f"/api/cuenta/conversaciones/{d['id']}/mensajes").status_code == 404
    assert como("auditor").get("/api/admin/conversaciones").status_code == 403


def test_rol_desincronizado_se_repara_con_seed_roles(app, como):
    """Causa raíz (17-nov): la base no tenía permiso_padron.gestionar en el rol aprobador porque no se ejecutó seed-roles."""
    suc, aprob = como("empresa"), como("aprobador")
    p = suc.post("/api/cuenta/permiso-padron", {"motivo": "Altas del nuevo turno"}).get_json()
    with app.app_context():
        rol = db.session.scalars(select(Rol).filter_by(codigo="aprobador")).one()
        rol.permisos = [x for x in rol.permisos if x.codigo != "permiso_padron.gestionar"]
        db.session.commit()
    r = aprob.get("/api/admin/permisos-padron?estado=pendiente")
    assert r.status_code == 403 and r.get_json()["error"]["detalles"]["requiere"] == ["permiso_padron.gestionar"]
    with app.app_context():
        sincronizar_roles(db)
    # Mismo token: los permisos se leen de la base en cada petición
    assert aprob.get("/api/admin/permisos-padron?estado=pendiente").status_code == 200
    assert aprob.post(f"/api/admin/permisos-padron/{p['id']}/decision", {"decision": "aprobado"}).status_code == 200
    # Sin privilegios de más: el aprobador no administra usuarios y la sucursal no decide permisos
    assert aprob.get("/api/admin/usuarios").status_code == 403
    assert suc.post(f"/api/admin/permisos-padron/{p['id']}/decision", {"decision": "rechazado", "respuesta": "x"}).status_code == 403
