"""autorización de la distribuidora para pedidos corporativos: estado `aprobado`

El aprobador aprueba (`aprobado`) y solo la autorización de la distribuidora confirma el pedido y lo libera al surtido.
Regulariza los pedidos corporativos ya `confirmado` sin pago confirmado y sin surtido iniciado: vuelven a `aprobado`,
sin fecha de vencimiento, con su registro en el historial. Los que ya iniciaron surtido no se tocan.

Revision ID: a7c2e4f6b8d1
Revises: f1a3c5e7b9d2
Create Date: 2026-11-17
"""
from alembic import op

revision = "a7c2e4f6b8d1"
down_revision = "f1a3c5e7b9d2"
branch_labels = None
depends_on = None

ESTADOS = ("borrador", "en_revision", "devuelto", "rechazado", "pendiente_pago", "pago_en_revision", "confirmado",
           "en_preparacion", "parcialmente_enviado", "enviado", "parcialmente_entregado", "entregado", "cerrado",
           "cancelado", "expirado")
MOTIVO = "Regularización: requiere la autorización de la distribuidora antes de surtir"


def _ck(estados):
    return "estado in (" + ",".join(f"'{e}'" for e in estados) + ")"


def upgrade():
    op.drop_constraint("ck_pedido_estado", "pedido", type_="check")
    op.create_check_constraint("ck_pedido_estado", "pedido", _ck(ESTADOS + ("aprobado",)))
    op.execute(f"""
        with objetivo as (
            select p.id from pedido p
            where p.canal = 'corporativo' and p.estado = 'confirmado'
              and not exists (select 1 from pago g where g.pedido_id = p.id
                              and g.estado in ('confirmado', 'reembolsado_parcial', 'reembolsado'))
              and not exists (select 1 from asignacion_surtido a where a.pedido_id = p.id and a.estado <> 'pendiente')
        ), regularizados as (
            update pedido set estado = 'aprobado', reserva_expira = null
            where id in (select id from objetivo) returning id
        )
        insert into historial_estado (entidad, entidad_id, anterior, nuevo, motivo)
        select 'pedido', id, 'confirmado', 'aprobado', '{MOTIVO}' from regularizados
    """)


def downgrade():
    op.execute(f"""
        with revertidos as (
            update pedido set estado = 'confirmado' where estado = 'aprobado' returning id
        )
        insert into historial_estado (entidad, entidad_id, anterior, nuevo, motivo)
        select 'pedido', id, 'aprobado', 'confirmado', 'Reversión de la migración de autorización corporativa'
        from revertidos
    """)
    op.drop_constraint("ck_pedido_estado", "pedido", type_="check")
    op.create_check_constraint("ck_pedido_estado", "pedido", _ck(ESTADOS))
