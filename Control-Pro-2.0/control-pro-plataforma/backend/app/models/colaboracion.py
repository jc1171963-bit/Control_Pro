"""Colaboración entre el aprobador corporativo, las sucursales y la distribuidora: permisos para editar el padrón de
empleados y conversaciones (chat) ligadas o no a una solicitud."""
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..extensions import db
from .base import ConFechas

ESTADOS_PERMISO = ("pendiente", "aprobado", "rechazado", "cancelado", "terminado")


class PermisoPadron(ConFechas, db.Model):
    """Una sucursal pide permiso para modificar su padrón de empleados. Aprobado, vale hasta `vigente_hasta` o hasta que
    la sucursal lo da por terminado o el aprobador lo revoca (estado `terminado`)."""
    __tablename__ = "permiso_padron"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    cliente_id: Mapped[int] = mapped_column(ForeignKey("cliente.id", ondelete="CASCADE"), index=True)
    motivo: Mapped[str] = mapped_column(String(300))
    estado: Mapped[str] = mapped_column(String(15), default="pendiente")
    respuesta: Mapped[str | None] = mapped_column(String(300))
    resuelto_por_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id", ondelete="SET NULL"))
    resuelto_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    vigente_hasta: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    terminado_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cliente = relationship("Cliente", lazy="joined")
    resuelto_por = relationship("Usuario", lazy="joined")
    __table_args__ = (
        CheckConstraint("estado in ('pendiente','aprobado','rechazado','cancelado','terminado')", name="ck_permiso_padron_estado"),
        Index("ix_permiso_padron_estado", "estado"),
    )


class Conversacion(ConFechas, db.Model):
    """Canal entre el aprobador y una sucursal (`tipo='sucursal'`) o entre el aprobador y la distribuidora
    (`tipo='distribuidora'`). Puede referirse a una solicitud (`pedido_id`) o ser general."""
    __tablename__ = "conversacion"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tipo: Mapped[str] = mapped_column(String(15))
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("cliente.id", ondelete="CASCADE"), index=True)
    pedido_id: Mapped[int | None] = mapped_column(ForeignKey("pedido.id", ondelete="CASCADE"), index=True)
    ultimo_mensaje_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Marcas de lectura por lado: el aprobador y la contraparte (la sucursal o la distribuidora).
    leido_aprobador_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    leido_contraparte_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Entregado: la app del otro lado ya recibió los mensajes (aunque aún no abra la conversación). Da la doble palomita.
    entregado_aprobador_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    entregado_contraparte_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # "Escribiendo…": cada lado avisa mientras escribe; caduca sola a los pocos segundos.
    escribiendo_aprobador_hasta: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    escribiendo_contraparte_hasta: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cliente = relationship("Cliente", lazy="joined")
    pedido = relationship("Pedido", lazy="joined")
    __table_args__ = (
        CheckConstraint("tipo in ('sucursal','distribuidora')", name="ck_conversacion_tipo"),
        CheckConstraint("tipo <> 'sucursal' or cliente_id is not null", name="ck_conversacion_sucursal"),
        UniqueConstraint("tipo", "cliente_id", "pedido_id", name="uq_conversacion", postgresql_nulls_not_distinct=True),
    )


class Mensaje(db.Model):
    __tablename__ = "mensaje"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    conversacion_id: Mapped[int] = mapped_column(ForeignKey("conversacion.id", ondelete="CASCADE"))
    autor_usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id", ondelete="SET NULL"))
    autor_cliente_id: Mapped[int | None] = mapped_column(ForeignKey("cliente.id", ondelete="SET NULL"))
    # Lado del autor al escribir: 'aprobador' o 'contraparte' (se conserva aunque el usuario cambie de rol).
    lado: Mapped[str] = mapped_column(String(12))
    texto: Mapped[str] = mapped_column(Text)
    # texto | imagen | audio | archivo. Con adjunto el texto es opcional (pie de foto).
    tipo: Mapped[str] = mapped_column(String(10), default="texto", server_default="texto")
    adjunto_url: Mapped[str | None] = mapped_column(String(300))
    adjunto_nombre: Mapped[str | None] = mapped_column(String(160))
    adjunto_duracion: Mapped[int | None] = mapped_column(Integer)  # segundos (notas de voz)
    responde_a_id: Mapped[int | None] = mapped_column(ForeignKey("mensaje.id", ondelete="SET NULL"))
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    autor_usuario = relationship("Usuario", lazy="joined")
    autor_cliente = relationship("Cliente", lazy="joined")
    responde_a = relationship("Mensaje", remote_side="Mensaje.id", lazy="joined", join_depth=1)
    __table_args__ = (
        CheckConstraint("lado in ('aprobador','contraparte')", name="ck_mensaje_lado"),
        CheckConstraint("char_length(texto) <= 2000 and (char_length(texto) >= 1 or adjunto_url is not null)", name="ck_mensaje_texto"),
        CheckConstraint("tipo in ('texto','imagen','audio','archivo')", name="ck_mensaje_tipo"),
        Index("ix_mensaje_conversacion", "conversacion_id", "id"),
    )


class PushSuscripcion(db.Model):
    """Dispositivo (navegador o app instalada) suscrito a notificaciones push de una cuenta. El `endpoint` lo da el
    servicio push del navegador; `p256dh` y `auth` cifran el mensaje para ese dispositivo."""
    __tablename__ = "push_suscripcion"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    usuario_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id", ondelete="CASCADE"), index=True)
    cliente_id: Mapped[int | None] = mapped_column(ForeignKey("cliente.id", ondelete="CASCADE"), index=True)
    # Sesión que registró la suscripción; NULL en las anteriores a H1.
    sid: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sesion_auth.id", ondelete="CASCADE", name="fk_push_suscripcion_sid"), index=True)
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(String(200))
    auth: Mapped[str] = mapped_column(String(100))
    agente: Mapped[str | None] = mapped_column(String(200))
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (CheckConstraint("num_nonnulls(usuario_id, cliente_id) = 1", name="ck_push_dueno"),)
