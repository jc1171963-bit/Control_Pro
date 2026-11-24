/**
 * Envíos de reposición de una incidencia: cada uno es un paquete adicional con su propia paquetería y guía, que lleva
 * (por persona) lo que llegó mal o no llegó. Lo ven la sucursal y la distribuidora.
 */
import type { ReactNode } from 'react';
import { PackageCheck, Truck } from 'lucide-react';
import type { Paquete } from '../api/tipos';
import { etiqueta, fechaHora } from '../lib/formato';
import { Estado } from './ui';

export function ListaReposiciones({ paquetes, acciones }: { paquetes?: Paquete[]; acciones?: (pq: Paquete) => ReactNode }) {
  if (!paquetes?.length) return null;
  return (
    <div className="mt-3 space-y-2" aria-label="Envíos de reposición">
      {paquetes.map((pq) => (
        <div key={pq.id} className="rounded-xl bg-sky-50/70 p-3 text-xs ring-1 ring-sky-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex min-w-0 flex-wrap items-center gap-1.5 font-semibold text-sky-900">
              <PackageCheck className="h-4 w-4 shrink-0" aria-hidden />Reposición {pq.folio}
              <span className="font-normal text-sky-800/80">· desde {pq.sucursal} · {fechaHora(pq.creado)}</span>
            </p>
            <Estado valor={pq.recepcion ? `recepcion_${pq.recepcion.estado}` : pq.estado} />
          </div>
          {pq.envio
            ? <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sky-900"><Truck className="h-3.5 w-3.5" aria-hidden />
                <b>{pq.envio.paqueteria}</b> · Guía <b className="font-mono">{pq.envio.guia}</b> · {etiqueta(pq.envio.estado)}</p>
            : <p className="mt-1.5 text-sky-900/80">Preparado en almacén: aún sin guía de envío.</p>}
          <ul className="mt-2 space-y-0.5 text-sky-950/80">
            {(pq.individuales || []).map((g) => (
              <li key={g.empleado ? g.empleado.id : 'sin'}>
                <b>{g.empleado?.nombre ?? 'Sin asignar'}</b>: {g.piezas.map((x) => `${x.cantidad}× ${x.nombre} (${x.talla})`).join(', ')}
              </li>
            ))}
          </ul>
          {acciones && <div className="mt-2 flex flex-wrap gap-2">{acciones(pq)}</div>}
        </div>
      ))}
    </div>
  );
}
