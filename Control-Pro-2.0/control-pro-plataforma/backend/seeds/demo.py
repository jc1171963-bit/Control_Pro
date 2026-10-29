"""Datos de PRUEBA para validar el funcionamiento. No usar en producción.

Crea las 3 sucursales, usuarios por rol, catálogo con variantes, existencias iniciales (como movimientos de
entrada, para que el kardex cuadre), promociones, un cliente persona y una cuenta corporativa con empleados.
"""
import os
from datetime import timedelta
from decimal import Decimal

from flask import current_app
from sqlalchemy import select

from app.extensions import db
from app.models import (Categoria, Cliente, Direccion, EmpleadoCorporativo, Producto, ProductoImagen, ProductoPuesto,
                        Promocion, Rol, Sucursal, SucursalZona, Usuario, Variante, ahora, Carrito)
from app.security.auth import hash_password
from app.security.permisos import sincronizar_roles
from app.services import inventario_service as inv
from .imagenes import svg_producto

PASSWORD_DEMO = "ControlPro2026"

SUCURSALES = [
    {"codigo": "TOL", "nombre": "Sucursal Toluca", "direccion": "Av. Independencia 120, Centro", "ciudad": "Toluca",
     "estado": "Estado de México", "cp": "50000", "telefono": "722 214 0000", "correo": "toluca@controlpro.mx",
     "zonas": [("50", 1), ("51", 1), ("52", 1), ("0", 2), ("1", 2)]},
    {"codigo": "QRO", "nombre": "Sucursal Querétaro", "direccion": "Blvd. Bernardo Quintana 400", "ciudad": "Querétaro",
     "estado": "Querétaro", "cp": "76000", "telefono": "442 215 0000", "correo": "queretaro@controlpro.mx",
     "zonas": [("76", 1), ("37", 1), ("36", 2), ("78", 2)]},
    {"codigo": "PUE", "nombre": "Sucursal Puebla", "direccion": "Av. Juárez 85, Centro", "ciudad": "Puebla",
     "estado": "Puebla", "cp": "72000", "telefono": "222 232 0000", "correo": "puebla@controlpro.mx",
     "zonas": [("72", 1), ("73", 1), ("74", 1), ("90", 1), ("0", 3), ("1", 3)]},
]
HORARIO = {"lunes-viernes": "09:00-19:00", "sabado": "09:00-14:00", "domingo": "cerrado"}

CATEGORIAS = [("Batas", "batas"), ("Camisas y polos", "camisas-polos"), ("Pantalones", "pantalones"),
              ("Protección", "proteccion"), ("Calzado", "calzado"), ("Accesorios", "accesorios")]

