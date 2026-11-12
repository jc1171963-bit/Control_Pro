import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { PedidoResumen } from '../../api/tipos';
import { Estado } from '../../components/ui';
import { useMediaQuery } from '../../components/useMediaQuery';
import { fecha } from '../../lib/formato';

/** Estados filtrables de una solicitud. El backend filtra por igualdad exacta (no acepta listas), por eso es uno a la vez. */
export const ESTADOS_SOLICITUD = ['borrador', 'en_revision', 'devuelto', 'confirmado', 'en_preparacion', 'parcialmente_enviado', 'enviado',
  'parcialmente_entregado', 'entregado', 'cerrado', 'rechazado', 'cancelado'];

const destino = (p: PedidoResumen) => (p.estado === 'borrador' ? `/cuenta/solicitudes/${p.id}/editar` : `/cuenta/pedidos/${p.id}`);

/** Solicitudes de la empresa: tabla desde 768 px y tarjetas en móvil. Cada fila es un enlace a su detalle (o a su edición si es borrador). */
export default function TablaSolicitudes({ items }: { items: PedidoResumen[] }) {
  const ancho = useMediaQuery('(min-width: 768px)');
  if (!ancho) {
    return (
      <ul className="space-y-3">
        {items.map((p) => (
          <li key={p.id}>
            <Link to={destino(p)} className="flex min-h-14 items-center gap-3 rounded-xl p-4 ring-1 ring-tinta-100 hover:bg-sd-50">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2"><span className="font-display font-bold">{p.folio}</span><Estado valor={p.estado} /></div>
                <p className="text-sm text-tinta-500">{fecha(p.creado)} · {p.articulos} artículo(s)</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-tinta-300" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Solicitudes de la empresa</caption>
      <thead><tr className="border-b border-tinta-100 text-left text-[11px] uppercase text-tinta-400">
        <th scope="col" className="py-2 pr-3">Folio</th><th scope="col" className="px-3 py-2">Estado</th><th scope="col" className="px-3 py-2">Creada</th>
        <th scope="col" className="px-3 py-2 text-right">Artículos</th><th scope="col" className="w-8"><span className="sr-only">Ver</span></th></tr></thead>
      <tbody className="divide-y divide-tinta-100">
        {items.map((p) => (
          <tr key={p.id} className="hover:bg-sd-50">
            <td className="py-3 pr-3"><Link to={destino(p)} className="font-display font-bold text-sd-900 underline-offset-2 hover:underline">{p.folio}</Link></td>
            <td className="px-3 py-3"><Estado valor={p.estado} /></td>
            <td className="px-3 py-3 text-tinta-500">{fecha(p.creado)}</td>
            <td className="px-3 py-3 text-right">{p.articulos}</td>
            <td className="py-3 text-tinta-300"><ChevronRight className="h-4 w-4" aria-hidden /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
