import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, FileDown, History, Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import { claveIdempotencia, descargar, get, post, put } from '../../api/cliente';
import type { InventarioFila, Movimiento, Pagina, ProductoDetalle, Transferencia } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { Aviso, Boton, Campo, Cargando, Entrada, ErrorCaja, Estado, Modal, Paginacion, Selector, Tabla, Tarjeta, Td, Texto, useAviso } from '../../components/ui';
import { cls, fechaHora, TIPOS_MOVIMIENTO } from '../../lib/formato';
import { Encabezado, FiltroSucursal, useSucursalesAdmin } from './AdminLayout';

type VarSel = { id: number; sku: string; etiqueta: string };

export function SelectorVariante({ onElegir }: { onElegir: (v: VarSel) => void }) {
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  useEffect(() => { const t = setTimeout(() => setBusqueda(texto), 300); return () => clearTimeout(t); }, [texto]);
  const q = useQuery({ queryKey: ['buscar-variantes', busqueda], queryFn: () => get<Pagina<ProductoDetalle>>(`/admin/productos?q=${encodeURIComponent(busqueda)}&por_pagina=8&activos=1`), enabled: busqueda.length >= 2 });
  return (
    <div>
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-300" />
        <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Busca por producto o SKU (mín. 2 letras)" className="pl-9" /></div>
      {q.data && (
        <ul className="mt-2 max-h-56 overflow-y-auto rounded-xl ring-1 ring-tinta-100">
          {q.data.items.flatMap((p) => p.variantes.filter((v) => v.activo).map((v) => (
            <li key={v.id}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-menta-50" onClick={() => { onElegir({ id: v.id, sku: v.sku, etiqueta: `${p.nombre} · ${v.color} · ${v.talla}` }); setTexto(''); setBusqueda(''); }}>
              <b className="font-mono text-xs">{v.sku}</b> — {p.nombre} · {v.color} · {v.talla}</button></li>
          )))}
          {!q.data.items.length && <li className="px-3 py-2 text-sm text-tinta-400">Sin resultados</li>}
        </ul>
      )}
    </div>
  );
}

type ModoMov = { tipo: 'entrada' | 'ajuste' | 'minimo' | 'kardex'; fila?: InventarioFila };

