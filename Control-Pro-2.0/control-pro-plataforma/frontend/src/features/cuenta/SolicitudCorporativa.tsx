/**
 * Portal de la sucursal: constructor de solicitudes por empleado (el inicio está en features/portal/Inicio.tsx).
 * La solicitud se arma por persona (no hay productos sin destinatario), se guarda como borrador en el servidor y se
 * envía a revisión; el servidor vuelve a validar empleado, regla por puesto, variante y cantidades.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Plus, Save, Search, Send, Trash2 } from 'lucide-react';
import { claveIdempotencia, get, post, put } from '../../api/cliente';
import type { Direccion, Pedido, ProductoDetalle, ProductoResumen } from '../../api/tipos';
import { Aviso, Boton, Campo, Cargando, Entrada, ErrorCaja, Modal, Selector, Tarjeta, Texto, useAviso, Vacio } from '../../components/ui';
import Cantidad from '../../components/Cantidad';
import SelectorVariante, { useSeleccionVariante } from '../../components/SelectorVariante';
import Visor360 from '../../components/Visor360';
import { Aparecer, Transicion, volarHacia } from '../../components/movimiento';
import { cls } from '../../lib/formato';
import { catalogoCompleto, elegible, PartidaSolicitud, PuestosAutorizados } from '../../lib/solicitud';
import { ImagenProducto } from '../tienda/ProductoCard';
import type { EmpleadoCorporativo } from './Corporativo';
import ConfirmarEnvio from '../portal/ConfirmarEnvio';

// ---------------------------------------------------------------- constructor de solicitud

type Linea = PartidaSolicitud & { clave: string; nombre: string; talla: string; color: string; imagen: string | null; producto_id: number | null };
const PASOS = ['Empleados', 'Artículos', 'Revisar y enviar'];
// En pantallas pequeñas la acción principal queda fija al pie de la tarjeta (las listas son largas); desde 1024 px vuelve a su lugar.
const barraAccion = 'sticky bottom-0 z-10 -mx-5 -mb-5 mt-5 rounded-b-2xl border-t border-tinta-100 bg-white/95 px-5 py-3 backdrop-blur lg:static lg:z-auto lg:m-0 lg:mt-5 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none';

function SelectorArticulo({ producto, empleado, puestos, onAgregar, onCerrar }: {
  producto: ProductoResumen; empleado: EmpleadoCorporativo; puestos: PuestosAutorizados | undefined;
  onAgregar: (l: Omit<Linea, 'clave'>) => void; onCerrar: () => void;
}) {
  const det = useQuery({ queryKey: ['producto', producto.slug], queryFn: () => get<ProductoDetalle>(`/tienda/productos/${producto.slug}`) });
  const { colores, color, elegirColor, talla, setTalla, delColor, variante } = useSeleccionVariante(det.data?.variantes);
  const [cantidad, setCantidad] = useState(1);
  const [excepcion, setExcepcion] = useState('');
  const ok = elegible(puestos, empleado.puesto, producto.id);
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
        <SelectorVariante colores={colores} color={color} onColor={elegirColor} delColor={delColor} talla={talla} onTalla={setTalla} ocultarColorUnico />
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Cantidad</span>
          <Cantidad valor={cantidad} onCambio={setCantidad} tam="md" />
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
  const [confirmar, setConfirmar] = useState(false);
  const [clave] = useState(() => claveIdempotencia('solicitud'));
  const chips = useRef<Record<number, HTMLElement | null>>({});
  const tarjetas = useRef<Record<number, HTMLElement | null>>({});

  // Cambios sin guardar: se avisa antes de salir del asistente (navegación interna) y antes de cerrar o recargar la pestaña.
  // Se usa una referencia para que la navegación que sigue a un guardado exitoso no quede bloqueada por el estado anterior.
  const sinGuardar = useRef(false);
  sinGuardar.current = sucio;
  const bloqueo = useBlocker(({ currentLocation, nextLocation }) => sinGuardar.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!sucio) return;
    const avisarAntes = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisarAntes);
    return () => window.removeEventListener('beforeunload', avisarAntes);
  }, [sucio]);

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
      sinGuardar.current = false;
      setConfirmar(false);
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
  const totalArticulos = lineas.reduce((a, l) => a + l.cantidad, 0);
  const excepciones = lineas.filter((l) => !elegible(puestos.data, porId.get(l.empleado_id)?.puesto, l.producto_id ?? undefined)).length;
  const titulo = previo.data ? (previo.data.estado === 'devuelto' ? `Corregir solicitud ${previo.data.folio}` : `Borrador ${previo.data.folio}`) : 'Nueva solicitud';

  return (
    <div className="space-y-5">
      <Tarjeta titulo={titulo} sub="Arma la solicitud por empleado. El distribuidor la revisa antes de apartar inventario."
        accion={editable && previo.data?.estado !== 'devuelto' && <Boton variante="secundario" tam="sm" icono={<Save className="h-3.5 w-3.5" />} cargando={guardar.isPending && guardar.variables === false}
          disabled={!id && !direccion} onClick={() => guardar.mutate(false)}>{sucio || !id ? 'Guardar borrador' : 'Guardado'}</Boton>}>
        {previo.data?.aprobaciones?.filter((a) => a.decision === 'devuelto').slice(-1).map((a) => <div key={a.fecha} className="mb-4"><Aviso tipo="alerta">Observación del distribuidor: {a.motivo}</Aviso></div>)}
        <ol className="flex gap-2" aria-label="Pasos de la solicitud">
          {PASOS.map((n, i) => (
            <li key={n} className={cls(i === paso ? 'min-w-0 flex-1' : 'shrink-0 sm:min-w-0 sm:flex-1')}>
              <button type="button" onClick={() => (i < paso || (i === 1 && seleccion.length) || (i === 2 && lineas.length)) && setPaso(i)} aria-current={i === paso ? 'step' : undefined}
                className={cls('flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold ring-1 transition',
                  i === paso ? 'bg-sd-900 text-white ring-sd-900' : i < paso ? 'bg-menta-50 text-menta-800 ring-menta-200' : 'text-tinta-500 ring-tinta-100')}>
                <span className={cls('grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs', i === paso ? 'bg-white text-tinta-900' : i < paso ? 'bg-menta-500 text-white' : 'bg-tinta-100')}>{i < paso ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
                <span className={cls('min-w-0', i !== paso && 'sr-only sm:not-sr-only')}>
                  <span className="block truncate">{n}</span>
                  {/* Progreso real del armado: lo que ya se eligió en cada paso. */}
                  <span className={cls('hidden truncate text-[11px] font-normal sm:block', i === paso ? 'text-white/75' : 'text-tinta-500')}>
                    {i === 0 ? `${seleccion.length} seleccionado(s)` : i === 1 ? `${totalArticulos} artículo(s)` : excepciones ? `${excepciones} excepción(es)` : 'Confirmar y enviar'}
                  </span>
                </span>
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
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {activos.filter((e) => `${e.nombre} ${e.numero} ${e.puesto}`.toLowerCase().includes(busqEmpleado.toLowerCase())).map((e, i) => {
                const sel = seleccion.includes(e.id);
                return (
                  <Aparecer key={e.id} orden={i}>
                    <button type="button" aria-pressed={sel} onClick={() => setSeleccion(sel ? seleccion.filter((x) => x !== e.id) : [...seleccion, e.id])}
                      className={cls('flex w-full items-center gap-3 rounded-xl p-3 text-left ring-1 transition', sel ? 'bg-menta-50 ring-menta-400' : 'bg-white ring-tinta-100 hover:ring-tinta-300')}>
                      <span className={cls('grid h-10 w-10 shrink-0 place-items-center rounded-full font-display text-sm font-bold transition', sel ? 'bg-menta-500 text-white' : 'bg-tinta-50 text-tinta-600')}>
                        {sel ? <Check className="h-5 w-5" /> : e.nombre.split(' ').map((x) => x[0]).slice(0, 2).join('')}</span>
                      <span className="min-w-0"><span className="block truncate font-semibold">{e.nombre}</span><span className="block text-xs text-tinta-400">No. {e.numero} · {e.puesto}</span></span>
                      {cuenta(e.id) > 0 && <span className="ml-auto rounded-full bg-sd-900 px-2 py-0.5 text-[11px] font-bold text-white">{cuenta(e.id)}</span>}
                    </button>
                  </Aparecer>
                );
              })}
            </div>
            <div className={cls(barraAccion, 'flex justify-end')}><Boton disabled={!seleccion.length} icono={<ArrowRight className="h-4 w-4" />}
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
                        className={cls('flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ring-1 transition', activo === eid ? 'bg-sd-900 text-white ring-sd-900' : 'bg-white ring-tinta-100 hover:ring-tinta-300')}>
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
              <div className={cls(barraAccion, 'flex flex-wrap justify-between gap-2')}>
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
                                <Cantidad valor={l.cantidad} onCambio={(n) => cambiar(l.clave, { cantidad: n })} tam="sm" />
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
                  <div className="flex justify-between"><dt className="text-tinta-500">Artículos</dt><dd className="font-bold">{totalArticulos}</dd></div>
                  <div className="flex justify-between"><dt className="text-tinta-500">Excepciones por puesto</dt><dd className="font-bold">{excepciones}</dd></div>
                </dl>
                <Campo etiqueta="Entregar en" className="mt-4">
                  {previo.data?.direccion_envio ? (
                    <p className="rounded-lg bg-tinta-50 p-2 text-xs">{previo.data.direccion_envio.alias} · {previo.data.direccion_envio.calle} {previo.data.direccion_envio.numero}, {previo.data.direccion_envio.ciudad}</p>
                  ) : dirs.data?.length ? (
                    <Selector value={direccion} onChange={(e) => { setDireccion(Number(e.target.value)); setSucio(true); }}>
                      {dirs.data.map((d) => <option key={d.id} value={d.id}>{d.alias} · {d.calle} {d.numero}, {d.ciudad}</option>)}</Selector>
                  ) : <Aviso tipo="alerta">Tu sucursal aún no tiene una dirección de entrega registrada. Pide a tu distribuidor que la registre; puedes consultarla en <Link to="/cuenta/perfil" className="font-semibold underline">Mi cuenta</Link>.</Aviso>}
                </Campo>
                <Campo etiqueta="Notas para el distribuidor" className="mt-3"><Texto value={notas} onChange={(e) => { setNotas(e.target.value); setSucio(true); }} /></Campo>
                {pendientesJustificar.length > 0 && <div className="mt-3"><Aviso tipo="alerta">{pendientesJustificar.length} artículo(s) fuera de la regla por puesto necesitan justificación antes de enviar.</Aviso></div>}
                {/* El error de un envío se muestra en la confirmación; aquí, el de guardar borrador. */}
                {!confirmar && <div className="mt-3"><ErrorCaja error={guardar.error} /></div>}
                <div className="mt-4 grid gap-2">
                  <Boton tam="lg" icono={<Send className="h-4 w-4" />} disabled={!lineas.length || (!id && !direccion) || pendientesJustificar.length > 0}
                    cargando={guardar.isPending && guardar.variables === true} onClick={() => { guardar.reset(); setConfirmar(true); }}>
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

      <ConfirmarEnvio abierto={confirmar} reenvio={previo.data?.estado === 'devuelto'} folio={previo.data?.folio} empleados={conArticulos.length} articulos={totalArticulos}
        excepciones={excepciones} cargando={guardar.isPending} error={guardar.error} onConfirmar={() => guardar.mutate(true)} onCerrar={() => setConfirmar(false)} />
      <Modal abierto={bloqueo.state === 'blocked'} titulo="Tienes cambios sin guardar" onCerrar={() => bloqueo.reset?.()}>
        <p className="text-sm text-tinta-700">Si sales ahora se perderán los artículos y cambios que no has guardado{previo.data?.estado !== 'devuelto' ? '. Para conservarlos, elige «Seguir editando» y usa «Guardar borrador»' : ''}.</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Boton variante="secundario" onClick={() => bloqueo.reset?.()}>Seguir editando</Boton>
          <Boton variante="peligro" onClick={() => bloqueo.proceed?.()}>Salir sin guardar</Boton>
        </div>
      </Modal>
      <Modal abierto={!!eligiendo && !!empActivo} titulo={eligiendo?.nombre || ''} onCerrar={() => setEligiendo(null)} ancho="max-w-2xl">
        <div data-selector-articulo>
          {eligiendo && empActivo && <SelectorArticulo producto={eligiendo} empleado={empActivo} puestos={puestos.data} onAgregar={agregar} onCerrar={() => setEligiendo(null)} />}
        </div>
      </Modal>
    </div>
  );
}
