"""Interfaz para pasarelas de pago.

Estado actual: NO hay pasarela integrada. Los pagos se registran de forma manual (transferencia con referencia y
comprobante, o efectivo en caja) y una persona autorizada los valida. Para integrar una pasarela:

1. Implementar `ProveedorPago` (crear intención de cobro y verificar la firma del webhook).
2. Exponer un endpoint de webhook que verifique la firma y llame a `pago_service.validar` con un actor de sistema.
3. Nunca guardar números de tarjeta ni CVV: la pasarela tokeniza y la plataforma solo guarda la referencia.
"""
from abc import ABC, abstractmethod
from decimal import Decimal


class ProveedorPago(ABC):
    nombre: str

    @abstractmethod
    def crear_cobro(self, folio_pedido: str, monto: Decimal, correo_cliente: str) -> dict:
        """Devuelve {'referencia': str, 'url_pago': str}."""

    @abstractmethod
    def verificar_webhook(self, cuerpo: bytes, firma: str) -> dict:
        """Valida la firma y devuelve {'referencia', 'estado', 'monto'}; lanza excepción si la firma no es válida."""


class ProveedorManual(ProveedorPago):
    nombre = "manual"

    def crear_cobro(self, folio_pedido, monto, correo_cliente):
        raise NotImplementedError("Pagos manuales: el cliente registra su transferencia y Finanzas la valida.")

    def verificar_webhook(self, cuerpo, firma):
        raise NotImplementedError("Sin pasarela no existen webhooks de pago.")
