def registrar_blueprints(app):
    from . import (admin_catalogo, admin_inventario, admin_operacion, admin_pedidos, admin_sistema, archivos, auth,
                   cuenta, tienda)
    for modulo in (auth, tienda, cuenta, archivos, admin_sistema, admin_catalogo, admin_inventario, admin_pedidos,
                   admin_operacion):
        app.register_blueprint(modulo.bp)
