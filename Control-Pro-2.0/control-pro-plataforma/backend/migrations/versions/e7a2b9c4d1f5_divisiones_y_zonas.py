"""divisiones y zonas como catalogo con responsables

Revision ID: e7a2b9c4d1f5
Revises: c3d8e5a1f6b2
Create Date: 2026-11-11 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'e7a2b9c4d1f5'
down_revision = 'c3d8e5a1f6b2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('division',
    sa.Column('id', sa.BigInteger(), nullable=False),
    sa.Column('nombre', sa.String(length=60), nullable=False),
    sa.Column('responsable', sa.String(length=120), nullable=True),
    sa.Column('correo', sa.String(length=120), nullable=True),
    sa.Column('telefono', sa.String(length=20), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('nombre')
    )
    op.create_table('zona',
    sa.Column('id', sa.BigInteger(), nullable=False),
    sa.Column('nombre', sa.String(length=60), nullable=False),
    sa.Column('division_id', sa.BigInteger(), nullable=True),
    sa.Column('gerente', sa.String(length=120), nullable=True),
    sa.Column('correo', sa.String(length=120), nullable=True),
    sa.Column('telefono', sa.String(length=20), nullable=True),
    sa.ForeignKeyConstraint(['division_id'], ['division.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('nombre')
    )
    with op.batch_alter_table('zona', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_zona_division_id'), ['division_id'], unique=False)
    with op.batch_alter_table('cliente', schema=None) as batch_op:
        batch_op.add_column(sa.Column('zona_id', sa.BigInteger(), nullable=True))
        batch_op.create_index(batch_op.f('ix_cliente_zona_id'), ['zona_id'], unique=False)
        batch_op.create_foreign_key('cliente_zona_id_fkey', 'zona', ['zona_id'], ['id'], ondelete='SET NULL')
    # Los textos de división y zona existentes pasan al catálogo.
    op.execute("insert into division (nombre) select distinct division from cliente where division is not null")
    op.execute("""
        insert into zona (nombre, division_id, gerente)
        select c.zona, max(d.id), max(c.responsable_zona) from cliente c left join division d on d.nombre = c.division
        where c.zona is not null group by c.zona
    """)
    op.execute("update cliente c set zona_id = z.id from zona z where z.nombre = c.zona")
    with op.batch_alter_table('cliente', schema=None) as batch_op:
        batch_op.drop_index('ix_cliente_zona')
        batch_op.drop_column('responsable_zona')
        batch_op.drop_column('zona')
        batch_op.drop_column('division')


def downgrade():
    with op.batch_alter_table('cliente', schema=None) as batch_op:
        batch_op.add_column(sa.Column('division', sa.String(length=60), nullable=True))
        batch_op.add_column(sa.Column('zona', sa.String(length=60), nullable=True))
        batch_op.add_column(sa.Column('responsable_zona', sa.String(length=120), nullable=True))
        batch_op.create_index('ix_cliente_zona', ['zona'], unique=False)
    op.execute("""
        update cliente c set zona = z.nombre, responsable_zona = z.gerente, division = d.nombre
        from zona z left join division d on d.id = z.division_id where z.id = c.zona_id
    """)
    with op.batch_alter_table('cliente', schema=None) as batch_op:
        batch_op.drop_constraint('cliente_zona_id_fkey', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_cliente_zona_id'))
        batch_op.drop_column('zona_id')
    with op.batch_alter_table('zona', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_zona_division_id'))
    op.drop_table('zona')
    op.drop_table('division')
