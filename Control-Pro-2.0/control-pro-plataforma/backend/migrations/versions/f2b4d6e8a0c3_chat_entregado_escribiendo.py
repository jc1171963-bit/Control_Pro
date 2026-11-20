"""chat: marcas de entregado y "escribiendo…" por lado de la conversación

Revision ID: f2b4d6e8a0c3
Revises: e6a8c0e2b4d6
Create Date: 2026-11-19
"""
import sqlalchemy as sa
from alembic import op

revision = "f2b4d6e8a0c3"
down_revision = "e6a8c0e2b4d6"
branch_labels = None
depends_on = None

COLUMNAS = ("entregado_aprobador_en", "entregado_contraparte_en", "escribiendo_aprobador_hasta", "escribiendo_contraparte_hasta")


def upgrade():
    for c in COLUMNAS:
        op.add_column("conversacion", sa.Column(c, sa.DateTime(timezone=True)))
    # Lo ya leído cuenta como entregado.
    op.execute("update conversacion set entregado_aprobador_en = leido_aprobador_en, entregado_contraparte_en = leido_contraparte_en")


def downgrade():
    for c in COLUMNAS:
        op.drop_column("conversacion", c)
