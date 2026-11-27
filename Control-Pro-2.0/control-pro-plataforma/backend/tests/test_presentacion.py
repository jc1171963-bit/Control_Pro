"""Modo presentación: cuenta temporal de aprobador con horario, una sola sesión, bitácora y solo consulta opcional."""
from datetime import timedelta

from .conftest import Api


def _crear(app, desde_min=-5, horas=1.0, solo_lectura=False, correo="invitado.demo@ejemplo.mx"):
    with app.app_context():
        from app.models import ahora
        from app.services import presentacion_service as pres
        _, password = pres.crear("Invitado Demo", correo, ahora() + timedelta(minutes=desde_min), horas,
                                 "LURIMA", solo_lectura)
        return password


def _entrar(app, password, correo="invitado.demo@ejemplo.mx"):
    c = app.test_client()
    r = c.post("/api/auth/portal/login", json={"correo": correo, "password": password})
    return c, r


def test_dentro_de_horario_entra_como_aprobador_con_marca_de_agua(app):
    password = _crear(app)
    _, r = _entrar(app, password)
    assert r.status_code == 200, r.get_json()
    cuenta = r.get_json()["cuenta"]
    assert cuenta["rol"]["codigo"] == "aprobador"
    assert cuenta["presentacion"]["nombre"] == "Invitado Demo" and cuenta["presentacion"]["correo"] == "invitado.demo@ejemplo.mx"


def test_fuera_de_horario_no_entra_y_la_sesion_abierta_deja_de_valer(app):
    password = _crear(app, desde_min=60)  # empieza en una hora
    _, r = _entrar(app, password)
    assert r.status_code == 401
    password = _crear(app, desde_min=-5)
    c, r = _entrar(app, password)
    api = Api(c, r.get_json()["access_token"])
    assert api.get("/api/admin/pedidos?por_pagina=1").status_code == 200
    with app.app_context():  # termina el horario
        from app.extensions import db
        from app.models import Configuracion, ahora
        cfg = db.session.get(Configuracion, "presentacion")
        cfg.valor = {**cfg.valor, "hasta": (ahora() - timedelta(minutes=1)).isoformat()}
        db.session.commit()
    r = api.get("/api/admin/pedidos?por_pagina=1")
    assert r.status_code == 401 and r.get_json()["error"]["codigo"] == "sesion_expirada"


def test_una_sola_sesion_a_la_vez(app):
    password = _crear(app)
    c1, r1 = _entrar(app, password)
    primera = Api(c1, r1.get_json()["access_token"])
    _, r2 = _entrar(app, password)
    assert r2.status_code == 200
    assert primera.get("/api/admin/pedidos?por_pagina=1").status_code == 401  # el primer dispositivo quedó fuera


def test_bitacora_de_lo_que_vio_e_hizo(app, como):
    password = _crear(app)
    c, r = _entrar(app, password)
    api = Api(c, r.get_json()["access_token"])
    api.get("/api/admin/pedidos?por_pagina=1")
    api.post("/api/presentacion/vista", {"ruta": "/aprobador/seguimiento"})
    api.post("/api/presentacion/evento", {"tipo": "captura", "detalle": "Tecla Imprimir Pantalla"})
    api.get("/api/actividad")  # pulso automático: no se registra
    b = como("admin").get("/api/admin/presentacion").get_json()
    acciones = [x["accion"] for x in b["bitacora"]]
    assert "presentacion.entrada" in acciones and "presentacion.vista" in acciones and "presentacion.evento.captura" in acciones
    rutas = [(x["detalle"] or {}).get("ruta", "") for x in b["bitacora"] if x["accion"] == "presentacion.peticion"]
    assert any(r.startswith("/api/admin/pedidos") for r in rutas) and not any("actividad" in r for r in rutas)
    # Otra cuenta no puede registrar eventos de presentación
    assert como("aprobador").post("/api/presentacion/evento", {"tipo": "captura"}).status_code == 404


def test_solo_consulta_no_deja_hacer_cambios(app):
    password = _crear(app, solo_lectura=True)
    c, r = _entrar(app, password)
    api = Api(c, r.get_json()["access_token"])
    assert api.get("/api/admin/pedidos?por_pagina=1").status_code == 200
    r = api.post("/api/admin/pedidos/1/decision", {"decision": "aprobado"})
    assert r.status_code == 403 and r.get_json()["error"]["codigo"] == "solo_consulta"
    assert api.post("/api/presentacion/vista", {"ruta": "/aprobador"}).status_code == 200


