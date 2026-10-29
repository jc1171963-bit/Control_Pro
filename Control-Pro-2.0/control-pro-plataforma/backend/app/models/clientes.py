"""Clientes de la tienda, direcciones y empleados de cuentas corporativas."""
from datetime import datetime

from sqlalchemy import (BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text,
                        UniqueConstraint, func, text)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..extensions import db
from .base import ConFechas


class Cliente(ConFechas, db.Model):
    __tablename__ = "cliente"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    correo: Mapped[str] = mapped_column(String(120))
    hash_password: Mapped[str] = mapped_column(String(100))
    nombre: Mapped[str] = mapped_column(String(120))
    telefono: Mapped[str | None] = mapped_column(String(20))
    tipo: Mapped[str] = mapped_column(String(10), default="persona")
    razon_social: Mapped[str | None] = mapped_column(String(160))
    rfc: Mapped[str | None] = mapped_column(String(13))
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    intentos_fallidos: Mapped[int] = mapped_column(Integer, default=0)
    bloqueado_hasta: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ultimo_acceso: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    direcciones = relationship("Direccion", back_populates="cliente", order_by="Direccion.id")

    __table_args__ = (
        Index("uq_cliente_correo", func.lower(correo), unique=True),
        CheckConstraint("tipo in ('persona','empresa')", name="ck_cliente_tipo"),
        CheckConstraint("rfc is null or rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'", name="ck_cliente_rfc"),
    )


class Direccion(ConFechas, db.Model):
    __tablename__ = "direccion"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("cliente.id", ondelete="CASCADE"), index=True)
    alias: Mapped[str] = mapped_column(String(40))
    destinatario: Mapped[str] = mapped_column(String(120))
    telefono: Mapped[str] = mapped_column(String(20))
    calle: Mapped[str] = mapped_column(String(160))
    numero: Mapped[str] = mapped_column(String(20))
    colonia: Mapped[str] = mapped_column(String(120))
    ciudad: Mapped[str] = mapped_column(String(80))
    estado: Mapped[str] = mapped_column(String(80))
    cp: Mapped[str] = mapped_column(String(5))
    referencias: Mapped[str | None] = mapped_column(Text)
    predeterminada: Mapped[bool] = mapped_column(Boolean, default=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    cliente = relationship("Cliente", back_populates="direcciones")

    __table_args__ = (
        CheckConstraint("cp ~ '^[0-9]{5}$'", name="ck_direccion_cp"),
        Index("uq_direccion_predeterminada", "cliente_id", unique=True,
              postgresql_where=text("predeterminada and activo")),
    )

    def como_dict(self) -> dict:
        return {k: getattr(self, k) for k in (
            "alias", "destinatario", "telefono", "calle", "numero", "colonia", "ciudad", "estado", "cp", "referencias")}


class EmpleadoCorporativo(ConFechas, db.Model):
    __tablename__ = "empleado_corporativo"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("cliente.id", ondelete="CASCADE"), index=True)
    numero: Mapped[str] = mapped_column(String(20))
    nombre: Mapped[str] = mapped_column(String(120))
    puesto: Mapped[str] = mapped_column(String(60))
    area: Mapped[str | None] = mapped_column(String(80))
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    __table_args__ = (UniqueConstraint("cliente_id", "numero", name="uq_empleado_cliente_numero"),)
