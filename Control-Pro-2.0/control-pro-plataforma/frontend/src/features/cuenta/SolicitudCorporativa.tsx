/**
 * Portal de la sucursal: inicio con indicadores y constructor de solicitudes por empleado.
 * La solicitud se arma por persona (no hay productos sin destinatario), se guarda como borrador en el servidor y se
 * envía a revisión; el servidor vuelve a validar empleado, regla por puesto, variante y cantidades.
 */
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ClipboardList, FilePlus2, Minus, PackageCheck, PenLine, Plus, Save, Search,
  Send, ShieldAlert, Trash2, Truck, Users } from 'lucide-react';
import { claveIdempotencia, get, post, put } from '../../api/cliente';
import type { Direccion, Pagina, Pedido, PedidoResumen, ProductoDetalle, ProductoResumen, ResumenSucursal } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { Aviso, Boton, Campo, Cargando, Entrada, ErrorCaja, Modal, Selector, Tarjeta, Texto, useAviso, Vacio } from '../../components/ui';
import Visor360 from '../../components/Visor360';
import { Aparecer, Contador, EsqueletoLista, LineaProceso, Transicion, volarHacia } from '../../components/movimiento';
import { cls, fechaHora } from '../../lib/formato';
import { catalogoCompleto, elegible, PartidaSolicitud, PuestosAutorizados } from '../../lib/solicitud';
import { ImagenProducto } from '../tienda/ProductoCard';
import { Contacto } from '../admin/Organizacion';
import type { EmpleadoCorporativo } from './Corporativo';

// ---------------------------------------------------------------- inicio de la sucursal

const FLUJO = [
  { clave: 'sol', titulo: 'Solicitud', detalle: 'Por empleado' }, { clave: 'rev', titulo: 'Revisión', detalle: 'Distribuidor' },
  { clave: 'sur', titulo: 'Surtido', detalle: 'Almacén' }, { clave: 'env', titulo: 'Envío', detalle: 'Guía por paquete' },
  { clave: 'rec', titulo: 'Recepción', detalle: 'En tu sucursal' }, { clave: 'ent', titulo: 'Entrega', detalle: 'Firma del empleado' },
];

function Indicador({ titulo, valor, icono, enlace, alerta, orden }: { titulo: string; valor: number; icono: ReactNode; enlace: string; alerta?: boolean; orden: number }) {
  return (
    <Aparecer orden={orden}>
      <Link to={enlace} className={cls('group block rounded-2xl bg-white p-4 shadow-suave ring-1 transition hover:-translate-y-0.5 hover:shadow-lg',
        alerta && valor > 0 ? 'ring-amber-300' : 'ring-tinta-100')}>
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-tinta-400">
          <span>{titulo}</span>
          <span className={cls('grid h-8 w-8 place-items-center rounded-xl transition group-hover:scale-110', alerta && valor > 0 ? 'bg-amber-100 text-amber-700' : 'bg-menta-50 text-menta-700')}>{icono}</span>
        </div>
        <p className="mt-2 font-display text-3xl font-extrabold text-tinta-900"><Contador valor={valor} /></p>
      </Link>
    </Aparecer>
  );
}

