/**
 * Pestañas de las vistas de detalle: separan una página larga en secciones con su contador, para ver una cosa a la vez.
 * - La pestaña activa vive en la dirección (`?ver=paquetes`): se puede compartir el enlace y el botón Atrás funciona.
 * - Accesibles: role tablist/tab/tabpanel, flechas izquierda/derecha, Inicio y Fin.
 * - En celular la barra se desliza de lado y la pestaña activa se mantiene a la vista.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { cls } from '../lib/formato';

export type Pestana = { clave: string; titulo: string; icono?: LucideIcon; cuenta?: number; alerta?: boolean; oculta?: boolean };

/** Pestaña activa leída de `?ver=`; si no existe o no es válida, la indicada por omisión. */
export function usePestana(claves: string[], defecto: string): [string, (clave: string) => void] {
  const [params, setParams] = useSearchParams();
  const pedida = params.get('ver');
  const activa = pedida && claves.includes(pedida) ? pedida : defecto;
  const cambiar = (clave: string) => setParams((previos) => {
    const n = new URLSearchParams(previos);
    n.set('ver', clave);
    return n;
  }, { replace: true });
  return [activa, cambiar];
}

export function Pestanas({ items, activa, onCambio, etiqueta, className }:
  { items: Pestana[]; activa: string; onCambio: (clave: string) => void; etiqueta: string; className?: string }) {
  const visibles = items.filter((p) => !p.oculta);
  const barra = useRef<HTMLDivElement>(null);
  // Mantiene la pestaña activa a la vista dentro de la barra (celular).
  useEffect(() => {
    const b = barra.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    b?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activa]);
  const mover = (e: React.KeyboardEvent, i: number) => {
    const destino = e.key === 'ArrowRight' ? (i + 1) % visibles.length : e.key === 'ArrowLeft' ? (i - 1 + visibles.length) % visibles.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? visibles.length - 1 : -1;
    if (destino < 0) return;
    e.preventDefault();
    onCambio(visibles[destino].clave);
    barra.current?.querySelectorAll<HTMLElement>('[role="tab"]')[destino]?.focus();
  };
  return (
    <div ref={barra} role="tablist" aria-label={etiqueta}
      className={cls('pestanas -mx-1 flex snap-x gap-1 overflow-x-auto rounded-2xl bg-white/75 p-1 shadow-sm ring-1 ring-tinta-100 backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}>
      {visibles.map((p, i) => {
        const sel = p.clave === activa;
        const Icono = p.icono;
        return (
          <button key={p.clave} type="button" role="tab" id={`pestana-${p.clave}`} aria-controls={`panel-${p.clave}`} aria-selected={sel}
            tabIndex={sel ? 0 : -1} onClick={() => onCambio(p.clave)} onKeyDown={(e) => mover(e, i)}
            className={cls('pestana relative flex min-h-11 shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-sm font-semibold transition',
              sel ? 'pestana-activa bg-tinta-900 text-white shadow' : 'text-tinta-600 hover:bg-tinta-50 hover:text-tinta-900')}>
            {Icono && <Icono className="h-4 w-4 shrink-0" aria-hidden />}
            {p.titulo}
            {p.cuenta != null && p.cuenta > 0 && (
              <span className={cls('grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold',
                p.alerta ? 'bg-coral-500 text-white' : sel ? 'bg-black/25 text-white' : 'bg-tinta-100 text-tinta-700')}
                aria-label={`${p.cuenta}${p.alerta ? ' pendiente(s)' : ''}`}>{p.cuenta}</span>
            )}
            {p.alerta && !p.cuenta && <span className="h-2 w-2 rounded-full bg-coral-500" aria-label="Requiere atención" />}
          </button>
        );
      })}
    </div>
  );
}

export function PanelPestana({ clave, activa, children }: { clave: string; activa: string; children: ReactNode }) {
  if (clave !== activa) return null;
  return <div role="tabpanel" id={`panel-${clave}`} aria-labelledby={`pestana-${clave}`} tabIndex={-1} className="animate-aparecer focus:outline-none">{children}</div>;
}
