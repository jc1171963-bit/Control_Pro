"""unión de cabezas: observaciones (negociación, reserva al autorizar, incidencias) y chat con adjuntos (main)

c7e9b1d3f5a6 (observaciones) parte de f0a2c4e6b8d1 y a3c5e7f9b1d4 (chat) parte de e6a8c0e2b4d6 en paralelo. Esta revisión
solo las une para que haya una sola cabeza; no cambia el esquema ni los datos.

Revision ID: d9f1b3c5e7a8
Revises: c7e9b1d3f5a6, a3c5e7f9b1d4
Create Date: 2026-11-20
"""

revision = "d9f1b3c5e7a8"
down_revision = ("c7e9b1d3f5a6", "a3c5e7f9b1d4")
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
