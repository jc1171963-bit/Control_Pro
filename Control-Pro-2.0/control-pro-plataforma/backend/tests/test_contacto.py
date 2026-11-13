"""Formulario público de contacto. No usa base de datos: sustituye los fixtures `app` y `restaurar` del conftest."""
import pytest

from app import create_app
import app.api.tienda as tienda

VALIDO = {"nombre": "Ana López", "correo": "ana@ejemplo.mx", "telefono": "555 123 4567", "asunto": "Cotización de batas",
          "mensaje": "Quisiera información sobre batas para mi equipo."}


@pytest.fixture()
def app():
    a = create_app("testing")
    a.config.update(CORREO_PROVEEDOR="smtp", SMTP_HOST="smtp.ejemplo.mx", SMTP_REMITENTE="web@ejemplo.mx",
                    CONTACTO_DESTINATARIO="ventas@ejemplo.mx", CONTACTO_MAX_POR_HORA=2)
    return a


@pytest.fixture(autouse=True)
def restaurar():
    tienda._envios_contacto.clear()
    yield


@pytest.fixture()
def enviados(monkeypatch):
    lista = []
    monkeypatch.setattr(tienda, "enviar_correo", lambda *a, **k: lista.append((a, k)))
    return lista


def test_envia_al_buzon_configurado_con_responder_a(app, enviados):
    r = app.test_client().post("/api/tienda/contacto", json=VALIDO)
    assert r.status_code == 201
    (destino, asunto, cuerpo), kw = enviados[0]
    assert destino == "ventas@ejemplo.mx" and asunto == "[Contacto web] Cotización de batas"
    assert "Ana López" in cuerpo and kw["responder_a"] == "ana@ejemplo.mx"


def test_sin_correo_real_responde_503_y_no_envia(app, enviados):
    app.config.update(CORREO_PROVEEDOR="consola")
    r = app.test_client().post("/api/tienda/contacto", json=VALIDO)
    assert r.status_code == 503 and r.get_json()["error"]["codigo"] == "contacto_no_disponible"
    app.config.update(CORREO_PROVEEDOR="smtp", CONTACTO_DESTINATARIO="")
    assert app.test_client().post("/api/tienda/contacto", json=VALIDO).status_code == 503
    assert enviados == []


def test_validacion_campo_trampa_y_saltos_de_linea(app, enviados):
    c = app.test_client()
    r = c.post("/api/tienda/contacto", json={**VALIDO, "correo": "no-es-correo"})
    assert r.status_code >= 400 and "correo" in str(r.get_json()["error"]["detalles"])
    assert c.post("/api/tienda/contacto", json={**VALIDO, "asunto": "Hola\nBcc: x@y.z"}).status_code >= 400
    assert c.post("/api/tienda/contacto", json={**VALIDO, "mensaje": "corto"}).status_code >= 400
    assert c.post("/api/tienda/contacto", json={**VALIDO, "sitio_web": "http://spam"}).status_code == 400
    assert c.post("/api/tienda/contacto", json={**VALIDO, "extra": 1}).status_code >= 400
    assert enviados == []


def test_limite_por_ip_y_fallo_smtp_no_se_confirma(app, enviados, monkeypatch):
    c = app.test_client()
    assert c.post("/api/tienda/contacto", json=VALIDO).status_code == 201
    assert c.post("/api/tienda/contacto", json=VALIDO).status_code == 201
    assert c.post("/api/tienda/contacto", json=VALIDO).status_code == 429
    tienda._envios_contacto.clear()

    def falla(*a, **k):
        raise OSError("smtp caído")
    monkeypatch.setattr(tienda, "enviar_correo", falla)
    r = c.post("/api/tienda/contacto", json=VALIDO)
    assert r.status_code == 502 and r.get_json()["error"]["codigo"] == "contacto_fallo_envio"