TALLAS = ["CH", "M", "G", "XG"]
CALZADO = ["23", "24", "25", "26", "27", "28", "29"]
PRODUCTOS = [
    # sku, nombre, categoria, tipo_imagen, precio, colores, tallas, puestos, destacado, descripcion, material
    ("BAT-001", "Bata clínica clásica", "batas", "bata", "420", [("Blanco", "#F8FAFC")], ["CH", "M", "G", "XG"],
     ["Enfermería", "Administración"], True, "Bata de manga larga con tres bolsas y cierre de botones a presión.",
     "65% poliéster, 35% algodón"),
    ("BAT-002", "Bata de laboratorio antifluidos", "batas", "bata", "510", [("Blanco", "#F8FAFC"), ("Azul cielo", "#BAE6FD")],
     TALLAS, ["Enfermería"], True, "Tela con acabado repelente a fluidos, puños elásticos y cuello mao.", "100% poliéster técnico"),
    ("CAM-001", "Camisa de trabajo manga larga", "camisas-polos", "camisa", "280", [("Azul marino", "#1E3A5F"), ("Gris", "#64748B")],
     ["CH", "M", "G", "XG", "XXG"], ["Mantenimiento", "Seguridad", "Almacén"], True,
     "Camisa de gabardina con doble bolsa de parche y costuras reforzadas.", "Gabardina 100% algodón"),
    ("POL-001", "Polo corporativa piqué", "camisas-polos", "camisa", "250", [("Azul marino", "#1E3A5F"), ("Blanco", "#F8FAFC"), ("Turquesa", "#0F9F94")],
     TALLAS, ["Administración", "Intendencia"], True, "Polo de tejido piqué transpirable con cuello tejido y tres botones.",
     "50% algodón, 50% poliéster"),
    ("FIL-001", "Filipina quirúrgica", "camisas-polos", "camisa", "330", [("Azul rey", "#1D4ED8"), ("Verde quirúrgico", "#0E7C66")],
     TALLAS, ["Enfermería"], False, "Filipina cuello V con bolsa al pecho, tela antibacterial de secado rápido.", "Microfibra antibacterial"),
    ("PAN-001", "Pantalón de trabajo cargo", "pantalones", "pantalon", "320", [("Azul marino", "#1E3A5F"), ("Caqui", "#A68A5B")],
     ["28", "30", "32", "34", "36", "38"], ["Mantenimiento", "Seguridad", "Almacén", "Intendencia"], True,
     "Pantalón cargo con seis bolsas, rodillas reforzadas y pretina con elástico lateral.", "Gabardina 100% algodón"),
    ("PAN-002", "Pantalón quirúrgico", "pantalones", "pantalon", "290", [("Azul rey", "#1D4ED8"), ("Verde quirúrgico", "#0E7C66")],
     TALLAS, ["Enfermería"], False, "Pantalón de jareta con cintura ajustable y bolsas laterales.", "Microfibra antibacterial"),
    ("CHA-001", "Chaleco de alta visibilidad", "proteccion", "chaleco", "390", [("Amarillo neón", "#E7F225"), ("Naranja", "#F97316")],
     ["M", "G", "XG"], ["Seguridad", "Mantenimiento", "Almacén"], True, "Chaleco con dos franjas reflejantes y cierre frontal.",
     "Malla de poliéster"),
    ("BOT-001", "Botas de seguridad dieléctricas", "calzado", "calzado", "790", [("Negro", "#111827")], CALZADO,
     ["Seguridad", "Mantenimiento", "Almacén"], True, "Casco de policarbonato, suela antiderrapante y protección dieléctrica.",
     "Piel flor entera"),
    ("ZAP-001", "Zapato clínico antiderrapante", "calzado", "calzado", "640", [("Blanco", "#F8FAFC"), ("Negro", "#111827")],
     ["22", "23", "24", "25", "26", "27", "28"], ["Enfermería"], False, "Zapato ligero con plantilla acolchada y suela antiderrapante.",
     "Sintético lavable"),
    ("GOR-001", "Gorra de trabajo", "accesorios", "gorra", "120", [("Azul marino", "#1E3A5F"), ("Gris", "#64748B")], ["Unitalla"],
     ["Mantenimiento", "Seguridad", "Intendencia"], False, "Gorra de gabardina con ajuste trasero de velcro.", "Gabardina"),
    ("MAN-001", "Mandil de intendencia", "accesorios", "bata", "180", [("Gris", "#64748B"), ("Azul marino", "#1E3A5F")], ["Unitalla"],
     ["Intendencia"], False, "Mandil con peto, dos bolsas frontales y cintas ajustables.", "Poliéster resistente a manchas"),
]

EMPLEADOS = [("1001", "Juan Pérez", "Administración"), ("1002", "Rosario Ramírez", "Enfermería"),
             ("1003", "Carlos Mendoza", "Mantenimiento"), ("1004", "Ana López", "Intendencia"),
             ("1005", "Luis Hernández", "Seguridad"), ("1006", "María Torres", "Enfermería"),
             ("2001", "Pedro García", "Almacén"), ("2002", "Fernanda Ruiz", "Administración")]


def _sku(sku_base, color, talla):
    c = "".join(w[0] for w in color.upper().split())[:3]
    return f"{sku_base}-{c}-{talla.upper()}"


