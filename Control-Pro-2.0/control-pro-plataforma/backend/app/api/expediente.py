"""Expediente (documentos) de cada solicitud, para la sucursal dueña y para el personal que puede ver la solicitud."""
from flask import Blueprint, g, jsonify

from ..schemas import DocumentoSchema, cargar
from ..security.auth import requiere_cliente, requiere_usuario
from ..services import expediente_service as exp
from .util import cuerpo

bp = Blueprint("expediente", __name__)


def _pedido_admin(pedido_id):
    from .admin_pedidos import _pedido
    return _pedido(pedido_id)


def _pedido_cliente(pedido_id):
    from .cuenta import _mi_pedido
    return _mi_pedido(pedido_id)


@bp.get("/api/admin/pedidos/<int:pedido_id>/expediente")
@requiere_usuario("pedido.ver")
def ver_admin(pedido_id):
    return jsonify(exp.expediente(_pedido_admin(pedido_id), usuario=g.usuario))


@bp.post("/api/admin/pedidos/<int:pedido_id>/documentos")
@requiere_usuario("pedido.ver")
def subir_admin(pedido_id):
    p = _pedido_admin(pedido_id)
    d = exp.agregar(p, cargar(DocumentoSchema, cuerpo()), usuario=g.usuario)
    return jsonify(exp.documento_json(d, True, True)), 201


@bp.delete("/api/admin/pedidos/<int:pedido_id>/documentos/<int:documento_id>")
@requiere_usuario("pedido.ver")
def borrar_admin(pedido_id, documento_id):
    exp.eliminar(_pedido_admin(pedido_id), documento_id, usuario=g.usuario)
    return jsonify({"ok": True})


@bp.get("/api/cuenta/pedidos/<int:pedido_id>/expediente")
@requiere_cliente()
def ver_cliente(pedido_id):
    return jsonify(exp.expediente(_pedido_cliente(pedido_id), cliente=g.cliente))


@bp.get("/api/cuenta/pedidos/<int:pedido_id>/pdf")
@requiere_cliente()
def pdf_cliente(pedido_id):
    """Comprobante en PDF para la sucursal o persona dueña (sin importes en las solicitudes corporativas)."""
    import io

    from flask import send_file

    from ..services.documentos import pdf_pedido
    p = _pedido_cliente(pedido_id)
    datos = pdf_pedido(p, con_precios=p.canal != "corporativo")
    return send_file(io.BytesIO(datos), as_attachment=True, download_name=f"{p.folio}.pdf", mimetype="application/pdf")


@bp.post("/api/cuenta/pedidos/<int:pedido_id>/documentos")
@requiere_cliente()
def subir_cliente(pedido_id):
    p = _pedido_cliente(pedido_id)
    d = exp.agregar(p, cargar(DocumentoSchema, cuerpo()), cliente=g.cliente)
    return jsonify(exp.documento_json(d, False, True)), 201


@bp.delete("/api/cuenta/pedidos/<int:pedido_id>/documentos/<int:documento_id>")
@requiere_cliente()
def borrar_cliente(pedido_id, documento_id):
    exp.eliminar(_pedido_cliente(pedido_id), documento_id, cliente=g.cliente)
    return jsonify({"ok": True})
