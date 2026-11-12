import { ReactNode, useEffect, useMemo, useState } from 'react';
import type { VarianteT } from '../api/tipos';
import { cls } from '../lib/formato';

/**
 * Estado de la selección de color y talla de un producto: una sola lógica para la ficha y el asistente de solicitudes.
 * Elegir un color reinicia la talla; al cargar, se parte del primer color.
 */
export function useSeleccionVariante(variantes: VarianteT[] | undefined) {
  const colores = useMemo(() => [...new Map((variantes || []).map((v) => [v.color, v.color_hex] as [string, string])).entries()], [variantes]);
  const [color, setColor] = useState('');
  const [talla, setTalla] = useState('');
  useEffect(() => { if (colores.length && !color) setColor(colores[0][0]); }, [colores, color]);
  const elegirColor = (c: string) => { setColor(c); setTalla(''); };
  const delColor = (variantes || []).filter((v) => v.color === color);
  return { colores, color, elegirColor, talla, setTalla, delColor, variante: delColor.find((v) => v.talla === talla) };
}

/**
 * Elección visual de color y talla. `deshabilitarAgotadas` bloquea las tallas sin existencias (compra en línea; las
 * solicitudes de sucursal no dependen de la existencia). `ocultarColorUnico` omite el color si el producto solo tiene uno.
 */
export default function SelectorVariante({ colores, color, onColor, delColor, talla, onTalla, deshabilitarAgotadas = false, ocultarColorUnico = false, detalleTalla }: {
  colores: [string, string][]; color: string; onColor: (c: string) => void; delColor: VarianteT[]; talla: string; onTalla: (t: string) => void;
  deshabilitarAgotadas?: boolean; ocultarColorUnico?: boolean; detalleTalla?: ReactNode;
}) {
  return (
    <div className="space-y-5">
      {!(ocultarColorUnico && colores.length <= 1) && (
        <div>
          <p className="mb-2 text-sm font-semibold">Color: <span className="font-normal text-tinta-600">{color}</span></p>
          <div className="flex flex-wrap gap-2">
            {colores.map(([c, h]) => (
              <button key={c} type="button" onClick={() => onColor(c)} aria-label={c} title={c} aria-pressed={color === c}
                className={cls('h-10 w-10 rounded-full ring-2 ring-offset-2 ring-offset-white', color === c ? 'ring-lurima-800' : 'ring-lurima-200')} style={{ background: h }} />
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="mb-2 text-sm font-semibold">Talla {detalleTalla}</p>
        <div className="flex flex-wrap gap-2">
          {delColor.map((v) => {
            const agotada = deshabilitarAgotadas && !v.disponible;
            return (
              <button key={v.id} type="button" disabled={agotada} onClick={() => onTalla(v.talla)} aria-pressed={talla === v.talla} aria-label={`Talla ${v.talla}${agotada ? ' (agotada)' : ''}`}
                className={cls('h-11 min-w-12 rounded-xl px-3 text-sm font-bold ring-1 transition', talla === v.talla ? 'bg-lurima-800 text-white ring-lurima-800' : 'bg-white ring-lurima-200 hover:ring-lurima-500',
                  agotada && 'cursor-not-allowed bg-lurima-50 text-tinta-300 line-through')}>{v.talla}</button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
