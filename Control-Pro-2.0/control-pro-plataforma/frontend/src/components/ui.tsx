import { ButtonHTMLAttributes, createContext, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes,
  useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, Loader2, X } from 'lucide-react';
import { cls, etiqueta, mensajeError, tono } from '../lib/formato';
import { createPortal } from 'react-dom';
import { useAtraparFoco } from './useAtraparFoco';
import { EsqueletoLista, EsqueletoPagina, EsqueletoTabla, NumeroAnimado } from './movimiento';

// ---------------------------------------------------------------- botones y campos

type BotonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'secundario' | 'peligro' | 'fantasma' | 'menta'; tam?: 'sm' | 'md' | 'lg'; cargando?: boolean; icono?: ReactNode;
};
export function Boton({ variante = 'primario', tam = 'md', cargando, icono, className, children, disabled, ...p }: BotonProps) {
  const v = {
    // `boton-primario` no tiene estilos propios: solo permite que el portal (.tema-sd, index.css) le dé su color institucional.
    primario: 'boton-primario bg-tinta-900 text-white hover:bg-tinta-700 focus-visible:ring-tinta-400',
    menta: 'bg-menta-500 text-white hover:bg-menta-600 focus-visible:ring-menta-300',
    secundario: 'bg-white text-tinta-900 ring-1 ring-inset ring-tinta-200 hover:bg-tinta-50 focus-visible:ring-tinta-300',
    peligro: 'bg-coral-500 text-white hover:bg-coral-600 focus-visible:ring-coral-100',
    fantasma: 'text-tinta-700 hover:bg-tinta-50',
  }[variante];
  const t = { sm: 'h-8 px-3 text-xs gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-12 px-6 text-base gap-2' }[tam];
  return (
    <button {...p} disabled={disabled || cargando}
      className={cls('inline-flex items-center justify-center rounded-lg font-semibold transition focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50', v, t, className)}>
      {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : icono}
      {children}
    </button>
  );
}

export function Campo({ etiqueta: et, error, ayuda, children, className }: { etiqueta: string; error?: string; ayuda?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cls('block text-sm', className)}>
      <span className="mb-1 block font-semibold text-tinta-800">{et}</span>
      {children}
      {ayuda && !error && <span className="mt-1 block text-xs text-tinta-400">{ayuda}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-coral-600">{error}</span>}
    </label>
  );
}

const base = 'w-full rounded-lg border-0 bg-white px-3 text-sm text-tinta-900 ring-1 ring-inset ring-tinta-200 placeholder:text-tinta-300 focus:ring-2 focus:ring-menta-500 disabled:bg-tinta-50';
export const Entrada = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cls(base, 'h-10', p.className)} />;
export const Selector = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cls(base, 'h-10 pr-8', p.className)} />;
export const Texto = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={cls(base, 'py-2', p.className)} />;

// ---------------------------------------------------------------- estado, tarjetas, vacíos

