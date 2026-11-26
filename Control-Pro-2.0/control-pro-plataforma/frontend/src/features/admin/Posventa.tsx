import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { abrirPrivado, get, post } from '../../api/cliente';
import type { ConteoBandejas, Devolucion, Incidencia, Pagina } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { Aviso, Boton, Campo, Cargando, Entrada, ErrorCaja, Estado, Modal, Paginacion, Selector, Tabla, Tarjeta, Td, Texto, useAviso, Vacio } from '../../components/ui';
import ChipTurno from '../../components/ChipTurno';
import PrioridadIncidencia from '../../components/PrioridadIncidencia';
import TarjetaIncidencia from '../../components/TarjetaIncidencia';
import { bandejasPanel, filtroBandeja, PestanasBandeja } from '../../components/BandejasIncidencia';
import { cls, dinero, etiqueta, fechaHora, haceTiempo, MOTIVOS_DEVOLUCION, tipoIncidencia } from '../../lib/formato';
import { Encabezado, useSucursalesAdmin } from './AdminLayout';

const FILTROS_DEV = [['solicitada', 'Por autorizar'], ['autorizada,en_camino', 'Por recibir'], ['recibida', 'Por inspeccionar'], ['inspeccionada,reembolsada', 'Por cerrar'], ['', 'Todas']];

