"""Carga la red de sucursales de `seeds/sucursales_cliente.py`: divisiones, zonas con sus responsables y las cuentas de
sucursal (empresa). Se puede repetir: crea lo que falta y actualiza los responsables, sin duplicar sucursales ni tocar
contraseñas, datos ni direcciones que el distribuidor ya capturó (solo reemplaza direcciones provisionales)."""
import re
import unicodedata

from sqlalchemy import func, select

from app.extensions import db
from app.models import Carrito, Cliente, Direccion, Division, Zona
from app.security.auth import hash_password, validar_fortaleza
from app.services.comun import auditar

from .sucursales_cliente import CP_ESTADO, DIRECCIONES, DIVISIONES, ESTRUCTURA, GERENTES

DOMINIO = "sucursal.controlpro.mx"
PROVISIONAL = "Dirección provisional: el distribuidor debe capturar la dirección real."


def correo_de(nombre: str) -> str:
    """`Tijuana Casa Blanca` → `tijuana.casa.blanca@sucursal.controlpro.mx`."""
    base = unicodedata.normalize("NFD", nombre.lower())
    base = "".join(c for c in base if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", ".", base).strip(".") + "@" + DOMINIO


def sucursales():
    """Lista plana: (división, zona, estado, nombre, correo)."""
    filas, vistos = [], set()
    for division, zona, _responsable, estados in ESTRUCTURA:
        for estado, nombres in estados:
            for nombre in nombres:
                correo = correo_de(nombre)
                if correo in vistos:
                    raise ValueError(f"Sucursal repetida: {nombre}")
                vistos.add(correo)
                filas.append((division, zona, estado, nombre, correo))
    return filas


def _organizacion() -> dict[str, Zona]:
    divisiones = {}
    for division in {d for d, *_ in ESTRUCTURA if d}:
        div = db.session.scalars(select(Division).where(Division.nombre == division)).first() or Division(nombre=division)
        div.responsable, div.correo, div.telefono = DIVISIONES.get(division, (None, None, None))
        db.session.add(div)
        divisiones[division] = div
    db.session.flush()
    zonas = {}
    for division, zona, _r, _e in ESTRUCTURA:
        z = db.session.scalars(select(Zona).where(Zona.nombre == zona)).first() or Zona(nombre=zona)
        z.division_id = divisiones[division].id if division else None
        z.gerente, z.correo, z.telefono = GERENTES.get(zona, (None, None, None))
        db.session.add(z)
        zonas[zona] = z
    db.session.flush()
    return zonas


def _direccion(c: Cliente, nombre: str, estado: str):
    actual = db.session.scalars(select(Direccion).where(Direccion.cliente_id == c.id, Direccion.activo.is_(True))
                                .order_by(Direccion.predeterminada.desc(), Direccion.id)).first()
    if actual and actual.referencias != PROVISIONAL:
        return False  # ya tiene una dirección capturada: no se toca
    real = DIRECCIONES.get(nombre)
    d = actual or Direccion(cliente_id=c.id, alias="Sucursal", predeterminada=True)
    if real:
        calle, numero, colonia, cp, municipio, estado_real, entre = real
        d.destinatario, d.telefono = f"Recepción {nombre}", "Por capturar"
        d.calle, d.numero, d.colonia, d.cp, d.ciudad, d.estado, d.referencias = calle, numero, colonia, cp, municipio, estado_real, entre
    elif actual:
        return False
    else:
        d.destinatario, d.telefono, d.calle, d.numero, d.colonia = f"Recepción {nombre}", "Por capturar", "Dirección por capturar", "S/N", "Por capturar"
        d.ciudad, d.estado, d.cp, d.referencias = nombre, estado, CP_ESTADO[estado], PROVISIONAL
    db.session.add(d)
    return bool(real)


def cargar(password: str = "ControlPro2026") -> dict:
    validar_fortaleza(password)
    zonas = _organizacion()
    hash_ = hash_password(password)  # misma contraseña inicial: se calcula una vez
    r = {"creadas": 0, "existentes": 0, "direcciones_reales": 0}
    for _division, zona, estado, nombre, correo in sucursales():
        c = db.session.scalars(select(Cliente).where(func.lower(Cliente.correo) == correo)).first()
        if c:
            r["existentes"] += 1
            if c.zona_id is None:
                c.zona_id = zonas[zona].id
        else:
            c = Cliente(correo=correo, hash_password=hash_, nombre=f"Encargado {nombre}", tipo="empresa", razon_social=nombre,
                        zona_id=zonas[zona].id)
            db.session.add(c)
            db.session.flush()
            db.session.add(Carrito(cliente_id=c.id))
            auditar("sucursal_cliente.crear", "cliente", c.id, despues={"razon_social": nombre, "zona": zona, "origen": "carga masiva"})
            r["creadas"] += 1
        r["direcciones_reales"] += _direccion(c, nombre, estado)
    db.session.commit()
    r["zonas"], r["divisiones"] = len(zonas), len({d for d, *_ in ESTRUCTURA if d})
    return r
