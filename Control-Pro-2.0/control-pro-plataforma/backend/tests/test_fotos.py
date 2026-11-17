"""Fotografías y videos ilustrativos de stock: el comando los asigna a cada producto con su crédito y se puede repetir."""
import json
import os

from seeds.cargar_fotos import CARPETA


def test_cargar_fotos_asigna_fotos_video_y_creditos(app, client):
    from seeds.cargar_fotos import cargar
    manifiesto = json.load(open(os.path.join(CARPETA, "manifiesto.json"), encoding="utf-8"))["productos"]
    with app.app_context():
        r = cargar()
        assert r["sin_producto"] == [] and r["productos"] == len(manifiesto) == 50
        assert cargar()["fotos"] == r["fotos"]  # repetible: no duplica imágenes
    prod = client.get("/api/tienda/productos/bata-caballero").get_json()
    esperadas = manifiesto["BAT-002"]["fotos"]
    assert [i["url"] for i in prod["imagenes"]] == [f"/api/archivos/publicos/stock-{f['archivo']}" for f in esperadas]
    assert all("Pixabay" in i["credito"] for i in prod["imagenes"]) and prod["giros"] == []
    assert prod["video"]["url"].endswith(".mp4") and "Pixabay" in prod["video"]["credito"]
    # Los archivos se sirven: la foto como WebP y el video como mp4 (con soporte de rangos para el reproductor)
    foto = client.get(prod["imagenes"][0]["url"])
    assert foto.status_code == 200 and foto.mimetype == "image/webp"
    video = client.get(prod["video"]["url"], headers={"Range": "bytes=0-99"})
    assert video.status_code == 206 and video.mimetype == "video/mp4"
    # En el catálogo: segunda vista para el efecto al pasar el cursor y aviso de que es ilustrativa
    item = next(p for p in client.get("/api/tienda/productos?por_pagina=100").get_json()["items"] if p["slug"] == "bata-caballero")
    assert item["imagen_alterna"] == prod["imagenes"][1]["url"] and item["ilustrativa"] is True and item["video"]
