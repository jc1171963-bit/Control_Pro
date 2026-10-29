"""Envío de correo. Sin SMTP configurado, el mensaje se escribe en el log (modo `consola`).

Para producción: implementar un proveedor SMTP leyendo SMTP_HOST, SMTP_USER y SMTP_PASSWORD del entorno.
"""
from flask import current_app


def enviar_correo(destinatario: str, asunto: str, cuerpo: str) -> None:
    proveedor = current_app.config.get("CORREO_PROVEEDOR", "consola")
    if proveedor == "consola":
        current_app.logger.info("[correo:consola] Para: %s | %s | %s", destinatario, asunto, cuerpo)
        return
    raise NotImplementedError(f"Proveedor de correo '{proveedor}' no implementado.")
