"""Validación de entradas con Marshmallow. Los campos desconocidos se rechazan."""
from marshmallow import RAISE, Schema, ValidationError, fields, validate, validates_schema

L = validate.Length
OneOf = validate.OneOf
Range = validate.Range
CP = validate.Regexp(r"^[0-9]{5}$", error="Código postal de 5 dígitos.")
TEL = validate.Regexp(r"^[0-9+\-\s()]{8,20}$", error="Teléfono inválido.")
CLAVE = fields.Str(required=True, validate=L(min=8, max=80))


class Base(Schema):
    class Meta:
        unknown = RAISE


def cargar(schema_cls, datos, **kw):
    return schema_cls(**kw).load(datos or {})


class LoginSchema(Base):
    correo = fields.Email(required=True)
    password = fields.Str(required=True, validate=L(min=1, max=128))


class RegistroSchema(Base):
    correo = fields.Email(required=True)
    password = fields.Str(required=True, validate=L(min=8, max=128))
    nombre = fields.Str(required=True, validate=L(min=3, max=120))
    telefono = fields.Str(load_default=None, validate=TEL, allow_none=True)
    tipo = fields.Str(load_default="persona", validate=OneOf(["persona", "empresa"]))
    razon_social = fields.Str(load_default=None, allow_none=True, validate=L(max=160))
    rfc = fields.Str(load_default=None, allow_none=True,
                     validate=validate.Regexp(r"^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$", error="RFC inválido."))


class RecuperarSchema(Base):
    correo = fields.Email(required=True)
    tipo = fields.Str(load_default="cliente", validate=OneOf(["cliente", "usuario"]))


class RestablecerSchema(Base):
    token = fields.Str(required=True, validate=L(min=20, max=200))
    password = fields.Str(required=True, validate=L(min=8, max=128))


class CambiarPasswordSchema(Base):
    actual = fields.Str(required=True)
    nueva = fields.Str(required=True, validate=L(min=8, max=128))


class PerfilSchema(Base):
    nombre = fields.Str(validate=L(min=3, max=120))
    telefono = fields.Str(allow_none=True, validate=TEL)
    razon_social = fields.Str(allow_none=True, validate=L(max=160))


class DireccionSchema(Base):
    alias = fields.Str(required=True, validate=L(min=2, max=40))
    destinatario = fields.Str(required=True, validate=L(min=3, max=120))
    telefono = fields.Str(required=True, validate=TEL)
    calle = fields.Str(required=True, validate=L(min=2, max=160))
    numero = fields.Str(required=True, validate=L(min=1, max=20))
    colonia = fields.Str(required=True, validate=L(min=2, max=120))
    ciudad = fields.Str(required=True, validate=L(min=2, max=80))
    estado = fields.Str(required=True, validate=L(min=2, max=80))
    cp = fields.Str(required=True, validate=CP)
    referencias = fields.Str(load_default=None, allow_none=True, validate=L(max=300))
    predeterminada = fields.Bool(load_default=False)


class CarritoItemSchema(Base):
    variante_id = fields.Int(required=True)
    cantidad = fields.Int(required=True, validate=Range(min=1, max=99))


class CantidadSchema(Base):
    cantidad = fields.Int(required=True, validate=Range(min=1, max=99))


class CheckoutSchema(Base):
    modalidad = fields.Str(required=True, validate=OneOf(["envio", "recoger"]))
    metodo_pago = fields.Str(required=True, validate=OneOf(["transferencia", "efectivo", "tarjeta_pasarela"]))
    direccion_id = fields.Int(load_default=None, allow_none=True)
    sucursal_id = fields.Int(load_default=None, allow_none=True)
    notas = fields.Str(load_default=None, allow_none=True, validate=L(max=500))
    clave_idempotencia = CLAVE

    @validates_schema
    def _coherencia(self, d, **_):
        if d["modalidad"] == "envio" and not d.get("direccion_id"):
            raise ValidationError({"direccion_id": ["Selecciona una dirección de entrega."]})
        if d["modalidad"] == "recoger" and not d.get("sucursal_id"):
            raise ValidationError({"sucursal_id": ["Selecciona la sucursal donde recogerás."]})


