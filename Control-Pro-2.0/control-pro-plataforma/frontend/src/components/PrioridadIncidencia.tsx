/**
 * Prioridad de una incidencia como texto con ícono, sin forma de chip: así no se confunde con el turno (ChipTurno),
 * que sí es una pastilla de color. No cambia ni interpreta la prioridad del backend; solo la presenta.
 */
import { AlertOctagon, ChevronDown, ChevronsUp, Minus } from 'lucide-react';
import { cls } from '../lib/formato';

const PRIORIDADES: Record<string, [string, typeof Minus, string]> = {
  critica: ['Crítica', AlertOctagon, 'font-bold text-coral-700'],
  alta: ['Alta', ChevronsUp, 'font-semibold text-coral-700'],
  media: ['Media', Minus, 'text-tinta-700'],
  baja: ['Baja', ChevronDown, 'text-tinta-600'],
};

export default function PrioridadIncidencia({ prioridad, className }: { prioridad: string | null | undefined; className?: string }) {
  const [texto, Icono, estilo] = (prioridad && PRIORIDADES[prioridad]) || ['Sin prioridad', Minus, 'text-tinta-600'];
  return (
    <span data-prioridad={prioridad ?? ''} className={cls('inline-flex items-center gap-1 whitespace-nowrap text-xs', estilo, className)}>
      <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span><span className="sr-only">Prioridad </span>{texto}</span>
    </span>
  );
}
