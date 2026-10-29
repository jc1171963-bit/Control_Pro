"""Carrito, pedidos, asignaciones de surtido por sucursal, reservas, aprobaciones e historial de estados."""
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text,
                        UniqueConstraint, func, text)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..extensions import db
from .base import ConFechas, Dinero


class Carrito(ConFechas, db.Model):
    __tablename__ = "carrito"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("cliente.id", ondelete="CASCADE"), unique=True)
    items = relationship("CarritoItem", back_populates="carrito", cascade="all, delete-orphan",
                         order_by="CarritoItem.id", lazy="selectin")


class CarritoItem(db.Model):
    __tablename__ = "carrito_item"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    carrito_id: Mapped[int] = mapped_column(ForeignKey("carrito.id", ondelete="CASCADE"))
    variante_id: Mapped[int] = mapped_column(ForeignKey("variante.id"))
    cantidad: Mapped[int] = mapped_column(Integer)
    carrito = relationship("Carrito", back_populates="items")
    variante = relationship("Variante", lazy="joined")
    __table_args__ = (
        UniqueConstraint("carrito_id", "variante_id", name="uq_carrito_variante"),
        CheckConstraint("cantidad > 0 and cantidad <= 99", name="ck_carrito_cantidad"),
    )


class Favorito(db.Model):
    __tablename__ = "favorito"
    cliente_id: Mapped[int] = mapped_column(ForeignKey("cliente.id", ondelete="CASCADE"), primary_key=True)
    producto_id: Mapped[int] = mapped_column(ForeignKey("producto.id", ondelete="CASCADE"), primary_key=True)
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


ESTADOS_PEDIDO = ("en_revision", "devuelto", "rechazado", "pendiente_pago", "pago_en_revision", "confirmado",
                  "en_preparacion", "parcialmente_enviado", "enviado", "parcialmente_entregado", "entregado",
                  "cerrado", "cancelado", "expirado")


class Pedido(ConFechas, db.Model):
    __tablename__ = "pedido"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    folio: Mapped[str | None] = mapped_column(String(30), unique=True)
    canal: Mapped[str] = mapped_column(String(12))
    cliente_id: Mapped[int] = mapped_column(ForeignKey("cliente.id"), index=True)
    modalidad: Mapped[str] = mapped_column(String(10))
    sucursal_recoger_id: Mapped[int | None] = mapped_column(ForeignKey("sucursal.id"))
    direccion_envio: Mapped[dict | None] = mapped_column(JSONB)
    metodo_pago: Mapped[str] = mapped_column(String(25))
    estado: Mapped[str] = mapped_column(String(25))
    subtotal: Mapped[Decimal] = mapped_column(Dinero, default=0)
    descuento: Mapped[Decimal] = mapped_column(Dinero, default=0)
    costo_envio: Mapped[Decimal] = mapped_column(Dinero, default=0)
    impuestos: Mapped[Decimal] = mapped_column(Dinero, default=0)
    total: Mapped[Decimal] = mapped_column(Dinero, default=0)
    notas: Mapped[str | None] = mapped_column(Text)
    clave_idempotencia: Mapped[str | None] = mapped_column(String(80), unique=True)
    reserva_expira: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    cliente = relationship("Cliente", lazy="joined")
    sucursal_recoger = relationship("Sucursal", lazy="joined")
    detalles = relationship("PedidoDetalle", back_populates="pedido", order_by="PedidoDetalle.id", lazy="selectin",
                            cascade="all, delete-orphan")
    asignaciones = relationship("AsignacionSurtido", back_populates="pedido", order_by="AsignacionSurtido.id",
                                lazy="selectin")
    pagos = relationship("Pago", back_populates="pedido", order_by="Pago.id", lazy="selectin")

    __table_args__ = (
        CheckConstraint("canal in ('tienda','corporativo')", name="ck_pedido_canal"),
        CheckConstraint("modalidad in ('envio','recoger')", name="ck_pedido_modalidad"),
        CheckConstraint("modalidad <> 'recoger' or sucursal_recoger_id is not null", name="ck_pedido_recoger"),
        CheckConstraint("modalidad <> 'envio' or direccion_envio is not null", name="ck_pedido_direccion"),
        CheckConstraint("metodo_pago in ('transferencia','efectivo','tarjeta_pasarela','credito_corporativo')",
                        name="ck_pedido_metodo"),
        CheckConstraint("estado in (" + ",".join(f"'{e}'" for e in ESTADOS_PEDIDO) + ")", name="ck_pedido_estado"),
        CheckConstraint("subtotal >= 0 and descuento >= 0 and costo_envio >= 0 and total >= 0", name="ck_pedido_montos"),
        Index("ix_pedido_estado_creado", "estado", "creado"),
    )


