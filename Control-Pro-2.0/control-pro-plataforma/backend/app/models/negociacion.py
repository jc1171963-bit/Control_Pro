"""Negociación de condiciones de un pedido corporativo aprobado y acuerdo de pago.

La comercializadora propone cambios (productos, tallas, cantidades, precios, descuentos) sin tocar las condiciones
vigentes; el Gerente de compras acepta la última versión. Cada propuesta guarda en su versión 0 una copia de lo vigente al
crearla, para que la comparación se pueda reproducir siempre. Versiones, partidas y acuerdos son de solo inserción.
"""
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import BigInteger, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..extensions import db
from .base import ConFechas, Dinero


class PropuestaPedido(ConFechas, db.Model):
    __tablename__ = "propuesta_pedido"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    pedido_id: Mapped[int] = mapped_column(ForeignKey("pedido.id"), index=True)
    numero: Mapped[int] = mapped_column(Integer)
    estado: Mapped[str] = mapped_column(String(12), default="pendiente")
    # Versión de las condiciones vigentes sobre la que se hizo; si cambian, la propuesta ya no se puede aceptar.
    version_base_pedido: Mapped[int] = mapped_column(Integer)
    motivo_descarte: Mapped[str | None] = mapped_column(String(300))
    creado_por_usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    aceptada_por_usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    aceptada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    versiones = relationship("PropuestaVersion", order_by="PropuestaVersion.numero", lazy="selectin")
    creado_por = relationship("Usuario", foreign_keys=[creado_por_usuario_id], lazy="joined")
    aceptada_por = relationship("Usuario", foreign_keys=[aceptada_por_usuario_id], lazy="joined")

    __table_args__ = (
        UniqueConstraint("pedido_id", "numero", name="uq_propuesta_numero"),
        CheckConstraint("estado in ('pendiente','aceptada','descartada')", name="ck_propuesta_estado"),
        Index("uq_propuesta_pendiente", "pedido_id", unique=True, postgresql_where=text("estado = 'pendiente'")),
    )


class PropuestaVersion(db.Model):
    __tablename__ = "propuesta_version"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    propuesta_id: Mapped[int] = mapped_column(ForeignKey("propuesta_pedido.id"), index=True)
    numero: Mapped[int] = mapped_column(Integer)  # 0 = copia de las condiciones vigentes al crear la propuesta
    nota: Mapped[str] = mapped_column(String(300))
    subtotal: Mapped[Decimal] = mapped_column(Dinero)
    descuento: Mapped[Decimal] = mapped_column(Dinero)
    total: Mapped[Decimal] = mapped_column(Dinero)
    creado_por_usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    partidas = relationship("PropuestaPartida", order_by="PropuestaPartida.id", lazy="selectin")
    creado_por = relationship("Usuario", lazy="joined")

    __table_args__ = (UniqueConstraint("propuesta_id", "numero", name="uq_propuesta_version"),)


class PropuestaPartida(db.Model):
    __tablename__ = "propuesta_partida"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    version_id: Mapped[int] = mapped_column(ForeignKey("propuesta_version.id"), index=True)
    pedido_detalle_id: Mapped[int | None] = mapped_column(BigInteger)  # partida vigente que modifica (sin FK: puede eliminarse)
    empleado_id: Mapped[int | None] = mapped_column(ForeignKey("empleado_corporativo.id"))
    variante_id: Mapped[int] = mapped_column(ForeignKey("variante.id"))
    sku: Mapped[str] = mapped_column(String(40))
    nombre: Mapped[str] = mapped_column(String(160))
    talla: Mapped[str] = mapped_column(String(20))
    color: Mapped[str] = mapped_column(String(40))
    empleado_nombre: Mapped[str | None] = mapped_column(String(160))
    cantidad: Mapped[int] = mapped_column(Integer)
    precio_unitario: Mapped[Decimal] = mapped_column(Dinero)
    descuento_unitario: Mapped[Decimal] = mapped_column(Dinero)
    importe: Mapped[Decimal] = mapped_column(Dinero)
    precio_catalogo: Mapped[Decimal] = mapped_column(Dinero)  # referencia: precio de catálogo al hacer la versión
    excepcion: Mapped[str | None] = mapped_column(String(250))

    __table_args__ = (
        UniqueConstraint("version_id", "pedido_detalle_id", name="uq_propuesta_partida"),
        CheckConstraint("cantidad > 0", name="ck_ppart_cantidad"),
        CheckConstraint("precio_unitario >= 0 and descuento_unitario >= 0 and descuento_unitario <= precio_unitario",
                        name="ck_ppart_precio"),
    )


class AcuerdoPago(db.Model):
    """Acuerdo de pago de una solicitud. Cada cambio es una versión nueva; la vigente es la de mayor número."""
    __tablename__ = "acuerdo_pago"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    pedido_id: Mapped[int] = mapped_column(ForeignKey("pedido.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    forma: Mapped[str] = mapped_column(String(120))
    condiciones: Mapped[str] = mapped_column(Text)
    fecha_pago: Mapped[date] = mapped_column(Date)  # fecha comprometida de pago
    observaciones: Mapped[str | None] = mapped_column(Text)
    registrado_por_usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    registrado_por = relationship("Usuario", lazy="joined")

    __table_args__ = (UniqueConstraint("pedido_id", "version", name="uq_acuerdo_version"),)
