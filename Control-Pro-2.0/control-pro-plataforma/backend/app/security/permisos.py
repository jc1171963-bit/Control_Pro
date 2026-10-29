"""Catálogo de permisos y roles predeterminados. Se sincroniza con `flask seed-roles`."""

PERMISOS = {
    "sucursal.ver": "Consultar sucursales",
    "sucursal.gestionar": "Crear y editar sucursales, zonas y horarios",
    "usuario.gestionar": "Administrar usuarios internos y sus sucursales",
    "catalogo.gestionar": "Administrar categorías, productos, variantes y habilitación",
    "promocion.gestionar": "Administrar promociones",
    "cliente.ver": "Consultar clientes",
    "inventario.ver": "Consultar existencias y movimientos",
    "inventario.entrada": "Registrar entradas de mercancía",
    "inventario.ajustar": "Registrar ajustes y mermas (autorización de encargado)",
    "transferencia.solicitar": "Solicitar transferencias",
    "transferencia.autorizar": "Autorizar o cancelar transferencias",
    "transferencia.operar": "Enviar y recibir transferencias",
    "pedido.ver": "Consultar pedidos",
    "pedido.aprobar": "Aprobar, rechazar o devolver pedidos corporativos",
    "pedido.cancelar": "Cancelar pedidos antes del despacho",
    "pedido.cerrar": "Cerrar pedidos conciliados",
    "surtido.operar": "Surtir, empacar, despachar y registrar eventos de envío",
    "pago.ver": "Consultar pagos",
    "pago.validar": "Confirmar o rechazar pagos",
    "pago.registrar_efectivo": "Registrar cobros en efectivo en sucursal",
    "reembolso.autorizar": "Autorizar y registrar reembolsos",
    "devolucion.gestionar": "Autorizar o rechazar devoluciones",
    "devolucion.recibir": "Recibir e inspeccionar devoluciones",
    "incidencia.gestionar": "Registrar y dar seguimiento a incidencias",
    "reporte.ver": "Consultar indicadores y exportar reportes",
    "auditoria.ver": "Consultar la bitácora de auditoría",
}

_LECTURA = ["sucursal.ver", "cliente.ver", "inventario.ver", "pedido.ver", "pago.ver", "reporte.ver", "auditoria.ver"]

ROLES = {
    "admin": {
        "nombre": "Administrador general", "global": True,
        "descripcion": "Configuración completa de la plataforma y acceso a todas las sucursales.",
        "permisos": list(PERMISOS),
    },
    "encargado": {
        "nombre": "Encargado de sucursal", "global": False,
        "descripcion": "Opera y autoriza movimientos de su sucursal.",
        "permisos": ["sucursal.ver", "cliente.ver", "inventario.ver", "inventario.entrada", "inventario.ajustar",
                     "transferencia.solicitar", "transferencia.autorizar", "transferencia.operar", "pedido.ver",
                     "pedido.cancelar", "surtido.operar", "pago.ver", "pago.registrar_efectivo",
                     "devolucion.recibir", "incidencia.gestionar", "reporte.ver", "promocion.gestionar"],
    },
    "inventario": {
        "nombre": "Personal de inventario", "global": False,
        "descripcion": "Entradas, surtido, empaque, despacho y recepción en su sucursal.",
        "permisos": ["sucursal.ver", "inventario.ver", "inventario.entrada", "transferencia.solicitar",
                     "transferencia.operar", "pedido.ver", "surtido.operar", "devolucion.recibir",
                     "incidencia.gestionar"],
    },
    "finanzas": {
        "nombre": "Finanzas y caja", "global": True,
        "descripcion": "Valida pagos, registra cobros y autoriza reembolsos.",
        "permisos": ["sucursal.ver", "cliente.ver", "pedido.ver", "pago.ver", "pago.validar",
                     "pago.registrar_efectivo", "reembolso.autorizar", "reporte.ver"],
    },
    "atencion": {
        "nombre": "Atención a clientes", "global": True,
        "descripcion": "Seguimiento de pedidos, devoluciones e incidencias.",
        "permisos": ["sucursal.ver", "cliente.ver", "inventario.ver", "pedido.ver", "pedido.cancelar",
                     "pedido.cerrar", "pago.ver", "devolucion.gestionar", "incidencia.gestionar"],
    },
    "aprobador": {
        "nombre": "Aprobador corporativo", "global": True,
        "descripcion": "Aprueba, rechaza o devuelve pedidos del canal corporativo.",
        "permisos": ["sucursal.ver", "cliente.ver", "inventario.ver", "pedido.ver", "pedido.aprobar"],
    },
    "auditor": {
        "nombre": "Supervisor / auditor", "global": True,
        "descripcion": "Consulta de solo lectura en todas las sucursales.",
        "permisos": _LECTURA,
    },
}


def sincronizar_roles(db):
    from ..models import Permiso, Rol
    existentes = {p.codigo: p for p in db.session.query(Permiso).all()}
    for codigo, desc in PERMISOS.items():
        if codigo not in existentes:
            existentes[codigo] = Permiso(codigo=codigo, descripcion=desc)
            db.session.add(existentes[codigo])
        else:
            existentes[codigo].descripcion = desc
    db.session.flush()
    for codigo, datos in ROLES.items():
        rol = db.session.query(Rol).filter_by(codigo=codigo).one_or_none() or Rol(codigo=codigo)
        rol.nombre, rol.descripcion, rol.alcance_global = datos["nombre"], datos["descripcion"], datos["global"]
        rol.permisos = [existentes[p] for p in datos["permisos"]]
        db.session.add(rol)
    db.session.commit()