def cargar_demo(con_existencias: bool = True):
    if db.session.scalars(select(Sucursal)).first():
        print("La base ya tiene datos; no se cargó la demostración.")
        return
    sincronizar_roles(db)
    sucs = {}
    for s in SUCURSALES:
        suc = Sucursal(**{k: v for k, v in s.items() if k != "zonas"}, horario=HORARIO, permite_recoger=True)
        suc.zonas = [SucursalZona(cp_prefijo=p, prioridad=pr) for p, pr in s["zonas"]]
        db.session.add(suc)
        sucs[s["codigo"]] = suc
    db.session.flush()

    roles = {r.codigo: r for r in db.session.scalars(select(Rol))}
    pw = hash_password(PASSWORD_DEMO)
    usuarios = [("admin@controlpro.mx", "Administración General", "admin", []),
                ("finanzas@controlpro.mx", "Laura Finanzas", "finanzas", []),
                ("atencion@controlpro.mx", "Mario Atención", "atencion", []),
                ("aprobador@controlpro.mx", "Gerencia de Ventas", "aprobador", []),
                ("auditor@controlpro.mx", "Supervisión y Auditoría", "auditor", [])]
    for cod, s in sucs.items():
        usuarios.append((f"encargado.{cod.lower()}@controlpro.mx", f"Encargado {s.ciudad}", "encargado", [s]))
        usuarios.append((f"almacen.{cod.lower()}@controlpro.mx", f"Almacén {s.ciudad}", "inventario", [s]))
    for correo, nombre, rol, ss in usuarios:
        db.session.add(Usuario(correo=correo, nombre=nombre, hash_password=pw, rol=roles[rol], sucursales=ss))
    db.session.flush()
    for cod, s in sucs.items():
        s.responsable_id = db.session.scalars(select(Usuario.id).where(Usuario.correo == f"encargado.{cod.lower()}@controlpro.mx")).one()

    cats = {}
    for i, (nombre, slug) in enumerate(CATEGORIAS):
        cats[slug] = Categoria(nombre=nombre, slug=slug, orden=i)
        db.session.add(cats[slug])
    db.session.flush()

    carpeta = os.path.join(current_app.config["UPLOAD_DIR"], "publicos")
    os.makedirs(carpeta, exist_ok=True)
    productos = []
    for (sku, nombre, cat, tipo, precio, colores, tallas, puestos, dest, desc, material) in PRODUCTOS:
        slug = nombre.lower()
        for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"), ("ñ", "n")):
            slug = slug.replace(a, b)
        slug = "-".join(slug.split())
        p = Producto(sku_base=sku, nombre=nombre, slug=slug, descripcion=desc, material=material,
                     cuidados="Lavar a máquina en agua fría; no usar cloro.", categoria_id=cats[cat].id, destacado=dest)
        for i, (color, hexc) in enumerate(colores):
            archivo = f"{slug}-{i}.svg"
            with open(os.path.join(carpeta, archivo), "w", encoding="utf-8") as fh:
                fh.write(svg_producto(tipo, hexc, f"{nombre} {color}"))
            p.imagenes.append(ProductoImagen(url=f"/api/archivos/publicos/{archivo}", orden=i, alt=f"{nombre} color {color}"))
            for t in tallas:
                p.variantes.append(Variante(sku=_sku(sku, color, t), talla=t, color=color, color_hex=hexc,
                                            precio_base=Decimal(precio)))
        p.puestos = [ProductoPuesto(puesto=x) for x in puestos]
        db.session.add(p)
        productos.append(p)
    db.session.commit()

    if con_existencias:
        semilla = 7
        for p in productos:
            for v in p.variantes:
                for cod, s in sucs.items():
                    semilla = (semilla * 1103515245 + 12345) % 2147483648
                    cant = 3 + semilla % 22
                    if cod == "PUE" and p.sku_base in {"BAT-002", "ZAP-001"}:
                        cant = semilla % 3  # algunas existencias bajas para probar alertas
                    if cant:
                        inv.registrar_entrada(s.id, v.id, cant, "Inventario inicial de demostración",
                                              f"seed-{s.codigo}-{v.sku}")

    por_sku = {p.sku_base: p for p in productos}
    db.session.add(Promocion(nombre="Semana del polo corporativo", tipo="porcentaje", valor=Decimal("15"),
                             inicio=ahora() - timedelta(days=1), fin=ahora() + timedelta(days=30),
                             productos=[por_sku["POL-001"]]))
    db.session.add(Promocion(nombre="Botas: $100 menos al recoger en Puebla", tipo="monto", valor=Decimal("100"),
                             inicio=ahora() - timedelta(days=1), fin=ahora() + timedelta(days=30),
                             sucursal_id=sucs["PUE"].id, productos=[por_sku["BOT-001"]]))

    persona = Cliente(correo="cliente@demo.mx", nombre="Andrea Morales", telefono="722 100 2000", tipo="persona",
                      hash_password=pw)
    empresa = Cliente(correo="empresa@demo.mx", nombre="Compras Clínica San Rafael", telefono="442 300 4000",
                      tipo="empresa", razon_social="Clínica San Rafael S.A. de C.V.", rfc="CSR010101AB1", hash_password=pw)
    db.session.add_all([persona, empresa])
    db.session.flush()
    db.session.add_all([Carrito(cliente_id=persona.id), Carrito(cliente_id=empresa.id)])
    db.session.add(Direccion(cliente_id=persona.id, alias="Casa", destinatario="Andrea Morales", telefono="722 100 2000",
                             calle="Calle Hidalgo", numero="45", colonia="La Merced", ciudad="Toluca",
                             estado="Estado de México", cp="50080", predeterminada=True))
    db.session.add(Direccion(cliente_id=empresa.id, alias="Clínica matriz", destinatario="Recepción de compras",
                             telefono="442 300 4000", calle="Av. Constituyentes", numero="210", colonia="El Pocito",
                             ciudad="Querétaro", estado="Querétaro", cp="76040", predeterminada=True))
    for num, nombre, puesto in EMPLEADOS:
        db.session.add(EmpleadoCorporativo(cliente_id=empresa.id, numero=num, nombre=nombre, puesto=puesto))
    db.session.commit()
    print(f"Demostración cargada. Contraseña de todas las cuentas de prueba: {PASSWORD_DEMO}")
