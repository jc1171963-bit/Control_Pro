"""pendiente de producción por partida: la autorización aparta lo disponible y registra el resto

Al autorizar un pedido corporativo se reservan las existencias disponibles y lo que falta queda en
`pedido_detalle.cantidad_por_producir`. Nunca se reservan existencias inexistentes ni se registran mermas por ello.

Revision ID: a3c5e7f9b1d2
Revises: f0a2c4e6b8d1
Create Date: 2026-11-19
"""
import sqlalchemy as sa
from alembic import op

revision = "a3c5e7f9b1d2"
down_revision = "f0a2c4e6b8d1"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("pedido_detalle", sa.Column("cantidad_por_producir", sa.Integer(), nullable=False, server_default="0"))
    op.create_check_constraint(
        "ck_pdet_por_producir", "pedido_detalle",
        "cantidad_por_producir >= 0 and cantidad_por_producir + cantidad_cancelada + cantidad_entregada <= cantidad")


def downgrade():
    op.drop_constraint("ck_pdet_por_producir", "pedido_detalle", type_="check")
    op.drop_column("pedido_detalle", "cantidad_por_producir")
