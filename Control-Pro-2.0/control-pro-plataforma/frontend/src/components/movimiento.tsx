/**
 * Animaciones de la interfaz. Todas comunican un cambio de estado o un avance del proceso y respetan
 * `prefers-reduced-motion` (ver index.css y `reducirMovimiento`).
 */
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { cls } from '../lib/formato';

export function reducirMovimiento() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Entrada suave; `orden` escalona la aparición de elementos de una lista. */
export function Aparecer({ children, orden = 0, className, como = 'div' }: { children: ReactNode; orden?: number; className?: string; como?: 'div' | 'li' }) {
  const Etiqueta = como;
  return <Etiqueta className={cls('animate-aparecer', className)} style={{ animationDelay: `${Math.min(orden, 12) * 45}ms` }}>{children}</Etiqueta>;
}

/** Número que cuenta hacia arriba hasta su valor. */
export function Contador({ valor, duracion = 700 }: { valor: number; duracion?: number }) {
  const [mostrado, setMostrado] = useState(reducirMovimiento() ? valor : 0);
  const previo = useRef(0);
  useEffect(() => {
    if (reducirMovimiento()) { setMostrado(valor); return; }
    const desde = previo.current;
    const inicio = performance.now();
    let id = 0;
    const paso = (t: number) => {
      const avance = Math.min(1, (t - inicio) / duracion);
      setMostrado(Math.round(desde + (valor - desde) * (1 - Math.pow(1 - avance, 3))));
      if (avance < 1) id = requestAnimationFrame(paso);
      else previo.current = valor;
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [valor, duracion]);
  return <>{mostrado}</>;
}

/** Palomita que se dibuja: confirma que una acción quedó registrada. */
export function Palomita({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 52 52" className={cls('h-12 w-12', className)} aria-hidden>
      <circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="151" strokeDashoffset="151" className="animate-trazo" />
      <path d="M15 27 l7 7 l15 -16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="40" strokeDashoffset="40" className="animate-trazo" style={{ animationDelay: '.45s' }} />
    </svg>
  );
}

/** Silueta de carga con brillo (en lugar de un spinner). */
export function Esqueleto({ className }: { className?: string }) {
  return <div className={cls('animate-brillo rounded-xl bg-[linear-gradient(90deg,#EDE7DC_0%,#F7F4EF_50%,#EDE7DC_100%)] bg-[length:200%_100%]', className)} aria-hidden />;
}

export function EsqueletoLista({ filas = 4 }: { filas?: number }) {
  return <div className="space-y-3" aria-label="Cargando" role="status">{Array.from({ length: filas }, (_, i) => <Esqueleto key={i} className="h-16" />)}</div>;
}

export type Etapa = { clave: string; titulo: string; detalle?: ReactNode; estado: 'hecha' | 'actual' | 'pendiente' | 'alerta' };

/** Línea de un proceso: se llena en secuencia y la etapa actual late suavemente. */
export function LineaProceso({ etapas, compacta = false }: { etapas: Etapa[]; compacta?: boolean }) {
  const hechas = etapas.filter((e) => e.estado === 'hecha').length;
  const actual = etapas.findIndex((e) => e.estado === 'actual' || e.estado === 'alerta');
  const progreso = (Math.max(hechas, actual === -1 ? hechas : actual) / Math.max(1, etapas.length - 1)) * 100;
  return (
    <div className="relative">
      <div className={cls('absolute left-4 right-4 h-1 rounded-full bg-arena-200', compacta ? 'top-3' : 'top-4')} aria-hidden>
        <div className="h-full origin-left animate-crecer rounded-full bg-menta-500" style={{ width: `${Math.min(100, progreso)}%` }} />
      </div>
      <ol className="relative grid gap-2" style={{ gridTemplateColumns: `repeat(${etapas.length}, minmax(0, 1fr))` }}>
        {etapas.map((e, i) => (
          <li key={e.clave} className="flex flex-col items-center text-center" aria-current={e.estado === 'actual' ? 'step' : undefined}>
            <span className={cls('grid place-items-center rounded-full ring-4 ring-white transition-colors duration-500', compacta ? 'h-7 w-7 text-[11px]' : 'h-9 w-9 text-xs',
              e.estado === 'hecha' && 'bg-menta-500 text-white', e.estado === 'actual' && 'animate-latido bg-tinta-900 text-white',
              e.estado === 'alerta' && 'bg-coral-500 text-white', e.estado === 'pendiente' && 'bg-arena-200 text-tinta-400')}
              style={{ animationDelay: e.estado === 'actual' ? `${i * 120}ms` : undefined }}>
              {e.estado === 'hecha' ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span className={cls('mt-2 font-semibold leading-tight', compacta ? 'text-[11px]' : 'text-xs', e.estado === 'pendiente' ? 'text-tinta-400' : 'text-tinta-800')}>{e.titulo}</span>
            {e.detalle && !compacta && <span className="mt-0.5 text-[11px] leading-tight text-tinta-400">{e.detalle}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Hace "volar" una miniatura desde un elemento hacia otro (por ejemplo, de un producto a la tarjeta del empleado). */
export function volarHacia(origen: Element | null, destino: Element | null, imagen?: string | null) {
  if (!origen || !destino || reducirMovimiento() || typeof document === 'undefined') return;
  const a = origen.getBoundingClientRect();
  const b = destino.getBoundingClientRect();
  const nodo = document.createElement('div');
  const tam = 56;
  Object.assign(nodo.style, {
    position: 'fixed', left: `${a.left + a.width / 2 - tam / 2}px`, top: `${a.top + a.height / 2 - tam / 2}px`, width: `${tam}px`, height: `${tam}px`,
    borderRadius: '14px', zIndex: '80', pointerEvents: 'none', boxShadow: '0 10px 30px -8px rgba(15,34,56,.45)',
    background: imagen ? `#fff url("${imagen}") center/cover` : '#0F9F94',
  });
  document.body.appendChild(nodo);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const anim = nodo.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(.8)`, opacity: 1, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(.25)`, opacity: 0.2 },
  ], { duration: 650, easing: 'cubic-bezier(.5,0,.2,1)' });
  anim.onfinish = () => {
    nodo.remove();
    destino.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 300 });
  };
}

/** Contenedor que reanima su contenido cuando cambia `clave` (transición entre pasos o páginas). */
export function Transicion({ clave, children, className, lateral = false }: { clave: string; children: ReactNode; className?: string; lateral?: boolean }) {
  return <div key={clave} className={cls(lateral ? 'animate-deslizar' : 'animate-aparecer', className)}>{children}</div>;
}

