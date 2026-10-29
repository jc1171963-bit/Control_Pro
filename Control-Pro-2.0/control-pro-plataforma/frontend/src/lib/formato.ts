const fmtMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const fmtFecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });
const fmtFechaHora = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

export const dinero = (v: string | number | null | undefined) => (v == null ? '—' : fmtMoneda.format(Number(v)));
export const fecha = (v: string | null | undefined) => (v ? fmtFecha.format(new Date(v)) : '—');
export const fechaHora = (v: string | null | undefined) => (v ? fmtFechaHora.format(new Date(v)) : '—');

type Tono = 'gris' | 'azul' | 'menta' | 'ambar' | 'coral' | 'violeta' | 'verde';

export const ESTADOS: Record<string, [string, Tono]> = {
  // pedido
  en_revision: ['En revisión', 'ambar'], devuelto: ['Devuelto para corrección', 'coral'], rechazado: ['Rechazado', 'coral'],
  pendiente_pago: ['Pendiente de pago', 'ambar'], pago_en_revision: ['Pago en revisión', 'violeta'], confirmado: ['Confirmado', 'azul'],
  en_preparacion: ['En preparación', 'azul'], parcialmente_enviado: ['Parcialmente enviado', 'violeta'], enviado: ['Enviado', 'violeta'],
  parcialmente_entregado: ['Parcialmente entregado', 'menta'], entregado: ['Entregado', 'verde'], cerrado: ['Cerrado', 'gris'],
  cancelado: ['Cancelado', 'gris'], expirado: ['Expirado', 'gris'],
  // pago
  pendiente: ['Pendiente', 'ambar'], en_proceso: ['En validación', 'violeta'], reembolsado_parcial: ['Reembolso parcial', 'gris'],
  reembolsado: ['Reembolsado', 'gris'], realizado: ['Realizado', 'verde'],
  // asignación / paquete / envío
  en_surtido: ['En surtido', 'azul'], empacada: ['Empacada', 'azul'], despachada: ['Despachada', 'violeta'], entregada: ['Entregada', 'verde'],
  cancelada: ['Cancelada', 'gris'], preparado: ['Preparado', 'azul'], despachado: ['Despachado', 'violeta'], en_transito: ['En tránsito', 'violeta'],
  listo_para_recoger: ['Listo para recoger', 'menta'], incidencia: ['Con incidencia', 'coral'],
  // devoluciones / transferencias / incidencias
  solicitada: ['Solicitada', 'ambar'], autorizada: ['Autorizada', 'azul'], rechazada: ['Rechazada', 'coral'], en_camino: ['En camino', 'violeta'],
  recibida: ['Recibida', 'menta'], recibida_parcial: ['Recibida con faltantes', 'coral'], inspeccionada: ['Inspeccionada', 'azul'],
  reembolsada: ['Reembolsada', 'verde'], enviada: ['Enviada', 'violeta'], abierta: ['Abierta', 'coral'], en_atencion: ['En atención', 'ambar'],
  resuelta: ['Resuelta', 'verde'], parcial: ['Parcial', 'ambar'], con_incidencia: ['Con incidencia', 'coral'], completa: ['Completa', 'verde'],
  // prioridad
  baja: ['Baja', 'gris'], media: ['Media', 'ambar'], alta: ['Alta', 'coral'], critica: ['Crítica', 'coral'],
};

export const etiqueta = (estado: string) => ESTADOS[estado]?.[0] ?? estado.replace(/_/g, ' ');
export const tono = (estado: string): Tono => ESTADOS[estado]?.[1] ?? 'gris';

export const METODOS: Record<string, string> = {
  transferencia: 'Transferencia bancaria', efectivo: 'Efectivo en sucursal', tarjeta_pasarela: 'Tarjeta (pasarela)',
  credito_corporativo: 'Crédito corporativo',
};
export const MOTIVOS_DEVOLUCION: Record<string, string> = {
  talla_incorrecta: 'Talla incorrecta', producto_danado: 'Producto dañado', producto_incorrecto: 'Producto incorrecto',
  no_corresponde: 'No corresponde a lo pedido', arrepentimiento: 'Ya no lo quiero', otro: 'Otro motivo',
};
export const TIPOS_MOVIMIENTO: Record<string, string> = {
  entrada: 'Entrada', salida_venta: 'Salida por venta', ajuste_positivo: 'Ajuste (+)', ajuste_negativo: 'Ajuste (−)', merma: 'Merma',
  transferencia_salida: 'Transferencia (salida)', transferencia_entrada: 'Transferencia (entrada)', devolucion_reingreso: 'Reingreso por devolución',
};

export function mensajeError(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const err = e as { message: string; detalles?: any };
    const det = err.detalles;
    if (det && typeof det === 'object') {
      if (Array.isArray(det.faltantes)) {
        return err.message + ' ' + det.faltantes.map((f: any) => f.sku ? `${f.sku}: pediste ${f.solicitado}, hay ${f.disponible_total ?? f.disponible ?? 0}` : f.mensaje).join('; ');
      }
      if (Array.isArray(det.pendientes)) return err.message + ' ' + det.pendientes.join('; ');
      if (Array.isArray(det.partidas)) return err.message + ' ' + det.partidas.map((p: any) => p.error).join(' ');
      const campos = Object.entries(det).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`);
      if (campos.length) return err.message + ' ' + campos.join(' · ');
    }
    return err.message;
  }
  return 'Ocurrió un error inesperado.';
}

export const cls = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
