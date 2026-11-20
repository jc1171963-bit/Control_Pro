"""chat: notas de voz, fotos y documentos, y respuesta a un mensaje

Revision ID: a3c5e7f9b1d4
Revises: f2b4d6e8a0c3
Create Date: 2026-11-20
"""
import sqlalchemy as sa
from alembic import op

revision = "a3c5e7f9b1d4"
down_revision = "f2b4d6e8a0c3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("mensaje", sa.Column("tipo", sa.String(10), nullable=False, server_default="texto"))
    op.add_column("mensaje", sa.Column("adjunto_url", sa.String(300)))
    op.add_column("mensaje", sa.Column("adjunto_nombre", sa.String(160)))
    op.add_column("mensaje", sa.Column("adjunto_duracion", sa.Integer()))
    op.add_column("mensaje", sa.Column("responde_a_id", sa.BigInteger(), sa.ForeignKey("mensaje.id", ondelete="SET NULL")))
    op.drop_constraint("ck_mensaje_texto", "mensaje", type_="check")
    op.create_check_constraint("ck_mensaje_texto", "mensaje", "char_length(texto) <= 2000 and (char_length(texto) >= 1 or adjunto_url is not null)")
    op.create_check_constraint("ck_mensaje_tipo", "mensaje", "tipo in ('texto','imagen','audio','archivo')")


def downgrade():
    op.drop_constraint("ck_mensaje_tipo", "mensaje", type_="check")
    op.drop_constraint("ck_mensaje_texto", "mensaje", type_="check")
    op.execute("delete from mensaje where char_length(texto) = 0")
    op.create_check_constraint("ck_mensaje_texto", "mensaje", "char_length(texto) between 1 and 2000")
    for c in ("responde_a_id", "adjunto_duracion", "adjunto_nombre", "adjunto_url", "tipo"):
        op.drop_column("mensaje", c)