const TONOS = {
  gris: 'bg-tinta-100 text-tinta-600', azul: 'bg-sky-100 text-sky-800', menta: 'bg-menta-100 text-menta-800',
  ambar: 'bg-amber-100 text-amber-800', coral: 'bg-coral-100 text-coral-700', violeta: 'bg-violet-100 text-violet-800',
  verde: 'bg-emerald-100 text-emerald-800',
};
export function Estado({ valor, className }: { valor: string; className?: string }) {
  return (
    <span className={cls('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', TONOS[tono(valor)], className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{etiqueta(valor)}
    </span>
  );
}

export function Tarjeta({ titulo, accion, children, className, sub }: { titulo?: ReactNode; sub?: ReactNode; accion?: ReactNode; children: ReactNode; className?: string }) {
  return (
    // min-w-0: dentro de una cuadrícula o fila flexible, una tabla ancha se desplaza dentro de la tarjeta en vez de
    // estirar la columna (y con ella a las tarjetas vecinas) más allá de la pantalla en celular.
    <section className={cls('vidrio min-w-0 rounded-2xl bg-white p-5 shadow-suave ring-1 ring-tinta-100', className)}>
      {(titulo || accion) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>{titulo && <h2 className="font-display text-base font-bold text-tinta-900">{titulo}</h2>}{sub && <p className="text-xs text-tinta-400">{sub}</p>}</div>
          {accion}
        </header>
      )}
      {children}
    </section>
  );
}

export function Vacio({ titulo, texto, accion }: { titulo: string; texto?: string; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-tinta-50 text-tinta-400"><Inbox className="h-6 w-6" /></div>
      <p className="font-semibold text-tinta-800">{titulo}</p>
      {texto && <p className="max-w-sm text-sm text-tinta-400">{texto}</p>}
      {accion}
    </div>
  );
}

/** Carga con siluetas que anticipan la forma del contenido (lista, tabla o página completa) en lugar de un spinner. */
export function Cargando({ texto = 'Cargando…', forma = 'lista', filas }: { texto?: string; forma?: 'lista' | 'tabla' | 'pagina'; filas?: number }) {
  if (forma === 'tabla') return <EsqueletoTabla texto={texto} filas={filas} />;
  if (forma === 'pagina') return <EsqueletoPagina texto={texto} />;
  return <EsqueletoLista texto={texto} filas={filas ?? 4} />;
}

export function ErrorCaja({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl bg-coral-50 p-3 text-sm text-coral-700 ring-1 ring-coral-100">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{mensajeError(error)}</span>
    </div>
  );
}

export function Aviso({ children, tipo = 'info' }: { children: ReactNode; tipo?: 'info' | 'alerta' }) {
  return (
    <div className={cls('flex items-start gap-2 rounded-xl p-3 text-sm ring-1', tipo === 'info' ? 'bg-sky-50 text-sky-900 ring-sky-100' : 'bg-amber-50 text-amber-900 ring-amber-100')}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- tabla y paginación

export function Tabla({ columnas, children, vacia }: { columnas: ReactNode[]; children: ReactNode; vacia?: boolean }) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead><tr className="border-y border-tinta-100 bg-tinta-50/60 text-[11px] uppercase tracking-wide text-tinta-400">
          {columnas.map((c, i) => <th key={i} className="whitespace-nowrap px-5 py-2.5 font-semibold">{c}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-tinta-100">{children}</tbody>
      </table>
      {vacia && <Vacio titulo="Sin registros" texto="No hay información con los filtros actuales." />}
    </div>
  );
}
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cls('px-5 py-3 align-middle', className)}>{children}</td>;

export function Paginacion({ pagina, paginas, total, onCambio }: { pagina: number; paginas: number; total: number; onCambio: (p: number) => void }) {
  if (paginas <= 1) return <p className="mt-4 text-xs text-tinta-500">{total} registro(s)</p>;
  return (
    <div className="mt-4 flex items-center justify-between text-xs text-tinta-500">
      <span>{total} registros · página {pagina} de {paginas}</span>
      <div className="flex gap-1">
        <Boton tam="sm" variante="secundario" disabled={pagina <= 1} onClick={() => onCambio(pagina - 1)} aria-label="Anterior" icono={<ChevronLeft className="h-4 w-4" />} />
        <Boton tam="sm" variante="secundario" disabled={pagina >= paginas} onClick={() => onCambio(pagina + 1)} aria-label="Siguiente" icono={<ChevronRight className="h-4 w-4" />} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- modal

/** Bloqueo del desplazamiento del fondo mientras haya al menos un diálogo abierto (admite diálogos anidados). */
let dialogosAbiertos = 0;
function bloquearFondo() {
  if (dialogosAbiertos++ === 0) {
    const barra = window.innerWidth - document.documentElement.clientWidth; // evita el salto al ocultar la barra de desplazamiento
    document.documentElement.style.overflow = 'hidden';
    if (barra > 0) document.body.style.paddingRight = `${barra}px`;
  }
  return () => {
    if (--dialogosAbiertos === 0) { document.documentElement.style.overflow = ''; document.body.style.paddingRight = ''; }
  };
}

/**
 * Diálogo de todo el sistema.
 * - Celular: hoja que sube desde abajo, con asa, esquinas redondeadas y respeto del área segura (iPhone).
 * - Escritorio: tarjeta centrada que aparece con un leve acercamiento.
 * - El fondo no se desplaza mientras está abierto; foco atrapado, Escape y clic fuera para cerrar.
 * - Se dibuja dentro del panel activo (conserva sus colores de marca y el modo oscuro) aunque la página tenga transformaciones.
 * - `sub` (subtítulo) y `pie` (acciones fijas abajo, siempre visibles aunque el contenido sea largo) son opcionales.
 */
export function Modal({ abierto, titulo, onCerrar, children, ancho = 'max-w-lg', sub, pie }:
  { abierto: boolean; titulo: string; onCerrar: () => void; children: ReactNode; ancho?: string; sub?: ReactNode; pie?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Foco atrapado dentro del diálogo, Escape para cerrar y devolución del foco al elemento que lo abrió.
  useAtraparFoco(ref, abierto, onCerrar);
  useEffect(() => (abierto ? bloquearFondo() : undefined), [abierto]);
  const idTitulo = useId();
  if (!abierto) return null;
  const destino = (typeof document !== 'undefined' && document.querySelector('.tema-sd, .tema-lu')) || document.body;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-tinta-950/50 p-0 backdrop-blur-[3px] animate-fundido sm:items-center sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={idTitulo}
        className={cls('flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[26px] bg-white shadow-[0_-10px_50px_rgba(8,30,40,.25)] ring-1 ring-black/5 animate-hoja',
          'sm:max-h-[88vh] sm:rounded-[24px] sm:shadow-[0_30px_80px_rgba(8,30,40,.32)] sm:animate-emerger', ancho)}>
        <span className="mx-auto mt-2.5 h-1.5 w-11 shrink-0 rounded-full bg-tinta-200 sm:hidden" aria-hidden />
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-tinta-100 px-5 pb-3.5 pt-3 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            <h2 id={idTitulo} className="font-display text-lg font-bold leading-snug text-tinta-900">{titulo}</h2>
            {sub && <p className="mt-0.5 text-sm text-tinta-500">{sub}</p>}
          </div>
          <button type="button" onClick={onCerrar} className="-mr-2 -mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full text-tinta-400 transition hover:bg-tinta-50 hover:text-tinta-700" aria-label="Cerrar">
            <X className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>
        {pie && <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-tinta-100 bg-tinta-50/50 px-5 py-3.5 pb-[max(.875rem,env(safe-area-inset-bottom))] sm:px-6">{pie}</footer>}
        {!pie && <span className="block shrink-0 pb-[env(safe-area-inset-bottom)] sm:hidden" aria-hidden />}
      </div>
    </div>,
    destino,
  );
}

// ---------------------------------------------------------------- avisos emergentes

type Toast = { id: number; texto: string; tipo: 'ok' | 'error' };
const ToastCtx = createContext<(texto: string, tipo?: 'ok' | 'error') => void>(() => undefined);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Toast[]>([]);
  const avisar = useCallback((texto: string, tipo: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setLista((l) => [...l, { id, texto, tipo }]);
    setTimeout(() => setLista((l) => l.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={avisar}>
      {children}
      <div className="pointer-events-none fixed bottom-[max(1rem,calc(env(safe-area-inset-bottom)+.5rem))] right-[max(1rem,env(safe-area-inset-right))] z-[60] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
        {lista.map((t) => (
          <div key={t.id} className={cls('pointer-events-auto flex items-start gap-2 rounded-xl px-4 py-3 text-sm text-white shadow-xl', t.tipo === 'ok' ? 'bg-tinta-900' : 'bg-coral-600')}>
            {t.tipo === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-menta-300" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{t.texto}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useAviso = () => useContext(ToastCtx);

// ---------------------------------------------------------------- firma en canvas

// La captura de firma vive en su propio módulo (pantalla completa en celular).
export { default as Firma } from './Firma';

export function Cifra({ etiqueta: et, valor, detalle, icono, acento }: { etiqueta: string; valor: ReactNode; detalle?: ReactNode; icono?: ReactNode; acento?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-suave ring-1 ring-tinta-100">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-tinta-400">
        <span>{et}</span>{icono && <span className={cls('grid h-8 w-8 place-items-center rounded-xl', acento || 'bg-tinta-50 text-tinta-600')}>{icono}</span>}
      </div>
      <div className="mt-2 font-display text-2xl font-extrabold text-tinta-900">{typeof valor === 'string' || typeof valor === 'number' ? <NumeroAnimado valor={valor} /> : valor}</div>
      {detalle && <div className="mt-1 text-xs text-tinta-400">{detalle}</div>}
    </div>
  );
}
