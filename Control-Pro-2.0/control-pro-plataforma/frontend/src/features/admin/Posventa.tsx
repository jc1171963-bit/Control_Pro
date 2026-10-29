import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { abrirPrivado, get, patch, post } from '../../api/cliente';
import type { Devolucion, Incidencia, Pagina } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { Aviso, Boton, Campo, Cargando, Entrada, ErrorCaja, Estado, Modal, Paginacion, Selector, Tabla, Tarjeta, Td, Texto, useAviso } from '../../components/ui';
import { cls, dinero, etiqueta, fechaHora, MOTIVOS_DEVOLUCION } from '../../lib/formato';
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
        {q.isLoading ? <Cargando /> : (
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

export function Incidencias() {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [estado, setEstado] = useState('abierta,en_atencion');
  const [pagina, setPagina] = useState(1);
  const q = useQuery({ queryKey: ['admin-incidencias', estado, pagina], queryFn: () => get<Pagina<Incidencia>>(`/admin/incidencias?pagina=${pagina}${estado ? `&estado=${estado}` : ''}`) });
  const [sel, setSel] = useState<Incidencia | null>(null);
  const [nuevoEstado, setNuevoEstado] = useState('');
  const [comentario, setComentario] = useState('');
  const m = useMutation({
    mutationFn: () => patch<Incidencia>(`/admin/incidencias/${sel!.id}`, { estado: nuevoEstado || null, comentario: comentario || null }),
    onSuccess: (i) => { qc.invalidateQueries({ queryKey: ['admin-incidencias'] }); setSel(i); setComentario(''); avisar('Incidencia actualizada.'); },
  });
  return (
    <>
      <Encabezado titulo="Incidencias" sub="Faltantes, daños, diferencias de recepción y problemas de entrega" />
      <Tarjeta>
        <div className="mb-4 flex flex-wrap gap-1.5">{[['abierta,en_atencion', 'Abiertas'], ['resuelta', 'Resueltas'], ['cerrada', 'Cerradas'], ['', 'Todas']].map(([v, n]) =>
          <button key={v} onClick={() => { setEstado(v); setPagina(1); }} className={cls('rounded-full px-3 py-1 text-xs font-semibold ring-1', estado === v ? 'bg-tinta-900 text-white ring-tinta-900' : 'ring-tinta-200')}>{n}</button>)}</div>
        {q.isLoading ? <Cargando /> : (
          <Tabla columnas={['Folio', 'Tipo', 'Referencia', 'Descripción', 'Prioridad', 'Estado', '']} vacia={!q.data?.items.length}>
            {q.data?.items.map((i) => (
              <tr key={i.id}><Td><p className="font-semibold">{i.folio}</p><p className="text-xs text-tinta-400">{fechaHora(i.creado)}</p></Td><Td className="text-xs">{i.tipo.replace(/_/g, ' ')}</Td>
                <Td className="text-xs">{i.pedido_id ? <Link to={`/admin/pedidos/${i.pedido_id}`} className="text-menta-700">Pedido #{i.pedido_id}</Link> : i.transferencia_id ? `Transferencia #${i.transferencia_id}` : i.devolucion_id ? `Devolución #${i.devolucion_id}` : '—'}</Td>
                <Td className="max-w-sm text-xs">{i.descripcion}</Td><Td><Estado valor={i.prioridad} /></Td><Td><Estado valor={i.estado} /></Td>
                <Td><Boton tam="sm" variante="secundario" onClick={() => { setSel(i); setNuevoEstado(''); }}>Gestionar</Boton></Td></tr>
            ))}
          </Tabla>
        )}
        {q.data && <Paginacion pagina={q.data.pagina} paginas={q.data.paginas} total={q.data.total} onCambio={setPagina} />}
      </Tarjeta>
      <Modal abierto={!!sel} titulo={sel ? `Incidencia ${sel.folio}` : ''} onCerrar={() => setSel(null)}>
        {sel && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-2"><Estado valor={sel.estado} /><Estado valor={sel.prioridad} /></div>
            <p className="rounded-lg bg-tinta-50 p-3"><b>Descripción original:</b> {sel.descripcion}</p>
            {sel.resolucion && <div><p className="text-xs font-semibold uppercase text-tinta-400">Seguimiento</p><pre className="whitespace-pre-wrap font-sans text-xs">{sel.resolucion}</pre></div>}
            <Campo etiqueta="Agregar comentario o resolución" ayuda="Se agrega al historial; no reemplaza lo anterior."><Texto value={comentario} onChange={(e) => setComentario(e.target.value)} /></Campo>
            <Campo etiqueta="Cambiar estado"><Selector value={nuevoEstado} onChange={(e) => setNuevoEstado(e.target.value)}><option value="">Sin cambio</option>
              {['abierta', 'en_atencion', 'resuelta', 'cerrada'].filter((x) => x !== sel.estado).map((x) => <option key={x} value={x}>{etiqueta(x)}</option>)}</Selector></Campo>
            <ErrorCaja error={m.error} />
            <div className="flex justify-end gap-2"><Boton variante="secundario" onClick={() => setSel(null)}>Cerrar</Boton><Boton disabled={!comentario.trim() && !nuevoEstado} cargando={m.isPending} onClick={() => m.mutate()}>Guardar</Boton></div>
          </div>
        )}
      </Modal>
    </>
  );
}