export function InicioCuenta() {
  const { cliente } = useAuth();
  const empresa = cliente?.tipo === 'empresa';
  const resumen = useQuery({ queryKey: ['resumen-sucursal'], queryFn: () => get<ResumenSucursal>('/cuenta/resumen'), enabled: empresa });
  const borradores = useQuery({ queryKey: ['mis-borradores'], queryFn: () => get<Pagina<PedidoResumen>>('/cuenta/pedidos?canal=corporativo&estado=borrador&por_pagina=5'), enabled: empresa });
  if (!empresa) return <Navigate to="pedidos" replace />;
  const r = resumen.data;
  return (
    <div className="space-y-5">
      <Aparecer>
        <section className="relative overflow-hidden rounded-3xl bg-tinta-900 p-6 text-white sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-menta-500/25 blur-3xl" />
          <p className="text-xs font-bold uppercase tracking-widest text-menta-300">Portal de sucursal</p>
          <h1 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">{cliente?.razon_social || cliente?.nombre}</h1>
          <p className="mt-2 max-w-xl text-sm text-tinta-200">Solicita uniformes por empleado, sigue cada paquete y registra la entrega con firma de quien los recibe.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/cuenta/solicitudes/nueva" className="inline-flex h-11 items-center gap-2 rounded-full bg-menta-500 px-5 text-sm font-bold text-white transition hover:bg-menta-400"><FilePlus2 className="h-4 w-4" />Crear solicitud</Link>
            <Link to="/catalogo" className="inline-flex h-11 items-center gap-2 rounded-full bg-white/10 px-5 text-sm font-semibold ring-1 ring-white/20 transition hover:bg-white/15">Ver catálogo</Link>
          </div>
          <div className="mt-7 hidden rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 sm:block [&_span]:!text-tinta-100">
            <LineaProceso compacta etapas={FLUJO.map((e) => ({ ...e, estado: 'pendiente' as const }))} />
          </div>
        </section>
      </Aparecer>

      {resumen.isLoading ? <EsqueletoLista filas={2} /> : <ErrorCaja error={resumen.error} />}
      {r && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicador orden={1} titulo="En revisión" valor={r.solicitudes.en_revision} icono={<ClipboardList className="h-4 w-4" />} enlace="/cuenta/pedidos?estado=en_revision" />
          <Indicador orden={2} titulo="Por corregir" valor={r.solicitudes.por_corregir} alerta icono={<PenLine className="h-4 w-4" />} enlace="/cuenta/pedidos?estado=devuelto" />
          <Indicador orden={3} titulo="En proceso" valor={r.solicitudes.en_proceso} icono={<Truck className="h-4 w-4" />} enlace="/cuenta/pedidos?estado=confirmado,en_preparacion,parcialmente_enviado,enviado,parcialmente_entregado" />
          <Indicador orden={4} titulo="Paquetes por recibir" valor={r.paquetes_por_recibir} alerta icono={<PackageCheck className="h-4 w-4" />} enlace="/cuenta/pedidos?estado=parcialmente_entregado,entregado" />
          <Indicador orden={5} titulo="Entregas pendientes" valor={r.entregas_pendientes} alerta icono={<Users className="h-4 w-4" />} enlace="/cuenta/pedidos?estado=parcialmente_entregado,entregado" />
          <Indicador orden={6} titulo="Conformidades pendientes" valor={r.conformidades_pendientes} alerta icono={<Check className="h-4 w-4" />} enlace="/cuenta/pedidos?estado=parcialmente_entregado,entregado" />
          <Indicador orden={7} titulo="Incidencias abiertas" valor={r.incidencias_abiertas} alerta icono={<ShieldAlert className="h-4 w-4" />} enlace="/cuenta/pedidos" />
          <Indicador orden={8} titulo="Empleados activos" valor={r.empleados_activos} icono={<Users className="h-4 w-4" />} enlace="/cuenta/empleados" />
        </div>
      )}

      {r?.zona && (
        <Aparecer orden={9}>
          <Tarjeta titulo={`Tu zona: ${r.zona.nombre}`} sub={r.zona.division ? `División ${r.zona.division.nombre}` : undefined}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Contacto rol="Gerente de zona" nombre={r.zona.gerente} correo={r.zona.correo} telefono={r.zona.telefono} />
              {r.zona.division && <Contacto rol="Responsable divisional" nombre={r.zona.division.responsable} correo={r.zona.division.correo} telefono={r.zona.division.telefono} />}
            </div>
          </Tarjeta>
        </Aparecer>
      )}

      <Tarjeta titulo="Borradores" sub="Solicitudes guardadas que aún no envías a revisión">
        {borradores.isLoading ? <EsqueletoLista filas={2} /> : !borradores.data?.items.length ? (
          <Vacio titulo="Sin borradores" texto="Cuando guardes una solicitud sin enviarla, aparecerá aquí para continuarla." />
        ) : (
          <ul className="divide-y divide-tinta-100">
            {borradores.data.items.map((b, i) => (
              <Aparecer como="li" orden={i} key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div><p className="font-semibold">{b.folio}</p><p className="text-xs text-tinta-400">{b.articulos} artículo(s) · guardado {fechaHora(b.creado)}</p></div>
                <Link to={`/cuenta/solicitudes/${b.id}/editar`} className="inline-flex h-8 items-center gap-1 rounded-lg bg-tinta-900 px-3 text-xs font-semibold text-white">Continuar <ArrowRight className="h-3.5 w-3.5" /></Link>
              </Aparecer>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}

// ---------------------------------------------------------------- constructor de solicitud

type Linea = PartidaSolicitud & { clave: string; nombre: string; talla: string; color: string; imagen: string | null; producto_id: number | null };
const PASOS = ['Empleados', 'Artículos', 'Revisar y enviar'];

function SelectorArticulo({ producto, empleado, puestos, onAgregar, onCerrar }: {
  producto: ProductoResumen; empleado: EmpleadoCorporativo; puestos: PuestosAutorizados | undefined;
  onAgregar: (l: Omit<Linea, 'clave'>) => void; onCerrar: () => void;
}) {
  const det = useQuery({ queryKey: ['producto', producto.slug], queryFn: () => get<ProductoDetalle>(`/tienda/productos/${producto.slug}`) });
  const colores = useMemo(() => [...new Map((det.data?.variantes || []).map((v) => [v.color, v.color_hex])).entries()], [det.data]);
  const [color, setColor] = useState('');
  const [talla, setTalla] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [excepcion, setExcepcion] = useState('');
  useEffect(() => { if (colores.length && !color) setColor(colores[0][0]); }, [colores, color]);
  const ok = elegible(puestos, empleado.puesto, producto.id);
  const variante = det.data?.variantes.find((v) => v.color === color && v.talla === talla);
  const giro = det.data?.giros.find((g) => g.color === color) ?? det.data?.giros.find((g) => g.color === null);
  if (det.isLoading) return <Cargando />;
  return (
    <div className="grid gap-5 sm:grid-cols-[220px_1fr]">
      <div className="aspect-square overflow-hidden rounded-2xl bg-white ring-1 ring-arena-200">
        {giro ? <Visor360 compacto key={giro.frames[0]} frames={giro.frames} alt={`${producto.nombre} ${color}`} /> : <ImagenProducto src={producto.imagen} alt={producto.nombre} />}
      </div>
      <div className="space-y-4">
        <p className="text-sm text-tinta-500">Para <b className="text-tinta-900">{empleado.nombre}</b> · {empleado.puesto}</p>
        {!ok && <Aviso tipo="alerta">Este artículo no está autorizado para el puesto {empleado.puesto}. Puedes solicitarlo como excepción justificada; el distribuidor decide si la acepta.</Aviso>}
        {colores.length > 1 && (
          <div><p className="mb-2 text-sm font-semibold">Color: <span className="font-normal text-tinta-500">{color}</span></p>
            <div className="flex gap-2">{colores.map(([c, h]) => <button key={c} type="button" onClick={() => { setColor(c); setTalla(''); }} aria-label={c}
              className={cls('h-9 w-9 rounded-full ring-2 ring-offset-2', color === c ? 'ring-tinta-900' : 'ring-arena-300')} style={{ background: h }} />)}</div></div>
        )}
        <div><p className="mb-2 text-sm font-semibold">Talla</p>
          <div className="flex flex-wrap gap-2">{det.data?.variantes.filter((v) => v.color === color).map((v) => (
            <button key={v.id} type="button" onClick={() => setTalla(v.talla)}
              className={cls('h-10 min-w-11 rounded-xl px-3 text-sm font-bold ring-1 transition', talla === v.talla ? 'bg-tinta-900 text-white ring-tinta-900' : 'bg-white ring-arena-300 hover:ring-tinta-500')}>{v.talla}</button>
          ))}</div></div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Cantidad</span>
          <div className="flex h-10 items-center rounded-xl bg-white ring-1 ring-arena-300">
            <button type="button" className="px-3" onClick={() => setCantidad(Math.max(1, cantidad - 1))} aria-label="Menos"><Minus className="h-4 w-4" /></button>
            <span className="w-8 text-center font-bold">{cantidad}</span>
            <button type="button" className="px-3" onClick={() => setCantidad(Math.min(50, cantidad + 1))} aria-label="Más"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
        {!ok && <Campo etiqueta="Justificación de la excepción" ayuda="Mínimo 10 caracteres. Puedes completarla después en la revisión."><Texto value={excepcion} onChange={(e) => setExcepcion(e.target.value)} /></Campo>}
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
          <Boton disabled={!variante} icono={<Plus className="h-4 w-4" />} onClick={() => variante && onAgregar({
            empleado_id: empleado.id, variante_id: variante.id, cantidad, excepcion: ok ? null : (excepcion.trim() || null),
            nombre: producto.nombre, talla: variante.talla, color: variante.color, imagen: producto.imagen, producto_id: producto.id,
          })}>{variante ? `Agregar ${cantidad} para ${empleado.nombre.split(' ')[0]}` : 'Elige una talla'}</Boton>
        </div>
      </div>
    </div>
  );
}

export default function ConstructorSolicitud() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const avisar = useAviso();
  const empleados = useQuery({ queryKey: ['empleados'], queryFn: () => get<EmpleadoCorporativo[]>('/cuenta/empleados') });
  const catalogo = useQuery({ queryKey: ['catalogo-completo'], queryFn: catalogoCompleto, staleTime: 300_000 });
  const puestos = useQuery({ queryKey: ['puestos-autorizados'], queryFn: () => get<PuestosAutorizados>('/cuenta/puestos-autorizados') });
  const categorias = useQuery({ queryKey: ['categorias'], queryFn: () => get<{ id: number; nombre: string; slug: string }[]>('/tienda/categorias') });
  const dirs = useQuery({ queryKey: ['direcciones'], queryFn: () => get<Direccion[]>('/cuenta/direcciones') });
  const previo = useQuery({ queryKey: ['pedido', id], queryFn: () => get<Pedido>(`/cuenta/pedidos/${id}`), enabled: !!id });

  const [paso, setPaso] = useState(0);
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const [activo, setActivo] = useState<number | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [notas, setNotas] = useState('');
  const [direccion, setDireccion] = useState<number | ''>('');
  const [busqueda, setBusqueda] = useState('');
  const [busqEmpleado, setBusqEmpleado] = useState('');
  const [categoria, setCategoria] = useState('');
  const [soloElegibles, setSoloElegibles] = useState(true);
  const [eligiendo, setEligiendo] = useState<ProductoResumen | null>(null);
  const [sucio, setSucio] = useState(false);
  const [enviada, setEnviada] = useState(false);
  const [clave] = useState(() => claveIdempotencia('solicitud'));
  const chips = useRef<Record<number, HTMLElement | null>>({});
  const tarjetas = useRef<Record<number, HTMLElement | null>>({});

  // Cargar un borrador o una solicitud devuelta para corrección
  useEffect(() => {
    if (!previo.data || !catalogo.data) return;
    const p = previo.data;
    const porNombre = new Map(catalogo.data.map((x) => [x.nombre, x]));
    setLineas(p.detalles.filter((d) => d.empleado).map((d) => ({
      clave: String(d.id), empleado_id: d.empleado!.id, variante_id: d.variante_id, cantidad: d.cantidad, excepcion: d.excepcion,
      nombre: d.nombre, talla: d.talla, color: d.color, imagen: porNombre.get(d.nombre)?.imagen ?? null, producto_id: porNombre.get(d.nombre)?.id ?? null,
    })));
    const ids = [...new Set(p.detalles.filter((d) => d.empleado).map((d) => d.empleado!.id))];
    setSeleccion(ids);
    setActivo(ids[0] ?? null);
    setNotas(p.notas || '');
    if (ids.length) setPaso(1);
  }, [previo.data, catalogo.data]);
  useEffect(() => {
    if (direccion === '' && dirs.data?.length) setDireccion((dirs.data.find((d) => d.predeterminada) || dirs.data[0]).id);
  }, [dirs.data, direccion]);

  const activos = (empleados.data || []).filter((e) => e.activo);
  const porId = useMemo(() => new Map(activos.map((e) => [e.id, e])), [activos]);
  const empActivo = activo != null ? porId.get(activo) : undefined;
  const editable = !id || ['borrador', 'devuelto'].includes(previo.data?.estado || '');
  const partidas = (): PartidaSolicitud[] => lineas.map(({ empleado_id, variante_id, cantidad, excepcion }) => ({ empleado_id, variante_id, cantidad, excepcion }));
  const pendientesJustificar = lineas.filter((l) => !elegible(puestos.data, porId.get(l.empleado_id)?.puesto, l.producto_id ?? undefined) && (l.excepcion || '').trim().length < 10);

  const productos = (catalogo.data || []).filter((p) => {
    if (busqueda && !`${p.nombre} ${p.sku_base}`.toLowerCase().includes(busqueda.toLowerCase())) return false;
    if (categoria && p.categoria.slug !== categoria) return false;
    if (soloElegibles && empActivo && !elegible(puestos.data, empActivo.puesto, p.id)) return false;
    return true;
  });

  const guardar = useMutation({
    mutationFn: async (enviar: boolean) => {
      if (!id) {
        return post<Pedido>('/cuenta/pedidos-corporativos', { modalidad: 'envio', direccion_id: direccion, partidas: partidas(), notas: notas || null,
          borrador: !enviar, clave_idempotencia: clave });
      }
      return put<Pedido>(`/cuenta/pedidos-corporativos/${id}`, { partidas: partidas(), notas: notas || null, enviar });
    },
    onSuccess: (p, enviar) => {
      setSucio(false);
      qc.invalidateQueries({ queryKey: ['resumen-sucursal'] });
      qc.invalidateQueries({ queryKey: ['mis-borradores'] });
      qc.setQueryData(['pedido', String(p.id)], p);
      if (p.estado === 'borrador') {
        avisar(`Borrador ${p.folio} guardado.`);
        if (!id) nav(`/cuenta/solicitudes/${p.id}/editar`, { replace: true });
      } else {
        avisar(enviar ? `Solicitud ${p.folio} enviada a revisión.` : 'Solicitud corregida y reenviada.');
        setEnviada(true);
        nav(`/cuenta/pedidos/${p.id}?nuevo=1`);
      }
    },
  });

  const agregar = (l: Omit<Linea, 'clave'>) => {
    const origen = document.querySelector('[data-selector-articulo]');
    setLineas((ls) => {
      const i = ls.findIndex((x) => x.empleado_id === l.empleado_id && x.variante_id === l.variante_id);
      if (i === -1) return [...ls, { ...l, clave: `${l.empleado_id}-${l.variante_id}-${Date.now()}` }];
      return ls.map((x, j) => (j === i ? { ...x, cantidad: Math.min(50, x.cantidad + l.cantidad), excepcion: l.excepcion ?? x.excepcion } : x));
    });
    setSucio(true);
    volarHacia(tarjetas.current[l.producto_id ?? -1] || origen, chips.current[l.empleado_id], l.imagen);
    setEligiendo(null);
  };
  const cambiar = (clave: string, cambios: Partial<Linea>) => { setLineas((ls) => ls.map((x) => (x.clave === clave ? { ...x, ...cambios } : x))); setSucio(true); };
  const quitar = (clave: string) => { setLineas((ls) => ls.filter((x) => x.clave !== clave)); setSucio(true); };

  if (empleados.isLoading || catalogo.isLoading || (id && previo.isLoading)) return <Cargando texto="Preparando la solicitud…" />;
  if (previo.data && !editable && !enviada) return <Navigate to={`/cuenta/pedidos/${id}`} replace />;
  if (!activos.length) return <Tarjeta titulo="Nueva solicitud"><Vacio titulo="Primero registra a tus empleados" texto="Cada artículo de la solicitud se asigna a una persona de tu sucursal." accion={<Link to="/cuenta/empleados" className="mt-2 font-semibold text-menta-700">Ir a Empleados →</Link>} /></Tarjeta>;

  const cuenta = (empId: number) => lineas.filter((l) => l.empleado_id === empId).reduce((a, l) => a + l.cantidad, 0);
  const conArticulos = seleccion.filter((e) => cuenta(e) > 0);
  const titulo = previo.data ? (previo.data.estado === 'devuelto' ? `Corregir solicitud ${previo.data.folio}` : `Borrador ${previo.data.folio}`) : 'Nueva solicitud';

  return (
    <div className="space-y-5">
      <Tarjeta titulo={titulo} sub="Arma la solicitud por empleado. El distribuidor la revisa antes de apartar inventario."
        accion={editable && previo.data?.estado !== 'devuelto' && <Boton variante="secundario" tam="sm" icono={<Save className="h-3.5 w-3.5" />} cargando={guardar.isPending && guardar.variables === false}
          disabled={!id && !direccion} onClick={() => guardar.mutate(false)}>{sucio || !id ? 'Guardar borrador' : 'Guardado'}</Boton>}>
        {previo.data?.aprobaciones?.filter((a) => a.decision === 'devuelto').slice(-1).map((a) => <div key={a.fecha} className="mb-4"><Aviso tipo="alerta">Observación del distribuidor: {a.motivo}</Aviso></div>)}
        <ol className="grid grid-cols-3 gap-2">
          {PASOS.map((n, i) => (
            <li key={n}>
              <button type="button" onClick={() => (i < paso || (i === 1 && seleccion.length) || (i === 2 && lineas.length)) && setPaso(i)}
                className={cls('flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold ring-1 transition',
                  i === paso ? 'bg-tinta-900 text-white ring-tinta-900' : i < paso ? 'bg-menta-50 text-menta-800 ring-menta-200' : 'text-tinta-400 ring-tinta-100')}>
                <span className={cls('grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs', i === paso ? 'bg-white text-tinta-900' : i < paso ? 'bg-menta-500 text-white' : 'bg-tinta-100')}>{i < paso ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
                <span className="truncate">{n}</span>
              </button>
            </li>
          ))}
        </ol>
      </Tarjeta>

      <Transicion clave={String(paso)} lateral>
        {paso === 0 && (
          <Tarjeta titulo="¿Para quién es la solicitud?" sub={`${seleccion.length} de ${activos.length} empleados seleccionados`}
            accion={<div className="flex gap-2"><Boton tam="sm" variante="fantasma" onClick={() => setSeleccion(activos.map((e) => e.id))}>Todos</Boton><Boton tam="sm" variante="fantasma" onClick={() => setSeleccion([])}>Ninguno</Boton></div>}>
            <div className="relative mb-4 max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-300" />
              <Entrada value={busqEmpleado} onChange={(e) => setBusqEmpleado(e.target.value)} placeholder="Buscar por nombre, número o puesto" className="pl-9" /></div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {activos.filter((e) => `${e.nombre} ${e.numero} ${e.puesto}`.toLowerCase().includes(busqEmpleado.toLowerCase())).map((e, i) => {
                const sel = seleccion.includes(e.id);
                return (
                  <Aparecer key={e.id} orden={i}>
                    <button type="button" aria-pressed={sel} onClick={() => setSeleccion(sel ? seleccion.filter((x) => x !== e.id) : [...seleccion, e.id])}
                      className={cls('flex w-full items-center gap-3 rounded-xl p-3 text-left ring-1 transition', sel ? 'bg-menta-50 ring-menta-400' : 'bg-white ring-tinta-100 hover:ring-tinta-300')}>
                      <span className={cls('grid h-10 w-10 shrink-0 place-items-center rounded-full font-display text-sm font-bold transition', sel ? 'bg-menta-500 text-white' : 'bg-tinta-50 text-tinta-600')}>
                        {sel ? <Check className="h-5 w-5" /> : e.nombre.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
                      <span className="min-w-0"><span className="block truncate font-semibold">{e.nombre}</span><span className="block text-xs text-tinta-400">No. {e.numero} · {e.puesto}</span></span>
                      {cuenta(e.id) > 0 && <span className="ml-auto rounded-full bg-tinta-900 px-2 py-0.5 text-[11px] font-bold text-white">{cuenta(e.id)}</span>}
                    </button>
                  </Aparecer>
                );
              })}
            </div>
            <div className="mt-5 flex justify-end"><Boton disabled={!seleccion.length} icono={<ArrowRight className="h-4 w-4" />}
              onClick={() => { setActivo(activo && seleccion.includes(activo) ? activo : seleccion[0]); setPaso(1); }}>Elegir artículos</Boton></div>
          </Tarjeta>
        )}

        {paso === 1 && (
          <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
            <Tarjeta titulo="Empleados" sub="Elige a quién le asignas">
              <ul className="flex gap-2 overflow-x-auto lg:flex-col">
                {seleccion.map((eid) => {
                  const e = porId.get(eid);
                  if (!e) return null;
                  return (
                    <li key={eid} className="shrink-0">
                      <button type="button" ref={(el) => { chips.current[eid] = el; }} onClick={() => setActivo(eid)}
                        className={cls('flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ring-1 transition', activo === eid ? 'bg-tinta-900 text-white ring-tinta-900' : 'bg-white ring-tinta-100 hover:ring-tinta-300')}>
                        <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{e.nombre}</span><span className={cls('block text-[11px]', activo === eid ? 'text-tinta-200' : 'text-tinta-400')}>{e.puesto}</span></span>
                        <span className={cls('grid h-6 min-w-6 place-items-center rounded-full px-1 text-[11px] font-bold', cuenta(eid) ? 'bg-menta-500 text-white' : activo === eid ? 'bg-white/15' : 'bg-tinta-50 text-tinta-400')}>{cuenta(eid)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Tarjeta>
            <Tarjeta titulo={empActivo ? `Catálogo para ${empActivo.nombre}` : 'Catálogo'} sub={empActivo ? `Puesto: ${empActivo.puesto}` : undefined}>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-300" />
                  <Entrada value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto o SKU" className="pl-9" /></div>
                <Selector value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-48" aria-label="Categoría"><option value="">Todas las categorías</option>
                  {categorias.data?.map((c) => <option key={c.id} value={c.slug}>{c.nombre}</option>)}</Selector>
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={soloElegibles} onChange={(e) => setSoloElegibles(e.target.checked)} className="h-4 w-4 accent-menta-500" />Solo autorizados para su puesto</label>
              </div>
              {!productos.length ? <Vacio titulo="Sin productos" texto={soloElegibles ? 'No hay productos autorizados para este puesto con esos filtros. Desmarca "Solo autorizados" para pedir una excepción.' : 'Prueba con otra búsqueda.'} /> : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {productos.map((p, i) => {
                    const ok = elegible(puestos.data, empActivo?.puesto, p.id);
                    return (
                      <Aparecer key={p.id} orden={i}>
                        <button type="button" ref={(el) => { tarjetas.current[p.id] = el; }} onClick={() => setEligiendo(p)} disabled={!empActivo}
                          className="group flex h-full w-full flex-col overflow-hidden rounded-xl bg-white text-left ring-1 ring-arena-200 transition hover:-translate-y-0.5 hover:shadow-suave">
                          <span className="relative block aspect-square overflow-hidden bg-arena-100"><ImagenProducto src={p.imagen} alt={p.nombre} className="transition duration-500 group-hover:scale-105" />
                            {!ok && <span className="absolute left-2 top-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Requiere excepción</span>}</span>
                          <span className="flex flex-1 flex-col p-3"><span className="text-[10px] font-semibold uppercase tracking-wide text-menta-700">{p.categoria.nombre}</span>
                            <span className="text-sm font-bold leading-snug">{p.nombre}</span><span className="mt-auto pt-1 text-[11px] text-tinta-400">Tallas {p.tallas.slice(0, 5).join(' · ')}</span></span>
                        </button>
                      </Aparecer>
                    );
                  })}
                </div>
              )}
              <div className="mt-5 flex flex-wrap justify-between gap-2">
                <Boton variante="secundario" icono={<ArrowLeft className="h-4 w-4" />} onClick={() => setPaso(0)}>Empleados</Boton>
                <Boton disabled={!lineas.length} icono={<ArrowRight className="h-4 w-4" />} onClick={() => setPaso(2)}>Revisar solicitud ({lineas.reduce((a, l) => a + l.cantidad, 0)})</Boton>
              </div>
            </Tarjeta>
          </div>
        )}

        {paso === 2 && (
          <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              {seleccion.filter((e) => cuenta(e) === 0).length > 0 && (
                <Aviso>Sin artículos asignados (no se incluirán): {seleccion.filter((e) => cuenta(e) === 0).map((e) => porId.get(e)?.nombre).join(', ')}.</Aviso>
              )}
              {conArticulos.map((eid, i) => {
                const e = porId.get(eid);
                return (
                  <Aparecer key={eid} orden={i}>
                    <Tarjeta titulo={<span className="flex items-center gap-2">{e?.nombre}<span className="text-xs font-normal text-tinta-400">{e?.puesto} · No. {e?.numero}</span></span>}
                      accion={<Boton tam="sm" variante="fantasma" icono={<Plus className="h-3.5 w-3.5" />} onClick={() => { setActivo(eid); setPaso(1); }}>Agregar</Boton>}>
                      <ul className="divide-y divide-tinta-100">
                        {lineas.filter((l) => l.empleado_id === eid).map((l) => {
                          const ok = elegible(puestos.data, e?.puesto, l.producto_id ?? undefined);
                          return (
                            <li key={l.clave} className="py-3">
                              <div className="flex items-center gap-3">
                                <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-arena-100"><ImagenProducto src={l.imagen} alt={l.nombre} /></span>
                                <div className="min-w-0 flex-1"><p className="truncate font-semibold">{l.nombre}</p><p className="text-xs text-tinta-400">{l.color} · Talla {l.talla}</p></div>
                                <div className="flex h-9 items-center rounded-lg ring-1 ring-arena-300">
                                  <button type="button" className="px-2" onClick={() => cambiar(l.clave, { cantidad: Math.max(1, l.cantidad - 1) })} aria-label="Menos"><Minus className="h-3.5 w-3.5" /></button>
                                  <span className="w-7 text-center text-sm font-bold">{l.cantidad}</span>
                                  <button type="button" className="px-2" onClick={() => cambiar(l.clave, { cantidad: Math.min(50, l.cantidad + 1) })} aria-label="Más"><Plus className="h-3.5 w-3.5" /></button>
                                </div>
                                <button type="button" onClick={() => quitar(l.clave)} aria-label={`Quitar ${l.nombre}`} className="rounded-lg p-2 text-tinta-400 hover:bg-coral-50 hover:text-coral-600"><Trash2 className="h-4 w-4" /></button>
                              </div>
                              {!ok && (
                                <div className="mt-2 rounded-lg bg-amber-50 p-2 ring-1 ring-amber-200">
                                  <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-amber-900"><AlertTriangle className="h-3.5 w-3.5" />Fuera de la regla por puesto: justifica la excepción</p>
                                  <Texto rows={2} value={l.excepcion || ''} onChange={(ev) => cambiar(l.clave, { excepcion: ev.target.value })} placeholder="Justificación (mínimo 10 caracteres)" />
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </Tarjeta>
                  </Aparecer>
                );
              })}
            </div>
            <div className="space-y-4">
              <Tarjeta titulo="Resumen">
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-tinta-500">Empleados</dt><dd className="font-bold">{conArticulos.length}</dd></div>
                  <div className="flex justify-between"><dt className="text-tinta-500">Artículos</dt><dd className="font-bold">{lineas.reduce((a, l) => a + l.cantidad, 0)}</dd></div>
                  <div className="flex justify-between"><dt className="text-tinta-500">Excepciones por puesto</dt><dd className="font-bold">{lineas.filter((l) => !elegible(puestos.data, porId.get(l.empleado_id)?.puesto, l.producto_id ?? undefined)).length}</dd></div>
                </dl>
                <Campo etiqueta="Entregar en" className="mt-4">
                  {previo.data?.direccion_envio ? (
                    <p className="rounded-lg bg-tinta-50 p-2 text-xs">{previo.data.direccion_envio.alias} · {previo.data.direccion_envio.calle} {previo.data.direccion_envio.numero}, {previo.data.direccion_envio.ciudad}</p>
                  ) : dirs.data?.length ? (
                    <Selector value={direccion} onChange={(e) => { setDireccion(Number(e.target.value)); setSucio(true); }}>
                      {dirs.data.map((d) => <option key={d.id} value={d.id}>{d.alias} · {d.calle} {d.numero}, {d.ciudad}</option>)}</Selector>
                  ) : <Aviso tipo="alerta">Registra la dirección de tu sucursal en <Link to="/cuenta/direcciones" className="font-semibold underline">Direcciones</Link>.</Aviso>}
                </Campo>
                <Campo etiqueta="Notas para el distribuidor" className="mt-3"><Texto value={notas} onChange={(e) => { setNotas(e.target.value); setSucio(true); }} /></Campo>
                {pendientesJustificar.length > 0 && <div className="mt-3"><Aviso tipo="alerta">{pendientesJustificar.length} artículo(s) fuera de la regla por puesto necesitan justificación antes de enviar.</Aviso></div>}
                <div className="mt-3"><ErrorCaja error={guardar.error} /></div>
                <div className="mt-4 grid gap-2">
                  <Boton tam="lg" icono={<Send className="h-4 w-4" />} disabled={!lineas.length || (!id && !direccion) || pendientesJustificar.length > 0}
                    cargando={guardar.isPending && guardar.variables === true} onClick={() => guardar.mutate(true)}>
                    {previo.data?.estado === 'devuelto' ? 'Reenviar a revisión' : 'Enviar a revisión'}</Boton>
                  {previo.data?.estado !== 'devuelto' && <Boton variante="secundario" icono={<Save className="h-4 w-4" />} disabled={!id && !direccion}
                    cargando={guardar.isPending && guardar.variables === false} onClick={() => guardar.mutate(false)}>Guardar borrador</Boton>}
                </div>
                <p className="mt-3 text-xs text-tinta-400">Enviar no significa aprobar: el distribuidor revisa la solicitud y puede aprobarla, devolverla para corrección o rechazarla.</p>
              </Tarjeta>
              <Boton variante="fantasma" icono={<ArrowLeft className="h-4 w-4" />} onClick={() => setPaso(1)}>Seguir agregando</Boton>
            </div>
          </div>
        )}
      </Transicion>

      <Modal abierto={!!eligiendo && !!empActivo} titulo={eligiendo?.nombre || ''} onCerrar={() => setEligiendo(null)} ancho="max-w-2xl">
        <div data-selector-articulo>
          {eligiendo && empActivo && <SelectorArticulo producto={eligiendo} empleado={empActivo} puestos={puestos.data} onAgregar={agregar} onCerrar={() => setEligiendo(null)} />}
        </div>
      </Modal>
    </div>
  );
}
