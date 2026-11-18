"""Guardia de la base de pruebas: la suite borra y recrea su base, así que solo acepta una base local `*_test`."""
import pytest

from .conftest import motivo_rechazo_url

TRABAJO = "postgresql+psycopg://control_pro:x@localhost:5432/control_pro"


@pytest.mark.parametrize("url, motivo", [
    ("postgresql+psycopg://u:p@localhost:5432/control_pro", "_test"),  # base de trabajo (desarrollo)
    ("postgresql+psycopg://u:p@localhost:5432/control_pro_prod", "_test"),
    ("postgresql+psycopg://u:p@localhost:5432/control_pro_test_copia", "_test"),
    ("postgresql+psycopg://u:p@localhost:5432/Control_Pro_TEST", "_test"),
    ("postgresql+psycopg://u:p@db.produccion.mx:5432/control_pro_test", "no es local"),
    ("postgresql+psycopg://u:p@10.0.0.5:5432/control_pro_test", "no es local"),
    ("postgresql+psycopg://u:p@/control_pro_test", "no es local"),  # socket: no se puede comprobar el servidor
    ("sqlite:///control_pro_test", "PostgreSQL"),
    ("no-es-una-url", "válida"),
    ("", "vacía"),
    (None, "vacía"),
])
def test_rechaza_bases_que_no_son_de_pruebas(url, motivo):
    r = motivo_rechazo_url(url, TRABAJO)
    assert r and motivo in r


def test_rechaza_la_misma_base_que_la_de_trabajo():
    r = motivo_rechazo_url("postgresql+psycopg://u:p@127.0.0.1:5432/mi_base_test",
                           "postgresql://otro:x@localhost:5432/mi_base_test")
    assert r and "misma base" in r


@pytest.mark.parametrize("url", ["postgresql+psycopg://control_pro:x@localhost:5432/control_pro_test",
                                 "postgresql://u:p@127.0.0.1:55432/control_pro_test"])
def test_acepta_una_base_de_pruebas_local(url):
    assert motivo_rechazo_url(url, TRABAJO) is None
