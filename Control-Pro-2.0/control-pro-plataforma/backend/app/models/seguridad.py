"""Sucursales, usuarios internos, roles, permisos y tokens."""
from datetime import datetime

from sqlalchemy import (BigInteger, Boolean, CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, String,
                        Table, Text, UniqueConstraint, func)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..extensions import db
from .base import ConFechas

rol_permiso = Table(
    "rol_permiso",
    db.metadata,
    Column("rol_id", ForeignKey("rol.id", ondelete="CASCADE"), primary_key=True),
    Column("permiso_id", ForeignKey("permiso.id", ondelete="CASCADE"), primary_key=True),
)

usuario_sucursal = Table(
    "usuario_sucursal",
    db.metadata,
    Column("usuario_id", ForeignKey("usuario.id", ondelete="CASCADE"), primary_key=True),
    Column("sucursal_id", ForeignKey("sucursal.id", ondelete="RESTRICT"), primary_key=True),
)


class Sucursal(ConFechas, db.Model):
    __tablename__ = "sucursal"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    codigo: Mapped[str] = mapped_column(String(10), unique=True)
    nombre: Mapped[str] = mapped_column(String(120))
    direccion: Mapped[str] = mapped_column(String(250))
    ciudad: Mapped[str] = mapped_column(String(80))
    estado: Mapped[str] = mapped_column(String(80))
    cp: Mapped[str] = mapped_column(String(5))
    telefono: Mapped[str | None] = mapped_column(String(20))
    correo: Mapped[str | None] = mapped_column(String(120))
    horario: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    responsable_id: Mapped[int | None] = mapped_column(ForeignKey("usuario.id", use_alter=True, name="fk_sucursal_responsable", deferrable=True, initially="DEFERRED"))
    permite_recoger: Mapped[bool] = mapped_column(Boolean, default=True)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)

    zonas = relationship("SucursalZona", back_populates="sucursal", cascade="all, delete-orphan")
    responsable = relationship("Usuario", foreign_keys=[responsable_id])

    __table_args__ = (CheckConstraint("cp ~ '^[0-9]{5}$'", name="ck_sucursal_cp"),)


class SucursalZona(db.Model):
    """Prefijos de código postal que cada sucursal atiende con prioridad (para asignar el surtido)."""
    __tablename__ = "sucursal_zona"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    sucursal_id: Mapped[int] = mapped_column(ForeignKey("sucursal.id", ondelete="CASCADE"))
    cp_prefijo: Mapped[str] = mapped_column(String(5))
    prioridad: Mapped[int] = mapped_column(Integer, default=1)
    sucursal = relationship("Sucursal", back_populates="zonas")
    __table_args__ = (
        UniqueConstraint("sucursal_id", "cp_prefijo", name="uq_zona_sucursal_cp"),
        CheckConstraint("cp_prefijo ~ '^[0-9]{1,5}$'", name="ck_zona_cp"),
    )


class Permiso(db.Model):
    __tablename__ = "permiso"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    codigo: Mapped[str] = mapped_column(String(60), unique=True)
    descripcion: Mapped[str] = mapped_column(String(200))


class Rol(db.Model):
    __tablename__ = "rol"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    codigo: Mapped[str] = mapped_column(String(40), unique=True)
    nombre: Mapped[str] = mapped_column(String(80))
    descripcion: Mapped[str] = mapped_column(String(250), default="")
    alcance_global: Mapped[bool] = mapped_column(Boolean, default=False)
    permisos = relationship("Permiso", secondary=rol_permiso, lazy="selectin")


class Usuario(ConFechas, db.Model):
    __tablename__ = "usuario"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    correo: Mapped[str] = mapped_column(String(120))
    hash_password: Mapped[str] = mapped_column(String(100))
    nombre: Mapped[str] = mapped_column(String(120))
    rol_id: Mapped[int] = mapped_column(ForeignKey("rol.id"))
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    intentos_fallidos: Mapped[int] = mapped_column(Integer, default=0)
    bloqueado_hasta: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ultimo_acceso: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    rol = relationship("Rol", lazy="joined")
    sucursales = relationship("Sucursal", secondary=usuario_sucursal, lazy="selectin")

    __table_args__ = (Index("uq_usuario_correo", func.lower(correo), unique=True),)

    @property
    def alcance_global(self) -> bool:
        return bool(self.rol and self.rol.alcance_global)

    @property
    def codigos_permiso(self) -> set[str]:
        return {p.codigo for p in self.rol.permisos} if self.rol else set()

    @property
    def sucursal_ids(self) -> set[int]:
        return {s.id for s in self.sucursales}


class TokenRecuperacion(db.Model):
    __tablename__ = "token_recuperacion"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tipo_cuenta: Mapped[str] = mapped_column(String(10))
    cuenta_id: Mapped[int] = mapped_column(BigInteger)
    hash_token: Mapped[str] = mapped_column(String(64), unique=True)
    expira: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    usado: Mapped[bool] = mapped_column(Boolean, default=False)
    creado: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (CheckConstraint("tipo_cuenta in ('usuario','cliente')", name="ck_token_tipo"),)


class TokenRevocado(db.Model):
    """Lista de bloqueo de JWT (cierre de sesión)."""
    __tablename__ = "token_revocado"
    jti: Mapped[str] = mapped_column(String(64), primary_key=True)
    expira: Mapped[datetime] = mapped_column(DateTime(timezone=True))