def test_cerrar_saca_a_la_persona_de_inmediato(app, como):
    password = _crear(app)
    c, r = _entrar(app, password)
    api = Api(c, r.get_json()["access_token"])
    assert como("admin").post("/api/admin/presentacion/cerrar").get_json()["cerrada"] is True
    assert api.get("/api/admin/pedidos?por_pagina=1").status_code == 401
    _, r = _entrar(app, password)
    assert r.status_code == 401


def test_nunca_toma_una_cuenta_real_del_sistema(app):
    import pytest
    from sqlalchemy import select
    from app.errors import AppError
    from app.extensions import db
    from app.models import Usuario
    with app.app_context():
        hash_antes = db.session.scalars(select(Usuario).where(Usuario.correo == "aprobador@controlpro.mx")).one().hash_password
    with pytest.raises(AppError):
        _crear(app, correo="aprobador@controlpro.mx")
    with app.app_context():
        real = db.session.scalars(select(Usuario).where(Usuario.correo == "aprobador@controlpro.mx")).one()
        assert real.activo and real.hash_password == hash_antes  # la cuenta real quedó intacta


def test_otra_presentacion_cierra_la_anterior_y_se_puede_renovar(app):
    password = _crear(app)
    c, r = _entrar(app, password)
    primera = Api(c, r.get_json()["access_token"])
    _crear(app, correo="otro.invitado@ejemplo.mx")
    assert primera.get("/api/admin/pedidos?por_pagina=1").status_code == 401  # la cuenta anterior quedó cerrada
    assert _entrar(app, password)[1].status_code == 401
    password = _crear(app)  # una cuenta que ya fue de presentación sí se puede renovar
    assert _entrar(app, password)[1].status_code == 200


def test_contrasena_segura_y_sin_caracteres_confusos(app):
    import re
    password = _crear(app)
    assert re.fullmatch(r"[A-HJ-NP-Za-km-np-z2-9]{4}(-[A-HJ-NP-Za-km-np-z2-9]{4}){2}", password), password
    assert any(c.isupper() for c in password) and any(c.islower() for c in password) and any(c.isdigit() for c in password)


def test_ajustar_horario_sin_cambiar_la_contrasena(app):
    password = _crear(app, desde_min=60)  # empieza en una hora: aún no entra
    assert _entrar(app, password)[1].status_code == 401
    r = app.test_cli_runner().invoke(args=["presentacion-ajustar", "--horas", "3"])  # solo cambia la duración
    assert r.exit_code == 0 and "ajustada" in r.output, r.output
    with app.app_context():
        from app.models import ahora
        from app.services import presentacion_service as pres
        assert not pres.ajustar(desde=ahora() - timedelta(minutes=5))["solo_lectura"]  # se adelanta; la duración se queda
    c, r = _entrar(app, password)  # la misma contraseña sirve con el horario nuevo
    assert r.status_code == 200
    api = Api(c, r.get_json()["access_token"])
    r = app.test_cli_runner().invoke(args=["presentacion-ajustar", "--solo-lectura"])
    assert r.exit_code == 0 and "solo consulta" in r.output, r.output
    r = api.post("/api/admin/pedidos/1/decision", {"decision": "aprobado"})
    assert r.status_code == 403 and r.get_json()["error"]["codigo"] == "solo_consulta"


def test_intento_fuera_de_horario_queda_en_la_bitacora_y_cerrada_no_se_reabre(app, como):
    password = _crear(app, desde_min=60)
    assert _entrar(app, password)[1].status_code == 401
    acciones = [x["accion"] for x in como("admin").get("/api/admin/presentacion").get_json()["bitacora"]]
    assert "presentacion.intento_fuera_de_horario" in acciones
    como("admin").post("/api/admin/presentacion/cerrar")
    r = app.test_cli_runner().invoke(args=["presentacion-ajustar", "--horas", "2"])
    assert r.exit_code != 0 and "No hay una presentación abierta" in r.output, r.output


