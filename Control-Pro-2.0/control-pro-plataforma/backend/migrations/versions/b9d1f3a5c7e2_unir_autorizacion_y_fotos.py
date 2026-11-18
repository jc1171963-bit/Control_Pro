"""unir las ramas de migración: autorización corporativa y fotos/video de producto

Las dos partieron de f1a3c5e7b9d2 en ramas de trabajo distintas. Esta revisión no cambia el esquema: solo las une para
que `db upgrade` tenga un único final, sin importar cuál de las dos se aplicó primero en cada base.

Revision ID: b9d1f3a5c7e2
Revises: a7c2e4f6b8d1, a7c9e1f3b5d8
Create Date: 2026-11-18
"""

revision = "b9d1f3a5c7e2"
down_revision = ("a7c2e4f6b8d1", "a7c9e1f3b5d8")
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
