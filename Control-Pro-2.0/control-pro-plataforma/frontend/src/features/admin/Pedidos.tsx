import { Fragment, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, CheckCheck, ChevronRight, FileDown, FileText, History, MessagesSquare, PencilLine, Search, ShieldAlert, Shirt, Truck, Undo2, Users, Wallet, X } from 'lucide-react';
import { claveIdempotencia, descargar, get, post } from '../../api/cliente';
import type { Pagina, Pedido, PedidoResumen } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { useConfig } from '../../app/config';
import LineaTiempoSolicitud from '../../components/LineaTiempoSolicitud';
import { BASE_APROBADOR, esAprobador, useBasePanel } from '../../app/panel';
import { useCelebrar } from '../../components/Celebracion';
import { AdjuntarEvidencias, GaleriaEvidencias } from '../../components/Archivos';
import FirmaEnLinea from '../../components/FirmaEnLinea';
import Expediente from '../../components/Expediente';
import { BotonWhatsApp, ChatSolicitud } from '../colaboracion/Mensajes';
import { Aviso, Boton, Campo, Cargando, Entrada, ErrorCaja, Estado, Modal, Paginacion, Selector, Tabla, Tarjeta, Td, Texto, useAviso } from '../../components/ui';
import { cls, dinero, etiqueta, fechaHora, METODOS, mensajeError, PROBLEMAS_RECEPCION } from '../../lib/formato';
import { Aparecer, EsqueletoLista, Palomita } from '../../components/movimiento';
import ComprobanteEntrega from '../cuenta/ComprobanteEntrega';
import EditarSolicitud from './EditarSolicitud';
import PanelNegociacion from './Negociacion';
import { Encabezado, FiltroSucursal } from './AdminLayout';
import SelloCNR from '../../components/SelloCNR';
import TarjetaIncidencia from '../../components/TarjetaIncidencia';
import { PanelPestana, Pestanas, usePestana } from '../../components/Pestanas';

const ESTADOS_FILTRO = [['', 'Todos'], ['en_revision', 'Por aprobar'], ['pendiente_pago,pago_en_revision', 'Por pagar'], ['confirmado,en_preparacion', 'Por surtir'],
  ['parcialmente_enviado,enviado', 'En camino'], ['parcialmente_entregado,entregado', 'Entregados'], ['cerrado', 'Cerrados'], ['cancelado,expirado,rechazado', 'Cancelados']];

export function Pedidos() {
  const [params, setParams] = useSearchParams();
  const [texto, setTexto] = useState(params.get('q') || '');
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); if (k !== 'pagina') p.delete('pagina'); setParams(p); };
  const q = useQuery({ queryKey: ['admin-pedidos', params.toString()], queryFn: () => get<Pagina<PedidoResumen>>(`/admin/pedidos?por_pagina=20&${params.toString()}`), placeholderData: keepPreviousData });
  return (
    <>
      <Encabezado titulo="Pedidos" sub="Tienda en línea y canal corporativo">
        <Boton variante="secundario" icono={<FileDown className="h-4 w-4" />} onClick={() => descargar(`/admin/reportes/exportar/pedidos?formato=xlsx${params.get('sucursal_id') ? `&sucursal_id=${params.get('sucursal_id')}` : ''}`)}>Exportar Excel</Boton>
      </Encabezado>
      <Tarjeta>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <form onSubmit={(e) => { e.preventDefault(); set('q', texto); }} className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-300" />
            <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Folio, cliente o correo" className="w-64 pl-9" />
          </form>
          <Selector value={params.get('canal') || ''} onChange={(e) => set('canal', e.target.value)} className="w-40"><option value="">Ambos canales</option><option value="tienda">Tienda</option><option value="corporativo">Corporativo</option></Selector>
          <FiltroSucursal valor={params.get('sucursal_id') || ''} onCambio={(v) => set('sucursal_id', v)} />
        </div>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {ESTADOS_FILTRO.map(([v, n]) => <button key={v} onClick={() => set('estado', v)} className={cls('rounded-full px-3 py-1 text-xs font-semibold ring-1', (params.get('estado') || '') === v ? 'bg-tinta-900 text-white ring-tinta-900' : 'ring-tinta-200 hover:bg-tinta-50')}>{n}</button>)}
        </div>
        <ErrorCaja error={q.error} />
        {q.isLoading ? <Cargando forma="tabla" /> : (
          <Tabla columnas={['Folio', 'Fecha', 'Cliente', 'Canal', 'Sucursales', 'Artículos', 'Total', 'Estado']} vacia={!q.data?.items.length}>
            {q.data?.items.map((p) => (
              <tr key={p.id} className="hover:bg-tinta-50/60">
                <Td><Link to={`/admin/pedidos/${p.id}`} className="font-semibold text-tinta-900 hover:text-menta-700">{p.folio}</Link></Td>
                <Td className="text-xs">{fechaHora(p.creado)}</Td><Td>{p.cliente.nombre}</Td>
                <Td><span className="text-xs font-semibold capitalize">{p.canal}</span><br /><span className="text-xs text-tinta-400">{p.modalidad === 'recoger' ? 'Recoger' : 'Envío'}</span></Td>
                <Td className="text-xs">{p.sucursales.join(', ') || '—'}</Td><Td>{p.articulos}</Td><Td className="font-semibold">{dinero(p.total)}</Td><Td><Estado valor={p.estado} /></Td>
              </tr>
            ))}
          </Tabla>
        )}
        {q.data && <Paginacion pagina={q.data.pagina} paginas={q.data.paginas} total={q.data.total} onCambio={(p) => set('pagina', String(p))} />}
      </Tarjeta>
    </>
  );
}

// ---------------------------------------------------------------- bandeja de solicitudes de sucursales

