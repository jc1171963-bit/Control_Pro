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
from app.models import (Categoria, Cliente, Direccion, EmpleadoCorporativo, Producto, ProductoGiro, ProductoImagen,
                        ProductoPuesto, Promocion, Rol, Sucursal, SucursalZona, Usuario, Variante, ahora, Carrito)
from app.security.auth import hash_password
from app.security.permisos import sincronizar_roles
from app.services import inventario_service as inv
from .catalogo import CATEGORIAS, PRODUCTOS
from .imagenes import cuadros_giro, svg_producto

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

EMPLEADOS = [("1001", "Juan Pérez", "Administración"), ("1002", "Rosario Ramírez", "Enfermería"),
             ("1003", "Carlos Mendoza", "Mantenimiento"), ("1004", "Ana López", "Intendencia"),
             ("1005", "Luis Hernández", "Biomédica"), ("1006", "María Torres", "Enfermería"),
             ("2001", "Pedro García", "Almacén"), ("2002", "Fernanda Ruiz", "Recepción")]


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
            frames = []
            for k, svg in enumerate(cuadros_giro(tipo, hexc, f"{nombre} {color}")):
                cuadro = f"{slug}-{i}-giro-{k:02d}.svg"
                with open(os.path.join(carpeta, cuadro), "w", encoding="utf-8") as fh:
                    fh.write(svg)
                frames.append(f"/api/archivos/publicos/{cuadro}")
            p.giros.append(ProductoGiro(color=color, frames=frames))
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
    db.session.add(Promocion(nombre="Semana de la polo biomédica", tipo="porcentaje", valor=Decimal("15"),
                             inicio=ahora() - timedelta(days=1), fin=ahora() + timedelta(days=30),
                             productos=[por_sku["POL-001"]]))
    db.session.add(Promocion(nombre="Botas de mantenimiento: $100 menos al recoger en Puebla", tipo="monto",
                             valor=Decimal("100"), inicio=ahora() - timedelta(days=1), fin=ahora() + timedelta(days=30),
                             sucursal_id=sucs["PUE"].id, productos=[por_sku["BOT-003"]]))

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