export function Inventario() {
  const { puede, usuario } = useAuth();
  const qc = useQueryClient();
  const avisar = useAviso();
  const sucs = useSucursalesAdmin();
  const [params, setParams] = useSearchParams();
  const [texto, setTexto] = useState('');
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); if (k !== 'pagina') p.delete('pagina'); setParams(p); };
  const q = useQuery({ queryKey: ['inventario', params.toString()], queryFn: () => get<Pagina<InventarioFila>>(`/admin/inventario?por_pagina=25&${params.toString()}`), placeholderData: keepPreviousData });
  const [modo, setModo] = useState<ModoMov | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [variante, setVariante] = useState<VarSel | null>(null);
  const [clave, setClave] = useState(() => claveIdempotencia('inv'));
  const misSucursales = usuario?.rol.alcance_global ? sucs.data : sucs.data?.filter((s) => usuario?.sucursales.some((x) => x.id === s.id));
  const abrir = (m: ModoMov) => {
    setModo(m);
    setVariante(m.fila ? { id: m.fila.variante_id, sku: m.fila.sku, etiqueta: `${m.fila.producto} · ${m.fila.color} · ${m.fila.talla}` } : null);
    setForm({ sucursal_id: m.fila?.sucursal_id ?? misSucursales?.[0]?.id ?? '', cantidad: 1, tipo: 'ajuste_positivo', minimo: m.fila?.minimo ?? 5, motivo: '' });
    setClave(claveIdempotencia('inv'));
  };
  const kardex = useQuery({ queryKey: ['kardex', modo?.fila?.sucursal_id, modo?.fila?.variante_id], enabled: modo?.tipo === 'kardex',
    queryFn: () => get<Pagina<Movimiento>>(`/admin/inventario/movimientos?sucursal_id=${modo!.fila!.sucursal_id}&variante_id=${modo!.fila!.variante_id}&por_pagina=50`) });
  const guardar = useMutation({
    mutationFn: () => {
      const base = { sucursal_id: Number(form.sucursal_id), variante_id: variante!.id };
      if (modo!.tipo === 'minimo') return put('/admin/inventario/minimo', { ...base, minimo: Number(form.minimo) });
      if (modo!.tipo === 'entrada') return post('/admin/inventario/entradas', { ...base, cantidad: Number(form.cantidad), motivo: form.motivo, clave_idempotencia: clave });
      return post('/admin/inventario/ajustes', { ...base, cantidad: Number(form.cantidad), tipo: form.tipo, motivo: form.motivo, clave_idempotencia: clave });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventario'] }); setModo(null); avisar('Movimiento registrado en el kardex.'); },
  });

  return (
    <>
      <Encabezado titulo="Inventario por sucursal" sub="Disponible = físico − reservado − comprometido">
        <Boton variante="secundario" icono={<FileDown className="h-4 w-4" />} onClick={() => descargar(`/admin/reportes/exportar/inventario?formato=xlsx${params.get('sucursal_id') ? `&sucursal_id=${params.get('sucursal_id')}` : ''}`)}>Exportar</Boton>
        {puede('inventario.entrada') && <Boton icono={<ArrowDownToLine className="h-4 w-4" />} onClick={() => abrir({ tipo: 'entrada' })}>Registrar entrada</Boton>}
      </Encabezado>
      <Tarjeta>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <form onSubmit={(e) => { e.preventDefault(); set('q', texto); }} className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-300" />
            <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Producto o SKU" className="w-60 pl-9" /></form>
          <FiltroSucursal valor={params.get('sucursal_id') || ''} onCambio={(v) => set('sucursal_id', v)} />
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={params.get('bajo') === '1'} onChange={(e) => set('bajo', e.target.checked ? '1' : '')} className="accent-coral-500" />Solo existencias bajas</label>
        </div>
        <ErrorCaja error={q.error} />
        {q.isLoading ? <Cargando /> : (
          <Tabla columnas={['Sucursal', 'SKU', 'Producto', 'Físico', 'Reservado', 'Comprometido', 'En tránsito', 'Disponible', 'Mínimo', '']} vacia={!q.data?.items.length}>
            {q.data?.items.map((f) => (
              <tr key={`${f.sucursal_id}-${f.variante_id}`} className={cls(f.bajo && 'bg-amber-50/50')}>
                <Td className="text-xs">{f.sucursal}</Td><Td className="font-mono text-xs">{f.sku}</Td><Td>{f.producto}<p className="text-xs text-tinta-400">{f.color} · {f.talla}</p></Td>
                <Td>{f.fisico}</Td><Td className="text-amber-700">{f.reservado}</Td><Td className="text-sky-700">{f.comprometido}</Td><Td className="text-violet-700">{f.en_transito}</Td>
                <Td className={cls('font-bold', f.disponible <= 0 ? 'text-coral-600' : f.bajo ? 'text-amber-700' : 'text-menta-700')}>{f.disponible}</Td><Td>{f.minimo}</Td>
                <Td><div className="flex gap-1">
                  <button className="rounded-lg p-1.5 text-tinta-400 hover:bg-tinta-50" title="Kardex" aria-label="Kardex" onClick={() => abrir({ tipo: 'kardex', fila: f })}><History className="h-4 w-4" /></button>
                  {puede('inventario.entrada') && <button className="rounded-lg p-1.5 text-tinta-400 hover:bg-tinta-50" title="Entrada" aria-label="Entrada" onClick={() => abrir({ tipo: 'entrada', fila: f })}><Plus className="h-4 w-4" /></button>}
                  {puede('inventario.ajustar') && <button className="rounded-lg p-1.5 text-tinta-400 hover:bg-tinta-50" title="Ajuste o mínimo" aria-label="Ajuste" onClick={() => abrir({ tipo: 'ajuste', fila: f })}><SlidersHorizontal className="h-4 w-4" /></button>}
                </div></Td>
              </tr>
            ))}
          </Tabla>
        )}
        {q.data && <Paginacion pagina={q.data.pagina} paginas={q.data.paginas} total={q.data.total} onCambio={(p) => set('pagina', String(p))} />}
      </Tarjeta>

      <Modal abierto={!!modo} titulo={modo?.tipo === 'kardex' ? `Kardex · ${modo.fila?.sku} · ${modo.fila?.sucursal}` : modo?.tipo === 'entrada' ? 'Registrar entrada' : modo?.tipo === 'minimo' ? 'Existencia mínima' : 'Ajuste de inventario'}
        onCerrar={() => setModo(null)} ancho={modo?.tipo === 'kardex' ? 'max-w-3xl' : 'max-w-lg'}>
        {modo?.tipo === 'kardex' ? (kardex.isLoading ? <Cargando /> : (
          <Tabla columnas={['Fecha', 'Tipo', 'Cantidad', 'Saldo', 'Motivo', 'Usuario']} vacia={!kardex.data?.items.length}>
            {kardex.data?.items.map((m) => <tr key={m.id}><Td className="text-xs">{fechaHora(m.fecha)}</Td><Td className="text-xs">{TIPOS_MOVIMIENTO[m.tipo]}</Td>
              <Td className={m.cantidad < 0 ? 'text-coral-600' : 'text-menta-700'}>{m.cantidad > 0 ? '+' : ''}{m.cantidad}</Td><Td>{m.saldo}</Td><Td className="text-xs">{m.motivo}</Td><Td className="text-xs">{m.usuario}</Td></tr>)}
          </Tabla>
        )) : (
          <div className="space-y-4">
            {modo?.tipo === 'ajuste' && <div className="flex gap-2 text-sm"><button className={cls('rounded-full px-3 py-1 font-semibold ring-1', 'bg-tinta-900 text-white ring-tinta-900')}>Ajuste</button>
              <button className="rounded-full px-3 py-1 font-semibold ring-1 ring-tinta-200" onClick={() => setModo({ ...modo, tipo: 'minimo' })}>Cambiar mínimo</button></div>}
            {variante ? <p className="rounded-lg bg-tinta-50 p-3 text-sm"><b className="font-mono">{variante.sku}</b><br />{variante.etiqueta}
              {!modo?.fila && <button className="ml-2 text-xs font-semibold text-coral-600" onClick={() => setVariante(null)}>Cambiar</button>}</p> : <SelectorVariante onElegir={setVariante} />}
            <Campo etiqueta="Sucursal"><Selector value={form.sucursal_id} disabled={!!modo?.fila} onChange={(e) => setForm({ ...form, sucursal_id: e.target.value })}>
              {misSucursales?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Selector></Campo>
            {modo?.tipo === 'minimo' ? (
              <Campo etiqueta="Existencia mínima (alerta)"><Entrada type="number" min={0} value={form.minimo} onChange={(e) => setForm({ ...form, minimo: e.target.value })} /></Campo>
            ) : <>
              {modo?.tipo === 'ajuste' && <Campo etiqueta="Tipo"><Selector value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                <option value="ajuste_positivo">Ajuste positivo (+)</option><option value="ajuste_negativo">Ajuste negativo (−)</option><option value="merma">Merma (daño, pérdida)</option></Selector></Campo>}
              <Campo etiqueta="Cantidad"><Entrada type="number" min={1} value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} /></Campo>
              <Campo etiqueta={modo?.tipo === 'entrada' ? 'Motivo / referencia (factura, orden de compra)' : 'Motivo del ajuste'}><Texto value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} /></Campo>
              {modo?.tipo === 'ajuste' && <Aviso>Los ajustes no pueden dejar el físico por debajo de lo reservado o comprometido con pedidos.</Aviso>}
            </>}
            <ErrorCaja error={guardar.error} />
            <div className="flex justify-end gap-2"><Boton variante="secundario" onClick={() => setModo(null)}>Cancelar</Boton>
              <Boton disabled={!variante || !form.sucursal_id || (modo?.tipo !== 'minimo' && String(form.motivo).trim().length < (modo?.tipo === 'entrada' ? 3 : 5))} cargando={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton></div>
          </div>
        )}
      </Modal>
    </>
  );
}

