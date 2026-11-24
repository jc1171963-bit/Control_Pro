/**
 * Paquetes individuales: el paquete grande que se envía lleva dentro un paquete por persona, con su nombre y sus piezas.
 * Se usa en la recepción de la sucursal y en el empaque de la distribuidora.
 */
import type { ReactNode } from 'react';
import { PackageOpen, UserRound } from 'lucide-react';
import type { Paquete, PaqueteIndividual, PiezaPaquete } from '../api/tipos';
import { cls } from '../lib/formato';

/** Agrupa por persona (ordenado por nombre, "Sin asignar" al final). Respaldo si el servidor no mandó `individuales`. */
export function agruparPorPersona(contenido: PiezaPaquete[]): PaqueteIndividual[] {
  const grupos = new Map<string, PaqueteIndividual>();
  for (const c of contenido) {
    const clave = c.empleado_id != null ? `e${c.empleado_id}` : c.empleado ? `n${c.empleado}` : 'sin';
    const g = grupos.get(clave) ?? {
      empleado: c.empleado ? { id: c.empleado_id ?? 0, nombre: c.empleado, puesto: c.puesto ?? null } : null, piezas: [], total_piezas: 0,
    };
    g.piezas.push(c);
    g.total_piezas += c.cantidad;
    grupos.set(clave, g);
  }
  return [...grupos.values()].sort((a, b) => (a.empleado ? 0 : 1) - (b.empleado ? 0 : 1)
    || (a.empleado?.nombre ?? '').localeCompare(b.empleado?.nombre ?? '', 'es'));
}

export const individualesDe = (pq: Paquete) => pq.individuales ?? agruparPorPersona(pq.contenido);

export function iniciales(nombre: string) {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

/** Encabezado de un paquete individual: iniciales, nombre, puesto y piezas. */
export function CabezaIndividual({ g, derecha }: { g: PaqueteIndividual; derecha?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className={cls('grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold',
        g.empleado ? 'bg-menta-100 text-menta-800' : 'bg-tinta-100 text-tinta-500')}>
        {g.empleado ? iniciales(g.empleado.nombre) : <UserRound className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-semibold leading-snug text-tinta-900">{g.empleado?.nombre ?? 'Sin asignar a una persona'}</p>
        <p className="break-words text-xs text-tinta-500">{g.empleado?.puesto || (g.empleado ? 'Paquete individual' : 'Piezas generales del paquete')}</p>
      </div>
      {derecha ?? <span className="shrink-0 rounded-full bg-tinta-100 px-2.5 py-1 text-[11px] font-bold text-tinta-700">{g.total_piezas} {g.total_piezas === 1 ? 'pieza' : 'piezas'}</span>}
    </div>
  );
}

/** Contenido del paquete grande agrupado en paquetes individuales (solo lectura). */
export function ContenidoPorPersona({ pq, compacto = false, columnas = 2 }: { pq: Paquete; compacto?: boolean; columnas?: 1 | 2 }) {
  const grupos = individualesDe(pq);
  const personas = grupos.filter((g) => g.empleado).length;
  const piezas = grupos.reduce((s, g) => s + g.total_piezas, 0);
  return (
    <div className="mt-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-tinta-600">
        <PackageOpen className="h-3.5 w-3.5" aria-hidden />
        {personas > 0 ? `${personas} ${personas === 1 ? 'paquete individual' : 'paquetes individuales'} · ` : ''}{piezas} {piezas === 1 ? 'pieza' : 'piezas'}
      </p>
      <ul className={cls('grid gap-2', !compacto && columnas === 2 && 'sm:grid-cols-2')} aria-label={`Contenido del paquete ${pq.folio} por persona`}>
        {grupos.map((g) => (
          <li key={g.empleado ? `e${g.empleado.id}-${g.empleado.nombre}` : 'sin'}
            className={cls('min-w-0 rounded-xl bg-white p-3', g.empleado ? 'ring-1 ring-tinta-100' : 'border border-dashed border-tinta-200')}>
            <CabezaIndividual g={g} />
            {!compacto && (
              <ul className="mt-2.5 space-y-1 border-t border-tinta-100 pt-2.5">
                {g.piezas.map((c) => (
                  <li key={c.pedido_detalle_id} className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="min-w-0 text-tinta-700"><span className="font-medium text-tinta-900">{c.nombre}</span>
                      <span className="text-tinta-500"> · {[c.talla && `Talla ${c.talla}`, c.color].filter(Boolean).join(' · ')}</span></span>
                    <span className="shrink-0 font-semibold tabular-nums text-tinta-900">×{c.cantidad}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
