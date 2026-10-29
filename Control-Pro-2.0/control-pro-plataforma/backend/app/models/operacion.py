"""Pagos, reembolsos, paquetes, envíos, recepciones, entregas individuales, devoluciones, incidencias,
notificaciones y auditoría."""
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text,
                        UniqueConstraint, func)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..extensions import db
from .base import ConFechas, Dinero


class Pago(ConFechas, db.Model):
    """Nunca se guardan números de tarjeta ni códigos de seguridad."""
    __tablename__ = "pago"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    folio: Mapped[str | None] = mapped_column(String(30), unique=True)
    pedido_id: Mapped[int] = mapped_column(ForeignKey("pedido.id"), index=True)
    metodo: Mapped[str] = mapped_column(String(25))
    estado: Mapped[str] = mapped_column(String(25), default="pendiente")
    monto: Mapped[Decimal] = mapped_column(Dinero)
    referencia: Mapped[str | None] = mapped_column(String(80))
    comprobante_url: Mapped[str | None] = mapped_column(String(300))
    sucursal_id: Mapped[int | None] = mapped_column(ForeignKey("sucursal.id"))
    registrado_por_usuario: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    registrado_por_cliente: Mapped[int | None] = mapped_column(ForeignKey("cliente.id"))
    validado_por: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    validado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    motivo_rechazo: Mapped[str | None] = mapped_column(String(300))
    monto_reembolsado: Mapped[Decimal] = mapped_column(Dinero, default=0)
    clave_idempotencia: Mapped[str | None] = mapped_column(String(80), unique=True)

    pedido = relationship("Pedido", back_populates="pagos")
    reembolsos = relationship("Reembolso", back_populates="pago", lazy="selectin")

    __table_args__ = (
        CheckConstraint("metodo in ('transferencia','efectivo','tarjeta_pasarela','credito_corporativo')",
                        name="ck_pago_metodo"),
        CheckConstraint("estado in ('pendiente','en_proceso','confirmado','rechazado','cancelado',"
                        "'reembolsado_parcial','reembolsado')", name="ck_pago_estado"),
        CheckConstraint("monto > 0", name="ck_pago_monto"),
        CheckConstraint("monto_reembolsado >= 0 and monto_reembolsado <= monto", name="ck_pago_reembolso"),
        CheckConstraint("estado not in ('confirmado','reembolsado_parcial','reembolsado') or "
                        "(validado_por is not null and validado_en is not null)", name="ck_pago_validado"),
    )


class Reembolso(db.Model):
    __tablename__ = "reembolso"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    pago_id: Mapped[int | None] = mapped_column(ForeignKey("pago.id"), index=True)
    pedido_id: Mapped[int] = mapped_column(ForeignKey("pedido.id"), index=True)
    devolucion_id: Mapped[int | None] = mapped_column(ForeignKey("devolucion.id"))
    tipo: Mapped[str] = mapped_column(String(12), default="reembolso")
    monto: Mapped[Decimal] = mapped_column(Dinero)
    motivo: Mapped[str] = mapped_column(String(300))
    estado: Mapped[str] = mapped_column(String(12), default="pendiente")
    referencia: Mapped[str | None] = mapped_column(String(80))
    autorizado_por: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    realizado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    pago = relationship("Pago", back_populates="reembolsos")
    __table_args__ = (
        CheckConstraint("monto > 0", name="ck_reemb_monto"),
        CheckConstraint("tipo in ('reembolso','ajuste')", name="ck_reemb_tipo"),
        CheckConstraint("estado in ('pendiente','realizado','cancelado')", name="ck_reemb_estado"),
        CheckConstraint("tipo = 'ajuste' or pago_id is not null", name="ck_reemb_pago"),
    )


class Paquete(ConFechas, db.Model):
    __tablename__ = "paquete"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    folio: Mapped[str | None] = mapped_column(String(30), unique=True)
    asignacion_id: Mapped[int] = mapped_column(ForeignKey("asignacion_surtido.id"), index=True)
    estado: Mapped[str] = mapped_column(String(25), default="preparado")
    peso_kg: Mapped[Decimal | None] = mapped_column(Dinero)
    asignacion = relationship("AsignacionSurtido", back_populates="paquetes")
    detalles = relationship("PaqueteDetalle", lazy="selectin", cascade="all, delete-orphan")
    envio = relationship("Envio", back_populates="paquete", uselist=False, lazy="selectin")
    __table_args__ = (
        CheckConstraint("estado in ('preparado','despachado','en_transito','listo_para_recoger','entregado',"
                        "'incidencia','cancelado')", name="ck_paquete_estado"),
    )


class PaqueteDetalle(db.Model):
    __tablename__ = "paquete_detalle"
    paquete_id: Mapped[int] = mapped_column(ForeignKey("paquete.id", ondelete="CASCADE"), primary_key=True)
    asignacion_detalle_id: Mapped[int] = mapped_column(ForeignKey("asignacion_detalle.id"), primary_key=True)
    cantidad: Mapped[int] = mapped_column(Integer)
    asignacion_detalle = relationship("AsignacionDetalle", lazy="joined")
    __table_args__ = (CheckConstraint("cantidad > 0", name="ck_paqdet_cantidad"),)


