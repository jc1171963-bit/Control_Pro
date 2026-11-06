/**
 * Utilidades del flujo de solicitudes de sucursal. Todo se guarda en el servidor (borrador persistente):
 * no se usa almacenamiento local para sustituir datos del proceso.
 */
import { claveIdempotencia, get, post, put } from '../api/cliente';
import type { Direccion, Pagina, Pedido, PedidoResumen, ProductoResumen } from '../api/tipos';

export type PartidaSolicitud = { empleado_id: number; variante_id: number; cantidad: number; excepcion: string | null };

/** El catálogo completo (la API pagina de 48 en 48). */
export async function catalogoCompleto(): Promise<ProductoResumen[]> {
  const primera = await get<Pagina<ProductoResumen>>('/tienda/productos?por_pagina=48&orden=nombre');
  const resto = await Promise.all(Array.from({ length: primera.paginas - 1 }, (_, i) =>
    get<Pagina<ProductoResumen>>(`/tienda/productos?por_pagina=48&orden=nombre&pagina=${i + 2}`)));
  return [primera, ...resto].flatMap((p) => p.items);
}

/** Regla por puesto configurada en el catálogo: puesto → ids de producto autorizados. */
export type PuestosAutorizados = Record<string, number[]>;
export const elegible = (puestos: PuestosAutorizados | undefined, puesto: string | undefined, productoId: number | undefined) =>
  !!puesto && !!productoId && (puestos?.[puesto] || []).includes(productoId);

export const partidasDe = (p: Pedido): PartidaSolicitud[] => p.detalles.map((d) => ({
  empleado_id: d.empleado!.id, variante_id: d.variante_id, cantidad: d.cantidad, excepcion: d.excepcion,
}));

/** Suma la partida a una lista existente (mismo empleado y variante = se acumula la cantidad). */
export function sumarPartida(lista: PartidaSolicitud[], nueva: PartidaSolicitud): PartidaSolicitud[] {
  const i = lista.findIndex((x) => x.empleado_id === nueva.empleado_id && x.variante_id === nueva.variante_id);
  if (i === -1) return [...lista, nueva];
  return lista.map((x, j) => (j === i ? { ...x, cantidad: Math.min(50, x.cantidad + nueva.cantidad), excepcion: nueva.excepcion ?? x.excepcion } : x));
}

/** Agrega un artículo al borrador más reciente de la sucursal; si no hay, crea uno con la dirección predeterminada. */
export async function agregarAlBorrador(nueva: PartidaSolicitud): Promise<Pedido> {
  const borradores = await get<Pagina<PedidoResumen>>('/cuenta/pedidos?canal=corporativo&estado=borrador&por_pagina=1');
  if (borradores.items.length) {
    const actual = await get<Pedido>(`/cuenta/pedidos/${borradores.items[0].id}`);
    return put<Pedido>(`/cuenta/pedidos-corporativos/${actual.id}`, { partidas: sumarPartida(partidasDe(actual), nueva), notas: actual.notas });
  }
  const dirs = await get<Direccion[]>('/cuenta/direcciones');
  const direccion = dirs.find((d) => d.predeterminada) || dirs[0];
  if (!direccion) throw new Error('Registra primero la dirección de entrega de tu sucursal (Mi cuenta → Direcciones).');
  return post<Pedido>('/cuenta/pedidos-corporativos', {
    modalidad: 'envio', direccion_id: direccion.id, partidas: [nueva], borrador: true, clave_idempotencia: claveIdempotencia('borrador'),
  });
}
