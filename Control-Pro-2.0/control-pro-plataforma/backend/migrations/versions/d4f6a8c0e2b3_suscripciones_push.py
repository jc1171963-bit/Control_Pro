"""suscripciones de notificaciones push por dispositivo

Revision ID: d4f6a8c0e2b3
Revises: c2e4a6b8d0f1
Create Date: 2026-11-18
"""
import sqlalchemy as sa
from alembic import op

revision = "d4f6a8c0e2b3"
down_revision = "c2e4a6b8d0f1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "push_suscripcion",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("usuario_id", sa.BigInteger(), sa.ForeignKey("usuario.id", ondelete="CASCADE")),
        sa.Column("cliente_id", sa.BigInteger(), sa.ForeignKey("cliente.id", ondelete="CASCADE")),
        sa.Column("endpoint", sa.Text(), nullable=False, unique=True),
        sa.Column("p256dh", sa.String(200), nullable=False),
        sa.Column("auth", sa.String(100), nullable=False),
        sa.Column("agente", sa.String(200)),
        sa.Column("creado", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("num_nonnulls(usuario_id, cliente_id) = 1", name="ck_push_dueno"),
    )
    op.create_index("ix_push_suscripcion_usuario_id", "push_suscripcion", ["usuario_id"])
    op.create_index("ix_push_suscripcion_cliente_id", "push_suscripcion", ["cliente_id"])


def downgrade():
    op.drop_table("push_suscripcion")
