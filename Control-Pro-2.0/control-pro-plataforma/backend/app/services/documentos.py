"""Documentos PDF generados a partir de los datos guardados en el servidor."""
import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

AZUL = colors.HexColor("#142B4A")
GRIS = colors.HexColor("#E2E8F0")


def _m(v):
    return f"${v:,.2f}"


def pdf_pedido(p) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm,
                            bottomMargin=16 * mm, title=f"Pedido {p.folio}", author="Control Pro")
    est = getSampleStyleSheet()
    h = ParagraphStyle("h", parent=est["Heading1"], textColor=AZUL, fontSize=16, spaceAfter=2)
    peq = ParagraphStyle("p", parent=est["Normal"], fontSize=8.5, leading=11)
    norm = ParagraphStyle("n", parent=est["Normal"], fontSize=9.5, leading=13)
    cliente = p.cliente.razon_social or p.cliente.nombre
    entrega = (f"Recoger en {p.sucursal_recoger.nombre}" if p.modalidad == "recoger" else
               "{calle} {numero}, {colonia}, {ciudad}, {estado}, CP {cp}".format(**p.direccion_envio))
    elems = [
        Paragraph("Control Pro · Comprobante de pedido", h),
        Paragraph(f"Folio <b>{p.folio}</b> · Canal {p.canal} · Estado <b>{p.estado.replace('_', ' ')}</b> · "
                  f"Creado {p.creado:%d/%m/%Y %H:%M} UTC", norm),
        Spacer(1, 6),
        Paragraph(f"<b>Cliente:</b> {cliente} ({p.cliente.correo})", norm),
        Paragraph(f"<b>Entrega:</b> {entrega}", norm),
        Paragraph(f"<b>Método de pago:</b> {p.metodo_pago.replace('_', ' ')}", norm),
        Spacer(1, 8),
    ]
    filas = [["SKU", "Artículo", "Talla", "Empleado", "Cant.", "Precio", "Desc.", "Importe"]]
    for d in p.detalles:
        filas.append([d.sku, Paragraph(d.nombre, peq), d.talla, Paragraph(d.empleado.nombre if d.empleado else "—", peq),
                      str(d.cantidad), _m(d.precio_unitario), _m(d.descuento_unitario), _m(d.importe)])
    t = Table(filas, colWidths=[24 * mm, 46 * mm, 13 * mm, 30 * mm, 11 * mm, 19 * mm, 16 * mm, 21 * mm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), AZUL), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5), ("GRID", (0, 0), (-1, -1), 0.4, GRIS),
        ("ALIGN", (4, 1), (-1, -1), "RIGHT"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
    ]))
    elems += [t, Spacer(1, 8)]
    tot = Table([["Subtotal", _m(p.subtotal)], ["Descuento", "-" + _m(p.descuento)], ["Envío", _m(p.costo_envio)],
                 ["Total (IVA incluido)", _m(p.total)], ["IVA contenido", _m(p.impuestos)]],
                colWidths=[45 * mm, 30 * mm], hAlign="RIGHT")
    tot.setStyle(TableStyle([("ALIGN", (1, 0), (1, -1), "RIGHT"), ("FONTSIZE", (0, 0), (-1, -1), 9),
                             ("FONTNAME", (0, 3), (-1, 3), "Helvetica-Bold"), ("LINEABOVE", (0, 3), (-1, 3), 0.8, AZUL)]))
    elems += [tot, Spacer(1, 10)]
    if p.asignaciones:
        elems.append(Paragraph("<b>Surtido por sucursal</b>", norm))
        for a in p.asignaciones:
            elems.append(Paragraph(f"{a.sucursal.nombre}: {a.estado.replace('_', ' ')} · "
                                   f"{sum(x.cantidad for x in a.detalles)} unidad(es), "
                                   f"{sum(x.despachada for x in a.detalles)} despachada(s)", peq))
    elems += [Spacer(1, 12), Paragraph("Documento generado por Control Pro a partir de los registros del servidor. "
                                       "No es un comprobante fiscal (CFDI).", peq)]
    doc.build(elems)
    return buf.getvalue()
