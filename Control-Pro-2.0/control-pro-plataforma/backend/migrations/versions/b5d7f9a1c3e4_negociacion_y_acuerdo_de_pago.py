"""negociación de condiciones (propuestas versionadas) y acuerdo de pago de los pedidos corporativos

La comercializadora propone cambios sin tocar las condiciones vigentes; el Gerente de compras acepta la última versión.
El acuerdo de pago se versiona y «pago resuelto» (acuerdo definitivo) queda ligado a un acuerdo y a unas condiciones.
Los documentos de pago se guardan en el expediente sin que la sucursal los vea.

Revision ID: b5d7f9a1c3e4
Revises: a3c5e7f9b1d2
Create Date: 2026-11-20
"""
import sqlalchemy as sa
from alembic import op

from app.sql_extra import SQL_NEGOCIACION, TABLAS_NEGOCIACION

revision = "b5d7f9a1c3e4"
down_revision = "a3c5e7f9b1d2"
branch_labels = None
depends_on = None

DINERO = sa.Numeric(12, 2)
TIPOS = "'orden_compra','cotizacion','factura','comprobante','evidencia'"


def upgrade():
    op.create_table(
        "propuesta_pedido",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("pedido_id", sa.BigInteger(), sa.ForeignKey("pedido.id"), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("estado", sa.String(12), nullable=False),
        sa.Column("version_base_pedido", sa.Integer(), nullable=False),
        sa.Column("motivo_descarte", sa.String(300)),
        sa.Column("creado_por_usuario_id", sa.BigInteger(), sa.ForeignKey("usuario.id")),
        sa.Column("aceptada_por_usuario_id", sa.BigInteger(), sa.ForeignKey("usuario.id")),
        sa.Column("aceptada_en", sa.DateTime(timezone=True)),
        sa.Column("creado", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("actualizado", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("pedido_id", "numero", name="uq_propuesta_numero"),
        sa.CheckConstraint("estado in ('pendiente','aceptada','descartada')", name="ck_propuesta_estado"),
    )
    op.create_index("ix_propuesta_pedido_pedido_id", "propuesta_pedido", ["pedido_id"])
    op.create_index("uq_propuesta_pendiente", "propuesta_pedido", ["pedido_id"], unique=True,
                    postgresql_where=sa.text("estado = 'pendiente'"))
    op.create_table(
        "propuesta_version",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("propuesta_id", sa.BigInteger(), sa.ForeignKey("propuesta_pedido.id"), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("nota", sa.String(300), nullable=False),
        sa.Column("subtotal", DINERO, nullable=False),
        sa.Column("descuento", DINERO, nullable=False),
        sa.Column("total", DINERO, nullable=False),
        sa.Column("creado_por_usuario_id", sa.BigInteger(), sa.ForeignKey("usuario.id")),
        sa.Column("creado", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("propuesta_id", "numero", name="uq_propuesta_version"),
    )
    op.create_index("ix_propuesta_version_propuesta_id", "propuesta_version", ["propuesta_id"])
    op.create_table(
        "propuesta_partida",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("version_id", sa.BigInteger(), sa.ForeignKey("propuesta_version.id"), nullable=False),
        sa.Column("pedido_detalle_id", sa.BigInteger()),
        sa.Column("empleado_id", sa.BigInteger(), sa.ForeignKey("empleado_corporativo.id")),
        sa.Column("variante_id", sa.BigInteger(), sa.ForeignKey("variante.id"), nullable=False),
        sa.Column("sku", sa.String(40), nullable=False),
        sa.Column("nombre", sa.String(160), nullable=False),
        sa.Column("talla", sa.String(20), nullable=False),
        sa.Column("color", sa.String(40), nullable=False),
        sa.Column("empleado_nombre", sa.String(160)),
        sa.Column("cantidad", sa.Integer(), nullable=False),
        sa.Column("precio_unitario", DINERO, nullable=False),
        sa.Column("descuento_unitario", DINERO, nullable=False),
        sa.Column("importe", DINERO, nullable=False),
        sa.Column("precio_catalogo", DINERO, nullable=False),
        sa.Column("excepcion", sa.String(250)),
        sa.UniqueConstraint("version_id", "pedido_detalle_id", name="uq_propuesta_partida"),
        sa.CheckConstraint("cantidad > 0", name="ck_ppart_cantidad"),
        sa.CheckConstraint("precio_unitario >= 0 and descuento_unitario >= 0 and descuento_unitario <= precio_unitario",
                           name="ck_ppart_precio"),
    )
    op.create_index("ix_propuesta_partida_version_id", "propuesta_partida", ["version_id"])
    op.create_table(
        "acuerdo_pago",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("pedido_id", sa.BigInteger(), sa.ForeignKey("pedido.id"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("forma", sa.String(120), nullable=False),
        sa.Column("condiciones", sa.Text(), nullable=False),
        sa.Column("fecha_pago", sa.Date(), nullable=False),
        sa.Column("observaciones", sa.Text()),
        sa.Column("registrado_por_usuario_id", sa.BigInteger(), sa.ForeignKey("usuario.id")),
        sa.Column("creado", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("pedido_id", "version", name="uq_acuerdo_version"),
    )
    op.create_index("ix_acuerdo_pago_pedido_id", "acuerdo_pago", ["pedido_id"])
    op.add_column("pedido", sa.Column("version_condiciones", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("pedido", sa.Column("pago_resuelto_acuerdo_id", sa.BigInteger(),
                                      sa.ForeignKey("acuerdo_pago.id", name="fk_pedido_pago_resuelto_acuerdo")))
    op.add_column("pedido", sa.Column("pago_resuelto_condiciones", sa.Integer()))
    op.add_column("pedido", sa.Column("pago_resuelto_en", sa.DateTime(timezone=True)))
    op.add_column("pedido", sa.Column("pago_resuelto_por_usuario_id", sa.BigInteger(), sa.ForeignKey("usuario.id")))
    op.add_column("documento", sa.Column("visible_sucursal", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.drop_constraint("ck_documento_tipo", "documento", type_="check")
    op.create_check_constraint("ck_documento_tipo", "documento", f"tipo in ({TIPOS},'pago','otro')")
    for s in SQL_NEGOCIACION:
        op.execute(s)


def downgrade():
    for t in TABLAS_NEGOCIACION:
        op.execute(f"DROP TRIGGER IF EXISTS tr_{t}_inmutable ON {t};")
    op.execute("DELETE FROM documento WHERE tipo = 'pago'")  # el tipo deja de existir
    op.drop_constraint("ck_documento_tipo", "documento", type_="check")
    op.create_check_constraint("ck_documento_tipo", "documento", f"tipo in ({TIPOS},'otro')")
    op.drop_column("documento", "visible_sucursal")
    for c in ("pago_resuelto_por_usuario_id", "pago_resuelto_en", "pago_resuelto_condiciones", "pago_resuelto_acuerdo_id",
              "version_condiciones"):
        op.drop_column("pedido", c)
    op.drop_table("acuerdo_pago")
    op.drop_table("propuesta_partida")
    op.drop_table("propuesta_version")
    op.drop_table("propuesta_pedido")