class Envio(ConFechas, db.Model):
    __tablename__ = "envio"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    paquete_id: Mapped[int] = mapped_column(ForeignKey("paquete.id"), unique=True)
    paqueteria: Mapped[str] = mapped_column(String(60))
    guia: Mapped[str] = mapped_column(String(60))
    proveedor: Mapped[str] = mapped_column(String(20), default="manual")
    estado: Mapped[str] = mapped_column(String(25), default="despachado")
    despachado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    paquete = relationship("Paquete", back_populates="envio")
    eventos = relationship("EventoEnvio", order_by="EventoEnvio.id", lazy="selectin")
    __table_args__ = (
        UniqueConstraint("paqueteria", "guia", name="uq_envio_guia"),
        CheckConstraint("estado in ('despachado','en_transito','entregado','incidencia')", name="ck_envio_estado"),
    )


class EventoEnvio(db.Model):
    __tablename__ = "evento_envio"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    envio_id: Mapped[int] = mapped_column(ForeignKey("envio.id", ondelete="CASCADE"), index=True)
    estado: Mapped[str] = mapped_column(String(25))
    descripcion: Mapped[str] = mapped_column(String(300))
    origen: Mapped[str] = mapped_column(String(15), default="interno")
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    fecha: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (CheckConstraint("origen in ('interno','transportista')", name="ck_evento_origen"),)


class Recepcion(db.Model):
    """Recepción física por la cuenta corporativa. No equivale a entrega a cada empleado."""
    __tablename__ = "recepcion"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    paquete_id: Mapped[int] = mapped_column(ForeignKey("paquete.id"), unique=True)
    estado: Mapped[str] = mapped_column(String(10))
    diferencias: Mapped[str | None] = mapped_column(Text)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("cliente.id"))
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (CheckConstraint("estado in ('completa','parcial')", name="ck_recepcion_estado"),
                      CheckConstraint("estado = 'completa' or diferencias is not null", name="ck_recepcion_dif"))


class EntregaIndividual(ConFechas, db.Model):
    __tablename__ = "entrega_individual"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    paquete_id: Mapped[int] = mapped_column(ForeignKey("paquete.id"))
    empleado_id: Mapped[int] = mapped_column(ForeignKey("empleado_corporativo.id"))
    estado: Mapped[str] = mapped_column(String(15), default="pendiente")
    firma: Mapped[str | None] = mapped_column(Text)
    valoracion: Mapped[int | None] = mapped_column(Integer)
    observaciones: Mapped[str | None] = mapped_column(String(500))
    entregado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    detalles = relationship("EntregaIndividualDetalle", lazy="selectin", cascade="all, delete-orphan")
    empleado = relationship("EmpleadoCorporativo", lazy="joined")
    __table_args__ = (
        UniqueConstraint("paquete_id", "empleado_id", name="uq_entrega_paquete_empleado"),
        CheckConstraint("estado in ('pendiente','parcial','entregada','con_incidencia')", name="ck_entrega_estado"),
        CheckConstraint("valoracion is null or valoracion between 1 and 5", name="ck_entrega_valoracion"),
    )


class EntregaIndividualDetalle(db.Model):
    __tablename__ = "entrega_individual_detalle"
    entrega_id: Mapped[int] = mapped_column(ForeignKey("entrega_individual.id", ondelete="CASCADE"), primary_key=True)
    pedido_detalle_id: Mapped[int] = mapped_column(ForeignKey("pedido_detalle.id"), primary_key=True)
    esperada: Mapped[int] = mapped_column(Integer)
    entregada: Mapped[int] = mapped_column(Integer, default=0)
    pedido_detalle = relationship("PedidoDetalle", lazy="joined")
    __table_args__ = (CheckConstraint("entregada >= 0 and entregada <= esperada", name="ck_entdet_cantidad"),)


class Devolucion(ConFechas, db.Model):
    __tablename__ = "devolucion"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    folio: Mapped[str | None] = mapped_column(String(30), unique=True)
    pedido_id: Mapped[int] = mapped_column(ForeignKey("pedido.id"), index=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("cliente.id"))
    motivo: Mapped[str] = mapped_column(String(40))
    descripcion: Mapped[str] = mapped_column(Text)
    evidencias: Mapped[list] = mapped_column(JSONB, default=list)
    estado: Mapped[str] = mapped_column(String(15), default="solicitada")
    sucursal_recibe_id: Mapped[int | None] = mapped_column(ForeignKey("sucursal.id"))
    guia_retorno: Mapped[str | None] = mapped_column(String(60))
    resolucion: Mapped[str | None] = mapped_column(Text)
    autorizada_por: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    monto_reembolso: Mapped[Decimal] = mapped_column(Dinero, default=0)
    pedido = relationship("Pedido", lazy="joined")
    sucursal_recibe = relationship("Sucursal", lazy="joined")
    detalles = relationship("DevolucionDetalle", lazy="selectin", cascade="all, delete-orphan")
    __table_args__ = (
        CheckConstraint("estado in ('solicitada','autorizada','rechazada','en_camino','recibida','inspeccionada',"
                        "'reembolsada','cerrada')", name="ck_devol_estado"),
        CheckConstraint("motivo in ('talla_incorrecta','producto_danado','producto_incorrecto','no_corresponde',"
                        "'arrepentimiento','otro')", name="ck_devol_motivo"),
        CheckConstraint("jsonb_array_length(evidencias) >= 1", name="ck_devol_evidencia"),
    )


