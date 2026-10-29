"""Errores de negocio y respuestas JSON uniformes: {"error": {"codigo", "mensaje", "detalles"}}."""
from flask import jsonify
from marshmallow import ValidationError
from sqlalchemy.exc import IntegrityError
from werkzeug.exceptions import HTTPException

from .extensions import db


class AppError(Exception):
    status = 400
    codigo = "solicitud_invalida"

    def __init__(self, mensaje: str, detalles=None, status: int | None = None, codigo: str | None = None):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.detalles = detalles
        if status:
            self.status = status
        if codigo:
            self.codigo = codigo


class NoEncontrado(AppError):
    status = 404
    codigo = "no_encontrado"


class Conflicto(AppError):
    status = 409
    codigo = "conflicto"


class TransicionInvalida(Conflicto):
    codigo = "transicion_invalida"


class SinPermiso(AppError):
    status = 403
    codigo = "sin_permiso"


class NoAutenticado(AppError):
    status = 401
    codigo = "no_autenticado"


def _respuesta(status, codigo, mensaje, detalles=None):
    cuerpo = {"error": {"codigo": codigo, "mensaje": mensaje}}
    if detalles is not None:
        cuerpo["error"]["detalles"] = detalles
    return jsonify(cuerpo), status


def registrar_manejadores(app):
    @app.errorhandler(AppError)
    def _app_error(e: AppError):
        db.session.rollback()
        return _respuesta(e.status, e.codigo, e.mensaje, e.detalles)

    @app.errorhandler(ValidationError)
    def _validacion(e: ValidationError):
        db.session.rollback()
        return _respuesta(422, "datos_invalidos", "Revisa los datos enviados.", e.messages)

    @app.errorhandler(IntegrityError)
    def _integridad(e: IntegrityError):
        db.session.rollback()
        app.logger.warning("IntegrityError: %s", e.orig)
        return _respuesta(409, "integridad", "La operación viola una regla de integridad de datos (registro duplicado o referencia inválida).")

    @app.errorhandler(HTTPException)
    def _http(e: HTTPException):
        mensajes = {404: "Recurso no encontrado.", 405: "Método no permitido.", 413: "El archivo excede el tamaño permitido."}
        return _respuesta(e.code or 500, e.name.lower().replace(" ", "_"), mensajes.get(e.code, e.description))

    @app.errorhandler(Exception)
    def _inesperado(e: Exception):
        db.session.rollback()
        app.logger.exception("Error no controlado")
        return _respuesta(500, "error_interno", "Ocurrió un error inesperado. Intenta de nuevo o contacta al administrador.")