def test_ventana_de_prueba_no_toca_el_horario_acordado_y_se_marca_en_la_bitacora(app, como):
    from datetime import datetime, timezone
    password = _crear(app, desde_min=60 * 18)  # la presentación es mañana
    assert _entrar(app, password)[1].status_code == 401
    r = app.test_cli_runner().invoke(args=["presentacion-prueba", "--horas", "3"])
    assert r.exit_code == 0 and "Ventana de pruebas abierta" in r.output, r.output
    c, r = _entrar(app, password)  # la misma contraseña sirve en la ventana de pruebas
    assert r.status_code == 200
    fin = datetime.fromisoformat(r.get_json()["cuenta"]["presentacion"]["hasta"])  # el aviso cuenta hacia el fin de la prueba
    assert abs((fin - datetime.now(timezone.utc)) - timedelta(hours=3)) < timedelta(minutes=2)
    entrada = next(x for x in como("admin").get("/api/admin/presentacion").get_json()["bitacora"]
                   if x["accion"] == "presentacion.entrada")
    assert entrada["detalle"]["prueba"] is True
    api = Api(c, r.get_json()["access_token"])
    r = app.test_cli_runner().invoke(args=["presentacion-prueba", "--terminar"])
    assert r.exit_code == 0 and "terminada" in r.output, r.output
    assert api.get("/api/admin/pedidos?por_pagina=1").status_code == 401  # terminó la prueba: queda fuera
    with app.app_context():
        from app.models import ahora
        from app.services import presentacion_service as pres
        assert pres.en_ventana(ahora() + timedelta(hours=18, minutes=30))  # el horario acordado sigue intacto
        assert not pres.en_ventana(ahora() + timedelta(hours=2))


def test_pantalla_en_vivo_muestra_estado_y_actividad(app, como):
    password = _crear(app)
    c, r = _entrar(app, password)
    api = Api(c, r.get_json()["access_token"])
    api.get("/api/actividad")  # pulso de 2 s: la pestaña está abierta y visible
    api.post("/api/presentacion/vista", {"ruta": "/aprobador/seguimiento"})
    api.post("/api/presentacion/evento", {"tipo": "captura", "detalle": "Tecla Imprimir Pantalla"})
    api.post("/api/presentacion/evento", {"tipo": "fuera_de_ventana", "detalle": "Salió de la ventana"})
    api.get("/api/admin/pedidos?por_pagina=1")
    d = como("admin").get("/api/admin/presentacion/en-vivo").get_json()
    assert d["configurada"] and d["cuenta_activa"] and d["persona"]["nombre"] == "Invitado Demo"
    assert d["ventana"]["tipo"] == "acordada" and d["sesion"]["agente"] is not None and d["ultimo_pulso"]
    assert d["conteos"]["pantallas"] == 1 and d["conteos"]["alertas"] == 1 and d["conteos"]["salidas"] == 1
    assert d["conteos"]["acciones"] == 0  # entrar no cuenta como acción
    assert not any("/api/auth/" in str((x["detalle"] or {}).get("ruta", "")) for x in d["actividad"])  # ni se registra
    acciones = [x["accion"] for x in d["actividad"]]
    assert "presentacion.entrada" in acciones and "presentacion.evento.captura" in acciones
    assert any(x["sistema"] and x["accion"] == "presentacion.crear" for x in d["actividad"])
    assert not any("actividad" in str((x["detalle"] or {}).get("ruta", "")) for x in d["actividad"])  # el pulso no ensucia
    # la cuenta vigilada no puede ver su propia vigilancia ni extenderse el horario
    assert api.get("/api/admin/presentacion/en-vivo").status_code in (403, 404)
    assert api.post("/api/admin/presentacion/extender", {"minutos": 30}).status_code in (403, 404)


def test_extender_desde_la_pantalla_sin_cambiar_la_contrasena(app, como):
    from datetime import datetime
    password = _crear(app, desde_min=-5, horas=1.0)
    admin = como("admin")
    antes = admin.get("/api/admin/presentacion/en-vivo").get_json()["ventana"]["hasta"]
    r = admin.post("/api/admin/presentacion/extender", {"minutos": 30})
    assert r.status_code == 200, r.get_json()
    assert datetime.fromisoformat(r.get_json()["hasta"]) - datetime.fromisoformat(antes) == timedelta(minutes=30)
    assert admin.post("/api/admin/presentacion/extender", {"minutos": 0}).status_code == 400
    assert _entrar(app, password)[1].status_code == 200  # la contraseña sigue siendo la misma
    # sin presentación abierta no hay nada que extender
    admin.post("/api/admin/presentacion/cerrar")
    assert admin.post("/api/admin/presentacion/extender", {"minutos": 30}).status_code == 400
