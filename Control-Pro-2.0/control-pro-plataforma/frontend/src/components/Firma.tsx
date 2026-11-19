/**
 * Captura de firma (trazabilidad de la entrega al empleado).
 *
 * - Escritorio: lienzo en la página.
 * - Celular o tableta táctil: un recuadro "Toca para firmar" abre la firma en PANTALLA COMPLETA (más espacio, trazo más
 *   cómodo; si se gira el teléfono el lienzo se adapta sin perder lo firmado).
 * - El trazo se guarda como puntos normalizados (0–1): se redibuja igual al cambiar el tamaño o la orientación, se suaviza
 *   con curvas y su grosor varía con la velocidad, como una pluma.
 * - El PNG que se envía se recorta al área firmada y se reduce (≤ 900 px de ancho): tinta azul marino sobre fondo
 *   transparente, ligera y nítida en el comprobante impreso.
 * - Siempre se ve como papel claro, también en modo oscuro.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eraser, Maximize2, PenLine, RotateCcw, Smartphone, X } from 'lucide-react';
import { useAtraparFoco } from './useAtraparFoco';

type Punto = { x: number; y: number; t: number };
type Trazo = Punto[];
const TINTA = '#0F2238';
const PAPEL = '#fbfaf6';

function dibujar(canvas: HTMLCanvasElement, trazos: Trazo[]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height, escala = Math.min(w, h * 3) / 560;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = TINTA; ctx.fillStyle = TINTA; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const t of trazos) {
    if (t.length === 1) { ctx.beginPath(); ctx.arc(t[0].x * w, t[0].y * h, 1.6 * escala, 0, Math.PI * 2); ctx.fill(); continue; }
    for (let i = 1; i < t.length; i++) {
      const a = t[i - 1], b = t[i];
      const dist = Math.hypot((b.x - a.x) * w, (b.y - a.y) * h);
      const vel = dist / Math.max(1, b.t - a.t); // px/ms
      ctx.lineWidth = Math.max(1.3, Math.min(3.4, 3.6 - vel * 0.9)) * escala;
      const c = i > 1 ? t[i - 2] : a;
      ctx.beginPath();
      // Curva suave entre puntos medios (evita los quiebres de las líneas rectas)
      ctx.moveTo(((c.x + a.x) / 2) * w, ((c.y + a.y) / 2) * h);
      ctx.quadraticCurveTo(a.x * w, a.y * h, ((a.x + b.x) / 2) * w, ((a.y + b.y) / 2) * h);
      ctx.stroke();
    }
  }
}

/** PNG recortado al área firmada, con margen, máximo 900 px de ancho. */
function exportar(trazos: Trazo[], aspecto: number): string | null {
  const pts = trazos.flat();
  if (pts.length < 2) return null;
  const base = 1200;
  const W = base, H = base / aspecto;
  let x0 = Math.min(...pts.map((p) => p.x)) * W, x1 = Math.max(...pts.map((p) => p.x)) * W;
  let y0 = Math.min(...pts.map((p) => p.y)) * H, y1 = Math.max(...pts.map((p) => p.y)) * H;
  const m = 18; x0 -= m; y0 -= m; x1 += m; y1 += m;
  const completo = document.createElement('canvas');
  completo.width = W; completo.height = H;
  dibujar(completo, trazos);
  const ancho = Math.max(1, x1 - x0), alto = Math.max(1, y1 - y0);
  const f = Math.min(1, 900 / ancho);
  const salida = document.createElement('canvas');
  salida.width = Math.round(ancho * f); salida.height = Math.round(alto * f);
  salida.getContext('2d')!.drawImage(completo, x0, y0, ancho, alto, 0, 0, salida.width, salida.height);
  return salida.toDataURL('image/png');
}

