"""perfil de usuario, distintivo CNR, evidencias de incidencia, expediente por solicitud y configuración

Revision ID: e6a8c0e2b4d6
Revises: c4e6a8b0d2f3
Create Date: 2026-11-19
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "e6a8c0e2b4d6"
down_revision = "c4e6a8b0d2f3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("usuario", sa.Column("telefono", sa.String(20)))
    op.add_column("usuario", sa.Column("area", sa.String(80)))
    op.add_column("usuario", sa.Column("cargo", sa.String(80)))
    op.add_column("cliente", sa.Column("cnr", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("incidencia", sa.Column("evidencias", postgresql.JSONB(), nullable=False, server_default="[]"))
    op.create_table(
        "documento",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("pedido_id", sa.BigInteger(), sa.ForeignKey("pedido.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nombre", sa.String(160), nullable=False),
        sa.Column("tipo", sa.String(20), nullable=False, server_default="otro"),
        sa.Column("url", sa.String(300), nullable=False),
        sa.Column("subido_por_usuario", sa.BigInteger(), sa.ForeignKey("usuario.id", ondelete="SET NULL")),
        sa.Column("subido_por_cliente", sa.BigInteger(), sa.ForeignKey("cliente.id", ondelete="SET NULL")),
        sa.Column("creado", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("tipo in ('orden_compra','cotizacion','factura','comprobante','evidencia','otro')", name="ck_documento_tipo"),
    )
    op.create_index("ix_documento_pedido_id", "documento", ["pedido_id"])
    op.create_table(
        "configuracion",
        sa.Column("clave", sa.String(60), primary_key=True),
        sa.Column("valor", postgresql.JSONB()),
        sa.Column("actualizado", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    # La cuenta del aprobador muestra su área (antes fija en la interfaz).
    op.execute("""update usuario set area = 'Gerencia de Compras'
                  where area is null and rol_id in (select id from rol where codigo = 'aprobador')""")


def downgrade():
    op.drop_table("configuracion")
    op.drop_table("documento")
    op.drop_column("incidencia", "evidencias")
    op.drop_column("cliente", "cnr")
    op.drop_column("usuario", "cargo")
    op.drop_column("usuario", "area")
    op.drop_column("usuario", "telefono")
