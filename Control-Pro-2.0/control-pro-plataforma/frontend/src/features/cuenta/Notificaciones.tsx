import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { get, post } from '../../api/cliente';
import type { Notificacion, Pagina } from '../../api/tipos';
import { Boton, Cargando, Paginacion, Tarjeta, Vacio } from '../../components/ui';
import { cls, fechaHora } from '../../lib/formato';

export function ListaNotificaciones({ base, clave }: { base: string; clave: string }) {
  const qc = useQueryClient();
  const [pagina, setPagina] = useState(1);
  const q = useQuery({ queryKey: [clave, pagina], queryFn: () => get<Pagina<Notificacion> & { no_leidas: number }>(`${base}/notificaciones?pagina=${pagina}`) });
  const leer = useMutation({ mutationFn: (ids?: number[]) => post(`${base}/notificaciones/leer`, ids ? { ids } : {}), onSuccess: () => qc.invalidateQueries({ queryKey: [clave] }) });
  return (
    <Tarjeta titulo="Notificaciones" sub={q.data ? `${q.data.no_leidas} sin leer` : undefined}
      accion={<Boton tam="sm" variante="secundario" onClick={() => leer.mutate(undefined)}>Marcar todas como leídas</Boton>}>
      {q.isLoading ? <Cargando /> : !q.data?.items.length ? <Vacio titulo="Sin notificaciones" /> : (
        <ul className="divide-y divide-tinta-100">
          {q.data.items.map((n) => (
            <li key={n.id} className={cls('flex items-start gap-3 py-3', !n.leida && 'font-semibold')}>
              <span className={cls('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl', n.leida ? 'bg-tinta-50 text-tinta-300' : 'bg-menta-100 text-menta-700')}><Bell className="h-4 w-4" /></span>
              <div className="flex-1 text-sm">
                {n.enlace ? <Link to={n.enlace} onClick={() => !n.leida && leer.mutate([n.id])} className="hover:underline">{n.mensaje}</Link> : n.mensaje}
                <p className="text-xs font-normal text-tinta-400">{fechaHora(n.fecha)}</p>
              </div>
              {!n.leida && <button className="text-xs font-semibold text-menta-700" onClick={() => leer.mutate([n.id])}>Leída</button>}
            </li>
          ))}
        </ul>
      )}
      {q.data && <Paginacion pagina={q.data.pagina} paginas={q.data.paginas} total={q.data.total} onCambio={setPagina} />}
    </Tarjeta>
  );
}

export default function Notificaciones() {
  return <ListaNotificaciones base="/cuenta" clave="notif-cliente" />;
}
