"""permisos de padrón de empleados y conversaciones entre aprobador, sucursales y distribuidora

Revision ID: f1a3c5e7b9d2
Revises: e7a2b9c4d1f5
Create Date: 2026-11-13
"""
import sqlalchemy as sa
from alembic import op

revision = "f1a3c5e7b9d2"
down_revision = "e7a2b9c4d1f5"
branch_labels = None
depends_on = None

FECHA = sa.DateTime(timezone=True)


def upgrade():
    op.create_table(
        "permiso_padron",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("cliente_id", sa.BigInteger(), sa.ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False),
        sa.Column("motivo", sa.String(300), nullable=False),
        sa.Column("estado", sa.String(15), nullable=False, server_default="pendiente"),
        sa.Column("respuesta", sa.String(300)),
        sa.Column("resuelto_por_id", sa.BigInteger(), sa.ForeignKey("usuario.id", ondelete="SET NULL")),
        sa.Column("resuelto_en", FECHA),
        sa.Column("vigente_hasta", FECHA),
        sa.Column("terminado_en", FECHA),
        sa.Column("creado", FECHA, server_default=sa.func.now(), nullable=False),
        sa.Column("actualizado", FECHA, server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("estado in ('pendiente','aprobado','rechazado','cancelado','terminado')", name="ck_permiso_padron_estado"),
    )
    op.create_index("ix_permiso_padron_cliente_id", "permiso_padron", ["cliente_id"])
    op.create_index("ix_permiso_padron_estado", "permiso_padron", ["estado"])

    op.create_table(
        "conversacion",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("tipo", sa.String(15), nullable=False),
        sa.Column("cliente_id", sa.BigInteger(), sa.ForeignKey("cliente.id", ondelete="CASCADE")),
        sa.Column("pedido_id", sa.BigInteger(), sa.ForeignKey("pedido.id", ondelete="CASCADE")),
        sa.Column("ultimo_mensaje_en", FECHA),
        sa.Column("leido_aprobador_en", FECHA),
        sa.Column("leido_contraparte_en", FECHA),
        sa.Column("creado", FECHA, server_default=sa.func.now(), nullable=False),
        sa.Column("actualizado", FECHA, server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("tipo in ('sucursal','distribuidora')", name="ck_conversacion_tipo"),
        sa.CheckConstraint("tipo <> 'sucursal' or cliente_id is not null", name="ck_conversacion_sucursal"),
        sa.UniqueConstraint("tipo", "cliente_id", "pedido_id", name="uq_conversacion", postgresql_nulls_not_distinct=True),
    )
    op.create_index("ix_conversacion_cliente_id", "conversacion", ["cliente_id"])
    op.create_index("ix_conversacion_pedido_id", "conversacion", ["pedido_id"])

    op.create_table(
        "mensaje",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("conversacion_id", sa.BigInteger(), sa.ForeignKey("conversacion.id", ondelete="CASCADE"), nullable=False),
        sa.Column("autor_usuario_id", sa.BigInteger(), sa.ForeignKey("usuario.id", ondelete="SET NULL")),
        sa.Column("autor_cliente_id", sa.BigInteger(), sa.ForeignKey("cliente.id", ondelete="SET NULL")),
        sa.Column("lado", sa.String(12), nullable=False),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column("creado", FECHA, server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("lado in ('aprobador','contraparte')", name="ck_mensaje_lado"),
        sa.CheckConstraint("char_length(texto) between 1 and 2000", name="ck_mensaje_texto"),
    )
    op.create_index("ix_mensaje_conversacion", "mensaje", ["conversacion_id", "id"])


def downgrade():
    op.drop_table("mensaje")
    op.drop_table("conversacion")
    op.drop_table("permiso_padron")