class PedidoDetalle(db.Model):
    __tablename__ = "pedido_detalle"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    pedido_id: Mapped[int] = mapped_column(ForeignKey("pedido.id", ondelete="CASCADE"), index=True)
    variante_id: Mapped[int] = mapped_column(ForeignKey("variante.id"))
    empleado_id: Mapped[int | None] = mapped_column(ForeignKey("empleado_corporativo.id"))
    # Copias del catálogo al momento de la compra: un cambio de catálogo no altera pedidos existentes.
    sku: Mapped[str] = mapped_column(String(40))
    nombre: Mapped[str] = mapped_column(String(160))
    talla: Mapped[str] = mapped_column(String(20))
    color: Mapped[str] = mapped_column(String(40))
    cantidad: Mapped[int] = mapped_column(Integer)
    precio_unitario: Mapped[Decimal] = mapped_column(Dinero)
    descuento_unitario: Mapped[Decimal] = mapped_column(Dinero, default=0)
    importe: Mapped[Decimal] = mapped_column(Dinero)
    excepcion: Mapped[str | None] = mapped_column(String(250))
    cantidad_cancelada: Mapped[int] = mapped_column(Integer, default=0)
    cantidad_entregada: Mapped[int] = mapped_column(Integer, default=0)
    cantidad_devuelta: Mapped[int] = mapped_column(Integer, default=0)

    pedido = relationship("Pedido", back_populates="detalles")
    variante = relationship("Variante", lazy="joined")
    empleado = relationship("EmpleadoCorporativo", lazy="joined")

    __table_args__ = (
        CheckConstraint("cantidad > 0", name="ck_pdet_cantidad"),
        CheckConstraint("precio_unitario >= 0 and descuento_unitario >= 0 and descuento_unitario <= precio_unitario",
                        name="ck_pdet_precio"),
        CheckConstraint("cantidad_cancelada >= 0 and cantidad_entregada >= 0 and cantidad_devuelta >= 0",
                        name="ck_pdet_no_negativos"),
        CheckConstraint("cantidad_cancelada + cantidad_entregada <= cantidad", name="ck_pdet_entregada"),
        CheckConstraint("cantidad_devuelta <= cantidad_entregada", name="ck_pdet_devuelta"),
    )

    @property
    def precio_final(self) -> Decimal:
        return self.precio_unitario - self.descuento_unitario


class AsignacionSurtido(ConFechas, db.Model):
    __tablename__ = "asignacion_surtido"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    pedido_id: Mapped[int] = mapped_column(ForeignKey("pedido.id", ondelete="CASCADE"))
    sucursal_id: Mapped[int] = mapped_column(ForeignKey("sucursal.id"), index=True)
    estado: Mapped[str] = mapped_column(String(20), default="pendiente")

    pedido = relationship("Pedido", back_populates="asignaciones")
    sucursal = relationship("Sucursal", lazy="joined")
    detalles = relationship("AsignacionDetalle", back_populates="asignacion", order_by="AsignacionDetalle.id",
                            lazy="selectin", cascade="all, delete-orphan")
    paquetes = relationship("Paquete", back_populates="asignacion", order_by="Paquete.id", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("pedido_id", "sucursal_id", name="uq_asignacion_pedido_sucursal"),
        CheckConstraint("estado in ('pendiente','en_surtido','empacada','despachada','entregada','cancelada')",
                        name="ck_asig_estado"),
    )


