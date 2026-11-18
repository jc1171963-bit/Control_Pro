def registrar_blueprints(app):
    from . import (admin_catalogo, admin_colaboracion, admin_inventario, admin_operacion, admin_pedidos, admin_sistema,
                   admin_sucursales, archivos, auth, cuenta, push, tienda)
    for modulo in (auth, tienda, cuenta, archivos, admin_sistema, admin_catalogo, admin_inventario, admin_pedidos,
                   admin_operacion, admin_sucursales, admin_colaboracion, push):
        app.register_blueprint(modulo.bp)
