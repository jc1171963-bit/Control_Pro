"""Carga y descarga de archivos (comprobantes, evidencias, imágenes de producto).

- Se valida extensión y firma binaria (magic bytes); el nombre en disco es aleatorio.
- `privados/`: comprobantes y evidencias; solo el cliente que lo subió o personal interno pueden descargarlos.
- `publicos/`: imágenes de catálogo.
"""
import json
import os
import uuid

from flask import Blueprint, current_app, g, jsonify, request, send_from_directory
from flask_jwt_extended import get_jwt, verify_jwt_in_request

from ..errors import AppError, NoEncontrado, SinPermiso
from ..security.auth import _cargar_cliente, _cargar_usuario, requiere_usuario

bp = Blueprint("archivos", __name__, url_prefix="/api/archivos")

FIRMAS = {
    "png": [b"\x89PNG\r\n\x1a\n"], "jpg": [b"\xff\xd8\xff"], "jpeg": [b"\xff\xd8\xff"],
    "webp": [b"RIFF"], "pdf": [b"%PDF"],
}
MIMES = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "pdf": "application/pdf",
         "svg": "image/svg+xml"}


def _guardar(carpeta: str, permitidas: set[str]) -> str:
    archivo = request.files.get("archivo")
    if not archivo or not archivo.filename:
        raise AppError("Selecciona un archivo.")
    ext = archivo.filename.rsplit(".", 1)[-1].lower() if "." in archivo.filename else ""
    if ext not in permitidas:
        raise AppError(f"Formato no permitido. Usa: {', '.join(sorted(permitidas))}.")
    cabecera = archivo.stream.read(16)
    archivo.stream.seek(0)
    if not any(cabecera.startswith(f) for f in FIRMAS[ext]):
        raise AppError("El contenido del archivo no corresponde a su extensión.")
    nombre = f"{uuid.uuid4().hex}.{ext}"
    destino = os.path.join(current_app.config["UPLOAD_DIR"], carpeta)
    os.makedirs(destino, exist_ok=True)
    archivo.save(os.path.join(destino, nombre))
    return nombre


@bp.post("/privados")
def subir_privado():
    verify_jwt_in_request()
    tipo = get_jwt().get("tipo")
    dueno = f"c{_cargar_cliente().id}" if tipo == "cliente" else f"u{_cargar_usuario().id}"
    nombre = _guardar("privados", {"png", "jpg", "jpeg", "webp", "pdf"})
    with open(os.path.join(current_app.config["UPLOAD_DIR"], "privados", nombre + ".meta"), "w") as fh:
        json.dump({"dueno": dueno}, fh)
    return jsonify({"url": f"/api/archivos/privados/{nombre}"}), 201


@bp.get("/privados/<nombre>")
def ver_privado(nombre):
    verify_jwt_in_request()
    ruta = os.path.join(current_app.config["UPLOAD_DIR"], "privados")
    meta = os.path.join(ruta, os.path.basename(nombre) + ".meta")
    if not os.path.exists(meta):
        raise NoEncontrado("Archivo no encontrado.")
    if get_jwt().get("tipo") == "cliente":
        with open(meta) as fh:
            if json.load(fh)["dueno"] != f"c{_cargar_cliente().id}":
                raise NoEncontrado("Archivo no encontrado.")
    else:
        _cargar_usuario()
    return send_from_directory(ruta, os.path.basename(nombre), max_age=0)


@bp.post("/publicos")
@requiere_usuario("catalogo.gestionar")
def subir_publico():
    nombre = _guardar("publicos", {"png", "jpg", "jpeg", "webp"})
    return jsonify({"url": f"/api/archivos/publicos/{nombre}"}), 201


@bp.get("/publicos/<nombre>")
def ver_publico(nombre):
    ruta = os.path.join(current_app.config["UPLOAD_DIR"], "publicos")
    ext = nombre.rsplit(".", 1)[-1].lower()
    if ext not in MIMES:
        raise NoEncontrado("Archivo no encontrado.")
    resp = send_from_directory(ruta, os.path.basename(nombre), mimetype=MIMES[ext], max_age=86400)
    if ext == "svg":
        resp.headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'"
    return resp
