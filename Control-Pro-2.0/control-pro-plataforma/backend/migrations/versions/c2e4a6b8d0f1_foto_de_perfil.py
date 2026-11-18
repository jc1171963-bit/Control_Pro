"""foto de perfil de usuarios internos y cuentas de cliente

Revision ID: c2e4a6b8d0f1
Revises: b9d1f3a5c7e2
Create Date: 2026-11-18
"""
import sqlalchemy as sa
from alembic import op

revision = "c2e4a6b8d0f1"
down_revision = "b9d1f3a5c7e2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("usuario", sa.Column("foto_url", sa.String(300)))
    op.add_column("cliente", sa.Column("foto_url", sa.String(300)))


def downgrade():
    op.drop_column("cliente", "foto_url")
    op.drop_column("usuario", "foto_url")
