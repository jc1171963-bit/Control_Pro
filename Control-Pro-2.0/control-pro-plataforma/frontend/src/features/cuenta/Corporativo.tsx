import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { claveIdempotencia, get, post, put } from '../../api/cliente';
import type { Direccion, Pagina, Pedido, ProductoResumen, ProductoDetalle, Sucursal } from '../../api/tipos';
import { Aviso, Boton, Campo, Cargando, Entrada, ErrorCaja, Estado, Modal, Selector, Tabla, Tarjeta, Td, Texto, useAviso, Vacio } from '../../components/ui';
import { cls, dinero } from '../../lib/formato';

type Empleado = { id: number; numero: string; nombre: string; puesto: string; area: string | null; activo: boolean };
const PUESTOS = ['Administración', 'Enfermería', 'Mantenimiento', 'Seguridad', 'Intendencia', 'Almacén'];

export function Empleados() {
  const qc = useQueryClient();
  const avisar = useAviso();
  const q = useQuery({ queryKey: ['empleados'], queryFn: () => get<Empleado[]>('/cuenta/empleados') });
  const [editar, setEditar] = useState<Empleado | 'nuevo' | null>(null);
  const [error, setError] = useState<unknown>(null);
  const guardar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, any>;
    f.activo = f.activo === 'on';
    if (!f.area) f.area = null;
    try {
      await (editar === 'nuevo' ? post('/cuenta/empleados', f) : put(`/cuenta/empleados/${(editar as Empleado).id}`, f));
      qc.invalidateQueries({ queryKey: ['empleados'] }); setEditar(null); setError(null); avisar('Empleado guardado.');
    } catch (err) { setError(err); }
  };
  const ed = editar && editar !== 'nuevo' ? editar : null;
  return (
    <Tarjeta titulo="Empleados" sub="Personas que reciben uniformes en los pedidos corporativos" accion={<Boton icono={<UserPlus className="h-4 w-4" />} onClick={() => setEditar('nuevo')}>Agregar</Boton>}>
      {q.isLoading ? <Cargando /> : (
        <Tabla columnas={['Número', 'Nombre', 'Puesto', 'Área', 'Estado', '']} vacia={!q.data?.length}>
          {q.data?.map((e) => (
            <tr key={e.id}><Td>{e.numero}</Td><Td className="font-semibold">{e.nombre}</Td><Td>{e.puesto}</Td><Td>{e.area || '—'}</Td>
              <Td><span className={cls('text-xs font-semibold', e.activo ? 'text-menta-700' : 'text-tinta-400')}>{e.activo ? 'Activo' : 'Inactivo'}</span></Td>
              <Td><Boton tam="sm" variante="fantasma" icono={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditar(e)}>Editar</Boton></Td></tr>
          ))}
        </Tabla>
      )}
      <Modal abierto={!!editar} titulo={ed ? 'Editar empleado' : 'Nuevo empleado'} onCerrar={() => setEditar(null)}>
        <form onSubmit={guardar} className="grid gap-3 sm:grid-cols-2" key={ed?.id || 'nuevo'}>
          <Campo etiqueta="Número de empleado"><Entrada name="numero" defaultValue={ed?.numero} required /></Campo>
          <Campo etiqueta="Nombre completo"><Entrada name="nombre" defaultValue={ed?.nombre} required minLength={3} /></Campo>
          <Campo etiqueta="Puesto"><Selector name="puesto" defaultValue={ed?.puesto || PUESTOS[0]}>{PUESTOS.map((p) => <option key={p}>{p}</option>)}</Selector></Campo>
          <Campo etiqueta="Área (opcional)"><Entrada name="area" defaultValue={ed?.area || ''} /></Campo>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="activo" defaultChecked={ed ? ed.activo : true} className="accent-menta-500" />Activo</label>
          <div className="sm:col-span-2"><ErrorCaja error={error} /></div>
          <div className="flex justify-end gap-2 sm:col-span-2"><Boton type="button" variante="secundario" onClick={() => setEditar(null)}>Cancelar</Boton><Boton type="submit">Guardar</Boton></div>
        </form>
      </Modal>
    </Tarjeta>
  );
}

type Partida = { key: string; empleado_id: number | ''; producto: string; variante_id: number | ''; cantidad: number; excepcion: string };
const nuevaPartida = (): Partida => ({ key: Math.random().toString(36).slice(2), empleado_id: '', producto: '', variante_id: '', cantidad: 1, excepcion: '' });

