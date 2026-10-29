"""Existencias por sucursal, movimientos (kardex) y transferencias entre sucursales."""
from datetime import datetime

from sqlalchemy import (BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, func)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..extensions import db
from .base import ConFechas


class Inventario(ConFechas, db.Model):
    __tablename__ = "inventario"
    sucursal_id: Mapped[int] = mapped_column(ForeignKey("sucursal.id"), primary_key=True)
    variante_id: Mapped[int] = mapped_column(ForeignKey("variante.id"), primary_key=True)
    fisico: Mapped[int] = mapped_column(Integer, default=0)
    reservado: Mapped[int] = mapped_column(Integer, default=0)
    comprometido: Mapped[int] = mapped_column(Integer, default=0)
    en_transito: Mapped[int] = mapped_column(Integer, default=0)
    minimo: Mapped[int] = mapped_column(Integer, default=5)

    variante = relationship("Variante", lazy="joined")
    sucursal = relationship("Sucursal", lazy="joined")

    __table_args__ = (
        CheckConstraint("fisico >= 0", name="ck_inv_fisico"),
        CheckConstraint("reservado >= 0", name="ck_inv_reservado"),
        CheckConstraint("comprometido >= 0", name="ck_inv_comprometido"),
        CheckConstraint("en_transito >= 0", name="ck_inv_transito"),
        CheckConstraint("minimo >= 0", name="ck_inv_minimo"),
        CheckConstraint("reservado + comprometido <= fisico", name="ck_inv_no_sobreventa"),
        Index("ix_inventario_variante", "variante_id"),
    )

    @property
    def disponible(self) -> int:
        return self.fisico - self.reservado - self.comprometido


TIPOS_MOVIMIENTO = ("entrada", "salida_venta", "ajuste_positivo", "ajuste_negativo", "merma",
                    "transferencia_salida", "transferencia_entrada", "devolucion_reingreso")


class MovimientoInventario(db.Model):
    """Kardex inmutable. `cantidad` es el cambio con signo sobre la existencia física."""
    __tablename__ = "movimiento_inventario"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    sucursal_id: Mapped[int] = mapped_column(ForeignKey("sucursal.id"))
    variante_id: Mapped[int] = mapped_column(ForeignKey("variante.id"))
    tipo: Mapped[str] = mapped_column(String(25))
    cantidad: Mapped[int] = mapped_column(Integer)
    saldo_resultante: Mapped[int] = mapped_column(Integer)
    motivo: Mapped[str] = mapped_column(String(250))
    referencia_tipo: Mapped[str | None] = mapped_column(String(30))
    referencia_id: Mapped[int | None] = mapped_column(BigInteger)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    clave_idempotencia: Mapped[str | None] = mapped_column(String(80), unique=True)
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    variante = relationship("Variante", lazy="joined")
    usuario = relationship("Usuario", lazy="joined")

    __table_args__ = (
        CheckConstraint("cantidad <> 0", name="ck_mov_cantidad"),
        CheckConstraint("saldo_resultante >= 0", name="ck_mov_saldo"),
        CheckConstraint("tipo in ('entrada','salida_venta','ajuste_positivo','ajuste_negativo','merma',"
                        "'transferencia_salida','transferencia_entrada','devolucion_reingreso')", name="ck_mov_tipo"),
        Index("ix_mov_sucursal_variante_fecha", "sucursal_id", "variante_id", "creado"),
        Index("ix_mov_referencia", "referencia_tipo", "referencia_id"),
    )


class Transferencia(ConFechas, db.Model):
    __tablename__ = "transferencia"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    folio: Mapped[str | None] = mapped_column(String(30), unique=True)
    origen_id: Mapped[int] = mapped_column(ForeignKey("sucursal.id"))
    destino_id: Mapped[int] = mapped_column(ForeignKey("sucursal.id"))
    estado: Mapped[str] = mapped_column(String(20), default="solicitada")
    motivo: Mapped[str] = mapped_column(String(250))
    solicitada_por: Mapped[int] = mapped_column(ForeignKey("usuario.id"))
    autorizada_por: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    enviada_por: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    recibida_por: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    observaciones: Mapped[str | None] = mapped_column(Text)

    origen = relationship("Sucursal", foreign_keys=[origen_id], lazy="joined")
    destino = relationship("Sucursal", foreign_keys=[destino_id], lazy="joined")
    detalles = relationship("TransferenciaDetalle", back_populates="transferencia", lazy="selectin",
                            cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("origen_id <> destino_id", name="ck_transf_distintas"),
        CheckConstraint("estado in ('solicitada','autorizada','enviada','recibida','recibida_parcial','cancelada')",
                        name="ck_transf_estado"),
    )


class TransferenciaDetalle(db.Model):
    __tablename__ = "transferencia_detalle"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    transferencia_id: Mapped[int] = mapped_column(ForeignKey("transferencia.id", ondelete="CASCADE"), index=True)
    variante_id: Mapped[int] = mapped_column(ForeignKey("variante.id"))
    cantidad: Mapped[int] = mapped_column(Integer)
    enviada: Mapped[int] = mapped_column(Integer, default=0)
    recibida: Mapped[int] = mapped_column(Integer, default=0)
    transferencia = relationship("Transferencia", back_populates="detalles")
    variante = relationship("Variante", lazy="joined")

    __table_args__ = (
        CheckConstraint("cantidad > 0", name="ck_tdet_cantidad"),
        CheckConstraint("enviada >= 0 and enviada <= cantidad", name="ck_tdet_enviada"),
        CheckConstraint("recibida >= 0 and recibida <= enviada", name="ck_tdet_recibida"),
    )