const ATENDIDAS = 'devuelto,confirmado,en_preparacion,parcialmente_enviado,enviado,parcialmente_entregado,entregado,cerrado,rechazado,cancelado';
const BANDEJA = [['en_revision', 'Nuevas · por revisar'], [ATENDIDAS, 'Atendidas'], ['devuelto', 'En corrección'], ['confirmado,en_preparacion', 'En surtido'],
  ['parcialmente_enviado,enviado', 'En camino'], ['parcialmente_entregado,entregado', 'En recepción y entrega'], ['cerrado', 'Cerradas'],
  ['rechazado,cancelado', 'Rechazadas o canceladas'], ['', 'Todas']];

export function Solicitudes() {
  const base = useBasePanel();
  const [params, setParams] = useSearchParams();
  const estado = params.get('estado') ?? 'en_revision';
  const pagina = Number(params.get('pagina') || 1);
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); p.set(k, v); if (k !== 'pagina') p.delete('pagina'); setParams(p); };
  const q = useQuery({ queryKey: ['admin-solicitudes', estado, pagina], placeholderData: keepPreviousData,
    queryFn: () => get<Pagina<PedidoResumen>>(`/admin/pedidos?canal=corporativo&por_pagina=15&pagina=${pagina}${estado ? `&estado=${estado}` : ''}`) });
  return (
    <>
      <Encabezado titulo="Solicitudes de sucursales" sub="Revisión, surtido, envío y entrega de las solicitudes por empleado" />
      <Tarjeta>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {BANDEJA.map(([v, n]) => <button key={v} onClick={() => set('estado', v)} className={cls('rounded-full px-3 py-1 text-xs font-semibold ring-1 transition', estado === v ? 'bg-tinta-900 text-white ring-tinta-900' : 'ring-tinta-200 hover:bg-tinta-50')}>{n}</button>)}
        </div>
        <ErrorCaja error={q.error} />
        {q.isLoading ? <EsqueletoLista /> : !q.data?.items.length ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center"><Palomita className="text-menta-500" /><p className="font-semibold">Nada pendiente en esta bandeja</p></div>
        ) : (
          <ul className="divide-y divide-tinta-100">
            {q.data.items.map((p, i) => (
              <Aparecer como="li" orden={i} key={p.id}>
                <Link to={`${base}/pedidos/${p.id}`} className="flex flex-wrap items-center gap-4 rounded-lg px-2 py-4 transition hover:bg-tinta-50/60">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-display font-bold">{p.folio}</span><Estado valor={p.estado} /></div>
                    <p className="text-sm font-semibold text-tinta-700">{p.cliente.nombre}</p>
                    <p className="text-xs text-tinta-400">{fechaHora(p.creado)} · {p.articulos} artículo(s){p.sucursales.length ? ` · surte ${p.sucursales.join(', ')}` : ''}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-tinta-300" />
                </Link>
              </Aparecer>
            ))}
          </ul>
        )}
        {q.data && <Paginacion pagina={q.data.pagina} paginas={q.data.paginas} total={q.data.total} onCambio={(p) => set('pagina', String(p))} />}
      </Tarjeta>
    </>
  );
}

/** El aprobador acuerda cotización y precios con la distribuidora por WhatsApp (número configurado en el backend). */
function CotizacionWhatsApp({ folio }: { folio: string }) {
  const { whatsapp } = useConfig();
  if (!whatsapp.distribuidora) return null;
  return (
    <Tarjeta titulo="Cotización y precios" sub="Acuérdalos directamente con la distribuidora">
      <BotonWhatsApp numero={whatsapp.distribuidora} className="w-full justify-center"
        texto={`Hola, te escribe el aprobador corporativo para acordar la cotización y los precios de la solicitud ${folio}.`} />
    </Tarjeta>
  );
}

type Paso = { texto: string; tono: 'hecho' | 'parcial' | 'pendiente' | 'problema'; detalle?: string };
const TONO_PASO: Record<Paso['tono'], string> = {
  hecho: 'bg-menta-50 text-menta-800 ring-menta-200', parcial: 'bg-amber-50 text-amber-900 ring-amber-200',
  pendiente: 'bg-tinta-50 text-tinta-500 ring-tinta-100', problema: 'bg-coral-50 text-coral-800 ring-coral-200',
};

/** Avance de un artículo: surtido → enviado (guía) → recibido en sucursal → entregado al empleado. */
function pasosArticulo(p: Pedido, d: Pedido['detalles'][number]): Paso[] {
  const meta = d.cantidad - d.cantidad_cancelada;
  const asig = (p.asignaciones || []).flatMap((a) => a.detalles.filter((x) => x.pedido_detalle_id === d.id));
  const surtida = asig.reduce((s, x) => s + x.surtida, 0);
  const faltante = asig.reduce((s, x) => s + x.faltante, 0);
  const paquetes = p.paquetes.filter((pq) => pq.contenido.some((c) => c.pedido_detalle_id === d.id));
  const enviadas = paquetes.filter((pq) => pq.envio).reduce((s, pq) => s + pq.contenido.filter((c) => c.pedido_detalle_id === d.id).reduce((t, c) => t + c.cantidad, 0), 0);
  const recs = paquetes.flatMap((pq) => (pq.recepcion?.detalles || []).filter((x) => x.pedido_detalle_id === d.id));
  const recibidas = recs.reduce((s, x) => s + x.recibida, 0) + paquetes.filter((pq) => pq.recepcion && !pq.recepcion.detalles.length)
    .reduce((s, pq) => s + pq.contenido.filter((c) => c.pedido_detalle_id === d.id).reduce((t, c) => t + c.cantidad, 0), 0);
  const problema = recs.find((x) => x.problema);
  const entregadas = (p.entregas_individuales || []).filter((e) => e.estado !== 'pendiente')
    .flatMap((e) => e.detalles.filter((x) => x.pedido_detalle_id === d.id)).reduce((s, x) => s + x.entregada, 0);
  const tono = (n: number): Paso['tono'] => (n >= meta && meta > 0 ? 'hecho' : n > 0 ? 'parcial' : 'pendiente');
  const guias = paquetes.filter((pq) => pq.envio).map((pq) => `${pq.envio!.paqueteria} ${pq.envio!.guia}`).join(', ');
  return [
    { texto: `Surtido ${surtida}/${meta}`, tono: faltante ? 'problema' : tono(surtida), detalle: faltante ? `${faltante} faltante(s)` : undefined },
    { texto: `Enviado ${enviadas}/${meta}`, tono: tono(enviadas), detalle: guias || undefined },
    { texto: `Recibido ${recibidas}/${meta}`, tono: problema ? 'problema' : tono(recibidas), detalle: problema ? PROBLEMAS_RECEPCION[problema.problema!] : undefined },
    { texto: `Entregado ${entregadas}/${meta}`, tono: tono(entregadas) },
  ];
}

