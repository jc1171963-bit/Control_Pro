"""Fábrica de la aplicación Control Pro."""
import logging
import os

from flask import Flask, g, jsonify, request
from sqlalchemy import text

from .config import CONFIGS, ProdConfig
from .errors import registrar_manejadores
from .extensions import cors, db, jwt, migrate


def create_app(nombre_config: str | None = None) -> Flask:
    nombre_config = nombre_config or os.getenv("FLASK_ENV_CONFIG", "development")
    config = CONFIGS[nombre_config]
    if config is ProdConfig:
        ProdConfig.validar()

    # Confía en los certificados del sistema operativo (p. ej. antivirus que inspeccionan HTTPS o CA corporativas)
    # para las conexiones salientes, como el envío de notificaciones push.
    try:
        import truststore
        truststore.inject_into_ssl()
    except ImportError:
        pass

    app = Flask(__name__)
    app.config.from_object(config)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    os.makedirs(app.config["UPLOAD_DIR"], exist_ok=True)

    from . import models  # noqa: F401  (registra los modelos para Alembic)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}}, supports_credentials=True)

    from .security.auth import registrar_callbacks_jwt
    registrar_callbacks_jwt(jwt)
    registrar_manejadores(app)

    from .api import registrar_blueprints
    registrar_blueprints(app)

    from .cli import registrar_comandos
    registrar_comandos(app)

    @app.get("/api/salud")
    def salud():
        try:
            db.session.execute(text("select 1"))
            estado_bd = "ok"
        except Exception:  # pragma: no cover
            estado_bd = "sin conexión"
        return jsonify({"servicio": "control-pro", "base_de_datos": estado_bd}), (200 if estado_bd == "ok" else 503)

    @app.after_request
    def bitacora_presentacion(resp):
        """Cuenta de presentación: cada petición queda en la bitácora (salvo los pulsos automáticos); el pulso de 2 s
        marca que su pestaña sigue abierta y visible (lo usa la pantalla «Presentación en vivo»)."""
        u = getattr(g, "usuario", None)
        if u is not None and request.path.startswith("/api/"):
            from .services import presentacion_service as pres
            if pres.es_presentacion(u.id):
                if request.path == "/api/actividad":
                    pres.marcar_pulso(u.id)
                elif not request.path.startswith(pres.SIN_REGISTRO):
                    pres.registrar("peticion", {"metodo": request.method, "ruta": request.full_path.rstrip("?")[:200],
                                                "estado": resp.status_code})
        return resp

    @app.after_request
    def cabeceras_seguridad(resp):
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Referrer-Policy", "same-origin")
        return resp

    return app
