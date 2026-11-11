"""division y zona de sucursal

Revision ID: c3d8e5a1f6b2
Revises: 9b4f2c6d1e83
Create Date: 2026-11-11 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'c3d8e5a1f6b2'
down_revision = '9b4f2c6d1e83'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('cliente', schema=None) as batch_op:
        batch_op.add_column(sa.Column('division', sa.String(length=60), nullable=True))
        batch_op.add_column(sa.Column('zona', sa.String(length=60), nullable=True))
        batch_op.add_column(sa.Column('responsable_zona', sa.String(length=120), nullable=True))
        batch_op.create_index(batch_op.f('ix_cliente_zona'), ['zona'], unique=False)


def downgrade():
    with op.batch_alter_table('cliente', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_cliente_zona'))
        batch_op.drop_column('responsable_zona')
        batch_op.drop_column('zona')
        batch_op.drop_column('division')
