import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { get } from '../../api/cliente';
import type { Pagina, PedidoResumen } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { Entrada, ErrorCaja, Estado, Paginacion, Selector, Tarjeta, Vacio } from '../../components/ui';
import { Aparecer, EsqueletoLista } from '../../components/movimiento';
import { cls, dinero, etiqueta, fecha } from '../../lib/formato';
import TablaSolicitudes, { ESTADOS_SOLICITUD } from '../portal/TablaSolicitudes';

export default function Pedidos() {
  const { cliente } = useAuth();
  const empresa = cliente?.tipo === 'empresa';
  const [pagina, setPagina] = useState(1);
  const [params] = useSearchParams();
  const [estado, setEstado] = useState(params.get('estado') || '');
  const [folio, setFolio] = useState('');
  const q = useQuery({ queryKey: ['mis-pedidos', pagina, estado, empresa], queryFn: () => get<Pagina<PedidoResumen>>(`/cuenta/pedidos?pagina=${pagina}&por_pagina=10${empresa ? '&canal=corporativo' : ''}${estado ? `&estado=${estado}` : ''}`) });
  const filtros = [['', 'Todos'], ['pendiente_pago', 'Por pagar'], ['en_preparacion', 'En preparación'], ['enviado', 'Enviados'], ['entregado', 'Entregados']];
  const items = q.data?.items.filter((pedido) => pedido.folio.toLowerCase().includes(folio.trim().toLowerCase())) || [];
  return (
    <Tarjeta titulo={empresa ? 'Mis solicitudes' : 'Mis pedidos'} sub={empresa ? 'Solicitudes corporativas y su estado de revisión' : 'Historial de tus pedidos'}>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        {empresa && <>
          <label className="block w-full text-sm sm:w-56"><span className="mb-1 block font-semibold text-tinta-800">Estado</span>
            <Selector value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }}>
              <option value="">Todas</option>{ESTADOS_SOLICITUD.map((v) => <option key={v} value={v}>{etiqueta(v)}</option>)}</Selector></label>
          <label className="block w-full text-sm sm:max-w-xs"><span className="mb-1 block font-semibold text-tinta-800">Folio</span>
            <Entrada value={folio} onChange={(e) => setFolio(e.target.value)} placeholder="Buscar en esta página" /></label>
        </>}
        {!empresa && filtros.map(([v, n]) => <button key={v} onClick={() => { setEstado(v); setPagina(1); }} className={cls('rounded-full px-3 py-1 text-xs font-semibold ring-1', estado === v ? 'bg-tinta-900 text-white ring-tinta-900' : 'ring-arena-300')}>{n}</button>)}
      </div>
      <ErrorCaja error={q.error} />
      {q.isLoading ? <EsqueletoLista /> : !items.length ? <Vacio titulo={folio ? 'No hay coincidencias en esta página' : empresa && estado ? 'No hay solicitudes en este estado' : empresa ? 'Aún no tienes solicitudes' : 'Aún no tienes pedidos'} texto={folio ? 'Prueba otro folio o cambia de página.' : empresa && estado ? 'Elige otro estado o vuelve a «Todas».' : empresa ? 'Crea una solicitud por empleado y aquí verás su avance.' : 'Cuando realices un pedido, aquí verás su estado.'}
        accion={empresa && !folio && !estado ? <Link to="/cuenta/solicitudes/nueva" className="mt-2 font-semibold text-menta-700">Crear solicitud →</Link> : undefined} /> : (
        empresa ? <TablaSolicitudes items={items} /> : (
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
        )
      )}
      {q.data && <Paginacion pagina={q.data.pagina} paginas={q.data.paginas} total={q.data.total} onCambio={setPagina} />}
    </Tarjeta>
  );
}
