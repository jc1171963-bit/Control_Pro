"""Envío de correo.

- `consola` (por defecto): el mensaje solo se escribe en el log; nadie lo recibe.
- `smtp`: se envía por SMTP con SMTP_HOST, SMTP_PUERTO, SMTP_USUARIO, SMTP_CLAVE, SMTP_REMITENTE y SMTP_TLS,
  leídos del entorno (nunca del frontend). Un fallo de envío se propaga para que quien llama no lo dé por entregado.
"""
import smtplib
from email.message import EmailMessage

from flask import current_app


def correo_real_habilitado() -> bool:
    """True si los correos llegan a una persona (no solo al log)."""
    c = current_app.config
    return c.get("CORREO_PROVEEDOR") == "smtp" and bool(c.get("SMTP_HOST")) and bool(c.get("SMTP_REMITENTE"))


def enviar_correo(destinatario: str, asunto: str, cuerpo: str, responder_a: str | None = None) -> None:
    c = current_app.config
    proveedor = c.get("CORREO_PROVEEDOR", "consola")
    if proveedor == "consola":
        current_app.logger.info("[correo:consola] Para: %s | %s | %s", destinatario, asunto, cuerpo)
        return
    if proveedor == "smtp":
        msg = EmailMessage()
        msg["From"] = c["SMTP_REMITENTE"]
        msg["To"] = destinatario
        msg["Subject"] = asunto
        if responder_a:
            msg["Reply-To"] = responder_a
        msg.set_content(cuerpo)
        with smtplib.SMTP(c["SMTP_HOST"], c["SMTP_PUERTO"], timeout=15) as s:
            if c.get("SMTP_TLS", True):
                s.starttls()
            if c.get("SMTP_USUARIO"):
                s.login(c["SMTP_USUARIO"], c.get("SMTP_CLAVE", ""))
            s.send_message(msg)
        return
    raise NotImplementedError(f"Proveedor de correo '{proveedor}' no implementado.")
