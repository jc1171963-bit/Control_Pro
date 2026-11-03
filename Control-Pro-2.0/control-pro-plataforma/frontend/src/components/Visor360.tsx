/**
 * Visor 360° a partir de una secuencia de fotos (la prenda fotografiada sobre una base giratoria).
 * - Arrastrar con mouse o dedo gira la prenda, con inercia al soltar; el desplazamiento vertical de la página sigue funcionando.
 * - Gira solo al cargar hasta que la persona interactúa (no gira si el sistema pide reducir movimiento).
 * - Flechas del teclado para girar, zoom con paneo y pantalla completa.
 */
import { KeyboardEvent, PointerEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Pause, Play, Rotate3d, ZoomIn, ZoomOut } from 'lucide-react';
import { cls } from '../lib/formato';

const PASO_AUTO_MS = 90;
const FRICCION = 0.94;

export default function Visor360({ frames, alt, compacto = false }: { frames: string[]; alt: string; compacto?: boolean }) {
  const total = frames.length;
  const caja = useRef<HTMLDivElement>(null);
  const [indice, setIndice] = useState(0);
  const [cargadas, setCargadas] = useState(0);
  const [girando, setGirando] = useState(() => !reducirMovimiento());
  const [tocado, setTocado] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [origen, setOrigen] = useState('50% 50%');
  const [completa, setCompleta] = useState(false);
  const arrastre = useRef<{ x: number; inicio: number; ultimoX: number; ultimoT: number; vel: number } | null>(null);
  const inercia = useRef<number>();

  const listo = cargadas >= total;
  const mover = useCallback((n: number) => setIndice((i) => (((i + n) % total) + total) % total), [total]);

  // Precarga de todos los cuadros: el giro solo es fluido si ya están en memoria.
  useEffect(() => {
    setIndice(0);
    setCargadas(0);
    let vivo = true;
    const imgs = frames.map((src) => {
      const im = new Image();
      im.onload = im.onerror = () => vivo && setCargadas((c) => c + 1);
      im.src = src;
      return im;
    });
    return () => { vivo = false; imgs.forEach((im) => { im.onload = im.onerror = null; }); };
  }, [frames]);

  useEffect(() => {
    if (!girando || !listo || zoom) return;
    const t = window.setInterval(() => mover(1), PASO_AUTO_MS);
    return () => window.clearInterval(t);
  }, [girando, listo, zoom, mover]);

  useEffect(() => () => cancelAnimationFrame(inercia.current!), []);

  useEffect(() => {
    const cambio = () => setCompleta(document.fullscreenElement === caja.current);
    document.addEventListener('fullscreenchange', cambio);
    return () => document.removeEventListener('fullscreenchange', cambio);
  }, []);

  const interactuar = () => { setGirando(false); setTocado(true); cancelAnimationFrame(inercia.current!); };

  // Una pasada horizontal completa por el visor equivale aproximadamente a una vuelta.
  const pxPorCuadro = () => Math.max(4, (caja.current?.clientWidth || 400) / total);

  const abajo = (e: PointerEvent<HTMLDivElement>) => {
    if (!listo || e.button !== 0) return;
    interactuar();
    if (zoom) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = { x: e.clientX, inicio: indice, ultimoX: e.clientX, ultimoT: performance.now(), vel: 0 };
  };

  const moverPuntero = (e: PointerEvent<HTMLDivElement>) => {
    if (zoom) {
      const r = e.currentTarget.getBoundingClientRect();
      setOrigen(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
      return;
    }
    const a = arrastre.current;
    if (!a) return;
    const ahora = performance.now();
    a.vel = (e.clientX - a.ultimoX) / Math.max(1, ahora - a.ultimoT);
    a.ultimoX = e.clientX;
    a.ultimoT = ahora;
    const n = Math.round((a.x - e.clientX) / pxPorCuadro());
    setIndice((((a.inicio + n) % total) + total) % total);
  };

  const arriba = () => {
    const a = arrastre.current;
    arrastre.current = null;
    if (!a || Math.abs(a.vel) < 0.15 || reducirMovimiento()) return;
    // Inercia: sigue girando y frena poco a poco.
    let vel = -a.vel / pxPorCuadro() * 16;
    let acumulado = 0;
    const paso = () => {
      acumulado += vel;
      const n = Math.trunc(acumulado);
      if (n) { mover(n); acumulado -= n; }
      vel *= FRICCION;
      if (Math.abs(vel) > 0.05) inercia.current = requestAnimationFrame(paso);
    };
    inercia.current = requestAnimationFrame(paso);
  };

  const teclado = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      interactuar();
      mover(e.key === 'ArrowRight' ? 1 : -1);
    }
  };

  const pantallaCompleta = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else caja.current?.requestFullscreen?.();
  };

  const grados = Math.round((indice / total) * 360);
  return (
    <div ref={caja} className={cls('group relative h-full w-full select-none overflow-hidden bg-white', completa && 'grid place-items-center')}>
      <div
        role="slider" tabIndex={0} aria-label={`Vista 360° de ${alt}. Usa las flechas para girar.`}
        aria-valuemin={0} aria-valuemax={359} aria-valuenow={grados} aria-valuetext={`${grados} grados`}
        onPointerDown={abajo} onPointerMove={moverPuntero} onPointerUp={arriba} onPointerCancel={arriba}
        onPointerLeave={() => zoom && setOrigen('50% 50%')} onKeyDown={teclado}
        className={cls('relative h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-menta-500',
          zoom ? 'cursor-zoom-out' : listo ? 'cursor-grab active:cursor-grabbing' : 'cursor-progress', completa && 'aspect-square max-h-screen')}
        style={{ touchAction: zoom ? 'none' : 'pan-y' }}
        onDoubleClick={() => { interactuar(); setZoom((z) => !z); }}
      >
        {frames.map((src, i) => (
          <img key={src + i} src={src} alt={i === indice ? alt : ''} aria-hidden={i !== indice} draggable={false}
            className={cls('pointer-events-none absolute inset-0 h-full w-full object-contain transition-transform duration-200', i === indice ? 'opacity-100' : 'opacity-0')}
            style={{ transform: zoom ? 'scale(2.2)' : undefined, transformOrigin: origen }} />
        ))}
      </div>

      {!listo && (
        <div className="pointer-events-none absolute inset-x-6 bottom-6">
          <div className="h-1 overflow-hidden rounded-full bg-tinta-100"><div className="h-full rounded-full bg-menta-500 transition-all" style={{ width: `${(cargadas / total) * 100}%` }} /></div>
          <p className="mt-2 text-center text-xs font-semibold text-tinta-500">Preparando vista 360° · {cargadas}/{total}</p>
        </div>
      )}

      {listo && !tocado && !compacto && (
        <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center">
          <span className="flex items-center gap-2 rounded-full bg-tinta-900/80 px-4 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur">
            <Rotate3d className="h-4 w-4 animate-pulse" />Arrastra para girar · doble clic para acercar
          </span>
        </div>
      )}

      <span className="pointer-events-none absolute left-3 top-3 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-extrabold tracking-wide text-tinta-800 shadow-sm ring-1 ring-tinta-100">
        <Rotate3d className="h-3.5 w-3.5 text-menta-600" />360°
      </span>

      {listo && (
        <div className={cls('absolute right-3 top-3 flex flex-col gap-1.5 transition', !compacto && 'sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100')}>
          <BotonVisor etiqueta={girando ? 'Pausar giro' : 'Girar automáticamente'} onClick={() => { setTocado(true); setZoom(false); setGirando((g) => !g); }}>
            {girando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </BotonVisor>
          <BotonVisor etiqueta={zoom ? 'Alejar' : 'Acercar'} onClick={() => { interactuar(); setZoom((z) => !z); }}>
            {zoom ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
          </BotonVisor>
          {!compacto && (
            <BotonVisor etiqueta={completa ? 'Salir de pantalla completa' : 'Pantalla completa'} onClick={pantallaCompleta}>
              {completa ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </BotonVisor>
          )}
        </div>
      )}

      {listo && (
        <div className="pointer-events-none absolute inset-x-10 bottom-2 h-0.5 rounded-full bg-tinta-100" aria-hidden>
          <div className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-menta-500" style={{ left: `${(indice / total) * 100}%` }} />
        </div>
      )}
    </div>
  );
}

function BotonVisor({ etiqueta, onClick, children }: { etiqueta: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={etiqueta} title={etiqueta}
      className="grid h-9 w-9 place-items-center rounded-full bg-white/95 text-tinta-700 shadow-sm ring-1 ring-tinta-100 transition hover:bg-white hover:text-menta-700">
      {children}
    </button>
  );
}

function reducirMovimiento() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
