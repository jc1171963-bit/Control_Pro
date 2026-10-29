from flask import request

from ..errors import AppError, NoEncontrado
from ..extensions import db


def cuerpo() -> dict:
    datos = request.get_json(silent=True)
    if datos is None:
        if request.data:
            raise AppError("El cuerpo debe ser JSON válido.")
        return {}
    if not isinstance(datos, dict):
        raise AppError("El cuerpo debe ser un objeto JSON.")
    return datos


def obtener(modelo, ident, mensaje="Registro no encontrado."):
    obj = db.session.get(modelo, ident)
    if not obj:
        raise NoEncontrado(mensaje)
    return obj


def arg_int(nombre, defecto=None):
    v = request.args.get(nombre)
    if v in (None, ""):
        return defecto
    try:
        return int(v)
    except ValueError:
        raise AppError(f"El parámetro '{nombre}' debe ser numérico.")


def pagina():
    return arg_int("pagina", 1), arg_int("por_pagina", 20)


def int_keys(d: dict) -> dict[int, int]:
    try:
        return {int(k): int(v) for k, v in (d or {}).items()}
    except (TypeError, ValueError):
        raise AppError("Las cantidades deben ser numéricas.")
