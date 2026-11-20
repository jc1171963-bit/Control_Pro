"""suscripciones push por sesión (H1.1): columna sid en push_suscripcion

Cada suscripción podrá ligarse a la sesión (sesion_auth) que la registró. Solo agrega la columna, su FK y su índice;
no modifica datos: las suscripciones existentes quedan con sid NULL.

Revision ID: e8b0c2d4f6a7
Revises: c4e6a8b0d2f3
Create Date: 2026-11-18
"""
import sqlalchemy as sa
from alembic import op

revision = "e8b0c2d4f6a7"
down_revision = "c4e6a8b0d2f3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("push_suscripcion", sa.Column("sid", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_push_suscripcion_sid", "push_suscripcion", "sesion_auth", ["sid"], ["id"],
                          ondelete="CASCADE")
    op.create_index("ix_push_suscripcion_sid", "push_suscripcion", ["sid"])


def downgrade():
    op.drop_index("ix_push_suscripcion_sid", table_name="push_suscripcion")
    op.drop_constraint("fk_push_suscripcion_sid", "push_suscripcion", type_="foreignkey")
    op.drop_column("push_suscripcion", "sid")
