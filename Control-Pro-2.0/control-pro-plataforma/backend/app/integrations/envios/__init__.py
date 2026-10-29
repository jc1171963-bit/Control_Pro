"""Interfaz para paqueterías.

Estado actual: NO hay integración con paqueterías. La guía se captura a mano y los eventos se registran como
`origen='interno'`; la interfaz nunca los presenta como rastreo del transportista. Para integrar una paquetería,
implementar `ProveedorEnvio` y una tarea que consulte `consultar_eventos` y guarde eventos con
`origen='transportista'`.
"""
from abc import ABC, abstractmethod


class ProveedorEnvio(ABC):
    nombre: str

    @abstractmethod
    def generar_guia(self, paquete: dict, destino: dict) -> dict:
        """Devuelve {'guia': str, 'etiqueta_pdf': bytes}."""

    @abstractmethod
    def consultar_eventos(self, guia: str) -> list[dict]:
        """Devuelve [{'estado', 'descripcion', 'fecha'}] reportados por el transportista."""


class ProveedorManual(ProveedorEnvio):
    nombre = "manual"

    def generar_guia(self, paquete, destino):
        raise NotImplementedError("Captura manual de guía: no hay API de paquetería configurada.")

    def consultar_eventos(self, guia):
        return []
