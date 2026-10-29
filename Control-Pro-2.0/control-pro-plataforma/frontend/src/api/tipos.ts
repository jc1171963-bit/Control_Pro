export type Sucursal = {
  id: number; codigo: string; nombre: string; ciudad: string; direccion: string; estado: string; cp: string;
  telefono: string | null; correo: string | null; horario: Record<string, string>; permite_recoger: boolean; activo: boolean;
  responsable?: { id: number; nombre: string } | null; zonas?: { cp_prefijo: string; prioridad: number }[];
};
export type Usuario = {
  id: number; correo: string; nombre: string; activo: boolean;
  rol: { codigo: string; nombre: string; alcance_global: boolean }; permisos: string[];
  sucursales: { id: number; nombre: string }[]; ultimo_acceso: string | null; bloqueado_hasta: string | null;
};
export type Cliente = {
  id: number; correo: string; nombre: string; telefono: string | null; tipo: 'persona' | 'empresa';
  razon_social: string | null; rfc: string | null; activo: boolean; creado: string;
};
export type Direccion = {
  id: number; alias: string; destinatario: string; telefono: string; calle: string; numero: string; colonia: string;
  ciudad: string; estado: string; cp: string; referencias: string | null; predeterminada: boolean;
};
export type VarianteT = {
  id: number; sku: string; talla: string; color: string; color_hex: string; precio_base: string; activo: boolean;
  precio?: string; descuento?: string; precio_final?: string; promocion?: string | null; disponible?: number;
};
export type ProductoResumen = {
  id: number; slug: string; nombre: string; sku_base: string; categoria: { id: number; nombre: string; slug: string };
  imagen: string | null; destacado: boolean; precio_desde: string | null; precio_base_desde: string | null;
  tallas: string[]; colores: [string, string][]; disponible: number | null; en_promocion?: boolean;
};
export type ProductoDetalle = ProductoResumen & {
  descripcion: string; material: string | null; cuidados: string | null; activo: boolean;
  imagenes: { url: string; alt: string }[]; puestos: string[]; sucursales_deshabilitadas: number[];
  variantes: VarianteT[];
  disponibilidad_sucursal?: { sucursal_id: number; sucursal: string; permite_recoger: boolean; variantes: Record<string, number> }[];
  relacionados?: ProductoResumen[];
};
export type Pagina<T> = { items: T[]; total: number; pagina: number; por_pagina: number; paginas: number };
export type Pago = {
  id: number; folio: string; pedido_id: number; metodo: string; estado: string; monto: string; monto_reembolsado: string;
  referencia: string | null; comprobante_url: string | null; sucursal_id: number | null; motivo_rechazo: string | null;
  validado_en: string | null; creado: string; reembolsos: Reembolso[];
  pedido?: { id: number; folio: string; total: string; cliente: string; estado: string };
};
export type Reembolso = {
  id: number; pago_id: number | null; pedido_id: number; devolucion_id: number | null; tipo: string; monto: string;
  motivo: string; estado: string; referencia: string | null; realizado_en: string | null; creado: string;
  pedido?: { id: number; folio: string; cliente: string };
};
export type Paquete = {
  id: number; folio: string; estado: string; peso_kg: string | null; creado: string; sucursal: string;
  contenido: { sku: string; nombre: string; talla: string; cantidad: number; empleado: string | null }[];
  envio: null | { paqueteria: string; guia: string; estado: string; proveedor: string; rastreo_externo: boolean;
    eventos: { estado: string; descripcion: string; origen: string; fecha: string }[] };
  recepcion?: { estado: string; diferencias: string | null; fecha: string } | null;
};
export type DetallePedido = {
  id: number; variante_id: number; sku: string; nombre: string; talla: string; color: string; cantidad: number;
  precio_unitario: string; descuento_unitario: string; importe: string; excepcion: string | null;
  empleado: { id: number; nombre: string; puesto: string } | null;
  cantidad_cancelada: number; cantidad_entregada: number; cantidad_devuelta: number;
};
export type Historial = { fecha: string; anterior: string | null; nuevo: string; motivo: string | null; actor: string };
export type Devolucion = {
  id: number; folio: string; pedido_id: number; pedido_folio: string; estado: string; motivo: string; descripcion: string;
  evidencias: string[]; sucursal_recibe: Sucursal | null; guia_retorno: string | null; resolucion: string | null;
  monto_reembolso: string; creado: string; historial: Historial[];
  detalles: { id: number; pedido_detalle_id: number; sku: string; nombre: string; talla: string; cantidad: number; recibida: number; resultado: string }[];
};
export type EntregaIndividual = {
  id: number; paquete_id: number; estado: string; empleado: { id: number; nombre: string; puesto: string; numero: string };
  valoracion: number | null; observaciones: string | null; entregado_en: string | null; tiene_firma: boolean; firma?: string;
  detalles: { pedido_detalle_id: number; sku: string; nombre: string; talla: string; esperada: number; entregada: number }[];
};
export type Asignacion = {
  id: number; pedido_id: number; estado: string; sucursal: { id: number; nombre: string }; creado: string;
  detalles: { id: number; pedido_detalle_id: number; sku: string; nombre: string; talla: string; color: string;
    empleado: string | null; cantidad: number; surtida: number; empacada: number; despachada: number; faltante: number }[];
  paquetes: Paquete[];
  pedido?: { id: number; folio: string; estado: string; canal: string; modalidad: string; cliente: string;
    direccion_envio: Record<string, string> | null; sucursal_recoger_id: number | null; creado: string };
};
export type Incidencia = {
  id: number; folio: string; tipo: string; prioridad: string; estado: string; pedido_id: number | null; paquete_id: number | null;
  devolucion_id: number | null; transferencia_id: number | null; sucursal_id: number | null; descripcion: string;
  resolucion: string | null; responsable_id: number | null; creado: string; actualizado: string;
};
export type PedidoResumen = {
  id: number; folio: string; canal: 'tienda' | 'corporativo'; estado: string; modalidad: 'envio' | 'recoger';
  metodo_pago: string; total: string; creado: string; cliente: { id: number; nombre: string }; articulos: number;
  sucursales: string[]; reserva_expira: string | null;
};
export type Pedido = PedidoResumen & {
  subtotal: string; descuento: string; costo_envio: string; impuestos: string; notas: string | null;
  direccion_envio: Record<string, string> | null; sucursal_recoger: Sucursal | null; confirmado_en: string | null;
  detalles: DetallePedido[]; pagos: Pago[]; paquetes: Paquete[]; historial: Historial[]; saldo: string;
  devoluciones: Devolucion[]; aprobaciones?: { decision: string; motivo: string | null; usuario: string; fecha: string }[];
  entregas_individuales?: EntregaIndividual[]; asignaciones?: Asignacion[]; incidencias?: Incidencia[];
  cliente: any;
};
export type Notificacion = { id: number; evento: string; mensaje: string; enlace: string | null; leida: boolean; fecha: string };
export type InventarioFila = {
  sucursal_id: number; sucursal: string; variante_id: number; sku: string; producto: string; talla: string; color: string;
  fisico: number; reservado: number; comprometido: number; en_transito: number; disponible: number; minimo: number; bajo: boolean;
};
export type Movimiento = {
  id: number; fecha: string; sucursal_id: number; variante_id: number; sku: string; tipo: string; cantidad: number;
  saldo: number; motivo: string; referencia: string | null; usuario: string;
};
export type Transferencia = {
  id: number; folio: string; estado: string; motivo: string; observaciones: string | null;
  origen: { id: number; nombre: string }; destino: { id: number; nombre: string }; creado: string; actualizado: string;
  detalles: { id: number; variante_id: number; sku: string; producto: string; talla: string; cantidad: number; enviada: number; recibida: number }[];
};
export type Carrito = {
  items: { id: number; variante_id: number; cantidad: number; producto: string; slug: string; imagen: string | null; sku: string;
    talla: string; color: string; color_hex: string; precio: string; descuento: string; promocion: string | null; importe: string;
    disponible: number; activo: boolean }[];
  avisos: string[]; articulos: number; totales: Record<string, string>; envio_gratis_desde: string; costo_envio: string;
  reserva_horas: number;
};
