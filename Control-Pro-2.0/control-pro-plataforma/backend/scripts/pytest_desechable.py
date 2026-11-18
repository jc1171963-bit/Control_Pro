"""Ejecuta pytest sobre una base PostgreSQL desechable que esta misma ejecución crea y elimina.

Uso, desde backend/ (PowerShell):
  $env:ADMIN_DATABASE_URL = "postgresql://USUARIO:CLAVE@127.0.0.1:PUERTO/postgres"
  python scripts/pytest_desechable.py                          # toda la suite
  python scripts/pytest_desechable.py tests/test_flujos.py -x  # cualquier argumento de pytest

Ver docs/pruebas-base-desechable.md. Nunca usa DATABASE_URL y nunca recibe el nombre de la base a eliminar.
"""
import os
import re
import secrets
import subprocess
import sys
from dataclasses import dataclass

import psycopg
from psycopg import sql
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import ArgumentError

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)
from tests.conftest import HOSTS_LOCALES, motivo_rechazo_url  # noqa: E402  (la misma guardia T1)

PATRON = re.compile(r"cp_[0-9a-f]{12}_test")  # solo se elimina lo que tenga esta forma y además la marca de la ejecución
SALIDA_RECHAZO = 3  # rechazado antes de crear o de ejecutar pytest
SALIDA_INTERRUMPIDO = 130


class Rechazo(Exception):
    pass


@dataclass(frozen=True)
class Desechable:
    admin: URL
    nombre: str
    marca: str      # comentario aleatorio puesto a la base al crearla: prueba de que es de esta ejecución
    servidor: str   # pg_postmaster_start_time() al crear: el servidor no debe cambiar antes de limpiar

    @property
    def url_pruebas(self) -> str:
        return self.admin.set(drivername="postgresql+psycopg", database=self.nombre).render_as_string(hide_password=False)


def log(m):
    print(f"[desechable] {m}", flush=True)


def nuevo_nombre() -> str:
    return f"cp_{secrets.token_hex(6)}_test"


def validar_admin(url: str | None) -> URL:
    if not url:
        raise Rechazo("Define ADMIN_DATABASE_URL: conexión administrativa a la base 'postgres' del servidor desechable.")
    try:
        u = make_url(url)
    except (ArgumentError, ValueError):
        raise Rechazo("ADMIN_DATABASE_URL no es una URL válida.") from None
    if u.get_backend_name() != "postgresql":
        raise Rechazo(f"Solo se admite PostgreSQL (recibido: {u.get_backend_name()}).")
    if (u.host or "") not in HOSTS_LOCALES:
        raise Rechazo(f"El host '{u.host}' no es local; solo se admiten {sorted(HOSTS_LOCALES)}.")
    if u.database != "postgres":
        raise Rechazo(f"La conexión administrativa debe usar la base de mantenimiento 'postgres', no '{u.database}'.")
    return u


def _conectar(u: URL, base: str):
    conninfo = u.set(drivername="postgresql", database=base).render_as_string(hide_password=False)
    return psycopg.connect(conninfo, autocommit=True, connect_timeout=5)


def _servidor(c) -> str:
    return c.execute("select pg_postmaster_start_time()::text").fetchone()[0]


def _marca_de(c, nombre: str) -> str | None:
    """Comentario de la base `nombre`; None si no existe, '' si existe sin comentario."""
    fila = c.execute("select coalesce(shobj_description(oid, 'pg_database'), '') from pg_database where datname = %s",
                     (nombre,)).fetchone()
    return None if fila is None else fila[0]


def crear(u: URL) -> Desechable:
    nombre = nuevo_nombre()
    if not PATRON.fullmatch(nombre):
        raise Rechazo(f"Nombre generado inesperado '{nombre}'.")
    marca = f"control-pro desechable {secrets.token_hex(16)}"
    try:
        c = _conectar(u, "postgres")
    except psycopg.Error as e:
        raise Rechazo(f"PostgreSQL no está disponible ({type(e).__name__}: {str(e).strip().splitlines()[0]}).") from None
    with c:
        servidor = _servidor(c)
        if _marca_de(c, nombre) is not None:
            raise Rechazo(f"La base '{nombre}' ya existe; no se reutiliza ni se toca.")
        try:
            c.execute(sql.SQL("create database {}").format(sql.Identifier(nombre)))
        except psycopg.Error as e:  # p. ej. creada por otro entre la comprobación y aquí: no es nuestra
            raise Rechazo(f"No se pudo crear '{nombre}' ({type(e).__name__}).") from None
        try:
            c.execute(sql.SQL("comment on database {} is {}").format(sql.Identifier(nombre), sql.Literal(marca)))
        except psycopg.Error:
            c.execute(sql.SQL("drop database {}").format(sql.Identifier(nombre)))  # la acabamos de crear en esta conexión
            raise Rechazo(f"No se pudo marcar '{nombre}'; se eliminó.") from None
    return Desechable(u, nombre, marca, servidor)


