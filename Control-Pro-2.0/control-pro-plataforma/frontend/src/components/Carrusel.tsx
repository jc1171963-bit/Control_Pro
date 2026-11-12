import { ReactNode, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { cls } from '../lib/formato';
import { reducirMovimiento } from './movimiento';

export type Diapositiva = { id: string; contenido: ReactNode };

/**
 * Carrusel accesible: avance automático con botón de pausa, que además se detiene al pasar el cursor o enfocar
 * un control. Con `prefers-reduced-motion` nace pausado. Los controles están pensados para fondos oscuros.
 * Con una sola diapositiva no muestra controles.
 */
export default function Carrusel({ etiqueta, diapositivas, intervalo = 7000, className }: {
  etiqueta: string; diapositivas: Diapositiva[]; intervalo?: number; className?: string;
}) {
  const n = diapositivas.length;
  const [i, setI] = useState(0);
  const [pausado, setPausado] = useState(reducirMovimiento);
  const [encima, setEncima] = useState(false);
  const actual = Math.min(i, n - 1);
  const ir = (k: number) => setI((k + n) % n);

  useEffect(() => {
    if (n < 2 || pausado || encima) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), intervalo);
    return () => clearInterval(t);
  }, [n, pausado, encima, intervalo]);

  const boton = 'grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/30 transition hover:bg-white/25 focus-visible:outline-white';
  return (
    <section aria-roledescription="carrusel" aria-label={etiqueta} className={cls('relative', className)}
      onMouseEnter={() => setEncima(true)} onMouseLeave={() => setEncima(false)}
      onFocus={() => setEncima(true)} onBlur={() => setEncima(false)}>
      <div aria-live={pausado || encima ? 'polite' : 'off'}>
        {diapositivas.map((d, k) => (
          <div key={d.id} role="group" aria-roledescription="diapositiva" aria-label={`${k + 1} de ${n}`} hidden={k !== actual}
            className={cls(k === actual && 'animate-aparecer')}>{d.contenido}</div>
        ))}
      </div>
      {n > 1 && (
        <div className="contenedor pointer-events-none absolute inset-x-0 bottom-4 flex items-center gap-2">
          <div className="pointer-events-auto flex items-center gap-2">
            <button type="button" className={boton} onClick={() => ir(actual - 1)} aria-label="Diapositiva anterior"><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" className={boton} onClick={() => setPausado(!pausado)} aria-label={pausado ? 'Reanudar el avance automático' : 'Pausar el avance automático'}>
              {pausado ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            </button>
            <button type="button" className={boton} onClick={() => ir(actual + 1)} aria-label="Diapositiva siguiente"><ChevronRight className="h-5 w-5" /></button>
          </div>
          <div className="pointer-events-auto flex items-center">
            {diapositivas.map((d, k) => (
              <button key={d.id} type="button" onClick={() => ir(k)} aria-label={`Ir a la diapositiva ${k + 1} de ${n}`} aria-current={k === actual ? 'true' : undefined}
                className="grid h-11 w-6 place-items-center">
                <span className={cls('h-2.5 rounded-full transition-all', k === actual ? 'w-6 bg-white' : 'w-2.5 bg-white/45')} />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