/** Seguimiento por empleado: lo que le toca a cada persona, en qué paso va cada artículo y su firma de entrega. */
function EntregasPorEmpleado({ p, onFirma }: { p: Pedido; onFirma: (entregaId: number) => void }) {
  const [filtro, setFiltro] = useState<'todos' | 'pendientes' | 'completos'>('todos');
  const personas = [...new Map(p.detalles.filter((d) => d.empleado).map((d) => [d.empleado!.id, d.empleado!])).values()].map((emp) => {
    const suyos = p.detalles.filter((d) => d.empleado?.id === emp.id);
    const entregas = (p.entregas_individuales || []).filter((e) => e.empleado.id === emp.id);
    const meta = suyos.reduce((s, d) => s + d.cantidad - d.cantidad_cancelada, 0);
    const firmadas = entregas.reduce((s, e) => s + e.detalles.reduce((t, x) => t + x.entregada, 0), 0);
    return { emp, suyos, entregas, meta, firmadas, completo: meta > 0 && firmadas >= meta };
  });
  const visibles = personas.filter((x) => filtro === 'todos' || (filtro === 'completos' ? x.completo : !x.completo));
  return (
    <Tarjeta titulo="Entregas por empleado" sub="Cada artículo de la solicitud a la firma del empleado"
      accion={personas.length > 3 && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar empleados">
          {([['todos', 'Todos', personas.length], ['pendientes', 'Con pendientes', personas.filter((x) => !x.completo).length], ['completos', 'Completos', personas.filter((x) => x.completo).length]] as const).map(([k, t, n]) => (
            <button key={k} type="button" onClick={() => setFiltro(k)} aria-pressed={filtro === k}
              className={cls('min-h-9 rounded-full px-3 text-xs font-semibold ring-1 transition', filtro === k ? 'bg-tinta-900 text-white ring-tinta-900' : 'text-tinta-600 ring-tinta-200 hover:bg-tinta-50')}>
              {t} <span className="opacity-70">{n}</span></button>
          ))}
        </div>
      )}>
      {p.incidencias?.some((i) => ['abierta', 'en_atencion'].includes(i.estado)) && <div className="mb-3"><Aviso tipo="alerta">Hay incidencias abiertas en esta solicitud: revísalas en la pestaña Incidencias.</Aviso></div>}
      {!visibles.length ? <p className="text-sm text-tinta-500">Nadie en este filtro.</p> : (
      <div className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0">
        {visibles.map(({ emp, suyos, entregas, meta, firmadas }) => (
          <article key={emp.id} className="rounded-xl bg-white/60 p-4 ring-1 ring-tinta-100" aria-label={`Seguimiento de ${emp.nombre}`}>
            <header className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-menta-50 text-xs font-bold text-menta-800 ring-1 ring-menta-100" aria-hidden>
                {emp.nombre.split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase()}</span>
              <div className="min-w-0 flex-1"><p className="truncate font-semibold">{emp.nombre}</p><p className="truncate text-xs text-tinta-500">{emp.puesto}</p></div>
              <span className="shrink-0 text-right text-xs"><b className="font-display text-lg text-tinta-900">{firmadas}</b><span className="text-tinta-500">/{meta}</span><span className="block text-[11px] text-tinta-500">entregados</span></span>
            </header>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-tinta-100"><div className="h-full rounded-full bg-menta-500" style={{ width: `${meta ? (firmadas / meta) * 100 : 0}%` }} /></div>
            <ul className="mt-3 space-y-2.5">
              {suyos.map((d) => (
                <li key={d.id} className="text-xs">
                  <p className="text-tinta-800"><b>{d.cantidad}×</b> {d.nombre} · {d.talla}{d.excepcion && <span className="ml-1 text-amber-700">(excepción)</span>}
                    {!!d.cantidad_cancelada && <span className="ml-1 text-coral-700">· {d.cantidad_cancelada} cancelada(s)</span>}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {pasosArticulo(p, d).map((x) => (
                      <span key={x.texto} title={x.detalle} className={cls('rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1', TONO_PASO[x.tono])}>
                        {x.texto}{x.detalle && x.tono === 'problema' ? ` · ${x.detalle}` : ''}</span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            {!!entregas.length && (
              <ul className="mt-3 space-y-2 border-t border-tinta-100 pt-3">
                {entregas.map((e) => {
                  const paq = p.paquetes.find((pq) => pq.id === e.paquete_id);
                  return (
                    <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5"><span className="font-medium text-tinta-700">{paq?.reposicion ? 'Reposición' : 'Paquete'} {paq?.folio}</span><Estado valor={e.estado} /></span>
                        {e.estado !== 'pendiente' && <span className="mt-0.5 block text-tinta-500">Entregó {e.registrado_por || '—'} · {fechaHora(e.entregado_en)}</span>}
                        {e.conformidad_en && <span className="block text-amber-500" aria-label={`${e.valoracion} de 5 estrellas`}>{'★'.repeat(e.valoracion || 0)}<span className="text-tinta-200">{'★'.repeat(5 - (e.valoracion || 0))}</span></span>}
                      </span>
                      {e.tiene_firma && <FirmaEnLinea entregaId={e.id} origen="admin" onAbrir={() => onFirma(e.id)} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
        ))}
      </div>
      )}
    </Tarjeta>
  );
}

/** Artículos agrupados por persona (una fila de encabezado por empleado), con precios y avance. */
function TablaArticulos({ p }: { p: Pedido }) {
  const grupos = new Map<string, Pedido['detalles']>();
  for (const d of p.detalles) {
    const k = d.empleado ? `${d.empleado.nombre}|${d.empleado.puesto}` : '';
    grupos.set(k, [...(grupos.get(k) || []), d]);
  }
  const corporativo = p.canal === 'corporativo';
  return (
    <Tabla columnas={['Artículo', 'Cant.', 'Precio', 'Importe', 'Entregada / cancelada / devuelta']}>
      {[...grupos.entries()].map(([k, dets]) => {
        const [nombre, puesto] = k.split('|');
        return (
          <Fragment key={k || 'sin'}>
            {corporativo && (
              <tr className="bg-tinta-50/70">
                <Td className="py-2"><span className="font-semibold text-tinta-900">{nombre || 'Sin empleado'}</span>{puesto && <span className="ml-2 text-xs text-tinta-500">{puesto}</span>}</Td>
                <Td className="py-2 text-xs text-tinta-500">{dets.reduce((s, d) => s + d.cantidad, 0)} pz</Td><Td className="py-2" /><Td className="py-2 text-xs font-semibold text-tinta-700">{dinero(dets.reduce((s, d) => s + Number(d.importe), 0))}</Td><Td className="py-2" />
              </tr>
            )}
            {dets.map((d) => (
              <tr key={d.id}>
                <Td className={corporativo ? 'pl-8' : ''}><p className="font-semibold">{d.nombre}</p><p className="text-xs text-tinta-500">{d.sku} · {d.color} · {d.talla}</p>
                  {d.excepcion && <p className="mt-1 rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800">Excepción: {d.excepcion}</p>}</Td>
                <Td>{d.cantidad}</Td>
                <Td className="text-xs">{dinero(d.precio_unitario)}{Number(d.descuento_unitario) > 0 && <><br /><span className="text-coral-600">−{dinero(d.descuento_unitario)}</span></>}</Td>
                <Td className="font-semibold">{dinero(d.importe)}</Td>
                <Td className="text-xs">{d.cantidad_entregada} / {d.cantidad_cancelada} / {d.cantidad_devuelta}{!!d.cantidad_por_producir && <span className="block font-semibold text-amber-700">{d.cantidad_por_producir} por producir</span>}</Td>
              </tr>
            ))}
          </Fragment>
        );
      })}
    </Tabla>
  );
}

export function PedidoAdmin() {
  const { id } = useParams();
  const { puede, usuario } = useAuth();
  const base = useBasePanel();
  const aprobador = esAprobador(usuario);
  const qc = useQueryClient();
  const avisar = useAviso();
  const celebrar = useCelebrar();
  const q = useQuery({ queryKey: ['admin-pedido', id], queryFn: () => get<Pedido>(`/admin/pedidos/${id}`) });
  const [modal, setModal] = useState<'aprobar' | 'autorizar' | 'devuelto' | 'rechazado' | 'cancelar' | 'cerrar' | 'efectivo' | 'incidencia' | null>(null);
  const [texto, setTexto] = useState('');
  const [aceptar, setAceptar] = useState(false);
  const [clave, setClave] = useState(() => claveIdempotencia('efectivo'));
  const [tipoInc, setTipoInc] = useState('seguimiento');
  const [evidencias, setEvidencias] = useState<string[]>([]);
  const [comprobante, setComprobante] = useState<number | null>(null);
  const [editando, setEditando] = useState(false);
  const datos = q.data;
  const porDefecto = !datos ? 'articulos'
    : datos.estado === 'aprobado' ? 'pagos'
    : ['confirmado', 'en_preparacion', 'parcialmente_enviado', 'enviado'].includes(datos.estado) ? 'logistica'
    : ['parcialmente_entregado', 'entregado', 'cerrado'].includes(datos.estado) && (datos.entregas_individuales || []).length ? 'seguimiento'
    : 'articulos';
  const [pestana, cambiarPestana] = usePestana(['articulos', 'seguimiento', 'logistica', 'pagos', 'incidencias', 'documentos', 'mensajes', 'historial'], porDefecto);
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['admin-pedido', id] }); qc.invalidateQueries({ queryKey: ['admin-pedidos'] }); };
  const accion = useMutation({
    mutationFn: async () => {
      switch (modal) {
        case 'aprobar': return post(`/admin/pedidos/${id}/decision`, { decision: 'aprobado', motivo: texto || null, aceptar_excepciones: aceptar });
        case 'autorizar': return post(`/admin/pedidos/${id}/autorizar`, { nota: texto || null });
        case 'devuelto': case 'rechazado': return post(`/admin/pedidos/${id}/decision`, { decision: modal, motivo: texto });
        case 'cancelar': return post(`/admin/pedidos/${id}/cancelar`, { motivo: texto });
        case 'cerrar': return post(`/admin/pedidos/${id}/cerrar`, { nota: texto || null });
        case 'efectivo': return post(`/admin/pedidos/${id}/efectivo`, { monto: q.data!.saldo, referencia: texto || null, clave_idempotencia: clave });
        case 'incidencia': return post('/admin/incidencias', { tipo: tipoInc, descripcion: texto, pedido_id: Number(id), prioridad: 'media', evidencias });
      }
    },
    onSuccess: () => {
      refrescar(); setTexto(''); setEvidencias([]); setClave(claveIdempotencia('efectivo'));
      const folio = q.data?.folio ?? '';
      if (modal === 'aprobar') celebrar({ titulo: `Solicitud ${folio} aprobada`, texto: 'La sucursal y la distribuidora ya recibieron el aviso.', paleta: base === BASE_APROBADOR ? 'sd' : 'lurima' });
      else if (modal === 'autorizar') celebrar({ titulo: `Solicitud ${folio} autorizada`, texto: 'Quedó confirmada y el almacén ya puede surtirla.', paleta: 'lurima' });
      else avisar('Operación registrada.');
      setModal(null);
    },
  });
  const validar = useMutation({ mutationFn: ({ pid }: { pid: number }) => post(`/admin/pagos/${pid}/validar`, { nota: 'Validado desde el detalle del pedido' }),
    onSuccess: () => { refrescar(); avisar('Pago actualizado.'); }, onError: (e) => avisar(mensajeError(e), 'error') });

  if (q.isLoading) return <Cargando forma="pagina" />;
  if (!q.data) return <ErrorCaja error={q.error} />;
  const p = q.data;
  const excepciones = p.detalles.some((d) => d.excepcion);
  const abiertas = (p.incidencias || []).filter((i) => ['abierta', 'en_atencion'].includes(i.estado)).length;
  const empleados = new Set(p.detalles.map((d) => d.empleado?.id).filter(Boolean)).size;
  const conSeguimiento = p.canal === 'corporativo' && !!(p.entregas_individuales || []).length;
  const conPagos = (p.canal === 'corporativo' && (!!p.negociacion || aprobador)) || puede('pago.ver');
  const conMensajes = p.canal === 'corporativo' && (aprobador || puede('orden.recibir'));
  const titulos: Record<string, string> = { aprobar: 'Aprobar pedido', autorizar: 'Autorizar pedido para surtir', devuelto: 'Devolver para corrección', rechazado: 'Rechazar pedido', cancelar: 'Cancelar pedido', cerrar: 'Cerrar pedido', efectivo: 'Registrar cobro en efectivo', incidencia: 'Registrar incidencia' };
  const requiereTexto = ['devuelto', 'rechazado', 'cancelar', 'incidencia'].includes(modal || '');

  return (
    <>
      <Encabezado titulo={`${p.canal === 'corporativo' ? 'Solicitud' : 'Pedido'} ${p.folio}`} sub={<span className="inline-flex flex-wrap items-center gap-1.5">{p.canal === 'corporativo' ? `Sucursal ${p.cliente.razon_social || p.cliente.nombre}` : 'Tienda en línea'}{p.cliente.cnr && <SelloCNR />} · {fechaHora(p.creado)}</span>}>
        <Boton variante="secundario" icono={<FileDown className="h-4 w-4" />} onClick={() => descargar(`/admin/pedidos/${p.id}/pdf`, `${p.folio}.pdf`)}>PDF</Boton>
        {p.estado === 'en_revision' && puede('pedido.aprobar') && <>
          {p.canal === 'corporativo' && <Boton variante="secundario" icono={<PencilLine className="h-4 w-4" />} onClick={() => setEditando(true)}>Editar</Boton>}
          <Boton variante="menta" icono={<Check className="h-4 w-4" />} onClick={() => setModal('aprobar')}>Aprobar</Boton>
          <Boton variante="secundario" icono={<Undo2 className="h-4 w-4" />} onClick={() => setModal('devuelto')}>Devolver</Boton>
          <Boton variante="peligro" icono={<X className="h-4 w-4" />} onClick={() => setModal('rechazado')}>Rechazar</Boton>
        </>}
        {p.estado === 'aprobado' && puede('pedido.autorizar') && <Boton variante="menta" icono={<Check className="h-4 w-4" />} onClick={() => setModal('autorizar')}
          disabled={!!p.negociacion?.pendiente || !p.negociacion?.pago_resuelto?.vigente}
          title={p.negociacion?.pendiente ? 'Hay una propuesta pendiente de aceptar o descartar' : !p.negociacion?.pago_resuelto?.vigente ? 'Primero registra el acuerdo de pago y márcalo como resuelto' : undefined}>Autorizar</Boton>}
        {p.estado === 'pendiente_pago' && p.metodo_pago === 'efectivo' && puede('pago.registrar_efectivo') && <Boton variante="menta" onClick={() => setModal('efectivo')}>Cobrar {dinero(p.saldo)} en efectivo</Boton>}
        {p.estado === 'entregado' && puede('pedido.cerrar') && <Boton icono={<CheckCheck className="h-4 w-4" />} onClick={() => setModal('cerrar')}>Cerrar pedido</Boton>}
        {['en_revision', 'devuelto', 'aprobado', 'pendiente_pago', 'pago_en_revision', 'confirmado', 'en_preparacion'].includes(p.estado) && puede('pedido.cancelar') &&
          <Boton variante="fantasma" icono={<Ban className="h-4 w-4" />} onClick={() => setModal('cancelar')}>Cancelar</Boton>}
        {puede('incidencia.gestionar') && <Boton variante="fantasma" onClick={() => setModal('incidencia')}>Incidencia</Boton>}
      </Encabezado>

      <Tarjeta className="mb-5">
        {p.canal === 'corporativo' && p.estado !== 'borrador' ? <LineaTiempoSolicitud p={p} /> : (
          <p className="flex flex-wrap items-center gap-2 text-sm"><Estado valor={p.estado} />{METODOS[p.metodo_pago]} · {p.modalidad === 'recoger' ? `Recoge en ${p.sucursal_recoger?.nombre}` : 'Envío a domicilio'}</p>
        )}
        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,340px)] [&>*]:min-w-0">
          <div className="min-w-0">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([['Total', dinero(p.total), false], [p.canal === 'corporativo' ? 'Empleados' : 'Artículos', p.canal === 'corporativo' ? String(empleados) : String(p.articulos), false],
                [p.canal === 'corporativo' ? 'Entregados a empleados' : 'Entregados', `${p.canal === 'corporativo' ? (p.entregas_individuales || []).reduce((s, e) => s + e.detalles.reduce((t, x) => t + x.entregada, 0), 0) : p.detalles.reduce((s, d) => s + d.cantidad_entregada, 0)}/${p.detalles.reduce((s, d) => s + d.cantidad - d.cantidad_cancelada, 0)}`, false],
                ['Incidencias abiertas', String(abiertas), abiertas > 0]] as const).map(([t, v, mal]) => (
                <div key={t} className="rounded-xl bg-tinta-50/70 px-3 py-2 ring-1 ring-tinta-100">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-tinta-500">{t}</dt>
                  <dd className={cls('font-display text-lg font-bold', mal ? 'text-coral-700' : 'text-tinta-900')}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <aside className="min-w-0 rounded-xl bg-tinta-50/60 p-4 text-sm ring-1 ring-tinta-100" aria-label="Cliente">
            <p className="text-[11px] font-bold uppercase tracking-wide text-tinta-500">{p.canal === 'corporativo' ? 'Sucursal' : 'Cliente'}</p>
            <p className="mt-0.5 font-semibold text-tinta-900">{p.cliente.razon_social || p.cliente.nombre}</p>
            <p className="break-words text-xs text-tinta-500">{p.cliente.correo}{p.cliente.telefono && <> · {p.cliente.telefono}</>}</p>
            {p.direccion_envio && <p className="mt-2 text-xs text-tinta-700"><b>Entrega:</b> {p.direccion_envio.calle} {p.direccion_envio.numero}, {p.direccion_envio.colonia}, {p.direccion_envio.ciudad}, {p.direccion_envio.estado} · CP {p.direccion_envio.cp}
              <span className="block text-tinta-500">Recibe {p.direccion_envio.destinatario} · {p.direccion_envio.telefono}</span></p>}
            {p.notas && <p className="mt-2 rounded-lg bg-white/70 p-2 text-xs">{p.notas}</p>}
            {aprobador ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Link to={`${base}/sucursales-cliente/${p.cliente.id}`} className="text-xs font-semibold text-menta-700">Ver sucursal y su padrón →</Link>
                <BotonWhatsApp numero={p.cliente.telefono} texto={`Hola, te escribo sobre la solicitud ${p.folio}.`} className="ml-auto" />
              </div>
            ) : puede('cliente.ver') && <Link to={`/admin/clientes?q=${encodeURIComponent(p.cliente.correo)}`} className="mt-2 inline-block text-xs font-semibold text-menta-700">Ver cliente →</Link>}
          </aside>
        </div>
      </Tarjeta>

      {(!!p.por_producir || (excepciones && p.estado === 'en_revision')) && (
        <div className="mb-5 space-y-2">
          {!!p.por_producir && <Aviso tipo="alerta">{p.por_producir} pieza(s) quedaron pendientes de producción: no había existencias suficientes al autorizar. El pedido no se completa hasta entregarlas.</Aviso>}
          {excepciones && p.estado === 'en_revision' && <Aviso tipo="alerta">Este pedido incluye productos fuera de la regla por puesto; revisa las justificaciones antes de aprobar.</Aviso>}
        </div>
      )}

      <Pestanas etiqueta={`Secciones de ${p.folio}`} activa={pestana} onCambio={cambiarPestana} className="mb-5"
        items={[
          { clave: 'articulos', titulo: 'Artículos', icono: Shirt, cuenta: p.detalles.length },
          { clave: 'seguimiento', titulo: 'Entregas', icono: Users, cuenta: (p.entregas_individuales || []).filter((e) => e.estado === 'pendiente').length, oculta: !conSeguimiento },
          { clave: 'logistica', titulo: 'Surtido y paquetes', icono: Truck, cuenta: p.paquetes.length, oculta: !p.asignaciones?.length && !p.paquetes.length },
          { clave: 'pagos', titulo: p.canal === 'corporativo' ? 'Negociación y pago' : 'Pagos', icono: Wallet, alerta: p.estado === 'aprobado', oculta: !conPagos },
          { clave: 'incidencias', titulo: 'Incidencias', icono: ShieldAlert, cuenta: abiertas || (p.incidencias?.length ?? 0) + p.devoluciones.length, alerta: abiertas > 0, oculta: !p.incidencias?.length && !p.devoluciones.length },
          { clave: 'documentos', titulo: 'Documentos', icono: FileText, oculta: p.canal !== 'corporativo' },
          { clave: 'mensajes', titulo: 'Mensajes', icono: MessagesSquare, oculta: !conMensajes },
          { clave: 'historial', titulo: 'Historial', icono: History, cuenta: p.historial.length },
        ]} />

      <PanelPestana clave="articulos" activa={pestana}>
        <Tarjeta titulo={<span className="flex items-center gap-2">Artículos <Estado valor={p.estado} /></span>} sub={`${METODOS[p.metodo_pago]} · ${p.modalidad === 'recoger' ? `Recoge en ${p.sucursal_recoger?.nombre}` : 'Envío a domicilio'}`}>
          <TablaArticulos p={p} />
          <dl className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{dinero(p.subtotal)}</dd></div>
            <div className="flex justify-between"><dt>Descuento</dt><dd>−{dinero(p.descuento)}</dd></div>
            <div className="flex justify-between"><dt>Envío</dt><dd>{dinero(p.costo_envio)}</dd></div>
            <div className="flex justify-between border-t border-tinta-100 pt-1 font-display text-lg font-extrabold"><dt>Total</dt><dd>{dinero(p.total)}</dd></div>
            <div className="flex justify-between text-xs text-tinta-500"><dt>Saldo por cobrar</dt><dd>{dinero(p.saldo)}</dd></div>
          </dl>
        </Tarjeta>
      </PanelPestana>

      <PanelPestana clave="seguimiento" activa={pestana}>
        <EntregasPorEmpleado p={p} onFirma={setComprobante} />
      </PanelPestana>

      <PanelPestana clave="logistica" activa={pestana}>
        <div className="space-y-5">
          <Tarjeta titulo="Surtido por almacén">
            {!p.asignaciones?.length ? <p className="text-sm text-tinta-500">Aún sin asignar: el inventario se aparta al confirmar (pago en la tienda o autorización de la solicitud).</p> : (
              <div className="grid gap-3 md:grid-cols-2">
                {p.asignaciones.map((a) => (
                  <div key={a.id} className="rounded-xl p-4 ring-1 ring-tinta-100">
                    <div className="flex items-center justify-between gap-2"><p className="font-semibold">{a.sucursal.nombre}</p><Estado valor={a.estado} /></div>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                      {([['Surtidas', a.detalles.reduce((s, d) => s + d.surtida, 0)], ['Despachadas', a.detalles.reduce((s, d) => s + d.despachada, 0)], ['Faltantes', a.detalles.reduce((s, d) => s + d.faltante, 0)]] as const).map(([t, n]) => (
                        <div key={t} className="rounded-lg bg-tinta-50/70 py-1.5"><dt className="text-tinta-500">{t}</dt><dd className={cls('font-display text-base font-bold', t === 'Faltantes' && n ? 'text-coral-700' : 'text-tinta-900')}>{n}</dd></div>
                      ))}
                    </dl>
                    {puede('surtido.operar') && <Link to={`/admin/surtido/${a.id}`} className="mt-2 inline-block text-xs font-semibold text-menta-700">Abrir surtido →</Link>}
                  </div>
                ))}
              </div>
            )}
          </Tarjeta>
          {!!p.paquetes.length && (
            <Tarjeta titulo="Paquetes" sub="Cada paquete con su guía, su estado y su recepción">
              <Tabla columnas={['Paquete', 'Desde', 'Contenido', 'Guía', 'Estado']}>
                {p.paquetes.map((pq) => (
                  <tr key={pq.id}>
                    <Td className="font-semibold">{pq.folio}{pq.reposicion && <span className="mt-1 block w-fit rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800">Reposición · {pq.reposicion.folio}</span>}</Td>
                    <Td className="text-xs">{pq.sucursal}</Td>
                    <Td className="text-xs">{(pq.individuales || []).length ? `${(pq.individuales || []).length} persona(s) · ${pq.contenido.reduce((s, c) => s + c.cantidad, 0)} pieza(s)` : pq.contenido.map((c) => `${c.cantidad}× ${c.sku}`).join(', ')}</Td>
                    <Td className="text-xs">{pq.envio ? `${pq.envio.paqueteria} · ${pq.envio.guia}` : '—'}{pq.recepcion && <p className={pq.recepcion.estado === 'parcial' ? 'text-coral-700' : 'text-menta-700'}>Recepción {etiqueta(pq.recepcion.estado).toLowerCase()}</p>}</Td>
                    <Td><Estado valor={pq.estado} /></Td>
                  </tr>
                ))}
              </Tabla>
            </Tarjeta>
          )}
        </div>
      </PanelPestana>

      <PanelPestana clave="pagos" activa={pestana}>
        <div className="space-y-5">
          {p.canal === 'corporativo' && p.negociacion && <PanelNegociacion p={p} />}
          {p.canal === 'corporativo' && aprobador && <CotizacionWhatsApp folio={p.folio} />}
          {puede('pago.ver') && <Tarjeta titulo="Pagos y reembolsos">
            {!p.pagos.length ? <p className="text-sm text-tinta-500">Sin pagos registrados.</p> : (
              <Tabla columnas={['Folio', 'Método', 'Referencia', 'Monto', 'Estado', '']}>
                {p.pagos.map((x) => (
                  <tr key={x.id}><Td>{x.folio}</Td><Td>{METODOS[x.metodo]}</Td><Td className="text-xs">{x.referencia || '—'}{x.motivo_rechazo && <p className="text-coral-600">{x.motivo_rechazo}</p>}</Td>
                    <Td>{dinero(x.monto)}{Number(x.monto_reembolsado) > 0 && <p className="text-xs text-tinta-500">Reembolsado {dinero(x.monto_reembolsado)}</p>}</Td><Td><Estado valor={x.estado} /></Td>
                    <Td>{x.estado === 'en_proceso' && puede('pago.validar') && <div className="flex gap-1">
                      <Boton tam="sm" variante="menta" onClick={() => validar.mutate({ pid: x.id })}>Validar</Boton>
                      <Link to="/admin/pagos" className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold ring-1 ring-tinta-200">Rechazar…</Link></div>}</Td></tr>
                ))}
              </Tabla>
            )}
          </Tarjeta>}
        </div>
      </PanelPestana>

      <PanelPestana clave="incidencias" activa={pestana}>
        <div className="space-y-5">
          {!!p.incidencias?.length && (
            <Tarjeta titulo="Incidencias" accion={puede('incidencia.gestionar') && <Link to="/admin/incidencias" className="text-xs font-semibold text-menta-700">Gestionar →</Link>}>
              <div className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0">
                {p.incidencias.map((i) => {
                  const persona = [i.empleado?.nombre, i.articulo && `${i.articulo.nombre} (${i.articulo.talla})`].filter(Boolean).join(' · ');
                  return (
                    <TarjetaIncidencia key={i.id} i={i} portal="lurima" a={puede('incidencia.gestionar') ? `/admin/incidencias/${i.id}` : undefined}
                      contexto={<>{persona && <span>{persona}</span>}<span>Estado: {etiqueta(i.estado)}</span></>}>
                      {!!i.evidencias?.length && <div className="mt-2"><GaleriaEvidencias urls={i.evidencias} titulo={`Evidencia de ${i.folio}`} /></div>}
                    </TarjetaIncidencia>
                  );
                })}
              </div>
            </Tarjeta>
          )}
          {!!p.devoluciones.length && (
            <Tarjeta titulo="Devoluciones">{p.devoluciones.map((d) => <div key={d.id} className="mb-2 flex justify-between text-sm">{puede('devolucion.gestionar') ? <Link to="/admin/devoluciones" className="font-semibold hover:underline">{d.folio}</Link> : <span className="font-semibold">{d.folio}</span>}<Estado valor={d.estado} /></div>)}</Tarjeta>
          )}
        </div>
      </PanelPestana>

      <PanelPestana clave="documentos" activa={pestana}>
        {p.canal === 'corporativo' && <Expediente pedidoId={p.id} folio={p.folio} origen="admin" onComprobante={setComprobante} />}
      </PanelPestana>

      <PanelPestana clave="mensajes" activa={pestana}>
        <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
          {p.canal === 'corporativo' && aprobador && <ChatSolicitud key={`s-${p.id}`} pedidoId={p.id} tipo="sucursal" titulo="Conversación con la sucursal" />}
          {p.canal === 'corporativo' && aprobador && !['borrador', 'en_revision', 'devuelto'].includes(p.estado) &&
            <ChatSolicitud key={`d-${p.id}`} pedidoId={p.id} tipo="distribuidora" titulo="Conversación con la distribuidora" />}
          {p.canal === 'corporativo' && !aprobador && puede('orden.recibir') &&
            <ChatSolicitud key={`a-${p.id}`} pedidoId={p.id} tipo="distribuidora" titulo="Conversación con el aprobador" />}
        </div>
      </PanelPestana>

      <PanelPestana clave="historial" activa={pestana}>
        <Tarjeta titulo="Historial" sub="Cada cambio de estado, quién lo hizo y cuándo (lo más reciente primero)">
          <ol className="space-y-3 text-sm">
            {[...p.historial].reverse().map((h, i) => <li key={i} className="border-l-2 border-menta-300 pl-3"><p className="font-semibold">{etiqueta(h.nuevo)}</p><p className="text-xs text-tinta-500">{fechaHora(h.fecha)} · {h.actor}</p>{h.motivo && <p className="text-xs text-tinta-600">{h.motivo}</p>}</li>)}
          </ol>
        </Tarjeta>
      </PanelPestana>

      <ComprobanteEntrega entregaId={comprobante} origen="admin" folio={p.folio} onCerrar={() => setComprobante(null)} />
      {p.canal === 'corporativo' && <EditarSolicitud p={p} abierto={editando} onCerrar={() => setEditando(false)} />}
      <Modal abierto={!!modal} titulo={modal ? titulos[modal] : ''} onCerrar={() => setModal(null)}>
        <div className="space-y-4">
          {modal === 'aprobar' && <>
            <p className="text-sm text-tinta-500">Aprobar no aparta inventario: la distribuidora cobra a la sucursal y, al autorizarla, se aparta lo disponible. Si no la autoriza a tiempo, la solicitud vence.</p>
            {excepciones && <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><input type="checkbox" checked={aceptar} onChange={(e) => setAceptar(e.target.checked)} className="mt-1" />Autorizo las excepciones por puesto incluidas en este pedido.</label>}
          </>}
          {modal === 'autorizar' && <Aviso>El pago está resuelto (acuerdo definitivo de cómo y cuándo se pagará). Al autorizarla se aparta el inventario disponible, lo que falte queda pendiente de producción y se avisa al almacén para surtir.{p.reserva_expira ? ` El plazo para autorizar vence el ${fechaHora(p.reserva_expira)}.` : ''}</Aviso>}
          {modal === 'efectivo' && <Aviso>Confirma que recibiste {dinero(p.saldo)} en efectivo. El cobro queda registrado a tu nombre y confirma el pedido.</Aviso>}
          {modal === 'cerrar' && <p className="text-sm text-tinta-500">Solo se cierra si no hay incidencias abiertas, devoluciones en trámite, reembolsos pendientes ni entregas individuales pendientes.</p>}
          {modal === 'incidencia' && <Campo etiqueta="Tipo"><Selector value={tipoInc} onChange={(e) => setTipoInc(e.target.value)}>
            {['seguimiento', 'talla_incorrecta', 'articulo_faltante', 'articulo_danado', 'paquete_no_recibido', 'error_preparacion', 'otro'].map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</Selector></Campo>}
          {modal === 'incidencia' && <div><p className="mb-1.5 text-sm font-semibold text-tinta-800">Foto de evidencia <span className="font-normal text-tinta-400">(opcional)</span></p>
            <AdjuntarEvidencias valor={evidencias} onCambio={setEvidencias} /></div>}
          <Campo etiqueta={modal === 'efectivo' ? 'Folio de caja (opcional)' : requiereTexto ? 'Motivo / descripción (obligatorio)' : 'Comentario (opcional)'}>
            {modal === 'efectivo' ? <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} /> : <Texto value={texto} onChange={(e) => setTexto(e.target.value)} />}
          </Campo>
          <ErrorCaja error={accion.error} />
          <div className="flex justify-end gap-2">
            <Boton variante="secundario" onClick={() => setModal(null)}>Volver</Boton>
            <Boton variante={['rechazado', 'cancelar'].includes(modal || '') ? 'peligro' : 'primario'} cargando={accion.isPending}
              disabled={(requiereTexto && texto.trim().length < (modal === 'incidencia' ? 10 : 5)) || (modal === 'aprobar' && excepciones && !aceptar)} onClick={() => accion.mutate()}>Confirmar</Boton>
          </div>
        </div>
      </Modal>
    </>
  );
}
