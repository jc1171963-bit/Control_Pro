"""Catálogo maestro: categorías, productos, variantes, habilitación por sucursal y promociones."""
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (BigInteger, Boolean, CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, String,
                        Table, Text, UniqueConstraint, func, text)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..extensions import db
from .base import ConFechas, Dinero

promocion_producto = Table(
    "promocion_producto",
    db.metadata,
    Column("promocion_id", ForeignKey("promocion.id", ondelete="CASCADE"), primary_key=True),
    Column("producto_id", ForeignKey("producto.id", ondelete="CASCADE"), primary_key=True),
)


class Categoria(db.Model):
    __tablename__ = "categoria"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(80))
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    padre_id: Mapped[int | None] = mapped_column(ForeignKey("categoria.id"))
    orden: Mapped[int] = mapped_column(Integer, default=0)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)


class Producto(ConFechas, db.Model):
    __tablename__ = "producto"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    sku_base: Mapped[str] = mapped_column(String(30), unique=True)
    nombre: Mapped[str] = mapped_column(String(160))
    slug: Mapped[str] = mapped_column(String(180), unique=True)
    descripcion: Mapped[str] = mapped_column(Text, default="")
    material: Mapped[str | None] = mapped_column(String(120))
    cuidados: Mapped[str | None] = mapped_column(String(250))
    categoria_id: Mapped[int] = mapped_column(ForeignKey("categoria.id"), index=True)
    destacado: Mapped[bool] = mapped_column(Boolean, default=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)

    categoria = relationship("Categoria", lazy="joined")
    variantes = relationship("Variante", back_populates="producto", order_by="Variante.id", lazy="selectin")
    imagenes = relationship("ProductoImagen", order_by="ProductoImagen.orden", lazy="selectin")
    puestos = relationship("ProductoPuesto", lazy="selectin", cascade="all, delete-orphan")
    sucursales = relationship("ProductoSucursal", lazy="selectin", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_producto_busqueda", text("to_tsvector('spanish', nombre || ' ' || coalesce(descripcion, ''))"),
              postgresql_using="gin"),
    )


class ProductoImagen(db.Model):
    __tablename__ = "producto_imagen"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    producto_id: Mapped[int] = mapped_column(ForeignKey("producto.id", ondelete="CASCADE"), index=True)
    url: Mapped[str] = mapped_column(String(300))
    orden: Mapped[int] = mapped_column(Integer, default=0)
    alt: Mapped[str] = mapped_column(String(160), default="")


class Variante(ConFechas, db.Model):
    __tablename__ = "variante"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    producto_id: Mapped[int] = mapped_column(ForeignKey("producto.id", ondelete="RESTRICT"), index=True)
    sku: Mapped[str] = mapped_column(String(40), unique=True)
    talla: Mapped[str] = mapped_column(String(20))
    color: Mapped[str] = mapped_column(String(40))
    color_hex: Mapped[str] = mapped_column(String(7), default="#334155")
    precio_base: Mapped[Decimal] = mapped_column(Dinero)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    producto = relationship("Producto", back_populates="variantes")

    __table_args__ = (
        UniqueConstraint("producto_id", "talla", "color", name="uq_variante_producto_talla_color"),
        CheckConstraint("precio_base > 0", name="ck_variante_precio"),
        CheckConstraint("color_hex ~ '^#[0-9A-Fa-f]{6}$'", name="ck_variante_color_hex"),
    )


class ProductoSucursal(db.Model):
    """Habilitación de cada producto por sucursal. Sin registro = habilitado."""
    __tablename__ = "producto_sucursal"
    producto_id: Mapped[int] = mapped_column(ForeignKey("producto.id", ondelete="CASCADE"), primary_key=True)
    sucursal_id: Mapped[int] = mapped_column(ForeignKey("sucursal.id", ondelete="CASCADE"), primary_key=True)
    habilitado: Mapped[bool] = mapped_column(Boolean, default=True)


class ProductoPuesto(db.Model):
    """Puestos autorizados para el canal corporativo."""
    __tablename__ = "producto_puesto"
    producto_id: Mapped[int] = mapped_column(ForeignKey("producto.id", ondelete="CASCADE"), primary_key=True)
    puesto: Mapped[str] = mapped_column(String(60), primary_key=True)


class Promocion(ConFechas, db.Model):
    __tablename__ = "promocion"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(120))
    tipo: Mapped[str] = mapped_column(String(12))
    valor: Mapped[Decimal] = mapped_column(Dinero)
    inicio: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    fin: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Nula = global. Con valor: aplica solo a pedidos para recoger en esa sucursal.
    sucursal_id: Mapped[int | None] = mapped_column(ForeignKey("sucursal.id"))
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    productos = relationship("Producto", secondary=promocion_producto, lazy="selectin")

    __table_args__ = (
        CheckConstraint("tipo in ('porcentaje','monto')", name="ck_promocion_tipo"),
        CheckConstraint("valor > 0", name="ck_promocion_valor"),
        CheckConstraint("tipo <> 'porcentaje' or valor <= 90", name="ck_promocion_porcentaje"),
        CheckConstraint("fin > inicio", name="ck_promocion_fechas"),
    )