export function Transferencias() {
  const { puede, usuario } = useAuth();
  const qc = useQueryClient();
  const avisar = useAviso();
  const sucs = useSucursalesAdmin();
  const [estado, setEstado] = useState('');
  const [pagina, setPagina] = useState(1);
  const q = useQuery({ queryKey: ['transferencias', estado, pagina], queryFn: () => get<Pagina<Transferencia>>(`/admin/transferencias?pagina=${pagina}${estado ? `&estado=${estado}` : ''}`) });
  const [nueva, setNueva] = useState(false);
  const [form, setForm] = useState<{ origen: string; destino: string; motivo: string; partidas: (VarSel & { cantidad: number })[] }>({ origen: '', destino: '', motivo: '', partidas: [] });
  const [operar, setOperar] = useState<{ t: Transferencia; accion: 'enviar' | 'recibir' | 'cancelar' } | null>(null);
  const [cant, setCant] = useState<Record<number, number>>({});
  const [obs, setObs] = useState('');
  const mias = (id: number) => usuario?.rol.alcance_global || usuario?.sucursales.some((s) => s.id === id);
  const refrescar = () => qc.invalidateQueries({ queryKey: ['transferencias'] });
  const crear = useMutation({
    mutationFn: () => post('/admin/transferencias', { origen_id: Number(form.origen), destino_id: Number(form.destino), motivo: form.motivo, partidas: form.partidas.map((p) => ({ variante_id: p.id, cantidad: p.cantidad })) }),
    onSuccess: () => { refrescar(); setNueva(false); setForm({ origen: '', destino: '', motivo: '', partidas: [] }); avisar('Transferencia solicitada.'); },
  });
  const autorizar = useMutation({ mutationFn: (id: number) => post(`/admin/transferencias/${id}/autorizar`), onSuccess: () => { refrescar(); avisar('Transferencia autorizada.'); } });
  const ejecutar = useMutation({
    mutationFn: () => operar!.accion === 'cancelar' ? post(`/admin/transferencias/${operar!.t.id}/cancelar`, { motivo: obs })
      : post(`/admin/transferencias/${operar!.t.id}/${operar!.accion}`, { cantidades: Object.fromEntries(Object.entries(cant).map(([k, v]) => [k, Number(v)])), observaciones: obs || null }),
    onSuccess: () => { refrescar(); qc.invalidateQueries({ queryKey: ['inventario'] }); setOperar(null); avisar('Transferencia actualizada.'); },
  });
  const abrirOperar = (t: Transferencia, accion: 'enviar' | 'recibir' | 'cancelar') => {
    setCant(Object.fromEntries(t.detalles.map((d) => [d.id, accion === 'enviar' ? d.cantidad : d.enviada]))); setObs(''); setOperar({ t, accion });
  };
  return (
    <>
      <Encabezado titulo="Transferencias entre sucursales" sub="Salida en origen → tránsito → recepción en destino">
        {puede('transferencia.solicitar') && <Boton icono={<Plus className="h-4 w-4" />} onClick={() => setNueva(true)}>Solicitar transferencia</Boton>}
      </Encabezado>
      <Tarjeta accion={<Selector value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }} className="w-48"><option value="">Todos los estados</option>
        {['solicitada', 'autorizada', 'enviada', 'recibida', 'recibida_parcial', 'cancelada'].map((e) => <option key={e} value={e}>{e.replace('_', ' ')}</option>)}</Selector>}>
        <ErrorCaja error={q.error || autorizar.error} />
        {q.isLoading ? <Cargando /> : (
          <Tabla columnas={['Folio', 'Origen → destino', 'Partidas', 'Motivo', 'Actualizado', 'Estado', '']} vacia={!q.data?.items.length}>
            {q.data?.items.map((t) => (
              <tr key={t.id}>
                <Td className="font-semibold">{t.folio}</Td><Td>{t.origen.nombre} → {t.destino.nombre}</Td>
                <Td className="text-xs">{t.detalles.map((d) => `${d.cantidad}× ${d.sku}${d.enviada ? ` (env. ${d.enviada}${t.estado.startsWith('recibida') ? `, rec. ${d.recibida}` : ''})` : ''}`).join(' · ')}</Td>
                <Td className="max-w-xs text-xs">{t.motivo}{t.observaciones && <p className="text-tinta-400">{t.observaciones}</p>}</Td><Td className="text-xs">{fechaHora(t.actualizado)}</Td><Td><Estado valor={t.estado} /></Td>
                <Td><div className="flex flex-wrap gap-1">
                  {t.estado === 'solicitada' && puede('transferencia.autorizar') && mias(t.origen.id) && <Boton tam="sm" onClick={() => autorizar.mutate(t.id)}>Autorizar</Boton>}
                  {['solicitada', 'autorizada'].includes(t.estado) && puede('transferencia.autorizar') && mias(t.origen.id) && <Boton tam="sm" variante="fantasma" onClick={() => abrirOperar(t, 'cancelar')}>Cancelar</Boton>}
                  {t.estado === 'autorizada' && puede('transferencia.operar') && mias(t.origen.id) && <Boton tam="sm" variante="menta" onClick={() => abrirOperar(t, 'enviar')}>Enviar</Boton>}
                  {t.estado === 'enviada' && puede('transferencia.operar') && mias(t.destino.id) && <Boton tam="sm" variante="menta" onClick={() => abrirOperar(t, 'recibir')}>Recibir</Boton>}
                </div></Td>
              </tr>
            ))}
          </Tabla>
        )}
        {q.data && <Paginacion pagina={q.data.pagina} paginas={q.data.paginas} total={q.data.total} onCambio={setPagina} />}
      </Tarjeta>

      <Modal abierto={nueva} titulo="Solicitar transferencia" onCerrar={() => setNueva(false)} ancho="max-w-2xl">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Sucursal origen"><Selector value={form.origen} onChange={(e) => setForm({ ...form, origen: e.target.value })}><option value="">Elige…</option>{sucs.data?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Selector></Campo>
            <Campo etiqueta="Sucursal destino"><Selector value={form.destino} onChange={(e) => setForm({ ...form, destino: e.target.value })}><option value="">Elige…</option>{sucs.data?.filter((s) => String(s.id) !== form.origen).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Selector></Campo>
          </div>
          <Campo etiqueta="Motivo"><Entrada value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} /></Campo>
          <div>
            <p className="mb-2 text-sm font-semibold">Partidas</p>
            {form.partidas.map((p, i) => (
              <div key={p.id} className="mb-2 flex items-center gap-2 rounded-lg p-2 text-sm ring-1 ring-tinta-100">
                <span className="flex-1"><b className="font-mono text-xs">{p.sku}</b> {p.etiqueta}</span>
                <Entrada type="number" min={1} className="w-20" value={p.cantidad} onChange={(e) => setForm({ ...form, partidas: form.partidas.map((x, j) => j === i ? { ...x, cantidad: Number(e.target.value) } : x) })} />
                <button onClick={() => setForm({ ...form, partidas: form.partidas.filter((_, j) => j !== i) })} aria-label="Quitar"><Trash2 className="h-4 w-4 text-tinta-400" /></button>
              </div>
            ))}
            <SelectorVariante onElegir={(v) => !form.partidas.some((p) => p.id === v.id) && setForm({ ...form, partidas: [...form.partidas, { ...v, cantidad: 1 }] })} />
          </div>
          <ErrorCaja error={crear.error} />
          <div className="flex justify-end gap-2"><Boton variante="secundario" onClick={() => setNueva(false)}>Cancelar</Boton>
            <Boton disabled={!form.origen || !form.destino || form.motivo.trim().length < 5 || !form.partidas.length} cargando={crear.isPending} onClick={() => crear.mutate()}>Solicitar</Boton></div>
        </div>
      </Modal>
      <Modal abierto={!!operar} titulo={operar ? `${operar.accion === 'enviar' ? 'Enviar' : operar.accion === 'recibir' ? 'Recibir' : 'Cancelar'} ${operar.t.folio}` : ''} onCerrar={() => setOperar(null)}>
        {operar && (
          <div className="space-y-3">
            {operar.accion !== 'cancelar' && operar.t.detalles.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg p-2 text-sm ring-1 ring-tinta-100">
                <span><b className="font-mono text-xs">{d.sku}</b> · {d.producto} {d.talla}</span>
                <span className="flex items-center gap-2"><Entrada type="number" min={0} max={operar.accion === 'enviar' ? d.cantidad : d.enviada} className="w-20" value={cant[d.id] ?? 0}
                  onChange={(e) => setCant({ ...cant, [d.id]: Number(e.target.value) })} />de {operar.accion === 'enviar' ? d.cantidad : d.enviada}</span>
              </div>
            ))}
            {operar.accion === 'recibir' && <Aviso>Si recibes menos de lo enviado se registra una incidencia de faltante.</Aviso>}
            <Campo etiqueta={operar.accion === 'cancelar' ? 'Motivo de cancelación' : 'Observaciones'}><Texto value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
            <ErrorCaja error={ejecutar.error} />
            <div className="flex justify-end gap-2"><Boton variante="secundario" onClick={() => setOperar(null)}>Volver</Boton>
              <Boton variante={operar.accion === 'cancelar' ? 'peligro' : 'primario'} disabled={operar.accion === 'cancelar' && obs.trim().length < 5} cargando={ejecutar.isPending} onClick={() => ejecutar.mutate()}>Confirmar</Boton></div>
          </div>
        )}
      </Modal>
    </>
  );
}
