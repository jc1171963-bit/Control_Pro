"""sesiones de inicio (S2.1): tabla sesion_auth

Base de la política de sesiones: cada inicio crea una sesión con su generación de refresh, actividad y expiración
absoluta. Solo agrega la tabla; ningún código la usa todavía y no modifica datos existentes.

Revision ID: c4e6a8b0d2f3
Revises: b2d4f6a8c0e1
Create Date: 2026-11-18
"""
import sqlalchemy as sa
from alembic import op

revision = "c4e6a8b0d2f3"
down_revision = "b2d4f6a8c0e1"
branch_labels = None
depends_on = None

MOTIVOS = ("cierre", "password", "restablecimiento", "admin", "desactivacion", "inactividad", "expiracion",
           "reutilizacion", "reemplazo")


def upgrade():
    op.create_table(
        "sesion_auth",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("tipo_cuenta", sa.String(10), nullable=False),
        sa.Column("cuenta_id", sa.BigInteger(), nullable=False),
        sa.Column("gen", sa.Integer(), nullable=False),
        sa.Column("gen_emitida_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("creada", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expira_absoluta", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actividad_en", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revocada_en", sa.DateTime(timezone=True)),
        sa.Column("motivo", sa.String(20)),
        sa.Column("ip", sa.String(45)),
        sa.Column("agente", sa.String(300)),
        sa.CheckConstraint("tipo_cuenta in ('usuario','cliente')", name="ck_sesion_tipo"),
        sa.CheckConstraint("gen >= 1", name="ck_sesion_gen"),
        sa.CheckConstraint("(revocada_en is null) = (motivo is null)", name="ck_sesion_revocacion"),
        sa.CheckConstraint("motivo is null or motivo in (" + ", ".join(f"'{m}'" for m in MOTIVOS) + ")",
                           name="ck_sesion_motivo"),
    )
    op.create_index("ix_sesion_cuenta_activa", "sesion_auth", ["tipo_cuenta", "cuenta_id"],
                    postgresql_where=sa.text("revocada_en is null"))


def downgrade():
    op.drop_index("ix_sesion_cuenta_activa", table_name="sesion_auth")
    op.drop_table("sesion_auth")
