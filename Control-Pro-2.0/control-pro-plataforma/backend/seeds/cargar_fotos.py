"""Carga las fotografías y videos ilustrativos de stock (seeds/fotos_stock) en los productos del catálogo.

`manifiesto.json` asocia cada SKU base con sus fotos (en orden: la primera es la principal) y, opcionalmente, un video.
Cada archivo lleva su crédito (autor y fuente, licencia de contenido de Pixabay: uso comercial sin atribución
obligatoria; se registra igualmente). Se puede repetir: reemplaza las imágenes del producto por las del manifiesto.
Las fotos que el distribuidor suba después desde el panel siguen funcionando igual (son imágenes sin crédito de stock).
Al tener fotos reales se quita el giro 360° generado (siluetas): el giro real se carga cuando haya sesión con base giratoria.
"""
import json
import os
import shutil

from flask import current_app
from sqlalchemy import select

from app.extensions import db
from app.models import Producto, ProductoImagen

CARPETA = os.path.join(os.path.dirname(__file__), "fotos_stock")
PREFIJO = "stock-"  # en UPLOAD_DIR/publicos (la ruta pública no admite subcarpetas)


def cargar() -> dict:
    manifiesto = json.load(open(os.path.join(CARPETA, "manifiesto.json"), encoding="utf-8"))
    destino = os.path.join(current_app.config["UPLOAD_DIR"], "publicos")
    os.makedirs(destino, exist_ok=True)
    r = {"productos": 0, "fotos": 0, "videos": 0, "sin_producto": []}
    for sku, datos in manifiesto["productos"].items():
        p = db.session.scalars(select(Producto).where(Producto.sku_base == sku)).first()
        if not p:
            r["sin_producto"].append(sku)
            continue
        for archivo in [f["archivo"] for f in datos["fotos"]] + ([datos["video"]["archivo"]] if datos.get("video") else []):
            origen = os.path.join(CARPETA, archivo)
            final = os.path.join(destino, PREFIJO + os.path.basename(archivo))
            if not os.path.exists(final) or os.path.getsize(final) != os.path.getsize(origen):
                shutil.copyfile(origen, final)
        for im in list(p.imagenes):
            db.session.delete(im)
        db.session.flush()
        for i, f in enumerate(datos["fotos"]):
            db.session.add(ProductoImagen(producto_id=p.id, orden=i, url=f"/api/archivos/publicos/{PREFIJO}{os.path.basename(f['archivo'])}",
                                          alt=f"{p.nombre} · {f.get('vista', 'vista ' + str(i + 1))} (foto ilustrativa)"[:160],
                                          credito=f["credito"][:200]))
        r["fotos"] += len(datos["fotos"])
        p.giros = []
        if datos.get("video"):
            p.video_url = f"/api/archivos/publicos/{PREFIJO}{os.path.basename(datos['video']['archivo'])}"
            p.video_credito = datos["video"]["credito"][:200]
            r["videos"] += 1
        else:
            p.video_url = p.video_credito = None
        r["productos"] += 1
    db.session.commit()
    return r
