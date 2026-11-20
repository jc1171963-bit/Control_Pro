import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardPlus, Heart, ShoppingBag, Store, Truck } from 'lucide-react';
import { del, get, post, put } from '../../api/cliente';
import type { ProductoDetalle, ProductoResumen, VarianteT } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { useConfig } from '../../app/config';
import Cantidad from '../../components/Cantidad';
import { useBorradores } from '../../app/borradores';
import { volarHacia } from '../../components/movimiento';
import SelectorBorrador, { DestinoBorrador } from '../../components/SelectorBorrador';
import SelectorVariante, { useSeleccionVariante } from '../../components/SelectorVariante';
import { agregarAlBorrador, elegible, PuestosAutorizados } from '../../lib/solicitud';
import type { EmpleadoCorporativo } from '../cuenta/Corporativo';
import { Aviso, Boton, Cargando, ErrorCaja, Selector, Texto, useAviso } from '../../components/ui';
import GaleriaProducto from '../../components/GaleriaProducto';
import { cls, dinero, mensajeError } from '../../lib/formato';
import { fotoIlustrativa } from '../../lib/fotosIlustrativas';
import { useContextoCatalogo } from './contextoCatalogo';
import ProductoCard from './ProductoCard';

/** Portal de sucursal: el artículo se agrega al borrador de solicitud, asignado a un empleado. */
function AgregarASolicitud({ p, variante, color }: { p: ProductoDetalle; variante: VarianteT | undefined; color: string }) {
  const { tipo, cliente } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const avisar = useAviso();
  const empresa = tipo === 'cliente' && cliente?.tipo === 'empresa';
  const empleados = useQuery({ queryKey: ['empleados'], queryFn: () => get<EmpleadoCorporativo[]>('/cuenta/empleados'), enabled: empresa });
  const puestos = useQuery({ queryKey: ['puestos-autorizados'], queryFn: () => get<PuestosAutorizados>('/cuenta/puestos-autorizados'), enabled: empresa });
  const borradores = useBorradores(empresa);
  const [destino, setDestino] = useState<DestinoBorrador>();
  const [empleado, setEmpleado] = useState<number | ''>('');
  const [cantidad, setCantidad] = useState(1);
  const [excepcion, setExcepcion] = useState('');
  const boton = useRef<HTMLSpanElement>(null);
  const emp = empleados.data?.find((e) => e.id === empleado);
  const ok = !emp || elegible(puestos.data, emp.puesto, p.id);
  const m = useMutation({
    // Sin elegir nada se usa el borrador más reciente (el comportamiento de siempre); si aún no cargan los borradores, decide el servidor.
    mutationFn: () => agregarAlBorrador({ empleado_id: Number(empleado), variante_id: variante!.id, cantidad, excepcion: ok ? null : excepcion.trim() || null },
      destino ?? borradores.data?.items[0]?.id),
    onSuccess: (borrador) => {
      volarHacia(boton.current, document.querySelector('[data-destino-solicitud]'), p.imagen);
      qc.invalidateQueries({ queryKey: ['mis-borradores'] });
      avisar(`Agregado al borrador ${borrador.folio} para ${emp?.nombre}.`);
    },
    onError: (e) => avisar(mensajeError(e), 'error'),
  });
  if (!empresa) {
    return (
      <div className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-lurima-100">
        <p className="font-display font-bold">¿Necesitas este artículo para tu equipo?</p>
        <p className="mt-1 text-sm text-tinta-600">Las sucursales solicitan uniformes por empleado desde su portal.</p>
        <Boton className="mt-3" onClick={() => nav(`/entrar?siguiente=${encodeURIComponent(loc.pathname)}`)}>Entrar con la cuenta de mi sucursal</Boton>
      </div>
    );
  }
  return (
    <div className="mt-6 space-y-3 rounded-2xl bg-white p-5 ring-1 ring-lurima-100">
      <p className="flex items-center gap-2 font-display font-bold"><ClipboardPlus className="h-5 w-5 text-bienestar-600" />Agregar a mi solicitud</p>
      <Selector value={empleado} onChange={(e) => setEmpleado(e.target.value ? Number(e.target.value) : '')} aria-label="Empleado">
        <option value="">¿Para qué empleado?</option>
        {empleados.data?.filter((e) => e.activo).map((e) => (
          <option key={e.id} value={e.id}>{e.nombre} · {e.puesto}{elegible(puestos.data, e.puesto, p.id) ? '' : ' (requiere excepción)'}</option>
        ))}
      </Selector>
      <SelectorBorrador borradores={borradores.data?.items ?? []} valor={destino} onCambio={setDestino} />
      {!ok && <><Aviso tipo="alerta">No está autorizado para el puesto {emp?.puesto}; se enviará como excepción y el Gerente de compras decide.</Aviso>
        <Texto rows={2} placeholder="Justificación (mínimo 10 caracteres; puedes completarla al revisar)" value={excepcion} onChange={(e) => setExcepcion(e.target.value)} /></>}
      <div className="flex flex-wrap items-center gap-3">
        <Cantidad valor={cantidad} onCambio={setCantidad} max={50} />
        <span ref={boton} className="flex flex-1"><Boton tam="lg" className="flex-1 rounded-xl" disabled={!variante || !empleado} cargando={m.isPending} icono={<ClipboardPlus className="h-5 w-5" />} onClick={() => m.mutate()}>
          {!variante ? 'Elige una talla' : !empleado ? 'Elige al empleado' : `Agregar (${color}, ${variante.talla})`}
        </Boton></span>
      </div>
      <p className="text-xs text-tinta-500">Se guarda en tu borrador de solicitud; lo revisas y envías desde <Link to="/cuenta" data-destino-solicitud className="font-semibold text-bienestar-700">tu portal</Link>.</p>
    </div>
  );
}

