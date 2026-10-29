import { useQuery } from '@tanstack/react-query';
import { Clock, MapPin, Phone } from 'lucide-react';
import { get } from '../../api/cliente';
import type { Sucursal } from '../../api/tipos';
import { Cargando } from '../../components/ui';

export default function Sucursales() {
  const q = useQuery({ queryKey: ['sucursales-publicas'], queryFn: () => get<Sucursal[]>('/tienda/sucursales') });
  return (
    <div className="contenedor py-10">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Nuestras sucursales</h1>
      <p className="mt-1 text-tinta-500">Recoge tu pedido sin costo y paga en efectivo al recogerlo.</p>
      {q.isLoading ? <Cargando /> : (
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {q.data?.map((s) => (
            <article key={s.id} className="rounded-3xl bg-white p-6 ring-1 ring-arena-200">
              <p className="text-xs font-bold uppercase tracking-widest text-menta-700">{s.codigo}</p>
              <h2 className="font-display text-xl font-extrabold">{s.nombre}</h2>
              <p className="mt-3 flex gap-2 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-tinta-400" />{s.direccion}, {s.ciudad}, {s.estado} · CP {s.cp}</p>
              {s.telefono && <p className="mt-2 flex gap-2 text-sm"><Phone className="mt-0.5 h-4 w-4 text-tinta-400" />{s.telefono}</p>}
              <div className="mt-2 flex gap-2 text-sm"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-tinta-400" />
                <ul>{Object.entries(s.horario || {}).map(([d, h]) => <li key={d}><span className="capitalize">{d}</span>: {h}</li>)}</ul>
              </div>
              {!s.permite_recoger && <p className="mt-3 text-xs text-coral-600">Temporalmente sin entregas en mostrador.</p>}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
