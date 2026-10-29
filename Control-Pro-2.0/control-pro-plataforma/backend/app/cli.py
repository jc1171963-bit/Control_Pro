"""Comandos de administración: `flask --app wsgi <comando>`."""
import click
from sqlalchemy import text

from .extensions import db


def registrar_comandos(app):
    @app.cli.command("seed-roles")
    def seed_roles():
        """Crea o actualiza permisos y roles predeterminados."""
        from .security.permisos import sincronizar_roles
        sincronizar_roles(db)
        click.echo("Roles y permisos sincronizados.")

    @app.cli.command("crear-admin")
    @click.option("--correo", prompt=True)
    @click.option("--nombre", prompt=True)
    @click.password_option()
    def crear_admin(correo, nombre, password):
        """Crea el primer administrador general."""
        from .models import Rol, Usuario
        from .security.auth import hash_password, validar_fortaleza
        from .security.permisos import sincronizar_roles
        sincronizar_roles(db)
        validar_fortaleza(password)
        rol = db.session.query(Rol).filter_by(codigo="admin").one()
        db.session.add(Usuario(correo=correo.lower(), nombre=nombre, hash_password=hash_password(password), rol=rol))
        db.session.commit()
        click.echo(f"Administrador {correo} creado.")

    @app.cli.command("seed-demo")
    def seed_demo():
        """Carga datos de PRUEBA (sucursales, usuarios, catálogo, existencias, clientes)."""
        from seeds.demo import cargar_demo
        cargar_demo()

    @app.cli.command("expirar-reservas")
    def expirar():
        """Expira pedidos sin pago dentro del plazo. Programar cada 15 minutos (cron o systemd timer)."""
        from .services.pedido_service import expirar_reservas
        click.echo(f"Pedidos expirados: {expirar_reservas()}")

    @app.cli.command("conciliar-inventario")
    def conciliar():
        """Verifica que la suma del kardex coincida con la existencia física de cada variante y sucursal."""
        filas = db.session.execute(text("""
            select i.sucursal_id, i.variante_id, i.fisico, coalesce(sum(m.cantidad), 0) as kardex
            from inventario i left join movimiento_inventario m
              on m.sucursal_id = i.sucursal_id and m.variante_id = i.variante_id
            group by i.sucursal_id, i.variante_id, i.fisico
            having i.fisico <> coalesce(sum(m.cantidad), 0)""")).all()
        if filas:
            for f in filas:
                click.echo(f"Diferencia sucursal {f.sucursal_id} variante {f.variante_id}: físico {f.fisico}, kardex {f.kardex}")
            raise SystemExit(1)
        click.echo("Inventario conciliado: el kardex coincide con la existencia física.")