class DevolucionDetalle(db.Model):
    __tablename__ = "devolucion_detalle"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    devolucion_id: Mapped[int] = mapped_column(ForeignKey("devolucion.id", ondelete="CASCADE"), index=True)
    pedido_detalle_id: Mapped[int] = mapped_column(ForeignKey("pedido_detalle.id"))
    cantidad: Mapped[int] = mapped_column(Integer)
    recibida: Mapped[int] = mapped_column(Integer, default=0)
    resultado: Mapped[str] = mapped_column(String(10), default="pendiente")
    pedido_detalle = relationship("PedidoDetalle", lazy="joined")
    __table_args__ = (
        UniqueConstraint("devolucion_id", "pedido_detalle_id", name="uq_devdet_partida"),
        CheckConstraint("cantidad > 0", name="ck_devdet_cantidad"),
        CheckConstraint("recibida >= 0 and recibida <= cantidad", name="ck_devdet_recibida"),
        CheckConstraint("resultado in ('pendiente','reingreso','merma','parcial')", name="ck_devdet_resultado"),
    )


class Incidencia(ConFechas, db.Model):
    __tablename__ = "incidencia"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    folio: Mapped[str | None] = mapped_column(String(30), unique=True)
    tipo: Mapped[str] = mapped_column(String(40))
    prioridad: Mapped[str] = mapped_column(String(10), default="media")
    estado: Mapped[str] = mapped_column(String(15), default="abierta")
    pedido_id: Mapped[int | None] = mapped_column(ForeignKey("pedido.id"), index=True)
    paquete_id: Mapped[int | None] = mapped_column(ForeignKey("paquete.id"))
    devolucion_id: Mapped[int | None] = mapped_column(ForeignKey("devolucion.id"))
    transferencia_id: Mapped[int | None] = mapped_column(ForeignKey("transferencia.id"))
    sucursal_id: Mapped[int | None] = mapped_column(ForeignKey("sucursal.id"))
    descripcion: Mapped[str] = mapped_column(Text)
    resolucion: Mapped[str | None] = mapped_column(Text)
    responsable_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    creado_por_usuario: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    creado_por_cliente: Mapped[int | None] = mapped_column(ForeignKey("cliente.id"))
    __table_args__ = (
        CheckConstraint("estado in ('abierta','en_atencion','resuelta','cerrada')", name="ck_inc_estado"),
        CheckConstraint("prioridad in ('baja','media','alta','critica')", name="ck_inc_prioridad"),
        CheckConstraint("num_nonnulls(pedido_id, paquete_id, devolucion_id, transferencia_id) >= 1",
                        name="ck_inc_referencia"),
        CheckConstraint("estado not in ('resuelta','cerrada') or resolucion is not null", name="ck_inc_resolucion"),
    )


class Notificacion(db.Model):
    __tablename__ = "notificacion"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id", ondelete="CASCADE"))
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("cliente.id", ondelete="CASCADE"))
    evento: Mapped[str] = mapped_column(String(40))
    entidad: Mapped[str] = mapped_column(String(30))
    entidad_id: Mapped[int] = mapped_column(BigInteger)
    mensaje: Mapped[str] = mapped_column(String(300))
    enlace: Mapped[str | None] = mapped_column(String(200))
    leida: Mapped[bool] = mapped_column(default=False)
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        CheckConstraint("num_nonnulls(usuario_id, cliente_id) = 1", name="ck_notif_destinatario"),
        UniqueConstraint("usuario_id", "cliente_id", "evento", "entidad", "entidad_id", name="uq_notif_evento",
                         postgresql_nulls_not_distinct=True),
        Index("ix_notif_usuario", "usuario_id", "leida"),
        Index("ix_notif_cliente", "cliente_id", "leida"),
    )


class Auditoria(db.Model):
    """Solo inserción: un trigger de la base impide UPDATE y DELETE."""
    __tablename__ = "auditoria"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id"))
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("cliente.id"))
    accion: Mapped[str] = mapped_column(String(60))
    entidad: Mapped[str] = mapped_column(String(30))
    entidad_id: Mapped[int | None] = mapped_column(BigInteger)
    sucursal_id: Mapped[int | None] = mapped_column(ForeignKey("sucursal.id"))
    antes: Mapped[dict | None] = mapped_column(JSONB)
    despues: Mapped[dict | None] = mapped_column(JSONB)
    ip: Mapped[str | None] = mapped_column(String(45))
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    usuario = relationship("Usuario", lazy="joined")
    __table_args__ = (Index("ix_auditoria_entidad", "entidad", "entidad_id"),)