class PartidaCorporativaSchema(Base):
    empleado_id = fields.Int(required=True)
    variante_id = fields.Int(required=True)
    cantidad = fields.Int(required=True, validate=Range(min=1, max=50))
    excepcion = fields.Str(load_default=None, allow_none=True, validate=L(max=250))


class PedidoCorporativoSchema(Base):
    modalidad = fields.Str(required=True, validate=OneOf(["envio", "recoger"]))
    direccion_id = fields.Int(load_default=None, allow_none=True)
    sucursal_id = fields.Int(load_default=None, allow_none=True)
    notas = fields.Str(load_default=None, allow_none=True, validate=L(max=500))
    partidas = fields.List(fields.Nested(PartidaCorporativaSchema), required=True, validate=L(min=1, max=200))
    clave_idempotencia = CLAVE


class CorreccionCorporativaSchema(Base):
    partidas = fields.List(fields.Nested(PartidaCorporativaSchema), required=True, validate=L(min=1, max=200))
    notas = fields.Str(load_default=None, allow_none=True, validate=L(max=500))


class EmpleadoSchema(Base):
    numero = fields.Str(required=True, validate=L(min=1, max=20))
    nombre = fields.Str(required=True, validate=L(min=3, max=120))
    puesto = fields.Str(required=True, validate=L(min=2, max=60))
    area = fields.Str(load_default=None, allow_none=True, validate=L(max=80))
    activo = fields.Bool(load_default=True)


class PagoTransferenciaSchema(Base):
    referencia = fields.Str(required=True, validate=L(min=4, max=80))
    comprobante_url = fields.Str(load_default=None, allow_none=True, validate=L(max=300))
    clave_idempotencia = CLAVE


class PagoEfectivoSchema(Base):
    monto = fields.Decimal(required=True, places=2, validate=Range(min=0.01))
    referencia = fields.Str(load_default=None, allow_none=True, validate=L(max=80))
    clave_idempotencia = CLAVE


class MotivoSchema(Base):
    motivo = fields.Str(required=True, validate=L(min=5, max=500))


class NotaSchema(Base):
    nota = fields.Str(load_default=None, allow_none=True, validate=L(max=500))


class ReferenciaSchema(Base):
    referencia = fields.Str(required=True, validate=L(min=4, max=80))


class DecisionSchema(Base):
    decision = fields.Str(required=True, validate=OneOf(["aprobado", "rechazado", "devuelto"]))
    motivo = fields.Str(load_default=None, allow_none=True, validate=L(max=500))
    aceptar_excepciones = fields.Bool(load_default=False)


class DevolucionSolicitudSchema(Base):
    motivo = fields.Str(required=True, validate=OneOf(["talla_incorrecta", "producto_danado", "producto_incorrecto",
                                                       "no_corresponde", "arrepentimiento", "otro"]))
    descripcion = fields.Str(required=True, validate=L(min=10, max=1000))
    evidencias = fields.List(fields.Str(validate=L(min=3, max=300)), required=True, validate=L(min=1, max=6))
    partidas = fields.List(fields.Dict(), required=True, validate=L(min=1))


class SucursalSchema(Base):
    codigo = fields.Str(required=True, validate=L(min=2, max=10))
    nombre = fields.Str(required=True, validate=L(min=3, max=120))
    direccion = fields.Str(required=True, validate=L(min=5, max=250))
    ciudad = fields.Str(required=True, validate=L(min=2, max=80))
    estado = fields.Str(required=True, validate=L(min=2, max=80))
    cp = fields.Str(required=True, validate=CP)
    telefono = fields.Str(load_default=None, allow_none=True, validate=TEL)
    correo = fields.Email(load_default=None, allow_none=True)
    horario = fields.Dict(load_default=dict)
    responsable_id = fields.Int(load_default=None, allow_none=True)
    permite_recoger = fields.Bool(load_default=True)
    activo = fields.Bool(load_default=True)
    zonas = fields.List(fields.Dict(), load_default=list)


