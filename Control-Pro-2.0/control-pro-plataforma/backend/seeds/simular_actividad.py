"""Actividad SIMULADA para demostraciones: solicitudes de sucursales a lo largo de varias semanas, con su historial
completo (enviada → aprobada → autorizada → surtida → enviada → entregada → cerrada) en fechas realistas.

Todo lo simulado lleva folio `SIM-…` y la nota «[Simulación]», no aparta inventario ni genera avisos, y se elimina por
completo con `flask --app wsgi simular-actividad --borrar`. Nunca usar en producción real.
"""
import math
import random
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import delete, select

from app.extensions import db
from app.models import Cliente, Direccion, HistorialEstado, Pedido, PedidoDetalle, Rol, Usuario, Variante

PREFIJO = "SIM-"
NOTA = "[Simulación] Actividad de demostración; se borra con simular-actividad --borrar."
# Recorrido de una solicitud completa y horas típicas entre pasos (mínimo, máximo).
PASOS = [("aprobado", None), ("confirmado", (2, 30)), ("en_preparacion", (4, 30)), ("enviado", (8, 48)),
         ("entregado", (24, 96)), ("cerrado", (24, 120))]


def borrar() -> int:
    ids = db.session.scalars(select(Pedido.id).where(Pedido.folio.like(f"{PREFIJO}%"))).all()
    if ids:
        db.session.execute(delete(HistorialEstado).where(HistorialEstado.entidad == "pedido", HistorialEstado.entidad_id.in_(ids)))
        db.session.execute(delete(Pedido).where(Pedido.id.in_(ids)))
        db.session.commit()
    return len(ids)


def _usuario(codigo: str):
    return db.session.scalars(select(Usuario.id).join(Rol, Rol.id == Usuario.rol_id).where(Rol.codigo == codigo)).first()


def simular(semanas: int = 12, solicitudes: int = 160, semilla: int = 2026) -> dict:
    borrar()
    rnd = random.Random(semilla)
    aprobador, distribuidora = _usuario("aprobador"), _usuario("admin")
    sucursales = db.session.scalars(select(Cliente).where(Cliente.tipo == "empresa", Cliente.activo.is_(True))).all()
    direcciones = {}
    for d in db.session.scalars(select(Direccion).where(Direccion.activo.is_(True)).order_by(Direccion.predeterminada.desc())):
        direcciones.setdefault(d.cliente_id, d)
    sucursales = [c for c in sucursales if c.id in direcciones]
    # Unas sucursales piden más que otras (actividad realista, no uniforme)
    pesos = [rnd.paretovariate(1.6) for _ in sucursales]
    variantes = db.session.scalars(select(Variante).where(Variante.activo.is_(True))).all()
    ahora = datetime.now(timezone.utc)
    inicio = ahora - timedelta(weeks=semanas)
    creadas = 0
    for n in range(solicitudes):
        # Más actividad en semanas recientes; el tiempo de aprobación mejora con el tiempo.
        avance = rnd.random() ** 0.8
        enviado = inicio + (ahora - inicio) * avance
        horas_aprob = max(0.4, rnd.lognormvariate(math.log(14 - 7 * avance), 0.7))
        cliente = rnd.choices(sucursales, weights=pesos)[0]
        d = direcciones[cliente.id]
        p = Pedido(folio=f"{PREFIJO}{n + 1:05d}", canal="corporativo", cliente_id=cliente.id, modalidad="envio",
                   metodo_pago="credito_corporativo", estado="en_revision", notas=NOTA, creado=enviado,
                   direccion_envio={"destinatario": d.destinatario, "telefono": d.telefono, "calle": d.calle, "numero": d.numero,
                                    "colonia": d.colonia, "ciudad": d.ciudad, "estado": d.estado, "cp": d.cp})
        subtotal = Decimal("0")
        for v in rnd.sample(variantes, rnd.randint(1, 4)):
            cant = rnd.choice([1, 1, 2, 2, 3, 4, 6])
            imp = v.precio_base * cant
            subtotal += imp
            p.detalles.append(PedidoDetalle(variante_id=v.id, sku=v.sku, nombre=v.producto.nombre, talla=v.talla, color=v.color,
                                            cantidad=cant, precio_unitario=v.precio_base, importe=imp))
        p.subtotal = p.total = subtotal
        db.session.add(p)
        db.session.flush()
        historial = [HistorialEstado(entidad="pedido", entidad_id=p.id, anterior="borrador", nuevo="en_revision",
                                     motivo="Solicitud enviada a revisión", cliente_id=cliente.id, creado=enviado)]
        momento, anterior = enviado, "en_revision"
        rechazada = rnd.random() < 0.06
        for estado, rango_h in PASOS:
            momento = momento + timedelta(hours=horas_aprob if estado == "aprobado" else rnd.uniform(*rango_h))
            if momento > ahora:
                break
            if estado == "aprobado" and rechazada:
                historial.append(HistorialEstado(entidad="pedido", entidad_id=p.id, anterior=anterior, nuevo="rechazado",
                                                 motivo="Fuera de la dotación autorizada", usuario_id=aprobador, creado=momento))
                anterior = "rechazado"
                break
            historial.append(HistorialEstado(entidad="pedido", entidad_id=p.id, anterior=anterior, nuevo=estado,
                                             usuario_id=aprobador if estado == "aprobado" else distribuidora, creado=momento))
            anterior = estado
        p.estado = anterior
        if anterior in ("confirmado", "en_preparacion", "enviado", "entregado", "cerrado"):
            p.confirmado_en = next(h.creado for h in historial if h.nuevo == "confirmado")
        db.session.add_all(historial)
        creadas += 1
    db.session.commit()
    return {"solicitudes": creadas, "sucursales": len({c.id for c in sucursales})}
