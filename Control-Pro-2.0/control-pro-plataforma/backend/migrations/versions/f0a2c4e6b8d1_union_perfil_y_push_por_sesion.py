"""unión de cabezas: perfil/CNR/expediente (main) y suscripciones push por sesión (H1)

e6a8c0e2b4d6 (main) y e8b0c2d4f6a7 (H1) parten de c4e6a8b0d2f3 en paralelo. Esta revisión solo las une para que haya una
sola cabeza; no cambia el esquema ni los datos.

Revision ID: f0a2c4e6b8d1
Revises: e6a8c0e2b4d6, e8b0c2d4f6a7
Create Date: 2026-11-19
"""

revision = "f0a2c4e6b8d1"
down_revision = ("e6a8c0e2b4d6", "e8b0c2d4f6a7")
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