def verificar_pruebas(d: Desechable):
    """La conexión de pruebas debe llegar al mismo servidor y a la base marcada por esta ejecución."""
    motivo = motivo_rechazo_url(d.url_pruebas, os.getenv("DATABASE_URL"))
    if motivo:
        raise Rechazo(f"La guardia T1 rechaza la base temporal: {motivo}")
    with _conectar(d.admin, d.nombre) as c:
        real = c.execute("select current_database()").fetchone()[0]
        if real != d.nombre or _marca_de(c, real) != d.marca or _servidor(c) != d.servidor:
            raise Rechazo("La conexión de pruebas no llegó a la base ni al servidor creados por esta ejecución.")


def eliminar(d: Desechable) -> tuple[bool, str]:
    """Elimina solo la base registrada por esta ejecución, tras volver a comprobar servidor, nombre y marca."""
    if not PATRON.fullmatch(d.nombre):
        return False, f"'{d.nombre}' no tiene la forma de una base desechable; no se elimina."
    try:
        with _conectar(d.admin, "postgres") as c:
            if _servidor(c) != d.servidor:
                return False, "el servidor no es el mismo que al crear la base (distinto o reiniciado); no se elimina."
            marca = _marca_de(c, d.nombre)
            if marca is None:
                return True, "la base ya no existía."
            if marca != d.marca:
                return False, f"'{d.nombre}' no tiene la marca de esta ejecución; no se elimina."
            c.execute("select pg_terminate_backend(pid) from pg_stat_activity where datname = %s and pid <> pg_backend_pid()",
                      (d.nombre,))
            c.execute(sql.SQL("drop database {}").format(sql.Identifier(d.nombre)))
            if _marca_de(c, d.nombre) is not None:
                return False, "la base sigue existiendo tras eliminarla."
    except psycopg.Error as e:
        return False, f"error al limpiar ({type(e).__name__}: {str(e).strip().splitlines()[0]})."
    return True, "eliminada."


def ejecutar(args: list[str], correr=subprocess.call) -> int:
    try:
        u = validar_admin(os.getenv("ADMIN_DATABASE_URL"))
        log(f"1. Servidor administrativo: {u.render_as_string(hide_password=True)}")
        d = crear(u)
    except Rechazo as e:
        log(f"RECHAZADO, no se creó ni se eliminó nada: {e}")
        return SALIDA_RECHAZO
    log(f"2. Base temporal creada: {d.nombre}")
    codigo = SALIDA_RECHAZO
    try:
        verificar_pruebas(d)
        log("3. Identidad comprobada: misma base, misma marca, mismo servidor; la guardia T1 la acepta.")
        log(f"4. pytest {' '.join(args) or '(toda la suite)'}")
        codigo = correr([sys.executable, "-m", "pytest", *args], cwd=BACKEND,
                        env={**os.environ, "TEST_DATABASE_URL": d.url_pruebas})
        log(f"5. pytest terminó con código {codigo}.")
    except Rechazo as e:
        log(f"RECHAZADO antes de ejecutar pytest: {e}")
    except KeyboardInterrupt:
        codigo = SALIDA_INTERRUMPIDO
        log("5. Interrumpido; se intenta la limpieza.")
    finally:
        ok, motivo = eliminar(d)
        if ok:
            log(f"6. Limpieza: '{d.nombre}' {motivo}")
        else:
            log(f"6. LIMPIEZA NO COMPLETADA para '{d.nombre}': {motivo} Ver 'Recuperación' en docs/pruebas-base-desechable.md.")
    return codigo


if __name__ == "__main__":
    sys.exit(ejecutar(sys.argv[1:]))
