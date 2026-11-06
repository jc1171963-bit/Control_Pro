import { useQuery } from '@tanstack/react-query';
import { get } from '../api/cliente';

export type Configuracion = { canal_tienda: boolean };

/** Opciones públicas del portal. Con la tienda apagada no hay precios, carrito ni checkout: solo solicitudes. */
export function useConfig() {
  const q = useQuery({ queryKey: ['configuracion'], queryFn: () => get<Configuracion>('/tienda/configuracion'), staleTime: Infinity });
  return { cargando: q.isLoading, canalTienda: q.data?.canal_tienda ?? false };
}
