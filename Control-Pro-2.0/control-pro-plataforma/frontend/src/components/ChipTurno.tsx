/**
 * Turno de una incidencia, tal como lo calcula el backend (turno_service). Solo presenta: traduce el código a texto,
 * estilo e ícono según el portal; no calcula turnos, no deduce responsabilidades ni decide acciones.
 *
 * Estilos: «accion» = le toca a quien mira (relleno); «seguimiento» = espera a la otra parte (contorno);
 * «cerrada» = terminada; «desconocido» = código nulo o no reconocido (neutral).
 * El significado no depende solo del color: cada tipo lleva su ícono y el texto dice qué pasa.
 */
import { ArrowRightCircle, CheckCircle2, Circle, Clock } from 'lucide-react';
import { cls, haceTiempo } from '../lib/formato';

export type PortalTurno = 'sucursal' | 'lurima';
type Tipo = 'accion' | 'seguimiento' | 'cerrada' | 'desconocido';
type Tono = 'ambar' | 'verde' | 'coral' | 'azul' | 'gris';

/** [texto, tipo, tono] por código y portal. Fuente: docs/etapa3-redisenio-incidencias/02_propuesta_redisenio.md §4. */
const TURNOS: Record<string, Record<PortalTurno, [string, Tipo, Tono]>> = {
  sucursal_responder: { sucursal: ['Te toca responder', 'accion', 'ambar'], lurima: ['Esperando a la sucursal', 'seguimiento', 'gris'] },
  sucursal_recibir: { sucursal: ['Te toca recibir la reposición', 'accion', 'ambar'], lurima: ['Esperando recepción', 'seguimiento', 'gris'] },
  sucursal_confirmar: { sucursal: ['Te toca confirmar la solución', 'accion', 'verde'], lurima: ['Esperando confirmación', 'seguimiento', 'gris'] },
  lurima_atender: { sucursal: ['Esperando a Lurima', 'seguimiento', 'gris'], lurima: ['Por atender', 'accion', 'coral'] },
  lurima_responder: { sucursal: ['Esperando a Lurima', 'seguimiento', 'gris'], lurima: ['Respondió la sucursal', 'accion', 'coral'] },
  lurima_reposicion: { sucursal: ['Reposición en proceso', 'seguimiento', 'azul'], lurima: ['Reposición en curso', 'seguimiento', 'azul'] },
  interna: { sucursal: ['Seguimiento interno', 'seguimiento', 'gris'], lurima: ['Por atender (interna)', 'accion', 'coral'] },
  cerrada: { sucursal: ['Cerrada', 'cerrada', 'gris'], lurima: ['Cerrada', 'cerrada', 'gris'] },
};
const DESCONOCIDO: [string, Tipo, Tono] = ['Sin información de turno', 'desconocido', 'gris'];

const ESTILOS: Record<Tipo, Partial<Record<Tono, string>>> = {
  accion: {
    ambar: 'bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-300',
    verde: 'bg-emerald-100 text-emerald-900 ring-1 ring-inset ring-emerald-300',
    coral: 'bg-coral-100 text-coral-700 ring-1 ring-inset ring-coral-500/40',
  },
  seguimiento: {
    gris: 'bg-white/60 text-tinta-700 ring-1 ring-inset ring-tinta-300',
    azul: 'bg-white/60 text-sky-800 ring-1 ring-inset ring-sky-300',
  },
  cerrada: { gris: 'bg-tinta-100 text-tinta-600' },
  desconocido: { gris: 'border border-dashed border-tinta-300 bg-white/60 text-tinta-600' },
};
const ICONOS: Record<Tipo, typeof Clock> = { accion: ArrowRightCircle, seguimiento: Clock, cerrada: CheckCircle2, desconocido: Circle };

/** Texto del turno para un portal (para títulos o textos fuera del chip). Código nulo o desconocido: texto neutral. */
export function textoTurno(turno: string | null | undefined, portal: PortalTurno): string {
  return (turno && TURNOS[turno]?.[portal]?.[0]) || DESCONOCIDO[0];
}

export default function ChipTurno({ turno, portal, desde, className }: {
  turno: string | null | undefined; portal: PortalTurno; desde?: string | null; className?: string;
}) {
  const [texto, tipo, tono] = (turno && TURNOS[turno]?.[portal]) || DESCONOCIDO;
  const Icono = ICONOS[tipo];
  const tiempo = desde ? haceTiempo(desde, { corto: true }) : null;
  const conTiempo = tiempo && tiempo !== '—' ? tiempo : null;
  return (
    <span data-turno={turno ?? ''} data-tipo={tipo}
      title={conTiempo ? `${texto} · ${haceTiempo(desde)}` : texto}
      // max-w-full: en un contenedor angosto el texto se parte en vez de salirse (el chip nunca excede su espacio)
      className={cls('inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold leading-snug',
        ESTILOS[tipo][tono], className)}>
      <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">{texto}</span>
      {conTiempo && <span className="shrink-0 whitespace-nowrap font-normal opacity-80">· {conTiempo}</span>}
    </span>
  );
}
