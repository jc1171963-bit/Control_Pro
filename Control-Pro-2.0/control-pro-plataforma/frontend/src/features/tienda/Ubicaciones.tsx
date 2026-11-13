import { useQuery } from '@tanstack/react-query';
import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import { get } from '../../api/cliente';
import type { Sucursal } from '../../api/tipos';
import { Boton, Cargando, ErrorCaja, Vacio } from '../../components/ui';
import { cls } from '../../lib/formato';

/** Sucursales públicas (GET /tienda/sucursales). Misma clave y vigencia que el pie de página y el checkout. */
export function useSucursalesPublicas() {
  return useQuery({ queryKey: ['sucursales-publicas'], queryFn: () => get<Sucursal[]>('/tienda/sucursales'), staleTime: 300_000 });
}

/** Tarjetas de ubicación con sus estados de carga, error y lista vacía. Los datos opcionales solo se muestran si existen. */
export function ListaUbicaciones({ mostrarRecoger = false, nivel = 'h2', className, compacta = false }: { mostrarRecoger?: boolean; nivel?: 'h2' | 'h3'; className?: string; compacta?: boolean }) {
  const q = useSucursalesPublicas();
  const Titulo = nivel;
  if (q.isLoading) return <Cargando />;
  if (q.error) return (
    <div className="mt-6 space-y-3">
      <ErrorCaja error={q.error} />
      <Boton variante="secundario" onClick={() => q.refetch()}>Reintentar</Boton>
    </div>
  );
  if (!q.data?.length) return <Vacio titulo="Aún no hay ubicaciones publicadas" texto="Cuando haya sucursales disponibles aparecerán aquí." />;
  return (
    <ul className={cls('mt-6 grid', compacta ? 'gap-4 sm:grid-cols-2 lg:grid-cols-1' : 'gap-5 md:grid-cols-2 lg:grid-cols-3', className)}>
      {q.data.map((s) => {
        const horario = Object.entries(s.horario || {});
        return (
          <li key={s.id} className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-lurima-100">
            <p className="text-xs font-bold uppercase tracking-widest text-bienestar-700">{s.codigo}</p>
            <Titulo className="font-display text-xl font-extrabold text-lurima-900">{s.nombre}</Titulo>
            <p className="mt-3 flex gap-2 text-sm text-tinta-600"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-lurima-500" aria-hidden />{s.direccion}, {s.ciudad}, {s.estado} · CP {s.cp}</p>
            {s.telefono && <p className="mt-2 flex gap-2 text-sm"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-lurima-500" aria-hidden />
              <a href={`tel:${s.telefono.replace(/[^\d+]/g, '')}`} className="font-semibold text-lurima-800 hover:underline">{s.telefono}</a></p>}
            {s.correo && <p className="mt-2 flex gap-2 text-sm"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-lurima-500" aria-hidden />
              <a href={`mailto:${s.correo}`} className="break-all font-semibold text-lurima-800 hover:underline">{s.correo}</a></p>}
            {horario.length > 0 && (
              <div className="mt-2 flex gap-2 text-sm text-tinta-600"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-lurima-500" aria-hidden />
                <ul>{horario.map(([d, h]) => <li key={d}><span className="capitalize">{d}</span>: {h}</li>)}</ul>
              </div>
            )}
            {mostrarRecoger && !s.permite_recoger && <p className="mt-3 text-xs text-coral-600">Temporalmente sin entregas en mostrador.</p>}
          </li>
        );
      })}
    </ul>
  );
}
