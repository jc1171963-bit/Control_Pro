/**
 * Recursos gráficos de la tienda LURIMA, hechos con SVG y CSS (sin imágenes externas).
 * Motivo: "cintas" en azul, verde y coral que retoman los colores del logotipo; son decorativas (aria-hidden).
 */
import { ReactNode } from 'react';
import { cls } from '../../lib/formato';

export function Cintas({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 200" preserveAspectRatio="none" aria-hidden className={cls('pointer-events-none', className)}>
      <path d="M0 150 C 140 60, 260 210, 420 110 S 600 40, 600 40" fill="none" className="stroke-lurima-500" strokeWidth="14" strokeLinecap="round" opacity=".9" />
      <path d="M0 175 C 160 90, 280 230, 440 135 S 600 70, 600 70" fill="none" className="stroke-bienestar-500" strokeWidth="10" strokeLinecap="round" opacity=".85" />
      <path d="M0 196 C 170 120, 300 240, 460 160 S 600 100, 600 100" fill="none" className="stroke-coral-500" strokeWidth="6" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}

/** Retícula de puntos sutil para fondos (CSS puro). */
export const PUNTOS = 'bg-[radial-gradient(circle_at_1px_1px,rgb(var(--lurima-200))_1px,transparent_0)] [background-size:22px_22px]';

/** Encabezado editorial de páginas de la tienda: banda clara con cintas, antetítulo, título y contenido opcional. */
export function EncabezadoPagina({ eyebrow, titulo, sub, children, className }: { eyebrow: string; titulo: ReactNode; sub?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <header className={cls('relative overflow-hidden border-b border-lurima-100 bg-gradient-to-b from-lurima-50 to-white', className)}>
      <div className={cls('absolute inset-0 opacity-60', PUNTOS)} aria-hidden />
      <Cintas className="absolute -right-24 bottom-0 h-28 w-[34rem] opacity-30 sm:opacity-60" />
      <div className="contenedor relative py-10 sm:py-12">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-bienestar-700"><span className="h-px w-6 bg-bienestar-500" aria-hidden />{eyebrow}</p>
        <h1 className="texto-equilibrado mt-2 max-w-3xl font-display text-3xl font-extrabold tracking-tight text-lurima-900 sm:text-4xl lg:text-5xl">{titulo}</h1>
        {sub && <div className="mt-3 max-w-2xl text-base text-tinta-600 sm:text-lg">{sub}</div>}
        {children}
      </div>
    </header>
  );
}