/** Lienzo que ocupa su contenedor, nítido en pantallas de alta densidad. */
function Lienzo({ trazos, onTrazos, alto, etiqueta }: { trazos: Trazo[]; onTrazos: (t: Trazo[]) => void; alto?: string; etiqueta: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const actual = useRef<Trazo | null>(null);
  const lista = useRef(trazos);
  lista.current = trazos;

  const ajustar = useCallback(() => {
    const c = ref.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    c.width = Math.max(1, Math.round(r.width * dpr)); c.height = Math.max(1, Math.round(r.height * dpr));
    dibujar(c, lista.current);
  }, []);
  useEffect(() => {
    ajustar();
    const obs = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(ajustar) : null;
    if (ref.current && obs) obs.observe(ref.current);
    return () => obs?.disconnect();
  }, [ajustar]);
  useEffect(() => { if (ref.current) dibujar(ref.current, trazos); }, [trazos]);

  const punto = (e: React.PointerEvent<HTMLCanvasElement>): Punto => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, t: e.timeStamp };
  };
  return (
    <canvas ref={ref} aria-label={etiqueta} role="img"
      className={`block w-full touch-none select-none ${alto ?? 'h-full'}`}
      onPointerDown={(e) => { e.preventDefault(); ref.current!.setPointerCapture(e.pointerId); actual.current = [punto(e)]; onTrazos([...lista.current, actual.current]); }}
      onPointerMove={(e) => {
        if (!actual.current) return;
        const eventos = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [];
        const nuevos = eventos.length ? eventos.map((x) => { const r = ref.current!.getBoundingClientRect(); return { x: (x.clientX - r.left) / r.width, y: (x.clientY - r.top) / r.height, t: x.timeStamp }; }) : [punto(e)];
        actual.current.push(...nuevos);
        onTrazos([...lista.current.slice(0, -1), [...actual.current]]);
      }}
      onPointerUp={() => { actual.current = null; }} onPointerCancel={() => { actual.current = null; }} />
  );
}

const usarPantallaCompleta = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse) and (max-width: 1023px)').matches;

