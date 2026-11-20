"""adjuntos (fotos y documentos) en cada mensaje del seguimiento de una incidencia

Revision ID: c7e9b1d3f5a6
Revises: b5d7f9a1c3e4
Create Date: 2026-11-20
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "c7e9b1d3f5a6"
down_revision = "b5d7f9a1c3e4"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("incidencia_seguimiento", sa.Column("adjuntos", postgresql.JSONB(), nullable=False, server_default="[]"))


def downgrade():
    op.drop_column("incidencia_seguimiento", "adjuntos")
