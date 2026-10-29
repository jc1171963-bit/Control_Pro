import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { get } from '../../api/cliente';
import type { Pagina, PedidoResumen } from '../../api/tipos';
import { Cargando, ErrorCaja, Estado, Paginacion, Tarjeta, Vacio } from '../../components/ui';
import { cls, dinero, fecha } from '../../lib/formato';

const FILTROS = [['', 'Todos'], ['pendiente_pago', 'Por pagar'], ['en_preparacion', 'En preparación'], ['enviado', 'Enviados'], ['entregado', 'Entregados']];

export default function Pedidos() {
  const [pagina, setPagina] = useState(1);
  const [estado, setEstado] = useState('');
  const q = useQuery({ queryKey: ['mis-pedidos', pagina, estado], queryFn: () => get<Pagina<PedidoResumen>>(`/cuenta/pedidos?pagina=${pagina}&por_pagina=10${estado ? `&estado=${estado}` : ''}`) });
  return (
    <Tarjeta titulo="Mis pedidos" sub="Historial de compras y pedidos corporativos">
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTROS.map(([v, n]) => <button key={v} onClick={() => { setEstado(v); setPagina(1); }} className={cls('rounded-full px-3 py-1 text-xs font-semibold ring-1', estado === v ? 'bg-tinta-900 text-white ring-tinta-900' : 'ring-arena-300')}>{n}</button>)}
      </div>
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : !q.data?.items.length ? <Vacio titulo="Aún no tienes pedidos" texto="Cuando compres, aquí verás el estado de cada pedido." /> : (
        <ul className="divide-y divide-arena-200">
          {q.data.items.map((p) => (
            <li key={p.id}>
              <Link to={`/cuenta/pedidos/${p.id}`} className="flex items-center gap-4 py-4 hover:bg-arena-50">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-display font-bold">{p.folio}</span><Estado valor={p.estado} />
                    {p.canal === 'corporativo' && <span className="rounded-full bg-tinta-100 px-2 py-0.5 text-[11px] font-semibold">Corporativo</span>}</div>
                  <p className="text-sm text-tinta-500">{fecha(p.creado)} · {p.articulos} artículo(s) · {p.modalidad === 'recoger' ? 'Recoger en sucursal' : 'Envío a domicilio'}</p>
                </div>
                <span className="font-display font-extrabold">{dinero(p.total)}</span>
                <ChevronRight className="h-4 w-4 text-tinta-300" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {q.data && <Paginacion pagina={q.data.pagina} paginas={q.data.paginas} total={q.data.total} onCambio={setPagina} />}
    </Tarjeta>
  );
}
