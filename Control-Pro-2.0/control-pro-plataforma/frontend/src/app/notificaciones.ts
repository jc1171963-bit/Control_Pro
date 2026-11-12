import { useQuery } from '@tanstack/react-query';
import { get } from '../api/cliente';

/**
 * Contador de notificaciones sin leer del cliente: una sola consulta (misma clave) compartida por la tienda, la cuenta
 * de persona y el portal de sucursales. `ListaNotificaciones` invalida el prefijo ['notif-cliente'], así que se
 * actualiza al marcar como leídas.
 */
export function useContadorNotificaciones(habilitado = true) {
  return useQuery({
    queryKey: ['notif-cliente', 'contador'],
    queryFn: () => get<{ no_leidas: number }>('/cuenta/notificaciones?por_pagina=1'),
    enabled: habilitado,
    refetchInterval: 30_000,
  });
}