function PantallaCompleta({ inicial, onListo, onCancelar, titulo }: { inicial: Trazo[]; onListo: (t: Trazo[], aspecto: number) => void; onCancelar: () => void; titulo: string }) {
  const [trazos, setTrazos] = useState<Trazo[]>(inicial);
  const caja = useRef<HTMLDivElement>(null);
  const dialogo = useRef<HTMLDivElement>(null);
  const [vertical, setVertical] = useState(() => window.innerHeight > window.innerWidth);
  useAtraparFoco(dialogo, true, onCancelar);
  useEffect(() => {
    const previo = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const girar = () => setVertical(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', girar);
    return () => { document.documentElement.style.overflow = previo; window.removeEventListener('resize', girar); };
  }, []);
  const aspecto = () => { const r = caja.current?.getBoundingClientRect(); return r && r.height ? r.width / r.height : 3; };
  return createPortal(
    <div ref={dialogo} role="dialog" aria-modal="true" aria-label={titulo} className="fixed inset-0 z-[80] flex flex-col bg-[#eceae3] text-[#0F2238] animate-fundido">
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-[max(.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onCancelar} className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold hover:bg-black/5"><X className="h-5 w-5" aria-hidden />Cancelar</button>
        <p className="truncate font-display text-base font-bold">{titulo}</p>
        <button type="button" disabled={!trazos.length} onClick={() => setTrazos(trazos.slice(0, -1))} className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold hover:bg-black/5 disabled:opacity-40">
          <RotateCcw className="h-4 w-4" aria-hidden />Deshacer</button>
      </div>
      {vertical && <p className="mx-4 mb-2 flex items-center justify-center gap-2 rounded-xl bg-black/5 px-3 py-2 text-xs font-semibold"><Smartphone className="h-4 w-4 rotate-90" aria-hidden />Gira el teléfono para tener más espacio</p>}
      <div ref={caja} className="relative mx-3 min-h-0 flex-1 overflow-hidden rounded-2xl shadow-inner ring-1 ring-black/10" style={{ background: PAPEL }}>
        <Lienzo trazos={trazos} onTrazos={setTrazos} etiqueta="Área de firma en pantalla completa" />
        <div className="pointer-events-none absolute inset-x-[8%] bottom-[22%] border-b-2 border-dashed border-[#0F2238]/25" aria-hidden />
        <span className="pointer-events-none absolute bottom-[calc(22%-1.6rem)] left-[8%] text-xs font-semibold text-[#0F2238]/45" aria-hidden>✕ Firme sobre la línea</span>
        {!trazos.length && <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm font-semibold text-[#0F2238]/35">Firme aquí con el dedo</p>}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-[max(.9rem,env(safe-area-inset-bottom))] pt-3">
        <button type="button" disabled={!trazos.length} onClick={() => setTrazos([])} className="flex min-h-12 items-center gap-2 rounded-full px-4 text-sm font-semibold hover:bg-black/5 disabled:opacity-40"><Eraser className="h-4 w-4" aria-hidden />Borrar</button>
        <button type="button" disabled={!trazos.flat().length || trazos.flat().length < 2} onClick={() => onListo(trazos, aspecto())}
          className="min-h-12 flex-1 rounded-full bg-[#0F2238] px-6 text-base font-bold text-white shadow-lg transition hover:bg-[#1D3049] disabled:opacity-40 sm:flex-none">Listo</button>
      </div>
    </div>,
    document.body,
  );
}

export default function Firma({ onCambio, titulo = 'Firma' }: { onCambio: (dataUrl: string | null) => void; titulo?: string }) {
  const [trazos, setTrazos] = useState<Trazo[]>([]);
  const [completa, setCompleta] = useState(false);
  const [vista, setVista] = useState<string | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const tactil = usarPantallaCompleta();
  const aspectoLocal = () => { const r = caja.current?.getBoundingClientRect(); return r && r.height ? r.width / r.height : 3; };

  // En escritorio la firma se envía al soltar cada trazo.
  const alCambiar = (t: Trazo[]) => {
    setTrazos(t);
    if (!t.length) { onCambio(null); setVista(null); }
  };
  // Escritorio: la imagen se genera poco después del último trazo (no en cada movimiento del puntero).
  const avisar = useRef(onCambio);
  avisar.current = onCambio;
  useEffect(() => {
    if (tactil || !trazos.length) return;
    const t = window.setTimeout(() => avisar.current(exportar(trazos, aspectoLocal())), 220);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trazos, tactil]);

  if (tactil) {
    return (
      <div>
        <button type="button" onClick={() => setCompleta(true)}
          className="relative grid h-40 w-full place-items-center overflow-hidden rounded-xl border-2 border-dashed border-tinta-200 text-[#0F2238]" style={{ background: PAPEL }}>
          {vista ? <img src={vista} alt="Firma capturada" className="max-h-32 max-w-[90%] object-contain" />
            : <span className="flex flex-col items-center gap-1.5 text-sm font-semibold text-[#0F2238]/60"><PenLine className="h-6 w-6" aria-hidden />Toca para firmar en pantalla completa</span>}
          {vista && <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-[#0F2238]/80 px-2.5 py-1 text-[11px] font-bold text-white"><Maximize2 className="h-3 w-3" aria-hidden />Volver a firmar</span>}
        </button>
        <div className="mt-1 flex justify-between gap-3 text-xs text-tinta-400">
          <span>Firma con el dedo. Es una firma simple, no una firma electrónica avanzada.</span>
          {vista && <button type="button" onClick={() => { setTrazos([]); setVista(null); onCambio(null); }} className="shrink-0 font-semibold text-tinta-600 hover:underline">Borrar</button>}
        </div>
        {completa && <PantallaCompleta titulo={titulo} inicial={trazos} onCancelar={() => setCompleta(false)}
          onListo={(t, aspecto) => { const png = exportar(t, aspecto); setTrazos(t); setVista(png); onCambio(png); setCompleta(false); }} />}
      </div>
    );
  }
  return (
    <div>
      <div ref={caja} className="relative h-40 overflow-hidden rounded-xl border-2 border-dashed border-tinta-200" style={{ background: PAPEL }}>
        <Lienzo trazos={trazos} onTrazos={alCambiar} etiqueta="Área de firma" />
        <div className="pointer-events-none absolute inset-x-[8%] bottom-[24%] border-b-2 border-dashed border-[#0F2238]/20" aria-hidden />
        {!trazos.length && <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm font-semibold text-[#0F2238]/35">Firme aquí con el mouse o el dedo</p>}
      </div>
      <div className="mt-1 flex justify-between gap-3 text-xs text-tinta-400">
        <span>Es una firma simple, no una firma electrónica avanzada.</span>
        <span className="flex shrink-0 gap-3">
          <button type="button" disabled={!trazos.length} onClick={() => alCambiar(trazos.slice(0, -1))} className="font-semibold text-tinta-600 hover:underline disabled:opacity-40">Deshacer</button>
          <button type="button" disabled={!trazos.length} onClick={() => alCambiar([])} className="font-semibold text-tinta-600 hover:underline disabled:opacity-40">Borrar</button>
        </span>
      </div>
    </div>
  );
}
