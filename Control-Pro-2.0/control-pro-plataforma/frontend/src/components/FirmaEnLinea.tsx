/**
 * Firma del empleado visible en la trazabilidad (sin abrir el comprobante). Usa la misma consulta que el comprobante,
 * así que al abrirlo ya está en caché. La firma siempre se muestra sobre "papel" claro (también en modo oscuro).
 */
import { useQuery } from '@tanstack/react-query';
import { FileSignature } from 'lucide-react';
import { get } from '../api/cliente';
import type { EntregaIndividual } from '../api/tipos';
import { cls } from '../lib/formato';

export default function FirmaEnLinea({ entregaId, origen, onAbrir, className }: {
  entregaId: number; origen: 'cuenta' | 'admin'; onAbrir: () => void; className?: string;
}) {
  const q = useQuery({ queryKey: ['comprobante', origen, entregaId], staleTime: 300_000,
    queryFn: () => get<EntregaIndividual & { firma?: string | null }>(`/${origen}/entregas/${entregaId}`) });
  const firma = q.data?.firma;
  return (
    <button type="button" onClick={onAbrir} title="Ver comprobante con firma"
      className={cls('firma-caja group inline-flex items-center gap-2 rounded-lg bg-[#fbfaf6] px-2 py-1 ring-1 ring-tinta-200 transition hover:ring-menta-500', className)}>
      {firma ? <img src={firma} alt={`Firma de ${q.data?.empleado.nombre ?? 'el empleado'}`} className="firma-trazo h-8 max-w-[110px] object-contain" />
        : <span className={cls('h-8 w-20 rounded', q.isLoading ? 'esqueleto animate-brillo' : 'grid place-items-center text-[10px] text-tinta-400')}>{q.isLoading ? '' : 'Sin firma'}</span>}
      <FileSignature className="h-3.5 w-3.5 text-[#0F2238]/60 group-hover:text-menta-700" aria-hidden />
    </button>
  );
}