export function Devoluciones() {
  const { puede, usuario } = useAuth();
  const qc = useQueryClient();
  const avisar = useAviso();
  const sucs = useSucursalesAdmin();
  const [estado, setEstado] = useState('solicitada');
  const [pagina, setPagina] = useState(1);
  const q = useQuery({ queryKey: ['admin-devoluciones', estado, pagina], queryFn: () => get<Pagina<Devolucion>>(`/admin/devoluciones?pagina=${pagina}${estado ? `&estado=${estado}` : ''}`) });
  const [sel, setSel] = useState<Devolucion | null>(null);
  const [f, setF] = useState<any>({});
  const refrescar = () => qc.invalidateQueries({ queryKey: ['admin-devoluciones'] });
  const m = useMutation({
    mutationFn: (accion: string) => {
      const id = sel!.id;
      if (accion === 'autorizar') return post(`/admin/devoluciones/${id}/autorizar`, { sucursal_id: Number(f.sucursal_id), nota: f.nota || null });
      if (accion === 'rechazar') return post(`/admin/devoluciones/${id}/rechazar`, { motivo: f.nota });
      if (accion === 'recibir') return post(`/admin/devoluciones/${id}/recibir`, { cantidades: f.recibidas || {}, observaciones: f.nota || null });
      if (accion === 'inspeccionar') return post(`/admin/devoluciones/${id}/inspeccionar`, { resultados: f.resultados || {}, nota: f.nota || null });
      return post(`/admin/devoluciones/${id}/cerrar`, { nota: f.nota || null });
    },
    onSuccess: (d: Devolucion) => { refrescar(); setSel(d); setF({}); avisar(`Devolución ${etiqueta(d.estado).toLowerCase()}.`); },
  });
  const puedeRecibir = sel?.sucursal_recibe && (usuario?.rol.alcance_global || usuario?.sucursales.some((s) => s.id === sel.sucursal_recibe!.id)) && puede('devolucion.recibir');
  const abrir = (d: Devolucion) => {
    setSel(d);
    setF({ recibidas: Object.fromEntries(d.detalles.map((x) => [x.id, x.cantidad])), resultados: Object.fromEntries(d.detalles.map((x) => [x.id, { aptas: x.recibida, merma: 0 }])) });
  };
  return (
    <>
      <Encabezado titulo="Devoluciones" sub="Solicitud con evidencia → autorización → recepción → inspección → reembolso" />
      <Tarjeta>
        <div className="mb-4 flex flex-wrap gap-1.5">{FILTROS_DEV.map(([v, n]) => <button key={v} onClick={() => { setEstado(v); setPagina(1); }} className={cls('rounded-full px-3 py-1 text-xs font-semibold ring-1', estado === v ? 'bg-tinta-900 text-white ring-tinta-900' : 'ring-tinta-200')}>{n}</button>)}</div>
        {q.isLoading ? <Cargando forma="tabla" /> : (
          <Tabla columnas={['Folio', 'Pedido', 'Motivo', 'Artículos', 'Recibe', 'Monto', 'Estado', '']} vacia={!q.data?.items.length}>
            {q.data?.items.map((d) => (
              <tr key={d.id}><Td><p className="font-semibold">{d.folio}</p><p className="text-xs text-tinta-400">{fechaHora(d.creado)}</p></Td>
                <Td><Link to={`/admin/pedidos/${d.pedido_id}`} className="text-menta-700 hover:underline">{d.pedido_folio}</Link></Td><Td className="text-xs">{MOTIVOS_DEVOLUCION[d.motivo]}</Td>
                <Td className="text-xs">{d.detalles.map((x) => `${x.cantidad}× ${x.sku}`).join(', ')}</Td><Td className="text-xs">{d.sucursal_recibe?.nombre || '—'}</Td>
                <Td>{Number(d.monto_reembolso) ? dinero(d.monto_reembolso) : '—'}</Td><Td><Estado valor={d.estado} /></Td><Td><Boton tam="sm" variante="secundario" onClick={() => abrir(d)}>Gestionar</Boton></Td></tr>
            ))}
          </Tabla>
        )}
        {q.data && <Paginacion pagina={q.data.pagina} paginas={q.data.paginas} total={q.data.total} onCambio={setPagina} />}
      </Tarjeta>
      <Modal abierto={!!sel} titulo={sel ? `Devolución ${sel.folio}` : ''} onCerrar={() => setSel(null)} ancho="max-w-2xl">
        {sel && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between"><span>{MOTIVOS_DEVOLUCION[sel.motivo]} · pedido {sel.pedido_folio}</span><Estado valor={sel.estado} /></div>
            <p className="rounded-lg bg-tinta-50 p-3">{sel.descripcion}</p>
            <div className="flex flex-wrap gap-2">{sel.evidencias.map((e, i) => e.startsWith('/api/') ? <button key={e} onClick={() => abrirPrivado(e)} className="inline-flex items-center gap-1 text-xs font-semibold text-menta-700"><FileText className="h-3 w-3" />Evidencia {i + 1}</button> : <span key={e} className="text-xs text-tinta-500">{e}</span>)}</div>
            {sel.guia_retorno && <p className="text-xs">Guía de retorno: {sel.guia_retorno}</p>}

            {sel.estado === 'solicitada' && puede('devolucion.gestionar') && <>
              <Campo etiqueta="Sucursal que recibe"><Selector value={f.sucursal_id || ''} onChange={(e) => setF({ ...f, sucursal_id: e.target.value })}><option value="">Elige…</option>{sucs.data?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Selector></Campo>
              <Campo etiqueta="Nota para el cliente / motivo de rechazo"><Texto value={f.nota || ''} onChange={(e) => setF({ ...f, nota: e.target.value })} /></Campo>
              <div className="flex justify-end gap-2"><Boton variante="peligro" disabled={(f.nota || '').trim().length < 5} onClick={() => m.mutate('rechazar')}>Rechazar</Boton><Boton disabled={!f.sucursal_id} onClick={() => m.mutate('autorizar')}>Autorizar</Boton></div>
            </>}
            {['autorizada', 'en_camino'].includes(sel.estado) && (puedeRecibir ? <>
              <p className="font-semibold">Unidades recibidas físicamente</p>
              {sel.detalles.map((x) => <div key={x.id} className="flex items-center justify-between gap-2"><span>{x.sku} · {x.nombre} {x.talla}</span>
                <span className="flex items-center gap-2"><Entrada type="number" min={0} max={x.cantidad} className="w-20" value={f.recibidas?.[x.id] ?? x.cantidad} onChange={(e) => setF({ ...f, recibidas: { ...f.recibidas, [x.id]: Number(e.target.value) } })} />de {x.cantidad}</span></div>)}
              <Campo etiqueta="Observaciones"><Texto value={f.nota || ''} onChange={(e) => setF({ ...f, nota: e.target.value })} /></Campo>
              <div className="flex justify-end"><Boton onClick={() => m.mutate('recibir')}>Registrar recepción</Boton></div>
            </> : <Aviso>Se recibe en {sel.sucursal_recibe?.nombre}; solo esa sucursal registra la recepción.</Aviso>)}
            {sel.estado === 'recibida' && (puedeRecibir ? <>
              <p className="font-semibold">Inspección: ¿regresa al inventario?</p>
              {sel.detalles.map((x) => (
                <div key={x.id} className="grid items-end gap-2 sm:grid-cols-[1fr_90px_90px]"><span>{x.sku} · recibidas {x.recibida}</span>
                  <Campo etiqueta="Aptas"><Entrada type="number" min={0} max={x.recibida} value={f.resultados?.[x.id]?.aptas ?? x.recibida} onChange={(e) => setF({ ...f, resultados: { ...f.resultados, [x.id]: { aptas: Number(e.target.value), merma: x.recibida - Number(e.target.value) } } })} /></Campo>
                  <Campo etiqueta="Merma"><Entrada type="number" value={f.resultados?.[x.id]?.merma ?? 0} readOnly /></Campo></div>
              ))}
              <Aviso>Las piezas aptas reingresan al inventario de {sel.sucursal_recibe?.nombre}; la merma no. Se genera el reembolso (o ajuste si el pedido es a crédito) por lo recibido.</Aviso>
              <Campo etiqueta="Dictamen"><Texto value={f.nota || ''} onChange={(e) => setF({ ...f, nota: e.target.value })} /></Campo>
              <div className="flex justify-end"><Boton onClick={() => m.mutate('inspeccionar')}>Guardar inspección</Boton></div>
            </> : <Aviso>Pendiente de inspección en {sel.sucursal_recibe?.nombre}.</Aviso>)}
            {['inspeccionada', 'reembolsada'].includes(sel.estado) && puede('devolucion.gestionar') && <>
              {sel.estado === 'inspeccionada' && Number(sel.monto_reembolso) > 0 && <Aviso tipo="alerta">Falta registrar el reembolso de {dinero(sel.monto_reembolso)} en Pagos y reembolsos.</Aviso>}
              <div className="flex justify-end"><Boton onClick={() => m.mutate('cerrar')}>Cerrar devolución</Boton></div>
            </>}
            <ErrorCaja error={m.error} />
            <div className="border-t border-tinta-100 pt-3"><p className="mb-1 text-xs font-semibold uppercase text-tinta-400">Historial</p>
              {sel.historial.map((h, i) => <p key={i} className="text-xs">{fechaHora(h.fecha)} · <b>{etiqueta(h.nuevo)}</b> · {h.actor}{h.motivo ? ` — ${h.motivo}` : ''}</p>)}</div>
          </div>
        )}
      </Modal>
    </>
  );
}

