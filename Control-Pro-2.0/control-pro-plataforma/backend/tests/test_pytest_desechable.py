"""Script de bases desechables (scripts/pytest_desechable.py).

Crea y borra bases: solo corre con ADMIN_DATABASE_URL de un servidor desechable, es decir, mediante el propio script.
pytest se sustituye por una función falsa para comprobar qué pasa durante y después de la ejecución.
"""
import os
import secrets

import psycopg
import pytest
from psycopg import sql
from sqlalchemy.engine import make_url

from scripts import pytest_desechable as pd

from .conftest import motivo_rechazo_url

ADMIN = os.getenv("ADMIN_DATABASE_URL")
pytestmark = pytest.mark.skipif(not ADMIN, reason="requiere ADMIN_DATABASE_URL de un servidor PostgreSQL desechable")


def marca(nombre):
    with pd._conectar(make_url(ADMIN), "postgres") as c:
        return pd._marca_de(c, nombre)


@pytest.fixture()
def ajena():
    """Base que no es de la ejecución: mismo patrón de nombre pero sin su marca."""
    nombre = f"cp_{secrets.token_hex(6)}_test"
    with pd._conectar(make_url(ADMIN), "postgres") as c:
        c.execute(sql.SQL("create database {}").format(sql.Identifier(nombre)))
    yield nombre
    with pd._conectar(make_url(ADMIN), "postgres") as c:
        c.execute(sql.SQL("drop database if exists {}").format(sql.Identifier(nombre)))


class Pytest:
    """Sustituto de subprocess.call: registra la base que recibió y devuelve un código o lanza una excepción."""

    def __init__(self, resultado=0):
        self.resultado, self.base = resultado, None

    def __call__(self, cmd, cwd, env):
        url = env["TEST_DATABASE_URL"]
        self.base = make_url(url).database
        assert pd.PATRON.fullmatch(self.base)
        assert marca(self.base).startswith("control-pro desechable ")
        assert motivo_rechazo_url(url, os.getenv("DATABASE_URL")) is None  # la guardia T1 la acepta
        with psycopg.connect(make_url(url).set(drivername="postgresql").render_as_string(hide_password=False)) as c:
            assert c.execute("select current_database()").fetchone()[0] == self.base
        if isinstance(self.resultado, BaseException):
            raise self.resultado
        return self.resultado


def test_crea_la_base_temporal_y_la_elimina():
    falso = Pytest(0)
    assert pd.ejecutar(["-q"], correr=falso) == 0
    assert falso.base and marca(falso.base) is None


def test_pytest_fallido_conserva_su_codigo_y_limpia():
    falso = Pytest(1)
    assert pd.ejecutar([], correr=falso) == 1
    assert marca(falso.base) is None


def test_interrupcion_limpia_solo_la_propia(ajena):
    falso = Pytest(KeyboardInterrupt())
    assert pd.ejecutar([], correr=falso) == pd.SALIDA_INTERRUMPIDO
    assert marca(falso.base) is None
    assert marca(ajena) == ""  # intacta


def test_rechaza_un_nombre_preexistente(ajena, monkeypatch):
    monkeypatch.setattr(pd, "nuevo_nombre", lambda: ajena)
    falso = Pytest(0)
    assert pd.ejecutar([], correr=falso) == pd.SALIDA_RECHAZO
    assert falso.base is None and marca(ajena) == ""  # pytest no corrió y la base sigue sin tocar


def test_la_limpieza_no_elimina_bases_ajenas(ajena):
    with pd._conectar(make_url(ADMIN), "postgres") as c:
        servidor = pd._servidor(c)
    otra_marca = pd.Desechable(make_url(ADMIN), ajena, "control-pro desechable otra", servidor)
    assert pd.eliminar(otra_marca) == (False, f"'{ajena}' no tiene la marca de esta ejecución; no se elimina.")
    otro_servidor = pd.Desechable(make_url(ADMIN), ajena, "", "1999-01-01")
    assert pd.eliminar(otro_servidor)[0] is False
    fuera_de_patron = pd.Desechable(make_url(ADMIN), "control_pro", "", servidor)
    assert pd.eliminar(fuera_de_patron)[0] is False
    assert marca(ajena) == ""  # nada se eliminó


@pytest.mark.parametrize("url", [
    "postgresql://u:p@db.produccion.mx:5432/postgres",
    "postgresql://u:p@10.0.0.5:5432/postgres",
    "postgresql://u:p@/postgres",
    "postgresql://u:p@localhost:5432/control_pro",  # base de trabajo como conexión administrativa
    "sqlite:///postgres",
    "no-es-una-url",
    "",
    "postgresql://u:p@127.0.0.1:1/postgres",  # local pero sin servidor
])
def test_rechaza_servidores_no_autorizados(url, monkeypatch):
    monkeypatch.setenv("ADMIN_DATABASE_URL", url)
    falso = Pytest(0)
    assert pd.ejecutar([], correr=falso) == pd.SALIDA_RECHAZO
    assert falso.base is None
