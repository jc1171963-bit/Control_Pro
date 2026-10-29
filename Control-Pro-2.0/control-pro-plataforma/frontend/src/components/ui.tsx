import { ButtonHTMLAttributes, createContext, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes,
  useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, Loader2, X } from 'lucide-react';
import { cls, etiqueta, mensajeError, tono } from '../lib/formato';

// ---------------------------------------------------------------- botones y campos

type BotonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: 'primario' | 'secundario' | 'peligro' | 'fantasma' | 'menta'; tam?: 'sm' | 'md' | 'lg'; cargando?: boolean; icono?: ReactNode;
};
export function Boton({ variante = 'primario', tam = 'md', cargando, icono, className, children, disabled, ...p }: BotonProps) {
  const v = {
    primario: 'bg-tinta-900 text-white hover:bg-tinta-700 focus-visible:ring-tinta-400',
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
    <section className={cls('rounded-2xl bg-white p-5 shadow-suave ring-1 ring-tinta-100', className)}>
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

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-sm text-tinta-400"><Loader2 className="h-5 w-5 animate-spin" />{texto}</div>;
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
  if (paginas <= 1) return <p className="mt-4 text-xs text-tinta-400">{total} registro(s)</p>;
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

export function Modal({ abierto, titulo, onCerrar, children, ancho = 'max-w-lg' }: { abierto: boolean; titulo: string; onCerrar: () => void; children: ReactNode; ancho?: string }) {
  useEffect(() => {
    if (!abierto) return;
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [abierto, onCerrar]);
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-tinta-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className={cls('max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl', ancho)}>
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-tinta-100 bg-white px-5 py-4">
          <h2 className="font-display text-lg font-bold text-tinta-900">{titulo}</h2>
          <button onClick={onCerrar} className="rounded-lg p-1.5 text-tinta-400 hover:bg-tinta-50" aria-label="Cerrar"><X className="h-5 w-5" /></button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
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
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
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

export function Firma({ onCambio }: { onCambio: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const tinta = useRef(false);
  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return [((e.clientX - r.left) * c.width) / r.width, ((e.clientY - r.top) * c.height) / r.height] as const;
  };
  const inicio = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = ref.current!.getContext('2d')!;
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.strokeStyle = '#0F2238';
    dibujando.current = true;
    ref.current!.setPointerCapture(e.pointerId);
    const [x, y] = punto(e);
    ctx.beginPath(); ctx.moveTo(x, y);
  };
  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujando.current) return;
    const ctx = ref.current!.getContext('2d')!;
    const [x, y] = punto(e);
    ctx.lineTo(x, y); ctx.stroke();
    tinta.current = true;
  };
  const fin = () => {
    if (!dibujando.current) return;
    dibujando.current = false;
    onCambio(tinta.current ? ref.current!.toDataURL('image/png') : null);
  };
  const limpiar = () => {
    const c = ref.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    tinta.current = false;
    onCambio(null);
  };
  return (
    <div>
      <canvas ref={ref} width={560} height={180} onPointerDown={inicio} onPointerMove={mover} onPointerUp={fin} onPointerLeave={fin}
        className="h-40 w-full touch-none rounded-xl border-2 border-dashed border-tinta-200 bg-arena-50" aria-label="Área de firma" />
      <div className="mt-1 flex justify-between text-xs text-tinta-400">
        <span>Firma con el dedo o el mouse. Es una firma simple, no una firma electrónica avanzada.</span>
        <button type="button" onClick={limpiar} className="font-semibold text-tinta-600 hover:underline">Borrar</button>
      </div>
    </div>
  );
}

export function Cifra({ etiqueta: et, valor, detalle, icono, acento }: { etiqueta: string; valor: ReactNode; detalle?: ReactNode; icono?: ReactNode; acento?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-suave ring-1 ring-tinta-100">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-tinta-400">
        <span>{et}</span>{icono && <span className={cls('grid h-8 w-8 place-items-center rounded-xl', acento || 'bg-tinta-50 text-tinta-600')}>{icono}</span>}
      </div>
      <div className="mt-2 font-display text-2xl font-extrabold text-tinta-900">{valor}</div>
      {detalle && <div className="mt-1 text-xs text-tinta-400">{detalle}</div>}
    </div>
  );
}