export default function Producto() {
  const { slug } = useParams();
  const { tipo } = useAuth();
  const { canalTienda } = useConfig();
  const { portal, rutaCatalogo } = useContextoCatalogo();
  const tienda = canalTienda && !portal; // el portal corporativo no muestra precios ni carrito aunque la tienda esté encendida
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const avisar = useAviso();
  const q = useQuery({ queryKey: ['producto', slug], queryFn: () => get<ProductoDetalle>(`/tienda/productos/${slug}`) });
  const favs = useQuery({ queryKey: ['favoritos'], queryFn: () => get<ProductoResumen[]>('/cuenta/favoritos'), enabled: tipo === 'cliente' && tienda });
  const p = q.data;
  const { colores, color, elegirColor, talla, setTalla, delColor, variante } = useSeleccionVariante(p?.variantes);
  const [cantidad, setCantidad] = useState(1);
  // Giro 360° del color elegido (si hay fotogramas reales); la galería lo muestra como una vista más.
  const giro = useMemo(() => p?.giros.find((g) => g.color === color) ?? p?.giros.find((g) => g.color === null), [p, color]);
  useEffect(() => { setTalla(''); setCantidad(1); }, [color]);

  const esFav = !!favs.data?.some((f) => f.id === p?.id);

  const agregar = useMutation({
    mutationFn: () => post('/cuenta/carrito/items', { variante_id: variante!.id, cantidad }),
    onSuccess: (d) => { qc.setQueryData(['carrito'], d); avisar(`Agregaste ${cantidad} × ${p!.nombre} (${talla}, ${color}).`); },
    onError: (e) => avisar(mensajeError(e), 'error'),
  });
  const fav = useMutation({
    mutationFn: () => (esFav ? del(`/cuenta/favoritos/${p!.id}`) : put(`/cuenta/favoritos/${p!.id}`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['favoritos'] }),
  });

  if (q.isLoading) return <Cargando />;
  if (q.error || !p) return <div className="contenedor py-10"><ErrorCaja error={q.error} /></div>;

  const requiereSesion = () => nav(`/entrar?siguiente=${encodeURIComponent(loc.pathname)}`);
  const resuelta = (u: string | null | undefined) => fotoIlustrativa(u) ?? u;

  return (
    <div className="contenedor py-8">
      <nav aria-label="Ruta de navegación" className="mb-5 text-xs text-tinta-500"><Link to={rutaCatalogo} className="hover:text-lurima-900">Catálogo</Link> / <Link to={`${rutaCatalogo}?categoria=${p.categoria.slug}`} className="hover:text-lurima-900">{p.categoria.nombre}</Link> / <span className="text-lurima-800">{p.nombre}</span></nav>
      <div className="grid gap-10 lg:grid-cols-2">
        <div className="lg:sticky lg:top-32 lg:self-start">
          {/* Fotos (las ilustrativas de stock antiguas se resuelven igual), video y 360° en una sola galería en movimiento. */}
          <GaleriaProducto nombre={p.nombre} video={p.video} giro={giro}
            fotos={p.imagenes.map((im) => ({ ...im, url: resuelta(im.url)! })).filter((im, i, todas) => todas.findIndex((x) => x.url === im.url) === i)} />
        </div>

        <div>
          <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-widest text-bienestar-700">
            <span className="rounded-full bg-bienestar-50 px-2.5 py-1">{p.categoria.nombre}</span><span className="text-tinta-500">SKU {p.sku_base}</span>
          </p>
          <h1 className="texto-equilibrado mt-3 font-display text-3xl font-extrabold leading-tight tracking-tight text-lurima-900 sm:text-5xl">{p.nombre}</h1>
          {tienda && <><div className="mt-4 flex items-baseline gap-3">
            <span className="font-display text-3xl font-extrabold text-lurima-900">{dinero(variante?.precio_final ?? delColor[0]?.precio_final ?? p.precio_desde)}</span>
            {(variante ?? delColor[0])?.descuento !== '0.00' && <span className="text-tinta-500 line-through">{dinero((variante ?? delColor[0])?.precio_base)}</span>}
            {(variante ?? delColor[0])?.promocion && <span className="rounded-full bg-coral-100 px-2 py-0.5 text-xs font-bold text-coral-700">{(variante ?? delColor[0])?.promocion}</span>}
          </div>
          <p className="text-xs text-tinta-500">IVA incluido</p></>}
          <p className="mt-5 text-tinta-600">{p.descripcion}</p>

          <div className="mt-6">
            <SelectorVariante colores={colores} color={color} onColor={elegirColor} delColor={delColor} talla={talla} onTalla={setTalla} deshabilitarAgotadas
              detalleTalla={variante && <span className="font-normal text-tinta-600">· {variante.disponible} disponible(s)</span>} />
          </div>
          {tienda ? <div className="mt-6 flex flex-wrap items-center gap-3">
            <Cantidad valor={cantidad} onCambio={setCantidad} max={variante?.disponible || 1} />
            <Boton tam="lg" className="flex-1 rounded-xl" disabled={!variante} cargando={agregar.isPending} icono={<ShoppingBag className="h-5 w-5" />}
              onClick={() => (tipo === 'cliente' ? agregar.mutate() : requiereSesion())}>
              {variante ? 'Agregar al carrito' : 'Elige una talla'}
            </Boton>
            <Boton tam="lg" variante="secundario" className="rounded-xl" aria-label={esFav ? 'Quitar de favoritos' : 'Agregar a favoritos'} aria-pressed={esFav} onClick={() => (tipo === 'cliente' ? fav.mutate() : requiereSesion())}
              icono={<Heart className={cls('h-5 w-5', esFav && 'fill-coral-500 text-coral-500')} />} />
          </div> : <AgregarASolicitud p={p} variante={variante} color={color} />}

          {/* Solo la tienda en línea muestra existencias por sucursal: el canal corporativo surte una sola distribuidora. */}
          {tienda && <div className="mt-8 rounded-2xl bg-white p-5 ring-1 ring-lurima-100">
            <p className="mb-3 flex items-center gap-2 font-display font-bold text-lurima-900"><Store className="h-4 w-4 text-bienestar-600" />Disponibilidad por sucursal {variante ? `· talla ${variante.talla}` : ''}</p>
            <ul className="divide-y divide-lurima-100 text-sm">
              {p.disponibilidad_sucursal?.map((s) => {
                const n = variante ? s.variantes[String(variante.id)] || 0 : delColor.reduce((a, v) => a + (s.variantes[String(v.id)] || 0), 0);
                return (
                  <li key={s.sucursal_id} className="flex items-center justify-between py-2">
                    <span>{s.sucursal}</span>
                    <span className={cls('font-semibold', n > 5 ? 'text-bienestar-700' : n > 0 ? 'text-amber-700' : 'text-tinta-500')}>
                      {n > 5 ? 'Disponible' : n > 0 ? `Últimas ${n}` : 'Sin existencias'}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 flex items-start gap-2 text-xs text-tinta-500"><Truck className="mt-0.5 h-3.5 w-3.5" />Envío a domicilio desde la sucursal de tu zona, o recoge sin costo.</p>
          </div>}
          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
            {p.material && <div><dt className="text-tinta-500">Material</dt><dd className="font-semibold">{p.material}</dd></div>}
            {p.cuidados && <div><dt className="text-tinta-500">Cuidados</dt><dd className="font-semibold">{p.cuidados}</dd></div>}
            {p.puestos.length > 0 && <div className="col-span-2"><dt className="text-tinta-500">{tienda ? 'Recomendado para' : 'Autorizado para los puestos'}</dt><dd className="mt-1 flex flex-wrap gap-1">{p.puestos.map((x) => <span key={x} className="flex items-center gap-1 rounded-full bg-bienestar-50 px-2 py-0.5 text-xs font-semibold text-bienestar-700"><Check className="h-3 w-3" />{x}</span>)}</dd></div>}
          </dl>
        </div>
      </div>
      {!!p.relacionados?.length && (
        <section className="mt-16">
          <h2 className="mb-5 font-display text-2xl font-extrabold text-lurima-900">También te puede servir</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">{p.relacionados.map((r, i) => <ProductoCard key={r.id} p={r} orden={i} />)}</div>
        </section>
      )}
    </div>
  );
}
