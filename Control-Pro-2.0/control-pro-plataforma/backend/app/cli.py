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

    @app.cli.command("cargar-sucursales")
    @click.option("--password", default="ControlPro2026", show_default=True, help="Contraseña inicial de todas las sucursales.")
    def cargar_sucursales(password):
        """Da de alta las sucursales (cuentas empresa) de seeds/sucursales_cliente.py. Se puede repetir sin duplicar."""
        from seeds.cargar_sucursales import cargar
        r = cargar(password)
        click.echo(f"Divisiones: {r['divisiones']}. Zonas: {r['zonas']}. Sucursales creadas: {r['creadas']}, ya existían: "
                   f"{r['existentes']}. Direcciones reales aplicadas: {r['direcciones_reales']}.")

    @app.cli.command("homologar-accesos-sucursales")
    @click.option("--password", default="ControlPro2026", show_default=True, help="Contraseña para todas las sucursales.")
    def homologar_accesos(password):
        """Pone a TODAS las sucursales un correo con su nombre (@sucursal.controlpro.mx) y la misma contraseña."""
        from seeds.cargar_sucursales import homologar_accesos as homologar
        r = homologar(password)
        click.echo(f"Sucursales: {r['sucursales']}. Correos cambiados: {len(r['correos_cambiados'])}.")
        for antes, despues in r["correos_cambiados"]:
            click.echo(f"  {antes} -> {despues}")

    @app.cli.command("simular-actividad")
    @click.option("--semanas", default=12, show_default=True)
    @click.option("--solicitudes", default=160, show_default=True)
    @click.option("--borrar", is_flag=True, help="Elimina toda la actividad simulada (folios SIM-).")
    def simular_actividad(semanas, solicitudes, borrar):
        """Solicitudes SIMULADAS (folio SIM-) con historial realista, para demostrar el tablero. Solo demostraciones."""
        from seeds.simular_actividad import borrar as borrar_sim, simular
        if borrar:
            click.echo(f"Solicitudes simuladas eliminadas: {borrar_sim()}.")
            return
        r = simular(semanas, solicitudes)
        click.echo(f"Solicitudes simuladas: {r['solicitudes']} en {r['sucursales']} sucursales posibles.")

    @app.cli.command("cargar-fotos")
    def cargar_fotos():
        """Asigna a cada producto sus fotografías y video ilustrativos de stock (seeds/fotos_stock). Se puede repetir."""
        from seeds.cargar_fotos import cargar
        r = cargar()
        click.echo(f"Productos con fotos: {r['productos']}. Fotos: {r['fotos']}. Videos: {r['videos']}."
                   + (f" SKU sin producto: {', '.join(r['sin_producto'])}." if r["sin_producto"] else ""))

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

    # ---------------------------------------------------------------- modo presentación
    def _zona():
        from zoneinfo import ZoneInfo
        return ZoneInfo(app.config.get("ZONA_HORARIA", "America/Mexico_City"))

    def _leer_inicio(inicio):
        from datetime import datetime
        return datetime.strptime(inicio, "%Y-%m-%d %H:%M").replace(tzinfo=_zona()) if inicio else None

    def _vigencia(c) -> str:
        from datetime import datetime
        local = lambda iso: datetime.fromisoformat(iso).astimezone(_zona()).strftime("%d/%m/%Y %H:%M")  # noqa: E731
        return (f"válida del {local(c['desde'])} al {local(c['hasta'])} ({_zona().key})"
                f"{'  (solo consulta)' if c.get('solo_lectura') else ''}")

    @app.cli.command("presentacion-crear")
    @click.option("--nombre", required=True, help="Nombre de la persona (aparece en la marca de agua).")
    @click.option("--correo", required=True, help="Correo con el que entrará (aparece en la marca de agua).")
    @click.option("--inicio", default=None, help="Inicio en hora local, AAAA-MM-DD HH:MM (por omisión: ahora).")
    @click.option("--horas", default=2.0, type=float, help="Duración del acceso en horas (por omisión 2).")
    @click.option("--empresa", default="LURIMA", help="Dueño del sistema que aparece en la marca de agua.")
    @click.option("--solo-lectura", is_flag=True, help="Puede recorrer todo, pero no hacer cambios.")
    def presentacion_crear(nombre, correo, inicio, horas, empresa, solo_lectura):
        """Crea la cuenta temporal de aprobador para una presentación y muestra su contraseña (una sola vez)."""
        from .errors import AppError
        from .models import ahora
        from .services import presentacion_service as pres
        try:
            u, password = pres.crear(nombre, correo, _leer_inicio(inicio) or ahora(), horas, empresa, solo_lectura)
        except AppError as e:
            raise click.ClickException(e.mensaje)
        click.echo(f"Cuenta de presentación lista para {u.nombre}.")
        click.echo(f"  Entra por: /entrar   Correo: {u.correo}   Contraseña: {password}")
        click.echo(f"  {_vigencia(pres.config())}")

    @app.cli.command("presentacion-ajustar")
    @click.option("--inicio", default=None, help="Nuevo inicio en hora local, AAAA-MM-DD HH:MM.")
    @click.option("--horas", default=None, type=float, help="Nueva duración total en horas, contada desde el inicio.")
    @click.option("--nombre", default=None, help="Nuevo nombre para la marca de agua.")
    @click.option("--solo-lectura/--puede-modificar", default=None, help="Activa o quita «solo consulta».")
    def presentacion_ajustar(inicio, horas, nombre, solo_lectura):
        """Cambia horario, nombre o «solo consulta» de la presentación SIN cambiar la contraseña."""
        from .errors import AppError
        from .services import presentacion_service as pres
        try:
            c = pres.ajustar(_leer_inicio(inicio), horas, nombre, solo_lectura)
        except AppError as e:
            raise click.ClickException(e.mensaje)
        click.echo(f"Presentación de {c['nombre']} ajustada: {_vigencia(c)}")

    @app.cli.command("presentacion-prueba")
    @click.option("--horas", default=3.0, type=float, help="Duración de la ventana de pruebas desde ahora (por omisión 3).")
    @click.option("--terminar", is_flag=True, help="Termina ya la ventana de pruebas.")
    def presentacion_prueba(horas, terminar):
        """Abre (o termina) una ventana de pruebas desde ahora, SIN tocar el horario acordado ni la contraseña."""
        from .errors import AppError
        from .services import presentacion_service as pres
        try:
            c = pres.ventana_de_prueba(None if terminar else horas)
        except AppError as e:
            raise click.ClickException(e.mensaje)
        if c.get("prueba"):
            click.echo(f"Ventana de pruebas abierta: {_vigencia({**c['prueba'], 'solo_lectura': c.get('solo_lectura')})}")
        else:
            click.echo("Ventana de pruebas terminada.")
        click.echo(f"Horario acordado (sin cambios): {_vigencia(c)}")

    @app.cli.command("presentacion-cerrar")
    def presentacion_cerrar():
        """Termina la presentación ahora: desactiva la cuenta y cierra su sesión en todos los dispositivos."""
        from .services import presentacion_service as pres
        u = pres.cerrar()
        click.echo(f"Presentación cerrada ({u.correo})." if u else "No hay presentación configurada.")

    @app.cli.command("presentacion-bitacora")
    def presentacion_bitacora():
        """Muestra lo que vio e hizo la cuenta de presentación (lo más reciente primero)."""
        from .services import presentacion_service as pres
        for r in pres.bitacora():
            click.echo(f"{r['fecha']}  {r['accion']:<28} {r['detalle'] or ''}")