const PRIORIDADES = [['', 'Todas las prioridades'], ['critica', 'Crítica'], ['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']];

export function Incidencias() {
  const { puede, usuario } = useAuth();
  // Bandeja, prioridad y página viven en la URL: un solo estado, sin contradicciones.
  const [params, setParams] = useSearchParams();
  const cambiar = (cambios: Record<string, string>) => {
    const p = new URLSearchParams(params);
    Object.entries(cambios).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    setParams(p, { replace: true });
  };
  const { bandejas, inicial } = bandejasPanel(puede('surtido.operar'), usuario?.rol.codigo);
  const bandeja = bandejas.find((b) => b.clave === params.get('bandeja')) ?? inicial;
  const prioridad = params.get('prioridad') ?? '';
  const pagina = Math.max(1, Number(params.get('pagina')) || 1);
  const filtro = [filtroBandeja(bandeja), prioridad && `prioridad=${prioridad}`].filter(Boolean).join('&');
  const q = useQuery({ queryKey: ['admin-incidencias', bandeja.clave, prioridad, pagina],
    queryFn: () => get<Pagina<Incidencia> & { conteo: ConteoBandejas }>(`/admin/incidencias?pagina=${pagina}${filtro ? `&${filtro}` : ''}`) });
  // El detalle recibe la bandeja de origen (con prioridad y página) para regresar a ella
  const detalle = (i: Incidencia) => ({ to: `/admin/incidencias/${i.id}`, state: { bandeja: params.toString() } });
  const items = q.data?.items ?? [];
  // Avisos anteriores a la 3B.3 enlazaban a ?abrir=<id>: se redirige a la página de detalle (que valida el acceso).
  const abrir = Number(params.get('abrir')) || 0;
  if (abrir > 0) return <Navigate to={`/admin/incidencias/${abrir}`} replace />;
  const referencia = (i: Incidencia) => i.pedido_id ? (i.pedido_folio ?? `Pedido #${i.pedido_id}`)
    : i.transferencia_id ? `Transferencia #${i.transferencia_id}` : i.devolucion_id ? `Devolución #${i.devolucion_id}` : '—';
  return (
    <>
      <Encabezado titulo="Incidencias" sub="Faltantes, daños, diferencias de recepción y problemas de entrega" />
      <Tarjeta>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <PestanasBandeja etiqueta="Bandejas de incidencias" bandejas={bandejas} activa={bandeja.clave} conteo={q.data?.conteo}
            onCambio={(clave) => cambiar({ bandeja: clave, pagina: '' })} />
          <Selector aria-label="Filtrar por prioridad" className="lg:w-56" value={prioridad}
            onChange={(e) => cambiar({ prioridad: e.target.value, pagina: '' })}>
            {PRIORIDADES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </Selector>
        </div>
        <div role="tabpanel" aria-label={bandeja.titulo}>
          <ErrorCaja error={q.error} />
          {q.isLoading ? <Cargando forma="tabla" /> : q.error ? null : !items.length
            ? <Vacio titulo={`Sin incidencias en «${bandeja.titulo}»`} texto={prioridad ? 'Prueba sin el filtro de prioridad.' : bandeja.vacio} /> : (
            <>
              {/* Escritorio: tabla de 6 columnas */}
              <div className="hidden lg:block">
                <Tabla columnas={['Incidencia', 'Solicitud · sucursal', 'Turno', 'Prioridad', 'Última actividad', '']}>
                  {items.map((i) => (
                    <tr key={i.id}>
                      <Td className="max-w-xs"><p className="font-semibold text-tinta-900">{i.folio}</p><p className="text-xs text-tinta-600">{tipoIncidencia(i.tipo)}</p>
                        <p className="truncate text-xs text-tinta-500" title={i.descripcion}>{i.descripcion}</p></Td>
                      <Td className="text-xs">{i.pedido_id ? <Link to={`/admin/pedidos/${i.pedido_id}`} className="font-semibold text-menta-700 hover:underline">{referencia(i)}</Link> : referencia(i)}
                        {i.cliente && <span className="block text-tinta-600">{i.cliente}</span>}</Td>
                      <Td><ChipTurno turno={i.turno} portal="lurima" desde={i.turno_desde} /></Td>
                      <Td><PrioridadIncidencia prioridad={i.prioridad} /></Td>
                      <Td className="whitespace-nowrap text-xs text-tinta-600"><span title={fechaHora(i.ultima_actividad)}>{haceTiempo(i.ultima_actividad)}</span></Td>
                      <Td><Link {...detalle(i)} aria-label={`Gestionar ${i.folio}`} className="inline-flex min-h-9 items-center rounded-xl px-3 text-xs font-semibold text-tinta-800 ring-1 ring-tinta-200 hover:bg-white">Gestionar</Link></Td>
                    </tr>
                  ))}
                </Tabla>
              </div>
              {/* Tableta y móvil: tarjetas (sin desplazamiento horizontal) */}
              <ul className="divide-y divide-tinta-100 lg:hidden">
                {items.map((i) => (
                  <li key={i.id}>
                    <TarjetaIncidencia i={i} portal="lurima" a={`/admin/incidencias/${i.id}`} state={detalle(i).state} etiqueta={`Gestionar ${i.folio}`}
                      contexto={<span>{referencia(i)}{i.cliente ? ` · ${i.cliente}` : ''}</span>} />
                  </li>
                ))}
              </ul>
            </>
          )}
          {q.data && <Paginacion pagina={q.data.pagina} paginas={q.data.paginas} total={q.data.total} onCambio={(p) => cambiar({ pagina: String(p) })} />}
        </div>
      </Tarjeta>
    </>
  );
}
