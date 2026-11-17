"""fotos con crédito y video por producto

Revision ID: a7c9e1f3b5d8
Revises: f1a3c5e7b9d2
Create Date: 2026-11-17
"""
import sqlalchemy as sa
from alembic import op

revision = "a7c9e1f3b5d8"
down_revision = "f1a3c5e7b9d2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("producto", sa.Column("video_url", sa.String(300)))
    op.add_column("producto", sa.Column("video_credito", sa.String(200)))
    op.add_column("producto_imagen", sa.Column("credito", sa.String(200)))


def downgrade():
    op.drop_column("producto_imagen", "credito")
    op.drop_column("producto", "video_credito")
    op.drop_column("producto", "video_url")
