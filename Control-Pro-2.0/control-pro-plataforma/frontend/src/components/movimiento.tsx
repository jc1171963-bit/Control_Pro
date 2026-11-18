/**
 * Animaciones de la interfaz. Todas comunican un cambio de estado o un avance del proceso y respetan
 * `prefers-reduced-motion` (ver index.css y `reducirMovimiento`).
 */
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { cls } from '../lib/formato';
import { fotoIlustrativa } from '../lib/fotosIlustrativas';

export function reducirMovimiento() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Entrada suave; `orden` escalona la aparición de elementos de una lista. */
export function Aparecer({ children, orden = 0, className, como = 'div' }: { children: ReactNode; orden?: number; className?: string; como?: 'div' | 'li' }) {
  const Etiqueta = como;
  return <Etiqueta className={cls('animate-aparecer', className)} style={{ animationDelay: `${Math.min(orden, 12) * 45}ms` }}>{children}</Etiqueta>;
}

/** Número que cuenta hacia arriba hasta su valor (atajo de NumeroAnimado para enteros). */
export function Contador({ valor, duracion = 900 }: { valor: number; duracion?: number }) {
  return <NumeroAnimado valor={valor} duracion={duracion} />;
}

// Partes de un texto con cifras: "$228,860.00" → ["$", 228860 (2 decimales, con comas), ""]; "11.3 h", "94.4 %", "6 / 54".
type Parte = string | { n: number; decimales: number; miles: boolean };
const CIFRA = /\d[\d,]*(?:\.\d+)?/g;
function partes(texto: string): Parte[] {
  const out: Parte[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(CIFRA)) {
    const crudo = m[0];
    if (m.index! > ultimo) out.push(texto.slice(ultimo, m.index));
    const dec = crudo.includes('.') ? crudo.split('.')[1].length : 0;
    out.push({ n: Number(crudo.replace(/,/g, '')), decimales: dec, miles: crudo.includes(',') });
    ultimo = m.index! + crudo.length;
  }
  if (ultimo < texto.length) out.push(texto.slice(ultimo));
  return out;
}
const formatoCifra = (n: number, p: { decimales: number; miles: boolean }) =>
  n.toLocaleString('en-US', { minimumFractionDigits: p.decimales, maximumFractionDigits: p.decimales, useGrouping: p.miles });

/**
 * Cifra que sube animada hasta su valor la primera vez que aparece en pantalla y, después, desde el valor anterior
 * cuando cambia. Conserva el formato del texto (moneda, decimales, separador de miles, unidades como "h" o "%").
 * El lector de pantalla recibe solo el valor final; sin IntersectionObserver o con "reducir movimiento" se muestra
 * el valor final de inmediato.
 */