class AsignacionDetalle(db.Model):
    __tablename__ = "asignacion_detalle"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    asignacion_id: Mapped[int] = mapped_column(ForeignKey("asignacion_surtido.id", ondelete="CASCADE"), index=True)
    pedido_detalle_id: Mapped[int] = mapped_column(ForeignKey("pedido_detalle.id", ondelete="CASCADE"), index=True)
    cantidad: Mapped[int] = mapped_column(Integer)
    surtida: Mapped[int] = mapped_column(Integer, default=0)
    empacada: Mapped[int] = mapped_column(Integer, default=0)
    despachada: Mapped[int] = mapped_column(Integer, default=0)
    faltante: Mapped[int] = mapped_column(Integer, default=0)

    asignacion = relationship("AsignacionSurtido", back_populates="detalles")
    pedido_detalle = relationship("PedidoDetalle", lazy="joined")

    __table_args__ = (
        UniqueConstraint("asignacion_id", "pedido_detalle_id", name="uq_asigdet_partida"),
        CheckConstraint("cantidad > 0", name="ck_asigdet_cantidad"),
        CheckConstraint("surtida >= 0 and surtida + faltante <= cantidad", name="ck_asigdet_surtida"),
        CheckConstraint("empacada >= 0 and empacada <= surtida", name="ck_asigdet_empacada"),
        CheckConstraint("despachada >= 0 and despachada <= empacada", name="ck_asigdet_despachada"),
        CheckConstraint("faltante >= 0", name="ck_asigdet_faltante"),
    )


class ReservaInventario(db.Model):
    __tablename__ = "reserva_inventario"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    asignacion_detalle_id: Mapped[int] = mapped_column(ForeignKey("asignacion_detalle.id", ondelete="CASCADE"))
    sucursal_id: Mapped[int] = mapped_column(ForeignKey("sucursal.id"))
    variante_id: Mapped[int] = mapped_column(ForeignKey("variante.id"))
    cantidad: Mapped[int] = mapped_column(Integer)
    estado: Mapped[str] = mapped_column(String(12), default="activa")
    expira: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actualizado: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("cantidad > 0", name="ck_reserva_cantidad"),
        CheckConstraint("estado in ('activa','consumida','liberada','expirada')", name="ck_reserva_estado"),
        Index("uq_reserva_activa", "asignacion_detalle_id", unique=True, postgresql_where=text("estado = 'activa'")),
        Index("ix_reserva_estado_expira", "estado", "expira"),
    )


class Aprobacion(db.Model):
    __tablename__ = "aprobacion"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    pedido_id: Mapped[int] = mapped_column(ForeignKey("pedido.id", ondelete="CASCADE"), index=True)
    decision: Mapped[str] = mapped_column(String(12))
    motivo: Mapped[str | None] = mapped_column(String(500))
    usuario_id: Mapped[int] = mapped_column(ForeignKey("usuario.id"))
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    usuario = relationship("Usuario", lazy="joined")
    __table_args__ = (
        CheckConstraint("decision in ('aprobado','rechazado','devuelto')", name="ck_aprob_decision"),
        CheckConstraint("decision = 'aprobado' or (motivo is not null and length(trim(motivo)) > 0)",
                        name="ck_aprob_motivo"),
    )


class HistorialEstado(db.Model):
    __tablename__ = "historial_estado"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    entidad: Mapped[str] = mapped_column(String(30))
    entidad_id: Mapped[int] = mapped_column(BigInteger)
    anterior: Mapped[str | None] = mapped_column(String(25))
    nuevo: Mapped[str] = mapped_column(String(25))
    motivo: Mapped[str | None] = mapped_column(String(500))
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("cliente.id"))
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    usuario = relationship("Usuario", lazy="joined")
    __table_args__ = (Index("ix_historial_entidad", "entidad", "entidad_id"),)
