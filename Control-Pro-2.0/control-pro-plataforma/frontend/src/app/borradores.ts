import { useQuery } from '@tanstack/react-query';
import { get } from '../api/cliente';
import type { Pagina, PedidoResumen } from '../api/tipos';

/**
 * Borradores de solicitud de la sucursal, del más reciente al más antiguo (la API ordena por id descendente).
 * Una sola consulta (misma clave) para el inicio, el indicador del encabezado y el selector de destino; el asistente y
 * "Agregar a mi solicitud" la invalidan al guardar.
 */
export function useBorradores(habilitado = true) {
  return useQuery({
    queryKey: ['mis-borradores'],
    queryFn: () => get<Pagina<PedidoResumen>>('/cuenta/pedidos?canal=corporativo&estado=borrador&por_pagina=20'),
    enabled: habilitado,
  });
}
