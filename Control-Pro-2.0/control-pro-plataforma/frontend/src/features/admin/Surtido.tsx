import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Package, PackageCheck, PackagePlus, Play, Truck } from 'lucide-react';
import { get, post } from '../../api/cliente';
import type { Asignacion, Pagina, Paquete } from '../../api/tipos';
import { CabezaIndividual, ContenidoPorPersona } from '../../components/PaqueteIndividual';
import { Aviso, Boton, Campo, Cargando, Entrada, ErrorCaja, Estado, Modal, Paginacion, Selector, Tabla, Tarjeta, Td, Texto, useAviso } from '../../components/ui';
import { cls, etiqueta, fechaHora } from '../../lib/formato';
import { Encabezado, FiltroSucursal } from './AdminLayout';

export function Surtido() {
  const [sucursal, setSucursal] = useState('');
  const [estado, setEstado] = useState('activas');
  const [pagina, setPagina] = useState(1);
  const q = useQuery({ queryKey: ['surtido', sucursal, estado, pagina], queryFn: () => get<Pagina<Asignacion>>(`/admin/surtido?estado=${estado}&pagina=${pagina}${sucursal ? `&sucursal_id=${sucursal}` : ''}`), refetchInterval: 30_000 });
  return (
    <>
      <Encabezado titulo="Surtido y envíos" sub="Pedidos confirmados asignados a tu sucursal">
        <Selector value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }} className="w-44">
          <option value="activas">Por atender</option><option value="pendiente">Pendientes</option><option value="en_surtido">En surtido</option>
          <option value="empacada">Empacadas</option><option value="despachada">Despachadas</option><option value="entregada">Entregadas</option><option value="todas">Todas</option>
        </Selector>
        <FiltroSucursal valor={sucursal} onCambio={(v) => { setSucursal(v); setPagina(1); }} />
      </Encabezado>
      <Tarjeta>
        <ErrorCaja error={q.error} />
        {q.isLoading ? <Cargando forma="tabla" /> : (
          <Tabla columnas={['Pedido', 'Sucursal', 'Cliente', 'Entrega', 'Unidades', 'Avance', 'Estado', '']} vacia={!q.data?.items.length}>
            {q.data?.items.map((a) => {
              const total = a.detalles.reduce((s, d) => s + d.cantidad - d.faltante, 0);
              const desp = a.detalles.reduce((s, d) => s + d.despachada, 0);
              const surt = a.detalles.reduce((s, d) => s + d.surtida, 0);
              return (
                <tr key={a.id}>
                  <Td><p className="font-semibold">{a.pedido?.folio}</p><p className="text-xs text-tinta-400">{fechaHora(a.creado)}</p></Td>
                  <Td>{a.sucursal.nombre}</Td><Td>{a.pedido?.cliente}</Td>
                  <Td className="text-xs">{a.pedido?.modalidad === 'recoger' ? 'Recoger en sucursal' : `${a.pedido?.direccion_envio?.ciudad} · CP ${a.pedido?.direccion_envio?.cp}`}</Td>
                  <Td>{total}</Td>
                  <Td><div className="w-28"><div className="h-1.5 overflow-hidden rounded-full bg-tinta-100"><div className="h-full bg-menta-500" style={{ width: `${total ? (desp / total) * 100 : 0}%` }} /></div>
                    <p className="mt-1 text-[11px] text-tinta-400">{surt} surtidas · {desp} despachadas</p></div></Td>
                  <Td><Estado valor={a.estado} /></Td>
                  <Td><Link to={`/admin/surtido/${a.id}`} className="inline-flex h-8 items-center rounded-lg bg-tinta-900 px-3 text-xs font-semibold text-white">Atender</Link></Td>
                </tr>
              );
            })}
          </Tabla>
        )}
        {q.data && <Paginacion pagina={q.data.pagina} paginas={q.data.paginas} total={q.data.total} onCambio={setPagina} />}
      </Tarjeta>
    </>
  );
}