export function NuevoPedidoCorporativo() {
  const { id } = useParams();
  const nav = useNavigate();
  const avisar = useAviso();
  const empleados = useQuery({ queryKey: ['empleados'], queryFn: () => get<Empleado[]>('/cuenta/empleados') });
  const productos = useQuery({ queryKey: ['catalogo-corp'], queryFn: () => get<Pagina<ProductoResumen>>('/tienda/productos?por_pagina=48') });
  const puestos = useQuery({ queryKey: ['puestos-autorizados'], queryFn: () => get<Record<string, number[]>>('/cuenta/puestos-autorizados') });
  const dirs = useQuery({ queryKey: ['direcciones'], queryFn: () => get<Direccion[]>('/cuenta/direcciones') });
  const sucs = useQuery({ queryKey: ['sucursales-publicas'], queryFn: () => get<Sucursal[]>('/tienda/sucursales') });
  const previo = useQuery({ queryKey: ['pedido', id], queryFn: () => get<Pedido>(`/cuenta/pedidos/${id}`), enabled: !!id });
  const [detalles, setDetalles] = useState<Record<string, ProductoDetalle>>({});
  const [partidas, setPartidas] = useState<Partida[]>([nuevaPartida()]);
  const [modalidad, setModalidad] = useState<'envio' | 'recoger'>('envio');
  const [direccion, setDireccion] = useState<number | ''>('');
  const [sucursal, setSucursal] = useState<number | ''>('');
  const [notas, setNotas] = useState('');
  const [clave] = useState(() => claveIdempotencia('corp'));

  const cargarProducto = async (slug: string) => {
    if (!slug || detalles[slug]) return;
    const d = await get<ProductoDetalle>(`/tienda/productos/${slug}`);
    setDetalles((x) => ({ ...x, [slug]: d }));
  };
  useEffect(() => {
    if (!previo.data || !productos.data) return;
    const p = previo.data;
    setModalidad(p.modalidad);
    setNotas(p.notas || '');
    const porId = new Map(productos.data.items.map((x) => [x.nombre, x.slug]));
    const nuevas = p.detalles.map((d) => ({ key: String(d.id), empleado_id: d.empleado?.id ?? '', producto: porId.get(d.nombre) || '', variante_id: d.variante_id, cantidad: d.cantidad, excepcion: d.excepcion || '' }));
    setPartidas(nuevas as Partida[]);
    nuevas.forEach((n) => n.producto && cargarProducto(n.producto));
  }, [previo.data, productos.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const empPorId = useMemo(() => new Map((empleados.data || []).map((e) => [e.id, e])), [empleados.data]);
  const prodPorSlug = useMemo(() => new Map((productos.data?.items || []).map((p) => [p.slug, p])), [productos.data]);
  const autorizado = (p: Partida) => {
    const emp = typeof p.empleado_id === 'number' ? empPorId.get(p.empleado_id) : undefined;
    const prod = prodPorSlug.get(p.producto);
    return !emp || !prod || (puestos.data?.[emp.puesto] || []).includes(prod.id);
  };
  const fijar = (key: string, cambios: Partial<Partida>) => setPartidas((ps) => ps.map((p) => (p.key === key ? { ...p, ...cambios } : p)));
  const total = partidas.reduce((a, p) => {
    const v = detalles[p.producto]?.variantes.find((x) => x.id === p.variante_id);
    return a + (v ? Number(v.precio_final) * p.cantidad : 0);
  }, 0);

  const enviar = useMutation({
    mutationFn: () => {
      const cuerpo = {
        partidas: partidas.map((p) => ({ empleado_id: p.empleado_id, variante_id: p.variante_id, cantidad: p.cantidad, excepcion: autorizado(p) ? null : p.excepcion })),
        notas: notas || null,
      };
      return id ? put<Pedido>(`/cuenta/pedidos-corporativos/${id}`, cuerpo)
        : post<Pedido>('/cuenta/pedidos-corporativos', { ...cuerpo, modalidad, clave_idempotencia: clave,
          ...(modalidad === 'envio' ? { direccion_id: direccion || dirs.data?.find((d) => d.predeterminada)?.id } : { sucursal_id: sucursal }) });
    },
    onSuccess: (p) => { avisar(id ? 'Pedido corregido y reenviado a revisión.' : 'Pedido enviado a revisión.'); nav(`/cuenta/pedidos/${p.id}${id ? '' : '?nuevo=1'}`); },
  });

  if (empleados.isLoading || productos.isLoading) return <Cargando />;
  if (!empleados.data?.length) return <Tarjeta titulo="Nuevo pedido corporativo"><Vacio titulo="Primero registra a tus empleados" texto="Cada partida del pedido corresponde a una persona." /></Tarjeta>;
  const completo = partidas.every((p) => p.empleado_id && p.variante_id && p.cantidad > 0 && (autorizado(p) || p.excepcion.trim().length >= 10));

  return (
    <div className="space-y-5">
      <Tarjeta titulo={id ? `Corregir pedido ${previo.data?.folio || ''}` : 'Nuevo pedido corporativo'} sub="Arma el pedido por empleado. Ventas lo revisa antes de apartar el inventario.">
        {previo.data?.aprobaciones?.filter((a) => a.decision === 'devuelto').slice(-1).map((a) => <div key={a.fecha} className="mb-4"><Aviso tipo="alerta">Observación de ventas: {a.motivo}</Aviso></div>)}
        <div className="space-y-3">
          {partidas.map((p, i) => {
            const det = detalles[p.producto];
            const ok = autorizado(p);
            return (
              <div key={p.key} className={cls('rounded-xl p-3 ring-1', ok ? 'ring-arena-200' : 'ring-amber-300 bg-amber-50/50')}>
                <div className="grid gap-2 md:grid-cols-[1.2fr_1.4fr_1fr_80px_auto]">
                  <Selector aria-label={`Empleado partida ${i + 1}`} value={p.empleado_id} onChange={(e) => fijar(p.key, { empleado_id: Number(e.target.value) || '' })}>
                    <option value="">Empleado…</option>{empleados.data!.filter((e) => e.activo).map((e) => <option key={e.id} value={e.id}>{e.nombre} · {e.puesto}</option>)}
                  </Selector>
                  <Selector aria-label={`Producto partida ${i + 1}`} value={p.producto} onChange={(e) => { fijar(p.key, { producto: e.target.value, variante_id: '' }); cargarProducto(e.target.value); }}>
                    <option value="">Producto…</option>{productos.data!.items.map((x) => <option key={x.slug} value={x.slug}>{x.nombre}</option>)}
                  </Selector>
                  <Selector aria-label={`Talla partida ${i + 1}`} value={p.variante_id} disabled={!det} onChange={(e) => fijar(p.key, { variante_id: Number(e.target.value) || '' })}>
                    <option value="">Talla / color…</option>{det?.variantes.map((v) => <option key={v.id} value={v.id}>{v.talla} · {v.color} ({v.disponible} disp.)</option>)}
                  </Selector>
                  <Entrada aria-label={`Cantidad partida ${i + 1}`} type="number" min={1} max={50} value={p.cantidad} onChange={(e) => fijar(p.key, { cantidad: Math.max(1, Number(e.target.value)) })} />
                  <button onClick={() => setPartidas(partidas.filter((x) => x.key !== p.key))} disabled={partidas.length === 1} className="grid h-10 w-10 place-items-center rounded-lg text-tinta-400 hover:bg-coral-50 hover:text-coral-600 disabled:opacity-30" aria-label="Quitar partida"><Trash2 className="h-4 w-4" /></button>
                </div>
                {!ok && (
                  <div className="mt-2">
                    <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-amber-800"><AlertTriangle className="h-3.5 w-3.5" />Producto no autorizado para el puesto: requiere justificación y aprobación.</p>
                    <Entrada placeholder="Justificación (mínimo 10 caracteres)" value={p.excepcion} onChange={(e) => fijar(p.key, { excepcion: e.target.value })} />
                  </div>
                )}
              </div>
            );
          })}
          <Boton variante="secundario" icono={<Plus className="h-4 w-4" />} onClick={() => setPartidas([...partidas, nuevaPartida()])}>Agregar partida</Boton>
        </div>
      </Tarjeta>
      <Tarjeta titulo="Entrega">
        {id ? <p className="text-sm text-tinta-500">La modalidad de entrega se conserva: {previo.data?.modalidad === 'recoger' ? 'recoger en sucursal' : 'envío a la dirección registrada'}.</p> : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Modalidad"><Selector value={modalidad} onChange={(e) => setModalidad(e.target.value as any)}><option value="envio">Envío a la empresa</option><option value="recoger">Recoger en sucursal</option></Selector></Campo>
            {modalidad === 'envio' ? (
              <Campo etiqueta="Dirección"><Selector value={direccion || dirs.data?.find((d) => d.predeterminada)?.id || ''} onChange={(e) => setDireccion(Number(e.target.value))}>
                {dirs.data?.map((d) => <option key={d.id} value={d.id}>{d.alias} · {d.ciudad} {d.cp}</option>)}</Selector></Campo>
            ) : (
              <Campo etiqueta="Sucursal"><Selector value={sucursal} onChange={(e) => setSucursal(Number(e.target.value))}><option value="">Elige…</option>
                {sucs.data?.filter((s) => s.permite_recoger).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</Selector></Campo>
            )}
          </div>
        )}
        <Campo etiqueta="Notas para ventas" className="mt-4"><Texto value={notas} onChange={(e) => setNotas(e.target.value)} /></Campo>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-tinta-100 pt-4">
          <p className="text-sm">{partidas.length} partida(s) · Importe estimado <b className="font-display text-lg">{dinero(total)}</b> <span className="text-xs text-tinta-400">(crédito corporativo, sin costo de envío)</span></p>
          <Boton variante="menta" tam="lg" disabled={!completo || (!id && modalidad === 'recoger' && !sucursal)} cargando={enviar.isPending} onClick={() => enviar.mutate()}>{id ? 'Reenviar a revisión' : 'Enviar a revisión'}</Boton>
        </div>
        <div className="mt-3"><ErrorCaja error={enviar.error} /></div>
        {!!previo.data && <p className="mt-2 text-xs text-tinta-400">Estado actual: <Estado valor={previo.data.estado} /></p>}
      </Tarjeta>
    </div>
  );
}
