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
    # Notas de voz: WebM/Opus (Chrome, Android), Ogg (Firefox), M4A (Safari, iPhone) y MP3.
    "webm": [b"\x1a\x45\xdf\xa3"], "ogg": [b"OggS"], "mp3": [b"ID3", b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"],
}
MIMES = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "pdf": "application/pdf",
         "svg": "image/svg+xml", "mp4": "video/mp4",
         "webm": "audio/webm", "ogg": "audio/ogg", "m4a": "audio/mp4", "mp3": "audio/mpeg"}  # mp4: clips de producto (solo lectura; no se aceptan como subida)


def _guardar(carpeta: str, permitidas: set[str]) -> str:
    archivo = request.files.get("archivo")
    if not archivo or not archivo.filename:
        raise AppError("Selecciona un archivo.")
    ext = archivo.filename.rsplit(".", 1)[-1].lower() if "." in archivo.filename else ""
    if ext not in permitidas:
        raise AppError(f"Formato no permitido. Usa: {', '.join(sorted(permitidas))}.")
    cabecera = archivo.stream.read(16)
    archivo.stream.seek(0)
    valido = cabecera[4:8] == b"ftyp" if ext == "m4a" else any(cabecera.startswith(f) for f in FIRMAS[ext])
    if not valido:
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


def _meta(url: str) -> tuple[str, dict]:
    nombre = os.path.basename(url)
    ruta = os.path.join(current_app.config["UPLOAD_DIR"], "privados", nombre + ".meta")
    if not url.startswith("/api/archivos/privados/") or not os.path.exists(ruta):
        raise NoEncontrado("Archivo no encontrado.")
    with open(ruta) as fh:
        return ruta, json.load(fh)


def vincular_a_pedido(urls: list[str], pedido_id: int, dueno: str):
    """Liga archivos recién subidos a una solicitud para que la sucursal dueña también pueda verlos (p. ej. la evidencia
    que sube la distribuidora). Solo quien subió el archivo puede ligarlo."""
    for url in urls:
        ruta, meta = _meta(url)
        if meta.get("dueno") != dueno:
            raise SinPermiso("Solo puedes adjuntar archivos que tú subiste.")
        meta["pedido_id"] = pedido_id
        with open(ruta, "w") as fh:
            json.dump(meta, fh)


def dueno_actual() -> str:
    return f"c{_cargar_cliente().id}" if get_jwt().get("tipo") == "cliente" else f"u{_cargar_usuario().id}"


@bp.post("/chat")
def subir_chat():
    """Adjuntos del chat: fotos, PDF y notas de voz. Quedan privados hasta ligarse a una conversación al enviarse."""
    verify_jwt_in_request()
    nombre = _guardar("privados", {"png", "jpg", "jpeg", "webp", "pdf", "webm", "ogg", "m4a", "mp3"})
    with open(os.path.join(current_app.config["UPLOAD_DIR"], "privados", nombre + ".meta"), "w") as fh:
        json.dump({"dueno": dueno_actual()}, fh)
    return jsonify({"url": f"/api/archivos/privados/{nombre}"}), 201


def vincular_a_conversacion(url: str, conversacion_id: int, dueno: str):
    """La otra parte de la conversación también podrá ver el adjunto. Solo quien lo subió puede adjuntarlo."""
    ruta, meta = _meta(url)
    if meta.get("dueno") != dueno:
        raise SinPermiso("Solo puedes adjuntar archivos que tú subiste.")
    meta["conversacion_id"] = conversacion_id
    with open(ruta, "w") as fh:
        json.dump(meta, fh)


@bp.get("/privados/<nombre>")
def ver_privado(nombre):
    verify_jwt_in_request()
    ruta = os.path.join(current_app.config["UPLOAD_DIR"], "privados")
    meta = os.path.join(ruta, os.path.basename(nombre) + ".meta")
    if not os.path.exists(meta):
        raise NoEncontrado("Archivo no encontrado.")
    if get_jwt().get("tipo") == "cliente":
        with open(meta) as fh:
            datos = json.load(fh)
        cliente = _cargar_cliente()
        propio = datos["dueno"] == f"c{cliente.id}"
        if not propio and datos.get("pedido_id"):
            from ..extensions import db
            from ..models import Pedido
            p = db.session.get(Pedido, datos["pedido_id"])
            propio = bool(p and p.cliente_id == cliente.id)
        if not propio and datos.get("conversacion_id"):
            from ..extensions import db
            from ..models import Conversacion
            c = db.session.get(Conversacion, datos["conversacion_id"])
            propio = bool(c and c.tipo == "sucursal" and c.cliente_id == cliente.id)
        if not propio:
            raise NoEncontrado("Archivo no encontrado.")
    else:
        _cargar_usuario()
    ext = nombre.rsplit(".", 1)[-1].lower()
    return send_from_directory(ruta, os.path.basename(nombre), max_age=0, mimetype=MIMES.get(ext))


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
