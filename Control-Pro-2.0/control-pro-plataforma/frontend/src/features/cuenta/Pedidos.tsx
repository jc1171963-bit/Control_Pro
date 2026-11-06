import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { get } from '../../api/cliente';
import type { Pagina, PedidoResumen } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { Entrada, ErrorCaja, Estado, Paginacion, Tarjeta, Vacio } from '../../components/ui';
import { Aparecer, EsqueletoLista } from '../../components/movimiento';
import { cls, dinero, fecha } from '../../lib/formato';

const FILTROS = [['', 'Todas'], ['borrador', 'Borradores'], ['en_revision', 'En revisión'], ['devuelto', 'Por corregir'],
  ['confirmado,en_preparacion', 'En surtido'], ['parcialmente_enviado,enviado', 'En camino'], ['parcialmente_entregado,entregado', 'Por recibir / entregar'],
  ['cerrado', 'Cerradas'], ['rechazado,cancelado', 'Rechazadas o canceladas']];

export default function Pedidos() {
  const { cliente } = useAuth();
  const empresa = cliente?.tipo === 'empresa';
  const [pagina, setPagina] = useState(1);
  const [params] = useSearchParams();
  const [estado, setEstado] = useState(params.get('estado') || '');
  const [folio, setFolio] = useState('');
  const q = useQuery({ queryKey: ['mis-pedidos', pagina, estado, empresa], queryFn: () => get<Pagina<PedidoResumen>>(`/cuenta/pedidos?pagina=${pagina}&por_pagina=10${empresa ? '&canal=corporativo' : ''}${estado ? `&estado=${estado}` : ''}`) });
  const filtros = empresa ? FILTROS : [['', 'Todos'], ['pendiente_pago', 'Por pagar'], ['en_preparacion', 'En preparación'], ['enviado', 'Enviados'], ['entregado', 'Entregados']];
  const items = q.data?.items.filter((pedido) => pedido.folio.toLowerCase().includes(folio.trim().toLowerCase())) || [];
  return (
    <Tarjeta titulo={empresa ? 'Mis solicitudes' : 'Mis pedidos'} sub={empresa ? 'Solicitudes corporativas y su estado de revisión' : 'Historial de tus pedidos'}>
      <div className="mb-4 flex flex-wrap gap-2">
        {empresa && <label className="w-full sm:max-w-xs"><span className="sr-only">Filtrar por folio en la página cargada</span><Entrada value={folio} onChange={(e) => setFolio(e.target.value)} placeholder="Filtrar por folio en esta página" /></label>}
        {filtros.map(([v, n]) => <button key={v} onClick={() => { setEstado(v); setPagina(1); }} className={cls('rounded-full px-3 py-1 text-xs font-semibold ring-1', estado === v ? 'bg-tinta-900 text-white ring-tinta-900' : 'ring-arena-300')}>{n}</button>)}
      </div>
      <ErrorCaja error={q.error} />
      {q.isLoading ? <EsqueletoLista /> : !items.length ? <Vacio titulo={folio ? 'No hay coincidencias en esta página' : empresa ? 'Aún no tienes solicitudes' : 'Aún no tienes pedidos'} texto={folio ? 'Prueba otro folio o cambia de página.' : empresa ? 'Crea una solicitud por empleado y aquí verás su avance.' : 'Cuando realices un pedido, aquí verás su estado.'}
        accion={empresa && !folio ? <Link to="/cuenta/solicitudes/nueva" className="mt-2 font-semibold text-menta-700">Crear solicitud →</Link> : undefined} /> : (
        <ul className="divide-y divide-arena-200">
          {items.map((p, i) => (
            <Aparecer como="li" orden={i} key={p.id}>
              <Link to={p.estado === 'borrador' ? `/cuenta/solicitudes/${p.id}/editar` : `/cuenta/pedidos/${p.id}`} className="flex items-center gap-4 rounded-lg px-1 py-4 transition hover:bg-arena-50">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-display font-bold">{p.folio}</span><Estado valor={p.estado} />
                    {p.canal === 'corporativo' && <span className="rounded-full bg-tinta-100 px-2 py-0.5 text-[11px] font-semibold">Solicitud</span>}</div>
                  <p className="text-sm text-tinta-500">{fecha(p.creado)} · {p.articulos} artículo(s){p.canal !== 'corporativo' && ` · ${p.modalidad === 'recoger' ? 'Recoger en sucursal' : 'Envío a domicilio'}`}</p>
                </div>
                {p.canal !== 'corporativo' && <span className="font-display font-extrabold">{dinero(p.total)}</span>}
                <ChevronRight className="h-4 w-4 text-tinta-300" />
              </Link>
            </Aparecer>
          ))}
        </ul>
      )}
      {q.data && <Paginacion pagina={q.data.pagina} paginas={q.data.paginas} total={q.data.total} onCambio={setPagina} />}
    </Tarjeta>
  );
}