class UsuarioSchema(Base):
    correo = fields.Email(required=True)
    nombre = fields.Str(required=True, validate=L(min=3, max=120))
    rol = fields.Str(required=True)
    sucursales = fields.List(fields.Int(), load_default=list)
    activo = fields.Bool(load_default=True)
    password = fields.Str(load_default=None, allow_none=True, validate=L(min=8, max=128))


class CategoriaSchema(Base):
    nombre = fields.Str(required=True, validate=L(min=2, max=80))
    slug = fields.Str(required=True, validate=validate.Regexp(r"^[a-z0-9-]{2,80}$"))
    padre_id = fields.Int(load_default=None, allow_none=True)
    orden = fields.Int(load_default=0)
    activo = fields.Bool(load_default=True)


class VarianteSchema(Base):
    id = fields.Int(load_default=None, allow_none=True)
    sku = fields.Str(required=True, validate=L(min=3, max=40))
    talla = fields.Str(required=True, validate=L(min=1, max=20))
    color = fields.Str(required=True, validate=L(min=2, max=40))
    color_hex = fields.Str(load_default="#334155", validate=validate.Regexp(r"^#[0-9A-Fa-f]{6}$"))
    precio_base = fields.Decimal(required=True, places=2, validate=Range(min=0.01))
    activo = fields.Bool(load_default=True)


class ProductoSchema(Base):
    sku_base = fields.Str(required=True, validate=L(min=3, max=30))
    nombre = fields.Str(required=True, validate=L(min=3, max=160))
    slug = fields.Str(required=True, validate=validate.Regexp(r"^[a-z0-9-]{3,180}$"))
    descripcion = fields.Str(load_default="", validate=L(max=4000))
    material = fields.Str(load_default=None, allow_none=True, validate=L(max=120))
    cuidados = fields.Str(load_default=None, allow_none=True, validate=L(max=250))
    categoria_id = fields.Int(required=True)
    destacado = fields.Bool(load_default=False)
    activo = fields.Bool(load_default=True)
    puestos = fields.List(fields.Str(validate=L(min=2, max=60)), load_default=list)
    variantes = fields.List(fields.Nested(VarianteSchema), required=True, validate=L(min=1))
    sucursales_deshabilitadas = fields.List(fields.Int(), load_default=list)
    imagenes = fields.List(fields.Str(validate=L(max=300)), load_default=list)


class PromocionSchema(Base):
    nombre = fields.Str(required=True, validate=L(min=3, max=120))
    tipo = fields.Str(required=True, validate=OneOf(["porcentaje", "monto"]))
    valor = fields.Decimal(required=True, places=2, validate=Range(min=0.01))
    inicio = fields.AwareDateTime(required=True, default_timezone=None)
    fin = fields.AwareDateTime(required=True, default_timezone=None)
    sucursal_id = fields.Int(load_default=None, allow_none=True)
    activo = fields.Bool(load_default=True)
    productos = fields.List(fields.Int(), required=True, validate=L(min=1))

    @validates_schema
    def _fechas(self, d, **_):
        if d["fin"] <= d["inicio"]:
            raise ValidationError({"fin": ["Debe ser posterior al inicio."]})
        if d["tipo"] == "porcentaje" and d["valor"] > 90:
            raise ValidationError({"valor": ["El porcentaje máximo es 90."]})


class EntradaSchema(Base):
    sucursal_id = fields.Int(required=True)
    variante_id = fields.Int(required=True)
    cantidad = fields.Int(required=True, validate=Range(min=1, max=100000))
    motivo = fields.Str(required=True, validate=L(min=3, max=250))
    clave_idempotencia = CLAVE


