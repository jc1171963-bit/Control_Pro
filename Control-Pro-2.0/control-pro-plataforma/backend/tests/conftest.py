"""Infraestructura de pruebas contra PostgreSQL real.

La base de pruebas se crea y se llena con los datos semilla una sola vez; antes de cada prueba se restaura una
copia (esquema `snap`) para que cada prueba empiece del mismo estado.
"""
import itertools
import os
import re
import sys

import pytest
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.sql_extra import SQL_INSTALAR, SQL_NEGOCIACION, SQL_SEGUIMIENTO  # noqa: E402

import app.security.auth as auth_mod  # noqa: E402

auth_mod.BCRYPT_COSTO = 4  # pruebas rápidas; producción usa 12
PASSWORD = "ControlPro2026"
_contador = itertools.count(1)


def _tablas():
    return [t.name for t in db.metadata.sorted_tables]


# ---------------------------------------------------------------- guardia: la suite borra y recrea la base de pruebas

HOSTS_LOCALES = {"localhost", "127.0.0.1", "::1"}


def motivo_rechazo_url(url_pruebas: str | None, url_trabajo: str | None = None) -> str | None:
    """Por qué `url_pruebas` no es inequívocamente una base de pruebas local, o None si lo es. No se conecta."""
    if not url_pruebas:
        return "TEST_DATABASE_URL está vacía."
    try:
        u = make_url(url_pruebas)
    except (ArgumentError, ValueError):
        return "TEST_DATABASE_URL no es una URL válida."
    if u.get_backend_name() != "postgresql":
        return f"Solo se admite PostgreSQL (recibido: {u.get_backend_name()})."
    if not u.database or not re.fullmatch(r"[a-z0-9_]+_test", u.database):
        return f"La base '{u.database}' no termina en '_test': no parece una base de pruebas."
    if (u.host or "") not in HOSTS_LOCALES:
        return f"El host '{u.host}' no es local; solo se admiten {sorted(HOSTS_LOCALES)}."
    if url_trabajo:
        try:
            t = make_url(url_trabajo)
        except (ArgumentError, ValueError):
            t = None
        if t and t.database == u.database and (t.port or 5432) == (u.port or 5432):
            return "TEST_DATABASE_URL apunta a la misma base que DATABASE_URL (la base de trabajo)."
    return None


def _verificar_base_de_pruebas(app):
    """Aborta toda la sesión, sin ejecutar nada destructivo, si la base no es inequívocamente de pruebas."""
    url = app.config["SQLALCHEMY_DATABASE_URI"]
    motivo = motivo_rechazo_url(url, os.getenv("DATABASE_URL"))
    if motivo:
        pytest.exit(f"Pruebas abortadas antes de tocar la base: {motivo}", returncode=3)
    esperada = make_url(url).database
    try:
        with db.engine.connect() as c:  # solo lectura: confirma a qué base respondió realmente el servidor
            real = c.execute(text("select current_database()")).scalar()
    except Exception as e:  # sin identidad comprobada no se continúa
        pytest.exit(f"Pruebas abortadas: no se pudo comprobar la identidad de la base ({type(e).__name__}).", returncode=3)
    if real != esperada or not str(real).endswith("_test"):
        pytest.exit(f"Pruebas abortadas: el servidor respondió con la base '{real}', no con '{esperada}'.", returncode=3)


@pytest.fixture(scope="session")
def app():
    app = create_app("testing")
    with app.app_context():
        _verificar_base_de_pruebas(app)  # antes de cualquier drop, create o truncate
        db.session.execute(text("drop schema if exists snap cascade"))
        db.session.commit()
        db.drop_all()
        db.create_all()
        for s in SQL_INSTALAR + SQL_SEGUIMIENTO + SQL_NEGOCIACION:
            db.session.execute(text(s))
        db.session.commit()
        from seeds.demo import cargar_demo
        cargar_demo()
        db.session.execute(text("create schema snap"))
        for t in _tablas():
            db.session.execute(text(f'create table snap."{t}" as table public."{t}"'))
        db.session.commit()
    yield app


@pytest.fixture(autouse=True)
def restaurar(app):
    with app.app_context():
        tablas = _tablas()
        db.session.execute(text("truncate " + ", ".join(f'public."{t}"' for t in tablas) + " restart identity cascade"))
        for t in tablas:
            db.session.execute(text(f'insert into public."{t}" select * from snap."{t}"'))
        con_id = set(db.session.execute(text(
            "select table_name from information_schema.columns where table_schema='public' and column_name='id'")).scalars())
        for t in tablas:
            if t not in con_id:
                continue
            seq = db.session.execute(text("select pg_get_serial_sequence(:t, 'id')"), {"t": f"public.{t}"}).scalar()
            if seq:
                db.session.execute(text(f"select setval('{seq}', coalesce((select max(id) from public.\"{t}\"), 0) + 1, false)"))
        db.session.commit()
        db.session.remove()
    yield


