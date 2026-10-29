"""Configuración por entorno. Todo valor sensible se lee de variables de entorno (.env)."""
import os
from datetime import timedelta
from decimal import Decimal

from dotenv import load_dotenv

load_dotenv()


def _bool(nombre: str, defecto: bool) -> bool:
    valor = os.getenv(nombre)
    if valor is None:
        return defecto
    return valor.strip().lower() in {"1", "true", "si", "sí", "yes"}


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "")
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "")
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}
    JSON_SORT_KEYS = False

    # JWT: access token en encabezado, refresh token en cookie HttpOnly con protección CSRF.
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=int(os.getenv("JWT_ACCESS_MINUTOS", "15")))
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=int(os.getenv("JWT_REFRESH_DIAS", "7")))
    JWT_TOKEN_LOCATION = ["headers", "cookies"]
    JWT_REFRESH_COOKIE_PATH = "/api/auth"
    JWT_REFRESH_COOKIE_NAME = "cp_refresh"
    JWT_ACCESS_COOKIE_NAME = "cp_access_no_usado"
    JWT_COOKIE_CSRF_PROTECT = True
    JWT_COOKIE_SAMESITE = "Strict"
    JWT_COOKIE_SECURE = _bool("COOKIE_SECURE", True)

    CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]

    UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads"))
    MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5 MB por solicitud

    # Reglas de negocio configurables
    RESERVA_HORAS = int(os.getenv("RESERVA_HORAS", "24"))
    PERMITIR_DIVISION = _bool("PERMITIR_DIVISION", True)
    IVA_TASA = Decimal(os.getenv("IVA_TASA", "0.16"))  # los precios ya incluyen IVA
    COSTO_ENVIO = Decimal(os.getenv("COSTO_ENVIO", "150.00"))
    ENVIO_GRATIS_DESDE = Decimal(os.getenv("ENVIO_GRATIS_DESDE", "1500.00"))
    INTENTOS_MAXIMOS = int(os.getenv("INTENTOS_MAXIMOS", "5"))
    BLOQUEO_MINUTOS = int(os.getenv("BLOQUEO_MINUTOS", "15"))
    RECUPERACION_MINUTOS = int(os.getenv("RECUPERACION_MINUTOS", "30"))
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
    # Mientras no haya SMTP, los correos se escriben en el log.
    CORREO_PROVEEDOR = os.getenv("CORREO_PROVEEDOR", "consola")
    EXPONER_TOKEN_RECUPERACION = False


class DevConfig(Config):
    DEBUG = True
    SECRET_KEY = Config.SECRET_KEY or "dev-solo-local-cambiar"
    JWT_SECRET_KEY = Config.JWT_SECRET_KEY or "dev-jwt-solo-local-cambiar-por-una-clave-larga"
    SQLALCHEMY_DATABASE_URI = Config.SQLALCHEMY_DATABASE_URI or "postgresql+psycopg://control_pro:control_pro_dev@localhost:5432/control_pro"
    JWT_COOKIE_SECURE = _bool("COOKIE_SECURE", False)
    EXPONER_TOKEN_RECUPERACION = _bool("EXPONER_TOKEN_RECUPERACION", True)


class TestConfig(Config):
    TESTING = True
    SECRET_KEY = "test"
    JWT_SECRET_KEY = "test-jwt-clave-suficientemente-larga-para-hs256"
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "TEST_DATABASE_URL", "postgresql+psycopg://control_pro:control_pro_dev@localhost:5432/control_pro_test"
    )
    JWT_COOKIE_SECURE = False
    JWT_COOKIE_CSRF_PROTECT = False
    EXPONER_TOKEN_RECUPERACION = True
    UPLOAD_DIR = "/tmp/control-pro-test-uploads"


class ProdConfig(Config):
    DEBUG = False

    @classmethod
    def validar(cls):
        faltantes = [n for n in ("SECRET_KEY", "JWT_SECRET_KEY", "SQLALCHEMY_DATABASE_URI") if not getattr(cls, n)]
        if faltantes:
            raise RuntimeError(f"Faltan variables de entorno obligatorias: {', '.join(faltantes)}")
        if len(cls.JWT_SECRET_KEY) < 32:
            raise RuntimeError("JWT_SECRET_KEY debe tener al menos 32 caracteres.")


CONFIGS = {"development": DevConfig, "testing": TestConfig, "production": ProdConfig}