function AccionesPaquete({ pq, modalidad, onListo }: { pq: Paquete; modalidad: string; onListo: () => void }) {
  const avisar = useAviso();
  const [modo, setModo] = useState<'despachar' | 'evento' | 'entregar' | null>(null);
  const [f, setF] = useState<Record<string, string>>({ estado: 'en_transito' });
  const m = useMutation({
    mutationFn: () => {
      if (modo === 'despachar') return post(`/admin/paquetes/${pq.id}/despachar`, { paqueteria: f.paqueteria, guia: f.guia });
      if (modo === 'evento') return post(`/admin/paquetes/${pq.id}/eventos`, { estado: f.estado, descripcion: f.descripcion });
      return post(`/admin/paquetes/${pq.id}/entregar`, { recibio: f.recibio, identificacion: f.identificacion });
    },
    onSuccess: () => { setModo(null); setF({ estado: 'en_transito' }); onListo(); avisar('Paquete actualizado.'); },
  });
  const listo = useMutation({ mutationFn: () => post(`/admin/paquetes/${pq.id}/listo`), onSuccess: () => { onListo(); avisar('Se avisó al cliente que puede recoger.'); } });
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {pq.estado === 'preparado' && modalidad === 'envio' && <Boton tam="sm" icono={<Truck className="h-3.5 w-3.5" />} onClick={() => setModo('despachar')}>Despachar</Boton>}
        {pq.estado === 'preparado' && modalidad === 'recoger' && <Boton tam="sm" cargando={listo.isPending} onClick={() => listo.mutate()}>Marcar listo para recoger</Boton>}
        {pq.estado === 'listo_para_recoger' && <Boton tam="sm" variante="menta" onClick={() => setModo('entregar')}>Entregar en mostrador</Boton>}
        {['despachado', 'en_transito', 'incidencia'].includes(pq.estado) && <Boton tam="sm" variante="secundario" onClick={() => setModo('evento')}>Registrar evento</Boton>}
      </div>
      <ErrorCaja error={listo.error} />
      <Modal abierto={!!modo} titulo={modo === 'despachar' ? `Despachar ${pq.folio}` : modo === 'evento' ? `Evento de ${pq.folio}` : `Entregar ${pq.folio}`} onCerrar={() => setModo(null)}>
        <div className="space-y-4">
          {modo === 'despachar' && <>
            <Aviso>Al despachar, las piezas salen del inventario físico de la sucursal. La guía se captura manualmente: no hay conexión con la paquetería.</Aviso>
            <Campo etiqueta="Paquetería"><Entrada value={f.paqueteria || ''} onChange={(e) => setF({ ...f, paqueteria: e.target.value })} placeholder="Nombre de la paquetería o reparto propio" /></Campo>
            <Campo etiqueta="Número de guía"><Entrada value={f.guia || ''} onChange={(e) => setF({ ...f, guia: e.target.value })} /></Campo>
          </>}
          {modo === 'evento' && <>
            <Campo etiqueta="Evento"><Selector value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>
              <option value="en_transito">En tránsito</option><option value="entregado">Entregado al cliente</option><option value="incidencia">Incidencia en el envío</option></Selector></Campo>
            <Campo etiqueta="Descripción" ayuda={f.estado === 'entregado' ? 'Indica quién recibió o la evidencia de entrega.' : undefined}><Texto value={f.descripcion || ''} onChange={(e) => setF({ ...f, descripcion: e.target.value })} /></Campo>
            <p className="text-xs text-tinta-400">El evento queda marcado como interno (registrado por la sucursal).</p>
          </>}
          {modo === 'entregar' && <>
            <Campo etiqueta="Nombre de quien recibe"><Entrada value={f.recibio || ''} onChange={(e) => setF({ ...f, recibio: e.target.value })} /></Campo>
            <Campo etiqueta="Identificación mostrada" ayuda="Tipo y últimos dígitos; no captures el número completo."><Entrada value={f.identificacion || ''} onChange={(e) => setF({ ...f, identificacion: e.target.value })} placeholder="INE ****1234" /></Campo>
          </>}
          <ErrorCaja error={m.error} />
          <div className="flex justify-end gap-2"><Boton variante="secundario" onClick={() => setModo(null)}>Cancelar</Boton><Boton cargando={m.isPending} onClick={() => m.mutate()}>Confirmar</Boton></div>
        </div>
      </Modal>
    </>
  );
}

type DetalleAsig = Asignacion['detalles'][number];
type GrupoEmpaque = { clave: string; empleado_id: number | null; nombre: string | null; puesto: string | null; detalles: DetalleAsig[] };

