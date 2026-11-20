"""Gunicorn de producción.

Cada sección del panel pide ~10 cosas a la vez (contadores, listas, avisos) y la app consulta /api/actividad cada
pocos segundos. Con trabajadores "sync" solo se atendían 4 peticiones simultáneas y el resto esperaba turno (1-4 s).
Con hilos, cada proceso atiende varias a la vez; las consultas a la base son cortas, así que esto escala bien.

- preload_app: la app se carga una sola vez antes de crear los procesos (sin "primer clic lento" en cada proceso).
- post_fork: cada proceso descarta las conexiones heredadas del padre y abre las suyas.
"""
import os

bind = "0.0.0.0:5000"
workers = int(os.getenv("GUNICORN_WORKERS", "4"))
worker_class = "gthread"
threads = int(os.getenv("GUNICORN_THREADS", "8"))
keepalive = 30
timeout = 60
graceful_timeout = 20
preload_app = True
accesslog = "-"
# Igual al formato habitual, más la duración de cada petición en milisegundos (para detectar lo lento).
access_log_format = '%(h)s "%(r)s" %(s)s %(b)s %(M)sms'


def when_ready(server):
    """Antes de crear los procesos: prepara una sola vez los modelos (relaciones, SQL compilado de arranque) para que
    los procesos nazcan "calientes" y el primer clic tras un despliegue no tarde segundos."""
    from sqlalchemy import text
    from sqlalchemy.orm import configure_mappers
    from wsgi import app
    from app.extensions import db
    configure_mappers()
    with app.app_context():
        try:
            db.session.execute(text("select 1"))
        finally:
            db.session.remove()
            db.engine.dispose()


def _calentar_conexiones(app, db, cuantas: int):
    """Abre `cuantas` conexiones y en cada una toca todas las tablas (LIMIT 0: no lee datos).

    Postgres carga la estructura de cada tabla la primera vez que una conexión la usa; sin esto, la primera petición
    que caía en una conexión nueva tardaba ~1 s. Las conexiones quedan abiertas en el grupo, listas para usarse.
    """
    from sqlalchemy import text
    with app.app_context():
        tablas = [t.name for t in db.metadata.sorted_tables]
        conexiones = []
        try:
            for _ in range(cuantas):
                con = db.engine.connect()
                for t in tablas:
                    con.execute(text(f'select * from "{t}" limit 0'))
                con.rollback()
                conexiones.append(con)
        except Exception:  # pragma: no cover - la base aún no responde: se calentarán al usarse
            pass
        finally:
            for con in conexiones:
                con.close()  # vuelve al grupo, abierta y caliente


def post_fork(server, worker):
    import threading

    from wsgi import app
    from app.extensions import db
    with app.app_context():
        db.engine.dispose(close=False)
    # En segundo plano: el proceso empieza a atender de inmediato mientras se calientan sus conexiones.
    threading.Thread(target=_calentar_conexiones, args=(app, db, threads), daemon=True, name="calentar-bd").start()
