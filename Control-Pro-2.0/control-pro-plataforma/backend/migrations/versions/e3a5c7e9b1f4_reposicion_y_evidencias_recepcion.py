"""reposición de incidencias (paquete con su propia guía) y evidencias por artículo en la recepción

Revision ID: e3a5c7e9b1f4
Revises: d9f1b3c5e7a8
Create Date: 2026-11-24
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "e3a5c7e9b1f4"
down_revision = "d9f1b3c5e7a8"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("paquete", sa.Column("incidencia_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key("fk_paquete_incidencia", "paquete", "incidencia", ["incidencia_id"], ["id"])
    op.create_index("ix_paquete_incidencia_id", "paquete", ["incidencia_id"])
    op.add_column("recepcion_detalle", sa.Column("evidencias", postgresql.JSONB(), nullable=False, server_default="[]"))


def downgrade():
    op.drop_column("recepcion_detalle", "evidencias")
    op.drop_index("ix_paquete_incidencia_id", table_name="paquete")
    op.drop_constraint("fk_paquete_incidencia", "paquete", type_="foreignkey")
    op.drop_column("paquete", "incidencia_id")