@pytest.fixture()
def client(app):
    return app.test_client()


def clave():
    return f"prueba-{os.getpid()}-{next(_contador):06d}"


class Api:
    """Cliente de pruebas con sesión: api.get('/ruta'), api.post('/ruta', {...})."""

    def __init__(self, client, token=None):
        self.c, self.token = client, token

    def _h(self):
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    def get(self, url, **kw):
        return self.c.get(url, headers=self._h(), **kw)

    def post(self, url, json=None, **kw):
        return self.c.post(url, json=json if json is not None else {}, headers=self._h(), **kw)

    def put(self, url, json=None):
        return self.c.put(url, json=json or {}, headers=self._h())

    def patch(self, url, json=None):
        return self.c.patch(url, json=json or {}, headers=self._h())

    def delete(self, url):
        return self.c.delete(url, headers=self._h())


@pytest.fixture()
def como(app):
    """como('admin') → Api autenticada. Acepta alias de usuarios internos o 'cliente' / 'empresa'.

    Cada llamada es un dispositivo propio (su cliente y su cookie): un login en el mismo navegador reemplaza la sesión
    anterior de ese navegador (H-05), y las pruebas usan varias cuentas a la vez."""
    alias = {
        "admin": "admin@controlpro.mx", "finanzas": "finanzas@controlpro.mx", "atencion": "atencion@controlpro.mx",
        "aprobador": "aprobador@controlpro.mx", "auditor": "auditor@controlpro.mx",
        "enc_tol": "encargado.tol@controlpro.mx", "enc_qro": "encargado.qro@controlpro.mx",
        "enc_pue": "encargado.pue@controlpro.mx", "alm_tol": "almacen.tol@controlpro.mx",
        "alm_qro": "almacen.qro@controlpro.mx", "alm_pue": "almacen.pue@controlpro.mx",
    }

    def _login(quien):
        client = app.test_client()
        if quien in ("cliente", "empresa"):
            correo = "cliente@demo.mx" if quien == "cliente" else "empresa@demo.mx"
            r = client.post("/api/auth/cliente/login", json={"correo": correo, "password": PASSWORD})
        else:
            r = client.post("/api/auth/login", json={"correo": alias.get(quien, quien), "password": PASSWORD})
        assert r.status_code == 200, r.get_json()
        return Api(client, r.get_json()["access_token"])
    return _login


def variante_id(app, sku):
    with app.app_context():
        return db.session.execute(text("select id from variante where sku = :s"), {"s": sku}).scalar_one()


def sucursal_id(app, codigo):
    with app.app_context():
        return db.session.execute(text("select id from sucursal where codigo = :c"), {"c": codigo}).scalar_one()


def inventario(app, codigo, sku):
    from collections import namedtuple
    Fila = namedtuple("Fila", "fisico reservado comprometido en_transito")
    with app.app_context():
        fila = db.session.execute(text(
            "select i.fisico, i.reservado, i.comprometido, i.en_transito from inventario i join sucursal s on s.id=i.sucursal_id "
            "join variante v on v.id=i.variante_id where s.codigo=:c and v.sku=:s"), {"c": codigo, "s": sku}).first()
        return Fila(*fila) if fila else Fila(0, 0, 0, 0)


def fijar_existencia(app, codigo, sku, cantidad):
    """Ajusta la existencia física con un movimiento (sin romper el kardex)."""
    with app.app_context():
        from app.services import inventario_service as inv
        sid, vid = sucursal_id(app, codigo), variante_id(app, sku)
        actual = inventario(app, codigo, sku).fisico
        if cantidad > actual:
            inv.registrar_ajuste(sid, vid, cantidad - actual, "ajuste_positivo", "Preparación de prueba")
        elif cantidad < actual:
            inv.registrar_ajuste(sid, vid, actual - cantidad, "ajuste_negativo", "Preparación de prueba")


def direccion_cliente(app, correo="cliente@demo.mx"):
    with app.app_context():
        return db.session.execute(text("select d.id from direccion d join cliente c on c.id=d.cliente_id where c.correo=:c"),
                                  {"c": correo}).scalar_one()


def conciliado(app):
    with app.app_context():
        return db.session.execute(text("""
            select count(*) from inventario i left join (select sucursal_id, variante_id, sum(cantidad) s
              from movimiento_inventario group by 1,2) m using (sucursal_id, variante_id)
            where i.fisico <> coalesce(m.s, 0) or i.reservado < 0 or i.comprometido < 0
               or i.reservado + i.comprometido > i.fisico""")).scalar() == 0
