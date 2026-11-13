import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { PedidoResumen } from '../../api/tipos';
import { Estado } from '../../components/ui';
import { useMediaQuery } from '../../components/useMediaQuery';
import { cls, fecha } from '../../lib/formato';

/** Estados filtrables de una solicitud. El backend filtra por igualdad exacta (no acepta listas), por eso es uno a la vez. */
export const ESTADOS_SOLICITUD = ['borrador', 'en_revision', 'devuelto', 'confirmado', 'en_preparacion', 'parcialmente_enviado', 'enviado',
  'parcialmente_entregado', 'entregado', 'cerrado', 'rechazado', 'cancelado'];

const destino = (p: PedidoResumen) => (p.estado === 'borrador' ? `/cuenta/solicitudes/${p.id}/editar` : `/cuenta/pedidos/${p.id}`);
/** Lo que la sucursal hace con la solicitud según su estado (solo el estado: el listado no trae entregas ni paquetes). */
const accion = (p: PedidoResumen): [string, boolean] => (p.estado === 'borrador' ? ['Continuar', true] : p.estado === 'devuelto' ? ['Corregir', true] : ['Ver detalle', false]);

/** Solicitudes de la empresa: tabla desde 768 px y tarjetas en móvil. Cada fila es un enlace a su detalle (o a su edición si es borrador). */
export default function TablaSolicitudes({ items }: { items: PedidoResumen[] }) {
  const ancho = useMediaQuery('(min-width: 768px)');
  if (!ancho) {
    return (
      <ul className="space-y-3">
        {items.map((p) => {
          const [texto, destaca] = accion(p);
          return (
            <li key={p.id}>
              <Link to={destino(p)} className={cls('flex min-h-14 items-center gap-3 rounded-xl p-4 ring-1 hover:bg-sd-50', destaca ? 'ring-menta-200' : 'ring-tinta-100')}>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-display font-bold">{p.folio}</span><Estado valor={p.estado} /></div>
                  <p className="text-sm text-tinta-500">{fecha(p.creado)} · {p.articulos} artículo(s)</p>
                  {destaca && <p className="text-sm font-semibold text-menta-700">{texto} →</p>}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-tinta-300" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Solicitudes de la empresa</caption>
      <thead><tr className="border-b border-tinta-100 text-left text-[11px] uppercase tracking-wide text-tinta-500">
        <th scope="col" className="py-2 pr-3">Folio</th><th scope="col" className="px-3 py-2">Estado</th><th scope="col" className="px-3 py-2">Creada</th>
        <th scope="col" className="px-3 py-2 text-right">Artículos</th><th scope="col" className="py-2 pl-3 text-right">Acción</th></tr></thead>
      <tbody className="divide-y divide-tinta-100">
        {items.map((p) => {
          const [texto, destaca] = accion(p);
          return (
            <tr key={p.id} className="hover:bg-sd-50">
              <td className="py-3 pr-3"><Link to={destino(p)} className="font-display font-bold text-sd-900 underline-offset-2 hover:underline">{p.folio}</Link></td>
              <td className="px-3 py-3"><Estado valor={p.estado} /></td>
              <td className="px-3 py-3 text-tinta-500">{fecha(p.creado)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{p.articulos}</td>
              <td className="py-3 pl-3 text-right">
                <Link to={destino(p)} aria-label={`${texto}: ${p.folio}`}
                  className={cls('inline-flex min-h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold', destaca ? 'bg-menta-50 text-menta-700 ring-1 ring-menta-200 hover:bg-menta-100' : 'text-tinta-600 hover:bg-tinta-50')}>
                  {texto}<ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
