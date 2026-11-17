/**
 * Galería de producto al estilo de las tiendas de ropa: las vistas avanzan solas con un acercamiento lento (efecto
 * "Ken Burns"), lupa que sigue al cursor, video en bucle sin sonido como una vista más, giro 360° cuando hay fotogramas
 * reales, miniaturas, flechas, puntos y deslizamiento con el dedo. Respeta "reducir movimiento" (no avanza sola).
 */
import { PointerEvent, TouchEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, PlayCircle, Rotate3d } from 'lucide-react';
import { cls } from '../lib/formato';
import { ImagenProducto } from '../features/tienda/ProductoCard';
import Visor360 from './Visor360';

type Foto = { url: string; alt: string; credito?: string | null };
type Vista = { tipo: 'foto'; foto: Foto } | { tipo: 'video'; url: string; credito?: string | null } | { tipo: '360'; frames: string[] };

const INTERVALO = 4200;
const prefiereQuieto = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function GaleriaProducto({ fotos, video, giro, nombre }: {
  fotos: Foto[]; video?: { url: string; credito?: string | null } | null; giro?: { frames: string[] } | null; nombre: string;
}) {
  const vistas = useMemo<Vista[]>(() => [
    ...fotos.map((foto) => ({ tipo: 'foto' as const, foto })),
    ...(video ? [{ tipo: 'video' as const, url: video.url, credito: video.credito }] : []),
    ...(giro && giro.frames.length >= 8 ? [{ tipo: '360' as const, frames: giro.frames }] : []),
  ], [fotos, video, giro]);
  const [i, setI] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(() => !prefiereQuieto());
  const [encima, setEncima] = useState(false);
  const [lupa, setLupa] = useState<{ x: number; y: number } | null>(null);
  const toque = useRef<number | null>(null);
  const actual = vistas[Math.min(i, Math.max(0, vistas.length - 1))];
  // Vuelve a la primera vista solo si cambian las fotos (otro producto o color), no en cada render del padre.
  const claveFotos = fotos.map((f) => f.url).join('|');
  useEffect(() => setI(0), [claveFotos]);

  // Avance automático entre fotos (no sobre el video ni el 360, que tienen su propio movimiento).
  const avanza = reproduciendo && !encima && actual?.tipo === 'foto' && vistas.length > 1;
  useEffect(() => {
    if (!avanza) return;
    const t = window.setTimeout(() => setI((n) => (n + 1) % vistas.length), INTERVALO);
    return () => window.clearTimeout(t);
  }, [avanza, i, vistas.length]);

  if (!vistas.length) return <div className="aspect-[4/5] overflow-hidden rounded-[2rem] bg-lurima-50"><ImagenProducto src={null} alt={nombre} /></div>;
  const ir = (n: number) => { setI((n + vistas.length) % vistas.length); setLupa(null); };
  const mover = (e: PointerEvent<HTMLDivElement>) => {
    if (actual.tipo !== 'foto' || e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    setLupa({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };
  const inicioToque = (e: TouchEvent) => { toque.current = e.touches[0].clientX; };
  const finToque = (e: TouchEvent) => {
    if (toque.current === null) return;
    const dx = e.changedTouches[0].clientX - toque.current;
    if (Math.abs(dx) > 40) ir(i + (dx < 0 ? 1 : -1));
    toque.current = null;
  };
  const credito = actual.tipo === 'foto' ? actual.foto.credito : actual.tipo === 'video' ? actual.credito : null;

  return (
    <div>
      <div className="group relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-gradient-to-br from-lurima-50 to-lurima-100 ring-1 ring-lurima-100"
        onMouseEnter={() => setEncima(true)} onMouseLeave={() => { setEncima(false); setLupa(null); }} onPointerMove={mover}
        onTouchStart={inicioToque} onTouchEnd={finToque} aria-roledescription="carrusel" aria-label={`Vistas de ${nombre}`}>
        {actual.tipo === 'foto' && (
          <div key={`f-${i}`} className="h-full w-full animate-aparecer">
            {lupa ? (
              <div className="h-full w-full bg-no-repeat" role="img" aria-label={actual.foto.alt}
                style={{ backgroundImage: `url(${actual.foto.url})`, backgroundSize: '220%', backgroundPosition: `${lupa.x}% ${lupa.y}%` }} />
            ) : (
              <ImagenProducto src={actual.foto.url} alt={actual.foto.alt} className={cls('origin-center', avanza && 'animate-kenburns')} />
            )}
          </div>
        )}
        {actual.tipo === 'video' && (
          <video key={actual.url} src={actual.url} poster={fotos[0]?.url} autoPlay={!prefiereQuieto()} muted loop playsInline controls={prefiereQuieto()}
            className="h-full w-full animate-aparecer object-cover" aria-label={`Video de ${nombre}`} />
        )}
        {actual.tipo === '360' && <div className="h-full w-full"><Visor360 frames={actual.frames} alt={nombre} /></div>}

        {vistas.length > 1 && <>
          <button type="button" onClick={() => ir(i - 1)} aria-label="Vista anterior"
            className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-lurima-900 shadow-md opacity-0 backdrop-blur transition hover:bg-white focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"><ChevronLeft className="h-5 w-5" /></button>
          <button type="button" onClick={() => ir(i + 1)} aria-label="Vista siguiente"
            className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-lurima-900 shadow-md opacity-0 backdrop-blur transition hover:bg-white focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"><ChevronRight className="h-5 w-5" /></button>
          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5">
            {vistas.map((_, n) => (
              <button key={n} type="button" onClick={() => ir(n)} aria-label={`Ir a la vista ${n + 1}`} aria-current={n === i ? 'true' : undefined}
                className={cls('h-1.5 rounded-full bg-white/90 shadow transition-all', n === i ? 'w-6 bg-white' : 'w-1.5 opacity-70')} />
            ))}
          </div>
          <button type="button" onClick={() => setReproduciendo(!reproduciendo)} aria-label={reproduciendo ? 'Pausar el cambio automático de vistas' : 'Reproducir el cambio automático de vistas'}
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/85 text-lurima-900 shadow backdrop-blur hover:bg-white">
            {reproduciendo ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
        </>}
        {(actual.tipo === 'foto' && actual.foto.credito) || actual.tipo === 'video' ? (
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-tinta-700 shadow-sm backdrop-blur">
            {actual.tipo === 'video' ? 'Video ilustrativo' : 'Imagen ilustrativa'}</span>
        ) : null}
      </div>
      {credito && <p className="mt-1.5 text-right text-[11px] text-tinta-400">{credito}</p>}

      {vistas.length > 1 && (
        <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1" role="group" aria-label="Miniaturas">
          {vistas.map((v, n) => (
            <button key={n} type="button" onClick={() => ir(n)} aria-pressed={n === i}
              aria-label={v.tipo === 'video' ? 'Video' : v.tipo === '360' ? 'Vista 360°' : `Fotografía ${n + 1}`}
              className={cls('relative h-20 w-16 shrink-0 overflow-hidden rounded-xl ring-2 transition sm:h-24 sm:w-20', n === i ? 'ring-lurima-600' : 'ring-lurima-100 hover:ring-lurima-300')}>
              {v.tipo === 'foto' ? <ImagenProducto src={v.foto.url} alt="" /> : v.tipo === 'video' ? (
                <><ImagenProducto src={fotos[0]?.url ?? null} alt="" className="opacity-60" />
                  <span className="absolute inset-0 grid place-items-center text-lurima-900"><PlayCircle className="h-7 w-7" aria-hidden /></span></>
              ) : (
                <><img src={v.frames[0]} alt="" className="h-full w-full object-cover opacity-50" />
                  <span className="absolute inset-0 grid place-items-center"><Rotate3d className="h-6 w-6 text-bienestar-600" aria-hidden /></span></>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
