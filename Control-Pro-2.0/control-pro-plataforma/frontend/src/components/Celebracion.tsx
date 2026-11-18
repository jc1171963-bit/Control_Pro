/**
 * Celebración al completar un paso importante (enviar o aprobar una solicitud): confeti con los colores de la marca y
 * una palomita que se dibuja en una tarjeta al centro.
 *
 * - `useCelebrar()` devuelve `celebrar({ titulo, texto, paleta })`. El proveedor vive por encima del enrutador, así que la
 *   celebración continúa aunque la pantalla navegue al detalle justo después de enviar.
 * - No bloquea: el confeti no recibe clics, la tarjeta se cierra sola (o con un clic / Escape) y el título se anuncia a
 *   los lectores de pantalla.
 * - Con "reducir movimiento" no hay confeti ni trazos animados: solo la tarjeta con la palomita.
 * - El confeti se dibuja en un único <canvas> con física simple (impulso, gravedad, resistencia del aire y giro).
 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { reducirMovimiento } from './movimiento';
import { cls } from '../lib/formato';

export type PaletaCelebracion = 'sd' | 'lurima';
type Datos = { titulo: string; texto?: string; paleta?: PaletaCelebracion };

const COLORES: Record<PaletaCelebracion, string[]> = {
  sd: ['#00a86b', '#2fd09a', '#5ec8d8', '#0e7490', '#ffd166', '#ffffff', '#9be7f0'],
  lurima: ['#1f5192', '#4f82c2', '#52ae62', '#e4572e', '#f2c14e', '#ffffff', '#86aedd'],
};
const ACENTO: Record<PaletaCelebracion, string> = { sd: 'from-[#00a86b] to-[#0e7490]', lurima: 'from-[#1f5192] to-[#52ae62]' };
const DURACION_TARJETA = 2800;

const Ctx = createContext<(d: Datos) => void>(() => undefined);
export const useCelebrar = () => useContext(Ctx);

type Pieza = { x: number; y: number; vx: number; vy: number; giro: number; vgiro: number; ancho: number; alto: number; color: string; forma: 0 | 1 | 2; fase: number; vida: number };

function lanzarConfeti(canvas: HTMLCanvasElement, colores: string[]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const piezas: Pieza[] = [];
  const rafaga = (x: number, y: number, angulo: number, abertura: number, n: number, fuerza: number) => {
    for (let i = 0; i < n; i++) {
      const a = angulo + (Math.random() - 0.5) * abertura;
      const v = fuerza * (0.55 + Math.random() * 0.6);
      piezas.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, giro: Math.random() * Math.PI, vgiro: (Math.random() - 0.5) * 0.35,
        ancho: 6 + Math.random() * 6, alto: 9 + Math.random() * 8, color: colores[(Math.random() * colores.length) | 0],
        forma: ((Math.random() * 3) | 0) as 0 | 1 | 2, fase: Math.random() * Math.PI * 2, vida: 0,
      });
    }
  };
  const total = Math.min(220, Math.max(110, Math.round(w / 6)));
  // Dos cañones desde las esquinas inferiores y una lluvia ligera desde arriba al centro.
  rafaga(-10, h * 0.85, -Math.PI / 3.2, 0.7, total * 0.38, Math.min(24, h / 34));
  rafaga(w + 10, h * 0.85, -Math.PI + Math.PI / 3.2, 0.7, total * 0.38, Math.min(24, h / 34));
  window.setTimeout(() => rafaga(w / 2, -20, Math.PI / 2, 1.6, total * 0.24, 5), 220);

  let id = 0;
  const inicio = performance.now();
  const cuadro = (t: number) => {
    ctx.clearRect(0, 0, w, h);
    const transcurrido = t - inicio;
    for (const p of piezas) {
      p.vida++;
      p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.32; // resistencia del aire y gravedad
      p.x += p.vx + Math.sin(p.fase + p.vida / 9) * 0.6; // aleteo
      p.y += p.vy;
      p.giro += p.vgiro;
      const alfa = transcurrido > 2600 ? Math.max(0, 1 - (transcurrido - 2600) / 700) : 1;
      ctx.save();
      ctx.globalAlpha = alfa;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.giro);
      ctx.scale(1, Math.cos(p.fase + p.vida / 7)); // efecto de papel que gira
      ctx.fillStyle = p.color;
      if (p.forma === 0) ctx.fillRect(-p.ancho / 2, -p.alto / 2, p.ancho, p.alto);
      else if (p.forma === 1) { ctx.beginPath(); ctx.arc(0, 0, p.ancho / 2, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.beginPath(); ctx.moveTo(0, -p.alto / 2); ctx.lineTo(p.ancho / 2, p.alto / 2); ctx.lineTo(-p.ancho / 2, p.alto / 2); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
    if (transcurrido < 3400) id = requestAnimationFrame(cuadro);
    else ctx.clearRect(0, 0, w, h);
  };
  id = requestAnimationFrame(cuadro);
  return () => cancelAnimationFrame(id);
}

function PalomitaGrande({ animar }: { animar: boolean }) {
  return (
    <svg viewBox="0 0 52 52" className="h-14 w-14 text-white" aria-hidden>
      <circle cx="26" cy="26" r="23" fill="none" stroke="currentColor" strokeOpacity=".35" strokeWidth="3" />
      <path d="M15 27 l7 7 l15 -16" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="40" strokeDashoffset={animar ? 40 : 0} className={animar ? 'animate-trazo' : undefined} style={{ animationDelay: '.25s' }} />
    </svg>
  );
}

export function CelebracionProvider({ children }: { children: ReactNode }) {
  const [actual, setActual] = useState<(Datos & { id: number }) | null>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const celebrar = useCallback((d: Datos) => setActual({ ...d, id: Date.now() }), []);

  useEffect(() => {
    if (!actual) return;
    const reducir = reducirMovimiento();
    const detener = !reducir && lienzo.current ? lanzarConfeti(lienzo.current, COLORES[actual.paleta ?? 'sd']) : () => undefined;
    const cerrar = window.setTimeout(() => setActual(null), DURACION_TARJETA + (reducir ? 0 : 600));
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setActual(null); };
    window.addEventListener('keydown', tecla);
    return () => { detener(); window.clearTimeout(cerrar); window.removeEventListener('keydown', tecla); };
  }, [actual]);

  const reducir = reducirMovimiento();
  return (
    <Ctx.Provider value={celebrar}>
      {children}
      <div role="status" aria-live="polite" className="sr-only">{actual ? `${actual.titulo}. ${actual.texto ?? ''}` : ''}</div>
      {actual && (
        <div key={actual.id} className="pointer-events-none fixed inset-0 z-[70]" aria-hidden>
          <canvas ref={lienzo} className="absolute inset-0 h-full w-full" />
          <div className="absolute inset-0 grid place-items-center p-6">
            <button type="button" tabIndex={-1} onClick={() => setActual(null)}
              className={cls('pointer-events-auto flex w-[min(92vw,380px)] flex-col items-center rounded-[28px] bg-white px-8 pb-7 pt-8 text-center shadow-[0_30px_80px_rgba(8,30,40,.35)] ring-1 ring-tinta-100',
                !reducir && 'animate-celebrar')}>
              <span className={cls('relative grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br shadow-[0_14px_34px_rgba(0,120,90,.35)]', ACENTO[actual.paleta ?? 'sd'])}>
                {!reducir && <span className="absolute inset-0 animate-onda rounded-full ring-4 ring-current text-[#2fd09a]/60" />}
                <PalomitaGrande animar={!reducir} />
              </span>
              <span className="mt-5 block font-display text-xl font-extrabold leading-tight text-tinta-900">{actual.titulo}</span>
              {actual.texto && <span className="mt-1.5 block text-sm text-tinta-500">{actual.texto}</span>}
            </button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
