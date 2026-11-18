import { useRef } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTema } from '../app/tema';
import { cls } from '../lib/formato';

/** Interruptor de modo claro / oscuro para el encabezado de los paneles. El sol y la luna giran al cambiar. */
export default function InterruptorTema({ className }: { className?: string }) {
  const { oscuro, alternar } = useTema();
  const boton = useRef<HTMLButtonElement>(null);
  return (
    <button ref={boton} type="button" role="switch" aria-checked={oscuro} aria-label="Modo oscuro"
      title={oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'} onClick={() => alternar(boton.current)}
      className={cls('relative grid place-items-center overflow-hidden rounded-full border border-white/80 bg-white/60 backdrop-blur-md transition hover:bg-white/80', className)}>
      <Sun className={cls('absolute h-5 w-5 text-amber-600 transition duration-500', oscuro ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100')} aria-hidden />
      <Moon className={cls('absolute h-5 w-5 text-sky-300 transition duration-500', oscuro ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0')} aria-hidden />
    </button>
  );
}
