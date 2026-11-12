import { Minus, Plus } from 'lucide-react';
import { cls } from '../lib/formato';

const TAMANOS = {
  lg: { caja: 'h-12 rounded-xl', boton: 'h-12 w-11', icono: 'h-4 w-4' },
  md: { caja: 'h-10 rounded-xl', boton: 'h-10 w-10', icono: 'h-4 w-4' },
  sm: { caja: 'h-9 rounded-lg', boton: 'h-9 w-9', icono: 'h-3.5 w-3.5' },
};

/** Selector de cantidad único (compra en línea, ficha de solicitud, asistente y líneas de revisión). Respeta el mínimo (1) y `max`. */
export default function Cantidad({ valor, onCambio, max = 50, tam = 'lg' }: { valor: number; onCambio: (n: number) => void; max?: number; tam?: keyof typeof TAMANOS }) {
  const t = TAMANOS[tam];
  return (
    <div role="group" aria-label="Cantidad" className={cls('flex shrink-0 items-center bg-white ring-1 ring-lurima-200', t.caja)}>
      <button type="button" className={cls('grid place-items-center disabled:opacity-30', t.boton)} disabled={valor <= 1} onClick={() => onCambio(valor - 1)} aria-label="Menos"><Minus className={t.icono} aria-hidden /></button>
      <span className="w-8 text-center font-bold" aria-live="polite">{valor}</span>
      <button type="button" className={cls('grid place-items-center disabled:opacity-30', t.boton)} disabled={valor >= max} onClick={() => onCambio(valor + 1)} aria-label="Más"><Plus className={t.icono} aria-hidden /></button>
    </div>
  );
}
