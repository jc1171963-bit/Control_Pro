"""une las ramas de migración: autorización corporativa y fotos/video de producto

Las dos salen de f1a3c5e7b9d2 y son independientes (pedido vs. producto). Esta revisión no cambia el esquema:
solo deja una única cabeza para que `flask db upgrade` funcione.

Revision ID: b2d4f6a8c0e1
Revises: a7c2e4f6b8d1, a7c9e1f3b5d8
Create Date: 2026-11-18
"""

revision = "b2d4f6a8c0e1"
down_revision = ("a7c2e4f6b8d1", "a7c9e1f3b5d8")
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
