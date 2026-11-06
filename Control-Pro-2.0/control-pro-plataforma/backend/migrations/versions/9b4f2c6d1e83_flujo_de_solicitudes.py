"""flujo de solicitudes: borrador, conformidad, recepción por artículo e historial de incidencias

Revision ID: 9b4f2c6d1e83
Revises: 5c1e8a2f7b40
Create Date: 2026-11-03 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

from app.sql_extra import SQL_SEGUIMIENTO

# revision identifiers, used by Alembic.
revision = '9b4f2c6d1e83'
down_revision = '5c1e8a2f7b40'
branch_labels = None
depends_on = None

ESTADOS_ANTES = ("en_revision", "devuelto", "rechazado", "pendiente_pago", "pago_en_revision", "confirmado",
                 "en_preparacion", "parcialmente_enviado", "enviado", "parcialmente_entregado", "entregado",
                 "cerrado", "cancelado", "expirado")


def _ck_pedido(estados):
    return "estado in (" + ",".join(f"'{e}'" for e in estados) + ")"


def upgrade():
    op.drop_constraint('ck_pedido_estado', 'pedido', type_='check')
    op.create_check_constraint('ck_pedido_estado', 'pedido', _ck_pedido(("borrador",) + ESTADOS_ANTES))

    with op.batch_alter_table('entrega_individual', schema=None) as batch_op:
        batch_op.add_column(sa.Column('registrado_por', sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column('conformidad_en', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('conformidad_comentario', sa.String(length=500), nullable=True))
    op.drop_constraint('ck_entrega_estado', 'entrega_individual', type_='check')
    op.create_check_constraint('ck_entrega_estado', 'entrega_individual',
                               "estado in ('pendiente','parcial','entregada','confirmada','con_incidencia')")

    op.create_table('recepcion_detalle',
    sa.Column('id', sa.BigInteger(), nullable=False),
    sa.Column('recepcion_id', sa.BigInteger(), nullable=False),
    sa.Column('pedido_detalle_id', sa.BigInteger(), nullable=False),
    sa.Column('esperada', sa.Integer(), nullable=False),
    sa.Column('recibida', sa.Integer(), nullable=False),
    sa.Column('problema', sa.String(length=12), nullable=True),
    sa.Column('nota', sa.String(length=300), nullable=True),
    sa.CheckConstraint('recibida >= 0 and recibida <= esperada', name='ck_recdet_cantidad'),
    sa.CheckConstraint("problema is null or problema in ('faltante','danado','diferencia')", name='ck_recdet_problema'),
    sa.ForeignKeyConstraint(['pedido_detalle_id'], ['pedido_detalle.id'], ),
    sa.ForeignKeyConstraint(['recepcion_id'], ['recepcion.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('recepcion_id', 'pedido_detalle_id', name='uq_recdet_partida')
    )
    with op.batch_alter_table('recepcion_detalle', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_recepcion_detalle_recepcion_id'), ['recepcion_id'], unique=False)

    with op.batch_alter_table('incidencia', schema=None) as batch_op:
        batch_op.add_column(sa.Column('empleado_id', sa.BigInteger(), nullable=True))
        batch_op.add_column(sa.Column('pedido_detalle_id', sa.BigInteger(), nullable=True))
        batch_op.create_foreign_key('incidencia_empleado_id_fkey', 'empleado_corporativo', ['empleado_id'], ['id'])
        batch_op.create_foreign_key('incidencia_pedido_detalle_id_fkey', 'pedido_detalle', ['pedido_detalle_id'], ['id'])

    op.create_table('incidencia_seguimiento',
    sa.Column('id', sa.BigInteger(), nullable=False),
    sa.Column('incidencia_id', sa.BigInteger(), nullable=False),
    sa.Column('estado_anterior', sa.String(length=15), nullable=True),
    sa.Column('estado_nuevo', sa.String(length=15), nullable=False),
    sa.Column('comentario', sa.Text(), nullable=True),
    sa.Column('responsable_id', sa.BigInteger(), nullable=True),
    sa.Column('usuario_id', sa.BigInteger(), nullable=True),
    sa.Column('cliente_id', sa.BigInteger(), nullable=True),
    sa.Column('creado', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['cliente_id'], ['cliente.id'], ),
    sa.ForeignKeyConstraint(['incidencia_id'], ['incidencia.id'], ),
    sa.ForeignKeyConstraint(['responsable_id'], ['usuario.id'], ),
    sa.ForeignKeyConstraint(['usuario_id'], ['usuario.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('incidencia_seguimiento', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_incidencia_seguimiento_incidencia_id'), ['incidencia_id'], unique=False)
    # Las incidencias existentes empiezan su historial con su registro original.
    op.execute("""
        insert into incidencia_seguimiento (incidencia_id, estado_anterior, estado_nuevo, comentario, usuario_id, cliente_id, creado)
        select id, null, estado, 'Incidencia registrada', creado_por_usuario, creado_por_cliente, creado from incidencia
    """)
    for sentencia in SQL_SEGUIMIENTO:
        op.execute(sentencia)


def downgrade():
    op.execute("DROP TRIGGER IF EXISTS tr_seguimiento_inmutable ON incidencia_seguimiento;")
    with op.batch_alter_table('incidencia_seguimiento', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_incidencia_seguimiento_incidencia_id'))
    op.drop_table('incidencia_seguimiento')

    with op.batch_alter_table('incidencia', schema=None) as batch_op:
        batch_op.drop_constraint('incidencia_pedido_detalle_id_fkey', type_='foreignkey')
        batch_op.drop_constraint('incidencia_empleado_id_fkey', type_='foreignkey')
        batch_op.drop_column('pedido_detalle_id')
        batch_op.drop_column('empleado_id')

    with op.batch_alter_table('recepcion_detalle', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_recepcion_detalle_recepcion_id'))
    op.drop_table('recepcion_detalle')

    op.execute("update entrega_individual set estado = 'entregada' where estado = 'confirmada'")
    op.drop_constraint('ck_entrega_estado', 'entrega_individual', type_='check')
    op.create_check_constraint('ck_entrega_estado', 'entrega_individual',
                               "estado in ('pendiente','parcial','entregada','con_incidencia')")
    with op.batch_alter_table('entrega_individual', schema=None) as batch_op:
        batch_op.drop_column('conformidad_comentario')
        batch_op.drop_column('conformidad_en')
        batch_op.drop_column('registrado_por')

    op.execute("update pedido set estado = 'cancelado' where estado = 'borrador'")
    op.drop_constraint('ck_pedido_estado', 'pedido', type_='check')
    op.create_check_constraint('ck_pedido_estado', 'pedido', _ck_pedido(ESTADOS_ANTES))
