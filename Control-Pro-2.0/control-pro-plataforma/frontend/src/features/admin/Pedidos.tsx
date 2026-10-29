import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, CheckCheck, FileDown, Search, Undo2, X } from 'lucide-react';
import { claveIdempotencia, descargar, get, post } from '../../api/cliente';
import type { Pagina, Pedido, PedidoResumen } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { Aviso, Boton, Campo, Cargando, Entrada, ErrorCaja, Estado, Modal, Paginacion, Selector, Tabla, Tarjeta, Td, Texto, useAviso } from '../../components/ui';
import { cls, dinero, etiqueta, fechaHora, METODOS, mensajeError } from '../../lib/formato';
import { Encabezado, FiltroSucursal } from './AdminLayout';

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
        {q.isLoading ? <Cargando /> : (
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

export function PedidoAdmin() {
  const { id } = useParams();
  const { puede } = useAuth();
  const qc = useQueryClient();
  const avisar = useAviso();
  const q = useQuery({ queryKey: ['admin-pedido', id], queryFn: () => get<Pedido>(`/admin/pedidos/${id}`) });
  const [modal, setModal] = useState<'aprobar' | 'devuelto' | 'rechazado' | 'cancelar' | 'cerrar' | 'efectivo' | 'incidencia' | null>(null);
  const [texto, setTexto] = useState('');
  const [aceptar, setAceptar] = useState(false);
  const [clave, setClave] = useState(() => claveIdempotencia('efectivo'));
  const [tipoInc, setTipoInc] = useState('seguimiento');
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['admin-pedido', id] }); qc.invalidateQueries({ queryKey: ['admin-pedidos'] }); };
  const accion = useMutation({
    mutationFn: async () => {
      switch (modal) {
        case 'aprobar': return post(`/admin/pedidos/${id}/decision`, { decision: 'aprobado', motivo: texto || null, aceptar_excepciones: aceptar });
        case 'devuelto': case 'rechazado': return post(`/admin/pedidos/${id}/decision`, { decision: modal, motivo: texto });
        case 'cancelar': return post(`/admin/pedidos/${id}/cancelar`, { motivo: texto });
        case 'cerrar': return post(`/admin/pedidos/${id}/cerrar`, { nota: texto || null });
        case 'efectivo': return post(`/admin/pedidos/${id}/efectivo`, { monto: q.data!.saldo, referencia: texto || null, clave_idempotencia: clave });
        case 'incidencia': return post('/admin/incidencias', { tipo: tipoInc, descripcion: texto, pedido_id: Number(id), prioridad: 'media' });
      }
    },
    onSuccess: () => { refrescar(); avisar('Operación registrada.'); setModal(null); setTexto(''); setClave(claveIdempotencia('efectivo')); },
  });
  const validar = useMutation({ mutationFn: ({ pid }: { pid: number }) => post(`/admin/pagos/${pid}/validar`, { nota: 'Validado desde el detalle del pedido' }),
    onSuccess: () => { refrescar(); avisar('Pago actualizado.'); }, onError: (e) => avisar(mensajeError(e), 'error') });

  if (q.isLoading) return <Cargando />;
  if (!q.data) return <ErrorCaja error={q.error} />;
  const p = q.data;
  const excepciones = p.detalles.some((d) => d.excepcion);
  const titulos: Record<string, string> = { aprobar: 'Aprobar pedido', devuelto: 'Devolver para corrección', rechazado: 'Rechazar pedido', cancelar: 'Cancelar pedido', cerrar: 'Cerrar pedido', efectivo: 'Registrar cobro en efectivo', incidencia: 'Registrar incidencia' };
  const requiereTexto = ['devuelto', 'rechazado', 'cancelar', 'incidencia'].includes(modal || '');

  return (
    <>
      <Encabezado titulo={`Pedido ${p.folio}`} sub={`${p.canal === 'corporativo' ? 'Canal corporativo' : 'Tienda en línea'} · ${fechaHora(p.creado)}`}>
        <Boton variante="secundario" icono={<FileDown className="h-4 w-4" />} onClick={() => descargar(`/admin/pedidos/${p.id}/pdf`, `${p.folio}.pdf`)}>PDF</Boton>
        {p.estado === 'en_revision' && puede('pedido.aprobar') && <>
          <Boton variante="menta" icono={<Check className="h-4 w-4" />} onClick={() => setModal('aprobar')}>Aprobar</Boton>
          <Boton variante="secundario" icono={<Undo2 className="h-4 w-4" />} onClick={() => setModal('devuelto')}>Devolver</Boton>
          <Boton variante="peligro" icono={<X className="h-4 w-4" />} onClick={() => setModal('rechazado')}>Rechazar</Boton>
        </>}
        {p.estado === 'pendiente_pago' && p.metodo_pago === 'efectivo' && puede('pago.registrar_efectivo') && <Boton variante="menta" onClick={() => setModal('efectivo')}>Cobrar {dinero(p.saldo)} en efectivo</Boton>}
        {p.estado === 'entregado' && puede('pedido.cerrar') && <Boton icono={<CheckCheck className="h-4 w-4" />} onClick={() => setModal('cerrar')}>Cerrar pedido</Boton>}
        {['en_revision', 'devuelto', 'pendiente_pago', 'pago_en_revision', 'confirmado', 'en_preparacion'].includes(p.estado) && puede('pedido.cancelar') &&
          <Boton variante="fantasma" icono={<Ban className="h-4 w-4" />} onClick={() => setModal('cancelar')}>Cancelar</Boton>}
        {puede('incidencia.gestionar') && <Boton variante="fantasma" onClick={() => setModal('incidencia')}>Incidencia</Boton>}
      </Encabezado>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Tarjeta titulo={<span className="flex items-center gap-2">Estado <Estado valor={p.estado} /></span>} sub={`${METODOS[p.metodo_pago]} · ${p.modalidad === 'recoger' ? `Recoge en ${p.sucursal_recoger?.nombre}` : 'Envío a domicilio'}`}>
            {excepciones && p.estado === 'en_revision' && <div className="mb-3"><Aviso tipo="alerta">Este pedido incluye productos fuera de la regla por puesto; revisa las justificaciones antes de aprobar.</Aviso></div>}
            <Tabla columnas={['Artículo', p.canal === 'corporativo' ? 'Empleado' : '', 'Cant.', 'Precio', 'Importe', 'Entregada / cancelada / devuelta']}>
              {p.detalles.map((d) => (
                <tr key={d.id}>
                  <Td><p className="font-semibold">{d.nombre}</p><p className="text-xs text-tinta-400">{d.sku} · {d.color} · {d.talla}</p>
                    {d.excepcion && <p className="mt-1 rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800">Excepción: {d.excepcion}</p>}</Td>
                  <Td className="text-xs">{d.empleado ? <>{d.empleado.nombre}<br /><span className="text-tinta-400">{d.empleado.puesto}</span></> : ''}</Td>
                  <Td>{d.cantidad}</Td><Td className="text-xs">{dinero(d.precio_unitario)}{Number(d.descuento_unitario) > 0 && <><br /><span className="text-coral-600">−{dinero(d.descuento_unitario)}</span></>}</Td>
                  <Td className="font-semibold">{dinero(d.importe)}</Td><Td className="text-xs">{d.cantidad_entregada} / {d.cantidad_cancelada} / {d.cantidad_devuelta}</Td>
                </tr>
              ))}
            </Tabla>
            <dl className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{dinero(p.subtotal)}</dd></div>
              <div className="flex justify-between"><dt>Descuento</dt><dd>−{dinero(p.descuento)}</dd></div>
              <div className="flex justify-between"><dt>Envío</dt><dd>{dinero(p.costo_envio)}</dd></div>
              <div className="flex justify-between border-t pt-1 font-display text-lg font-extrabold"><dt>Total</dt><dd>{dinero(p.total)}</dd></div>
              <div className="flex justify-between text-xs text-tinta-400"><dt>Saldo por cobrar</dt><dd>{dinero(p.saldo)}</dd></div>
            </dl>
          </Tarjeta>

          <Tarjeta titulo="Surtido por sucursal">
            {!p.asignaciones?.length ? <p className="text-sm text-tinta-400">Aún sin asignar: el inventario se aparta al confirmar (pago o aprobación).</p> : (
              <div className="grid gap-3 md:grid-cols-2">
                {p.asignaciones.map((a) => (
                  <div key={a.id} className="rounded-xl p-4 ring-1 ring-tinta-100">
                    <div className="flex items-center justify-between"><p className="font-semibold">{a.sucursal.nombre}</p><Estado valor={a.estado} /></div>
                    <p className="mt-1 text-xs text-tinta-500">{a.detalles.map((d) => `${d.cantidad}× ${d.sku}`).join(' · ')}</p>
                    <p className="mt-1 text-xs text-tinta-400">Surtidas {a.detalles.reduce((s, d) => s + d.surtida, 0)} · Despachadas {a.detalles.reduce((s, d) => s + d.despachada, 0)} · Faltantes {a.detalles.reduce((s, d) => s + d.faltante, 0)}</p>
                    {puede('surtido.operar') && <Link to={`/admin/surtido/${a.id}`} className="mt-2 inline-block text-xs font-semibold text-menta-700">Abrir surtido →</Link>}
                  </div>
                ))}
              </div>
            )}
          </Tarjeta>

          <Tarjeta titulo="Pagos y reembolsos">
            {!p.pagos.length ? <p className="text-sm text-tinta-400">Sin pagos registrados.</p> : (
              <Tabla columnas={['Folio', 'Método', 'Referencia', 'Monto', 'Estado', '']}>
                {p.pagos.map((x) => (
                  <tr key={x.id}><Td>{x.folio}</Td><Td>{METODOS[x.metodo]}</Td><Td className="text-xs">{x.referencia || '—'}{x.motivo_rechazo && <p className="text-coral-600">{x.motivo_rechazo}</p>}</Td>
                    <Td>{dinero(x.monto)}{Number(x.monto_reembolsado) > 0 && <p className="text-xs text-tinta-400">Reembolsado {dinero(x.monto_reembolsado)}</p>}</Td><Td><Estado valor={x.estado} /></Td>
                    <Td>{x.estado === 'en_proceso' && puede('pago.validar') && <div className="flex gap-1">
                      <Boton tam="sm" variante="menta" onClick={() => validar.mutate({ pid: x.id })}>Validar</Boton>
                      <Link to="/admin/pagos" className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-semibold ring-1 ring-tinta-200">Rechazar…</Link></div>}</Td></tr>
                ))}
              </Tabla>
            )}
          </Tarjeta>

          {!!p.paquetes.length && (
            <Tarjeta titulo="Paquetes">
              <Tabla columnas={['Paquete', 'Sucursal', 'Contenido', 'Guía', 'Estado']}>
                {p.paquetes.map((pq) => <tr key={pq.id}><Td className="font-semibold">{pq.folio}</Td><Td>{pq.sucursal}</Td><Td className="text-xs">{pq.contenido.map((c) => `${c.cantidad}× ${c.sku}`).join(', ')}</Td>
                  <Td className="text-xs">{pq.envio ? `${pq.envio.paqueteria} · ${pq.envio.guia}` : '—'}{pq.recepcion && <p className="text-menta-700">Recepción {pq.recepcion.estado}</p>}</Td><Td><Estado valor={pq.estado} /></Td></tr>)}
              </Tabla>
            </Tarjeta>
          )}
          {!!p.entregas_individuales?.length && (
            <Tarjeta titulo="Entregas individuales (corporativo)">
              <Tabla columnas={['Empleado', 'Artículos', 'Valoración', 'Fecha', 'Estado']}>
                {p.entregas_individuales.map((e) => <tr key={e.id}><Td>{e.empleado.nombre}<p className="text-xs text-tinta-400">{e.empleado.puesto}</p></Td>
                  <Td className="text-xs">{e.detalles.map((d) => `${d.entregada}/${d.esperada} ${d.sku}`).join(', ')}</Td><Td>{e.valoracion ?? '—'}</Td><Td className="text-xs">{fechaHora(e.entregado_en)}</Td><Td><Estado valor={e.estado} /></Td></tr>)}
              </Tabla>
            </Tarjeta>
          )}
        </div>

        <div className="space-y-5">
          <Tarjeta titulo="Cliente">
            <p className="font-semibold">{p.cliente.razon_social || p.cliente.nombre}</p>
            <p className="text-sm text-tinta-500">{p.cliente.correo}<br />{p.cliente.telefono}</p>
            {p.direccion_envio && <p className="mt-3 text-sm"><b>Entrega:</b> {p.direccion_envio.calle} {p.direccion_envio.numero}, {p.direccion_envio.colonia}, {p.direccion_envio.ciudad}, {p.direccion_envio.estado} · CP {p.direccion_envio.cp}<br /><span className="text-tinta-400">Recibe {p.direccion_envio.destinatario} · {p.direccion_envio.telefono}</span></p>}
            {p.notas && <p className="mt-3 rounded-lg bg-tinta-50 p-2 text-xs">{p.notas}</p>}
            {puede('cliente.ver') && <Link to={`/admin/clientes?q=${encodeURIComponent(p.cliente.correo)}`} className="mt-2 inline-block text-xs font-semibold text-menta-700">Ver cliente →</Link>}
          </Tarjeta>
          {!!p.incidencias?.length && (
            <Tarjeta titulo="Incidencias">
              {p.incidencias.map((i) => <div key={i.id} className="mb-2 rounded-lg p-3 text-sm ring-1 ring-tinta-100"><div className="flex justify-between"><b>{i.folio}</b><Estado valor={i.estado} /></div><p className="text-xs">{i.descripcion}</p></div>)}
              <Link to="/admin/incidencias" className="text-xs font-semibold text-menta-700">Gestionar →</Link>
            </Tarjeta>
          )}
          {!!p.devoluciones.length && (
            <Tarjeta titulo="Devoluciones">{p.devoluciones.map((d) => <div key={d.id} className="mb-2 flex justify-between text-sm"><Link to="/admin/devoluciones" className="font-semibold hover:underline">{d.folio}</Link><Estado valor={d.estado} /></div>)}</Tarjeta>
          )}
          <Tarjeta titulo="Historial">
            <ol className="space-y-3 text-sm">
              {p.historial.map((h, i) => <li key={i} className="border-l-2 border-menta-300 pl-3"><p className="font-semibold">{etiqueta(h.nuevo)}</p><p className="text-xs text-tinta-400">{fechaHora(h.fecha)} · {h.actor}</p>{h.motivo && <p className="text-xs text-tinta-500">{h.motivo}</p>}</li>)}
            </ol>
          </Tarjeta>
        </div>
      </div>

      <Modal abierto={!!modal} titulo={modal ? titulos[modal] : ''} onCerrar={() => setModal(null)}>
        <div className="space-y-4">
          {modal === 'aprobar' && <>
            <p className="text-sm text-tinta-500">Al aprobar se asignan sucursales y se aparta el inventario. Si no hay existencias suficientes, la aprobación no procede.</p>
            {excepciones && <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><input type="checkbox" checked={aceptar} onChange={(e) => setAceptar(e.target.checked)} className="mt-1" />Autorizo las excepciones por puesto incluidas en este pedido.</label>}
          </>}
          {modal === 'efectivo' && <Aviso>Confirma que recibiste {dinero(p.saldo)} en efectivo. El cobro queda registrado a tu nombre y confirma el pedido.</Aviso>}
          {modal === 'cerrar' && <p className="text-sm text-tinta-500">Solo se cierra si no hay incidencias abiertas, devoluciones en trámite, reembolsos pendientes ni entregas individuales pendientes.</p>}
          {modal === 'incidencia' && <Campo etiqueta="Tipo"><Selector value={tipoInc} onChange={(e) => setTipoInc(e.target.value)}>
            {['seguimiento', 'talla_incorrecta', 'articulo_faltante', 'articulo_danado', 'paquete_no_recibido', 'error_preparacion', 'otro'].map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</Selector></Campo>}
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