class AjusteSchema(EntradaSchema):
    tipo = fields.Str(required=True, validate=OneOf(["ajuste_positivo", "ajuste_negativo", "merma"]))
    motivo = fields.Str(required=True, validate=L(min=5, max=250))


class MinimoSchema(Base):
    sucursal_id = fields.Int(required=True)
    variante_id = fields.Int(required=True)
    minimo = fields.Int(required=True, validate=Range(min=0, max=100000))


class TransferenciaSchema(Base):
    origen_id = fields.Int(required=True)
    destino_id = fields.Int(required=True)
    motivo = fields.Str(required=True, validate=L(min=5, max=250))
    partidas = fields.List(fields.Dict(), required=True, validate=L(min=1, max=100))


class CantidadesSchema(Base):
    cantidades = fields.Dict(keys=fields.Str(), values=fields.Int(validate=Range(min=0)), load_default=dict)
    observaciones = fields.Str(load_default=None, allow_none=True, validate=L(max=500))


class SurtidoSchema(Base):
    partidas = fields.List(fields.Dict(), required=True, validate=L(min=1))


class PaqueteSchema(Base):
    partidas = fields.List(fields.Dict(), required=True, validate=L(min=1))
    peso_kg = fields.Decimal(load_default=None, allow_none=True, places=2, validate=Range(min=0))


class DespachoSchema(Base):
    paqueteria = fields.Str(required=True, validate=L(min=2, max=60))
    guia = fields.Str(required=True, validate=L(min=4, max=60))


class EventoSchema(Base):
    estado = fields.Str(required=True, validate=OneOf(["en_transito", "entregado", "incidencia"]))
    descripcion = fields.Str(required=True, validate=L(min=3, max=300))


class EntregaSucursalSchema(Base):
    recibio = fields.Str(required=True, validate=L(min=3, max=120))
    identificacion = fields.Str(required=True, validate=L(min=3, max=60))


class RecepcionSchema(Base):
    completa = fields.Bool(required=True)
    diferencias = fields.Str(load_default=None, allow_none=True, validate=L(max=1000))


class EntregaIndividualSchema(Base):
    cantidades = fields.Dict(keys=fields.Str(), values=fields.Int(validate=Range(min=0)), load_default=dict)
    firma = fields.Str(required=True)
    valoracion = fields.Int(load_default=None, allow_none=True, validate=Range(min=1, max=5))
    observaciones = fields.Str(load_default=None, allow_none=True, validate=L(max=500))


class AutorizarDevolucionSchema(Base):
    sucursal_id = fields.Int(required=True)
    nota = fields.Str(load_default=None, allow_none=True, validate=L(max=500))


class InspeccionSchema(Base):
    resultados = fields.Dict(keys=fields.Str(), values=fields.Dict(), required=True)
    nota = fields.Str(load_default=None, allow_none=True, validate=L(max=500))


class GuiaRetornoSchema(Base):
    guia = fields.Str(load_default=None, allow_none=True, validate=L(max=60))


class IncidenciaSchema(Base):
    tipo = fields.Str(required=True, validate=L(min=3, max=40))
    descripcion = fields.Str(required=True, validate=L(min=10, max=2000))
    prioridad = fields.Str(load_default="media", validate=OneOf(["baja", "media", "alta", "critica"]))
    pedido_id = fields.Int(load_default=None, allow_none=True)
    paquete_id = fields.Int(load_default=None, allow_none=True)
    devolucion_id = fields.Int(load_default=None, allow_none=True)
    transferencia_id = fields.Int(load_default=None, allow_none=True)


class IncidenciaCambioSchema(Base):
    estado = fields.Str(load_default=None, allow_none=True, validate=OneOf(["abierta", "en_atencion", "resuelta", "cerrada"]))
    comentario = fields.Str(load_default=None, allow_none=True, validate=L(max=1000))
    responsable_id = fields.Int(load_default=None, allow_none=True)
