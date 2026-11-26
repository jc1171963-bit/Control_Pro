const fmtMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const fmtFecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });
const fmtFechaHora = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

export const dinero = (v: string | number | null | undefined) => (v == null ? '—' : fmtMoneda.format(Number(v)));
export const fecha = (v: string | null | undefined) => (v ? fmtFecha.format(new Date(v)) : '—');
export const fechaHora = (v: string | null | undefined) => (v ? fmtFechaHora.format(new Date(v)) : '—');

/**
 * Tiempo transcurrido: «hace 3 horas» o, con `corto`, «3 h». Desde 30 días se muestra la fecha. Nula o inválida: «—».
 * Una fecha futura (reloj desfasado) cuenta como «hace unos segundos».
 */
export function haceTiempo(v: string | null | undefined, { corto = false, ahora = Date.now() } = {}): string {
  const t = v ? new Date(v).getTime() : NaN;
  if (Number.isNaN(t)) return '—';
  const seg = Math.max(0, Math.floor((ahora - t) / 1000));
  const min = Math.floor(seg / 60), h = Math.floor(min / 60), d = Math.floor(h / 24);
  const plural = (n: number, uno: string, varios: string) => `hace ${n} ${n === 1 ? uno : varios}`;
  if (seg < 60) return corto ? 'ahora' : 'hace unos segundos';
  if (min < 60) return corto ? `${min} min` : plural(min, 'minuto', 'minutos');
  if (h < 24) return corto ? `${h} h` : plural(h, 'hora', 'horas');
  if (d < 30) return corto ? `${d} d` : plural(d, 'día', 'días');
  return fmtFecha.format(new Date(t));
}

type Tono = 'gris' | 'azul' | 'menta' | 'ambar' | 'coral' | 'violeta' | 'verde';

export const ESTADOS: Record<string, [string, Tono]> = {
  // pedido / solicitud
  borrador: ['Borrador', 'gris'], en_revision: ['En revisión', 'ambar'], devuelto: ['Devuelto para corrección', 'coral'], rechazado: ['Rechazado', 'coral'], aprobado: ['Aprobado · por autorizar', 'ambar'],
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
  recepcion_completa: ['Recibida completa', 'verde'], recepcion_parcial: ['Recibida con problema', 'coral'],
  // devoluciones / transferencias / incidencias
  solicitada: ['Solicitada', 'ambar'], autorizada: ['Autorizada', 'azul'], rechazada: ['Rechazada', 'coral'], en_camino: ['En camino', 'violeta'],
  recibida: ['Recibida', 'menta'], recibida_parcial: ['Recibida con faltantes', 'coral'], inspeccionada: ['Inspeccionada', 'azul'],
  reembolsada: ['Reembolsada', 'verde'], enviada: ['Enviada', 'violeta'], abierta: ['Abierta', 'coral'], en_atencion: ['En atención', 'ambar'],
  resuelta: ['Resuelta', 'verde'], parcial: ['Parcial', 'ambar'], con_incidencia: ['Con incidencia', 'coral'], completa: ['Completa', 'verde'],
  confirmada: ['Conformidad confirmada', 'verde'], cerrada: ['Cerrada', 'gris'],
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
export const PROBLEMAS_RECEPCION: Record<string, string> = { faltante: 'Faltante', danado: 'Dañado', diferencia: 'Diferente a lo enviado' };
export const PROBLEMAS_CONFORMIDAD: Record<string, string> = {
  talla: 'Problema de talla', faltante: 'Artículo faltante', incorrecto: 'Artículo incorrecto', danado: 'Artículo dañado',
};
export const TIPOS_INCIDENCIA: Record<string, string> = {
  articulo_faltante: 'Artículo faltante', articulo_danado: 'Artículo dañado', talla_incorrecta: 'Talla incorrecta',
  articulo_incorrecto: 'Artículo incorrecto', paquete_no_recibido: 'Paquete no recibido', otro: 'Otro',
  diferencia_recepcion: 'Diferencia en recepción', entrega_incompleta: 'Entrega incompleta', faltante_surtido: 'Faltante al surtir',
  incidencia_envio: 'Incidencia de envío', conformidad_talla: 'Conformidad: talla', conformidad_faltante: 'Conformidad: faltante',
  conformidad_incorrecto: 'Conformidad: artículo incorrecto', conformidad_danado: 'Conformidad: dañado', faltante_transferencia: 'Faltante en transferencia',
};
export const tipoIncidencia = (t: string) => TIPOS_INCIDENCIA[t] ?? t.replace(/_/g, ' ');

export const TIPOS_MOVIMIENTO: Record<string, string> = {
  entrada: 'Entrada', salida_venta: 'Salida por venta', ajuste_positivo: 'Ajuste (+)', ajuste_negativo: 'Ajuste (−)', merma: 'Merma',
  transferencia_salida: 'Transferencia (salida)', transferencia_entrada: 'Transferencia (entrada)', devolucion_reingreso: 'Reingreso por devolución',
};

export function mensajeError(e: unknown): string {
  // fetch sin respuesta del servidor (sin red, servidor caído): el navegador da un mensaje técnico en inglés. Solo esos casos;
  // otros TypeError son errores de programación y conservan su mensaje.
  if (e instanceof TypeError && /Failed to fetch|NetworkError|Load failed/i.test(e.message)) return 'No pudimos comunicarnos con el servidor. Revisa tu conexión e intenta de nuevo.';
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