export function NumeroAnimado({ valor, duracion = 900, className }: { valor: string | number; duracion?: number; className?: string }) {
  const texto = typeof valor === 'number' ? valor.toLocaleString('en-US') : valor;
  const objetivo = partes(texto);
  const cifras = objetivo.filter((p): p is Exclude<Parte, string> => typeof p !== 'string');
  const animable = cifras.length > 0 && typeof window !== 'undefined' && 'IntersectionObserver' in window && !reducirMovimiento();
  const ref = useRef<HTMLSpanElement>(null);
  const previos = useRef<number[] | null>(null);
  const [actuales, setActuales] = useState<number[]>(() => (animable ? cifras.map(() => 0) : cifras.map((c) => c.n)));
  const clave = cifras.map((c) => c.n).join('|');

  useEffect(() => {
    if (!animable) { setActuales(cifras.map((c) => c.n)); return; }
    const el = ref.current;
    let id = 0;
    let obs: IntersectionObserver | null = null;
    const animar = () => {
      const desde = previos.current ?? cifras.map(() => 0);
      const hasta = cifras.map((c) => c.n);
      const inicio = performance.now();
      const paso = (t: number) => {
        const a = Math.min(1, (t - inicio) / duracion);
        const e = 1 - Math.pow(1 - a, 4); // desacelera al llegar
        setActuales(hasta.map((h, i) => (desde[i] ?? 0) + (h - (desde[i] ?? 0)) * e));
        if (a < 1) id = requestAnimationFrame(paso); else previos.current = hasta;
      };
      id = requestAnimationFrame(paso);
    };
    if (previos.current) animar(); // ya se vio: anima el cambio de inmediato
    else if (el) {
      obs = new IntersectionObserver((entradas) => { if (entradas.some((x) => x.isIntersecting)) { obs?.disconnect(); animar(); } }, { threshold: 0.3 });
      obs.observe(el);
    }
    return () => { cancelAnimationFrame(id); obs?.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, animable, duracion]);

  let i = 0;
  const visible = objetivo.map((p) => (typeof p === 'string' ? p : formatoCifra(p.decimales ? actuales[i++] ?? p.n : Math.round(actuales[i++] ?? p.n), p))).join('');
  // Mientras cuenta, el lector de pantalla oye solo el valor final; al terminar queda un único texto.
  return (
    <span ref={ref} className={cls('tabular-nums', className)}>
      {visible === texto ? texto : <><span aria-hidden>{visible}</span><span className="sr-only">{texto}</span></>}
    </span>
  );
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

/** Silueta de carga con brillo (en lugar de un spinner). Los colores dependen del tema (clase .esqueleto en index.css). */
export function Esqueleto({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cls('esqueleto animate-brillo', !/\brounded/.test(className ?? '') && 'rounded-xl', className)} style={style} aria-hidden />;
}

/** Contenedor accesible: anuncia la carga una vez y oculta las siluetas a los lectores de pantalla. */
function ContenedorCarga({ texto, children, className }: { texto: string; children: ReactNode; className?: string }) {
  return <div role="status" aria-live="polite" className={className}><span className="sr-only">{texto}</span>{children}</div>;
}

/** Fila de lista: ícono, dos líneas de texto de distinto largo y una etiqueta de estado. */
function FilaEsqueleto({ i }: { i: number }) {
  const largo = ['w-2/5', 'w-1/3', 'w-1/2', 'w-[45%]'][i % 4];
  return (
    <div className="flex items-center gap-3 py-3">
      <Esqueleto className="h-10 w-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2"><Esqueleto className={cls('h-3.5 rounded-md', largo)} /><Esqueleto className="h-3 w-1/4 rounded-md opacity-70" /></div>
      <Esqueleto className="hidden h-6 w-20 shrink-0 rounded-full sm:block" />
    </div>
  );
}

export function EsqueletoLista({ filas = 4, texto = 'Cargando…' }: { filas?: number; texto?: string }) {
  return <ContenedorCarga texto={texto} className="divide-y divide-tinta-100">{Array.from({ length: filas }, (_, i) => <FilaEsqueleto key={i} i={i} />)}</ContenedorCarga>;
}

/** Tabla: encabezado y filas con celdas de anchos variados. */
export function EsqueletoTabla({ filas = 6, columnas = 6, texto = 'Cargando…' }: { filas?: number; columnas?: number; texto?: string }) {
  const anchos = ['w-3/4', 'w-1/2', 'w-2/3', 'w-2/5', 'w-1/3', 'w-3/5'];
  return (
    <ContenedorCarga texto={texto} className="-mx-5 overflow-hidden">
      <div className="flex gap-6 border-y border-tinta-100 bg-tinta-50/60 px-5 py-3">{Array.from({ length: columnas }, (_, c) => <Esqueleto key={c} className="h-2.5 flex-1 rounded opacity-70" />)}</div>
      {Array.from({ length: filas }, (_, f) => (
        <div key={f} className="flex items-center gap-6 border-b border-tinta-100 px-5 py-4 last:border-0">
          {Array.from({ length: columnas }, (_, c) => <div key={c} className="flex-1"><Esqueleto className={cls('h-3.5 rounded-md', anchos[(f + c) % anchos.length])} /></div>)}
        </div>
      ))}
    </ContenedorCarga>
  );
}

/** Página completa (rutas que se cargan y detalles): título, cifras y dos bloques de contenido. */
export function EsqueletoPagina({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <ContenedorCarga texto={texto} className="space-y-5 py-2">
      <div className="space-y-2.5"><Esqueleto className="h-8 w-64 max-w-[70%] rounded-lg" /><Esqueleto className="h-3.5 w-80 max-w-[85%] rounded-md opacity-70" /></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Esqueleto key={i} className="h-24 rounded-2xl" />)}</div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-1 rounded-2xl p-1 lg:col-span-2">{Array.from({ length: 5 }, (_, i) => <FilaEsqueleto key={i} i={i} />)}</div>
        <Esqueleto className="h-64 rounded-2xl" />
      </div>
    </ContenedorCarga>
  );
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
  imagen = fotoIlustrativa(imagen) ?? imagen; // misma imagen que muestra ImagenProducto
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