/** Piezas surtidas y aún sin empacar, agrupadas por persona (orden alfabético; las piezas sin persona al final). */
function gruposPorEmpacar(a: Asignacion): GrupoEmpaque[] {
  const m = new Map<string, GrupoEmpaque>();
  for (const d of a.detalles.filter((x) => x.surtida > x.empacada)) {
    const clave = d.empleado_id != null ? `e${d.empleado_id}` : d.empleado ? `n${d.empleado}` : 'sin';
    const g = m.get(clave) ?? { clave, empleado_id: d.empleado_id ?? null, nombre: d.empleado, puesto: d.puesto ?? null, detalles: [] };
    g.detalles.push(d);
    m.set(clave, g);
  }
  return [...m.values()].sort((x, y) => (x.nombre ? 0 : 1) - (y.nombre ? 0 : 1) || (x.nombre ?? '').localeCompare(y.nombre ?? '', 'es'));
}

export function SurtidoDetalle() {
  const { id } = useParams();
  const qc = useQueryClient();
  const avisar = useAviso();
  const q = useQuery({ queryKey: ['asignacion', id], queryFn: () => get<Asignacion>(`/admin/surtido/${id}`) });
  const [surtido, setSurtido] = useState<Record<number, { surtida: number; faltante: number; motivo: string }>>({});
  const [empaque, setEmpaque] = useState<Record<number, number>>({});
  const [modalSurtido, setModalSurtido] = useState(false);
  const [modalPaquete, setModalPaquete] = useState(false);
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['asignacion', id] }); qc.invalidateQueries({ queryKey: ['surtido'] }); };
  const iniciar = useMutation({ mutationFn: () => post(`/admin/surtido/${id}/iniciar`), onSuccess: () => { refrescar(); avisar('Surtido iniciado: las piezas quedaron comprometidas.'); } });
  const registrar = useMutation({
    mutationFn: () => post(`/admin/surtido/${id}/registrar`, { partidas: Object.entries(surtido).map(([k, v]) => ({ asignacion_detalle_id: Number(k), surtida: v.surtida, faltante: v.faltante, motivo_faltante: v.motivo || null })) }),
    onSuccess: () => { refrescar(); setModalSurtido(false); avisar('Surtido registrado.'); },
  });
  const [destino, setDestino] = useState<'nuevo' | number>('nuevo');
  const empacar = useMutation({
    mutationFn: () => {
      const partidas = Object.entries(empaque).filter(([, c]) => c > 0).map(([k, c]) => ({ asignacion_detalle_id: Number(k), cantidad: c }));
      return destino === 'nuevo' ? post(`/admin/surtido/${id}/paquetes`, { partidas }) : post(`/admin/surtido/${id}/paquetes/${destino}/agregar`, { partidas });
    },
    onSuccess: () => { refrescar(); setModalPaquete(false); avisar(destino === 'nuevo' ? 'Paquete creado.' : 'Piezas agregadas al paquete.'); },
  });

  if (q.isLoading) return <Cargando forma="pagina" />;
  if (!q.data) return <ErrorCaja error={q.error} />;
  const a = q.data;
  const abrirSurtido = () => { setSurtido(Object.fromEntries(a.detalles.map((d) => [d.id, { surtida: d.cantidad - d.faltante, faltante: d.faltante, motivo: '' }]))); setModalSurtido(true); };
  const grupos = gruposPorEmpacar(a);
  /** Paquete que aún no sale donde ya va esa persona (sus piezas nuevas deben ir ahí). */
  const paqueteDe = (empleadoId: number | null) => empleadoId == null ? undefined
    : a.paquetes.find((pq) => pq.estado === 'preparado' && pq.contenido.some((c) => c.empleado_id === empleadoId));
  const bloqueado = (g: GrupoEmpaque, dest: 'nuevo' | number) => { const otro = paqueteDe(g.empleado_id); return !!otro && otro.id !== dest; };
  const abrirPaquete = (dest: 'nuevo' | number = 'nuevo') => {
    setDestino(dest);
    setEmpaque(Object.fromEntries(grupos.flatMap((g) => g.detalles.map((d) => [d.id, bloqueado(g, dest) ? 0 : d.surtida - d.empacada]))));
    empacar.reset();
    setModalPaquete(true);
  };
  const cambiarDestino = (dest: 'nuevo' | number) => {
    setDestino(dest);
    setEmpaque((e) => ({ ...e, ...Object.fromEntries(grupos.flatMap((g) => bloqueado(g, dest) ? g.detalles.map((d) => [d.id, 0]) : [])) }));
  };
  const incluida = (g: GrupoEmpaque) => g.detalles.every((d) => (empaque[d.id] ?? 0) === d.surtida - d.empacada);
  const alternar = (g: GrupoEmpaque, si: boolean) => setEmpaque((e) => ({ ...e, ...Object.fromEntries(g.detalles.map((d) => [d.id, si ? d.surtida - d.empacada : 0])) }));
  const piezasElegidas = Object.values(empaque).reduce((s, c) => s + c, 0);
  const preparados = a.paquetes.filter((pq) => pq.estado === 'preparado');
  const porEmpacar = a.detalles.some((d) => d.surtida > d.empacada);
  const pasos = [
    { n: 'Iniciar surtido', hecho: a.estado !== 'pendiente' },
    { n: 'Registrar surtido', hecho: a.detalles.every((d) => d.surtida + d.faltante === d.cantidad) },
    { n: 'Empacar', hecho: a.detalles.every((d) => d.empacada === d.cantidad - d.faltante) },
    { n: a.pedido?.modalidad === 'recoger' ? 'Entregar en mostrador' : 'Despachar y entregar', hecho: ['despachada', 'entregada'].includes(a.estado) },
  ];

  return (
    <>
      <Encabezado titulo={`Surtido ${a.pedido?.folio}`} sub={`${a.sucursal.nombre} · ${a.pedido?.cliente} · ${a.pedido?.canal === 'corporativo' ? 'Corporativo' : 'Tienda'}`}>
        <Link to={`/admin/pedidos/${a.pedido_id}`} className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold ring-1 ring-tinta-200">Ver pedido</Link>
      </Encabezado>
      <ol className="mb-5 grid gap-2 sm:grid-cols-4">
        {pasos.map((p, i) => <li key={p.n} className={cls('rounded-xl px-4 py-3 text-sm font-semibold ring-1', p.hecho ? 'bg-menta-50 text-menta-800 ring-menta-200' : 'bg-white ring-tinta-100')}>{i + 1}. {p.n}</li>)}
      </ol>
      {a.pedido && ['pendiente_pago', 'pago_en_revision', 'en_revision'].includes(a.pedido.estado) && <div className="mb-4"><Aviso tipo="alerta">El pedido aún no está confirmado ({etiqueta(a.pedido.estado)}): no se puede surtir.</Aviso></div>}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <Tarjeta titulo="Lista de surtido" sub={a.pedido?.modalidad === 'recoger' ? 'El cliente recoge en esta sucursal' : `Envío a ${a.pedido?.direccion_envio?.calle} ${a.pedido?.direccion_envio?.numero}, ${a.pedido?.direccion_envio?.ciudad}`}
          accion={<div className="flex gap-2">
            {a.estado === 'pendiente' && <Boton icono={<Play className="h-4 w-4" />} cargando={iniciar.isPending} onClick={() => iniciar.mutate()}>Iniciar surtido</Boton>}
            {['en_surtido', 'empacada'].includes(a.estado) && <Boton variante="secundario" icono={<ClipboardCheck className="h-4 w-4" />} onClick={abrirSurtido}>Registrar surtido</Boton>}
            {porEmpacar && <Boton icono={<Package className="h-4 w-4" />} onClick={() => abrirPaquete()}>Crear paquete</Boton>}
          </div>}>
          <ErrorCaja error={iniciar.error} />
          <Tabla columnas={['SKU', 'Artículo', 'Empleado', 'Pedidas', 'Surtidas', 'Faltantes', 'Empacadas', 'Despachadas']}>
            {a.detalles.map((d) => (
              <tr key={d.id}><Td className="font-mono text-xs">{d.sku}</Td><Td>{d.nombre}<p className="text-xs text-tinta-400">{d.color} · {d.talla}</p></Td><Td className="text-xs">{d.empleado || '—'}</Td>
                <Td className="font-semibold">{d.cantidad}</Td><Td>{d.surtida}</Td><Td className={d.faltante ? 'font-semibold text-coral-600' : ''}>{d.faltante}</Td><Td>{d.empacada}</Td><Td>{d.despachada}</Td></tr>
            ))}
          </Tabla>
        </Tarjeta>
        <Tarjeta titulo="Paquetes">
          {!a.paquetes.length ? <p className="text-sm text-tinta-400">Aún no hay paquetes.</p> : (
            <div className="space-y-3">
              {a.paquetes.map((pq) => (
                <div key={pq.id} className="rounded-xl p-4 ring-1 ring-tinta-100">
                  <div className="flex items-center justify-between"><p className="flex items-center gap-2 font-semibold"><PackageCheck className="h-4 w-4 text-menta-600" />{pq.folio}</p><Estado valor={pq.estado} /></div>
                  <div className="mb-2"><ContenidoPorPersona pq={pq} columnas={1} /></div>
                  {pq.estado === 'preparado' && porEmpacar && (
                    <Boton tam="sm" variante="secundario" icono={<PackagePlus className="h-3.5 w-3.5" />} className="mb-2" onClick={() => abrirPaquete(pq.id)}>Agregar piezas a este paquete</Boton>
                  )}
                  {pq.envio && <div className="mb-2 rounded-lg bg-tinta-50 p-2 text-xs"><p className="font-semibold">{pq.envio.paqueteria} · {pq.envio.guia}</p>
                    {pq.envio.eventos.map((e, i) => <p key={i}>{fechaHora(e.fecha)} · {etiqueta(e.estado)} — {e.descripcion} <span className="text-tinta-400">({e.origen})</span></p>)}</div>}
                  <AccionesPaquete pq={pq} modalidad={a.pedido?.modalidad || 'envio'} onListo={refrescar} />
                </div>
              ))}
            </div>
          )}
        </Tarjeta>
      </div>

      <Modal abierto={modalSurtido} titulo="Registrar surtido" onCerrar={() => setModalSurtido(false)} ancho="max-w-2xl">
        <p className="mb-3 text-sm text-tinta-500">Indica cuántas piezas tomaste del anaquel. Si una pieza no existe o está dañada, regístrala como faltante con su motivo: se descuenta como merma y se genera la incidencia y el reembolso o ajuste.</p>
        <div className="space-y-2">
          {a.detalles.map((d) => (
            <div key={d.id} className="grid items-end gap-2 rounded-xl p-3 ring-1 ring-tinta-100 sm:grid-cols-[1fr_90px_90px_1.2fr]">
              <p className="text-sm"><b>{d.sku}</b><br /><span className="text-xs text-tinta-400">Pedidas {d.cantidad}</span></p>
              <Campo etiqueta="Surtidas"><Entrada type="number" min={d.surtida} max={d.cantidad} value={surtido[d.id]?.surtida ?? 0} onChange={(e) => setSurtido({ ...surtido, [d.id]: { ...surtido[d.id], surtida: Number(e.target.value) } })} /></Campo>
              <Campo etiqueta="Faltantes"><Entrada type="number" min={d.faltante} max={d.cantidad} value={surtido[d.id]?.faltante ?? 0} onChange={(e) => setSurtido({ ...surtido, [d.id]: { ...surtido[d.id], faltante: Number(e.target.value) } })} /></Campo>
              <Campo etiqueta="Motivo del faltante"><Entrada value={surtido[d.id]?.motivo ?? ''} disabled={(surtido[d.id]?.faltante ?? 0) <= d.faltante} onChange={(e) => setSurtido({ ...surtido, [d.id]: { ...surtido[d.id], motivo: e.target.value } })} /></Campo>
            </div>
          ))}
        </div>
        <ErrorCaja error={registrar.error} />
        <div className="mt-4 flex justify-end gap-2"><Boton variante="secundario" onClick={() => setModalSurtido(false)}>Cancelar</Boton><Boton cargando={registrar.isPending} onClick={() => registrar.mutate()}>Guardar surtido</Boton></div>
      </Modal>
      <Modal abierto={modalPaquete} titulo={destino === 'nuevo' ? 'Crear paquete' : `Agregar a ${a.paquetes.find((pq) => pq.id === destino)?.folio ?? 'paquete'}`}
        sub="Un paquete individual por persona dentro del paquete grande" onCerrar={() => setModalPaquete(false)} ancho="max-w-2xl"
        pie={<div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-tinta-500">{piezasElegidas} {piezasElegidas === 1 ? 'pieza' : 'piezas'} · {grupos.filter((g) => g.nombre && g.detalles.some((d) => (empaque[d.id] ?? 0) > 0)).length} persona(s)</p>
          <div className="flex gap-2"><Boton variante="secundario" onClick={() => setModalPaquete(false)}>Cancelar</Boton>
            <Boton cargando={empacar.isPending} disabled={!piezasElegidas} onClick={() => empacar.mutate()}>{destino === 'nuevo' ? 'Crear paquete' : 'Agregar al paquete'}</Boton></div>
        </div>}>
        <Aviso>Todo lo de una persona va junto en su paquete individual, con su nombre, y en un solo paquete grande: se agrega o se quita a la persona completa.</Aviso>
        {preparados.length > 0 && (
          <Campo etiqueta="¿Dónde va?" ayuda="Si una persona ya va en un paquete que aún no sale, lo nuevo se agrega a ese mismo paquete.">
            <Selector value={String(destino)} onChange={(e) => cambiarDestino(e.target.value === 'nuevo' ? 'nuevo' : Number(e.target.value))}>
              <option value="nuevo">Paquete grande nuevo</option>
              {preparados.map((pq) => <option key={pq.id} value={pq.id}>Agregar a {pq.folio} (aún no sale)</option>)}
            </Selector>
          </Campo>
        )}
        <div className="mt-3 space-y-3">
          {grupos.map((g) => {
            const otro = bloqueado(g, destino) ? paqueteDe(g.empleado_id) : undefined;
            const piezas = g.detalles.reduce((s, d) => s + d.surtida - d.empacada, 0);
            const cabeza = { empleado: g.nombre ? { id: g.empleado_id ?? 0, nombre: g.nombre, puesto: g.puesto } : null, piezas: [], total_piezas: piezas };
            const si = !otro && incluida(g);
            return (
              <section key={g.clave} className={cls('rounded-2xl p-3 ring-1', otro ? 'bg-tinta-50 opacity-70 ring-tinta-100' : si && g.nombre ? 'bg-menta-50/50 ring-menta-200' : 'bg-white ring-tinta-100')}>
                {g.nombre ? (
                  <label className={cls('flex items-center gap-3', otro ? 'cursor-not-allowed' : 'cursor-pointer')}>
                    <input type="checkbox" className="h-5 w-5 shrink-0 accent-menta-600" checked={si} disabled={!!otro}
                      onChange={(e) => alternar(g, e.target.checked)} aria-label={`Incluir el paquete individual de ${g.nombre}`} />
                    <div className="min-w-0 flex-1"><CabezaIndividual g={cabeza} /></div>
                  </label>
                ) : <CabezaIndividual g={cabeza} />}
                {otro && <p className="mt-2 text-xs font-medium text-tinta-600">Ya va en {otro.folio}, que aún no sale: elige «Agregar a {otro.folio}» para que todo lo suyo vaya junto.</p>}
                <ul className="mt-2.5 space-y-1.5 border-t border-tinta-100 pt-2.5">
                  {g.detalles.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0"><span className="font-medium text-tinta-900">{d.nombre}</span>
                        <span className="text-tinta-500"> · Talla {d.talla}{d.color ? ` · ${d.color}` : ''}</span> <span className="font-mono text-[10px] text-tinta-400">{d.sku}</span></span>
                      {g.nombre ? <span className="shrink-0 font-semibold tabular-nums">×{d.surtida - d.empacada}</span> : (
                        <span className="flex shrink-0 items-center gap-2"><Entrada type="number" className="w-20" min={0} max={d.surtida - d.empacada} value={empaque[d.id] ?? 0}
                          onChange={(e) => setEmpaque({ ...empaque, [d.id]: Math.max(0, Math.min(d.surtida - d.empacada, Number(e.target.value))) })} aria-label={`Piezas de ${d.nombre}`} />de {d.surtida - d.empacada}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
        <ErrorCaja error={empacar.error} />
      </Modal>
    </>
  );
}
