"""giro 360 de producto

Revision ID: 5c1e8a2f7b40
Revises: 093c1b6e8e29
Create Date: 2026-11-03 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '5c1e8a2f7b40'
down_revision = '093c1b6e8e29'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('producto_giro',
    sa.Column('id', sa.BigInteger(), nullable=False),
    sa.Column('producto_id', sa.BigInteger(), nullable=False),
    sa.Column('color', sa.String(length=40), nullable=True),
    sa.Column('frames', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.CheckConstraint('jsonb_array_length(frames) between 8 and 72', name='ck_giro_frames'),
    sa.ForeignKeyConstraint(['producto_id'], ['producto.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('producto_id', 'color', name='uq_giro_producto_color', postgresql_nulls_not_distinct=True)
    )
    with op.batch_alter_table('producto_giro', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_producto_giro_producto_id'), ['producto_id'], unique=False)


def downgrade():
    with op.batch_alter_table('producto_giro', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_producto_giro_producto_id'))

    op.drop_table('producto_giro')
