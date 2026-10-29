import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Heart, Minus, Plus, ShoppingBag, Store, Truck } from 'lucide-react';
import { del, get, post, put } from '../../api/cliente';
import type { ProductoDetalle, ProductoResumen } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { Boton, Cargando, ErrorCaja, useAviso } from '../../components/ui';
import { cls, dinero, mensajeError } from '../../lib/formato';
import ProductoCard, { ImagenProducto } from './ProductoCard';

export default function Producto() {
  const { slug } = useParams();
  const { tipo } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const avisar = useAviso();
  const q = useQuery({ queryKey: ['producto', slug], queryFn: () => get<ProductoDetalle>(`/tienda/productos/${slug}`) });
  const favs = useQuery({ queryKey: ['favoritos'], queryFn: () => get<ProductoResumen[]>('/cuenta/favoritos'), enabled: tipo === 'cliente' });
  const p = q.data;
  const colores = useMemo(() => [...new Map((p?.variantes || []).map((v) => [v.color, v.color_hex])).entries()], [p]);
  const [color, setColor] = useState<string>('');
  const [talla, setTalla] = useState<string>('');
  const [cantidad, setCantidad] = useState(1);
  const [img, setImg] = useState(0);
  useEffect(() => { if (colores.length && !color) setColor(colores[0][0]); }, [colores, color]);
  useEffect(() => { setTalla(''); setCantidad(1); setImg(Math.max(0, colores.findIndex(([c]) => c === color))); }, [color, colores]);

  const delColor = (p?.variantes || []).filter((v) => v.color === color);
  const variante = delColor.find((v) => v.talla === talla);
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

  return (
    <div className="contenedor py-8">
      <nav className="mb-5 text-xs text-tinta-400"><Link to="/catalogo" className="hover:text-tinta-700">Catálogo</Link> / <Link to={`/catalogo?categoria=${p.categoria.slug}`} className="hover:text-tinta-700">{p.categoria.nombre}</Link> / <span className="text-tinta-700">{p.nombre}</span></nav>
      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <div className="aspect-square overflow-hidden rounded-3xl bg-white ring-1 ring-arena-200">
            <ImagenProducto src={p.imagenes[img]?.url || p.imagen} alt={p.imagenes[img]?.alt || p.nombre} />
          </div>
          {p.imagenes.length > 1 && (
            <div className="mt-3 flex gap-3">
              {p.imagenes.map((im, i) => (
                <button key={im.url} onClick={() => setImg(i)} className={cls('h-20 w-20 overflow-hidden rounded-xl ring-2', i === img ? 'ring-menta-500' : 'ring-transparent')} aria-label={`Imagen ${i + 1}`}>
                  <ImagenProducto src={im.url} alt={im.alt} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-menta-700">{p.categoria.nombre} · {p.sku_base}</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{p.nombre}</h1>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="font-display text-3xl font-extrabold">{dinero(variante?.precio_final ?? delColor[0]?.precio_final ?? p.precio_desde)}</span>
            {(variante ?? delColor[0])?.descuento !== '0.00' && <span className="text-tinta-400 line-through">{dinero((variante ?? delColor[0])?.precio_base)}</span>}
            {(variante ?? delColor[0])?.promocion && <span className="rounded-full bg-coral-100 px-2 py-0.5 text-xs font-bold text-coral-700">{(variante ?? delColor[0])?.promocion}</span>}
          </div>
          <p className="text-xs text-tinta-400">IVA incluido</p>
          <p className="mt-5 text-tinta-600">{p.descripcion}</p>

          <div className="mt-6">
            <p className="mb-2 text-sm font-semibold">Color: <span className="font-normal text-tinta-500">{color}</span></p>
            <div className="flex gap-2">
              {colores.map(([c, h]) => (
                <button key={c} onClick={() => setColor(c)} aria-label={c} title={c}
                  className={cls('h-10 w-10 rounded-full ring-2 ring-offset-2 ring-offset-arena-100', color === c ? 'ring-tinta-900' : 'ring-arena-300')} style={{ background: h }} />
              ))}
            </div>
          </div>
          <div className="mt-5">
            <p className="mb-2 text-sm font-semibold">Talla {variante && <span className="font-normal text-tinta-500">· {variante.disponible} disponible(s)</span>}</p>
            <div className="flex flex-wrap gap-2">
              {delColor.map((v) => (
                <button key={v.id} disabled={!v.disponible} onClick={() => setTalla(v.talla)}
                  className={cls('h-11 min-w-12 rounded-xl px-3 text-sm font-bold ring-1 transition', talla === v.talla ? 'bg-tinta-900 text-white ring-tinta-900' : 'bg-white ring-arena-300 hover:ring-tinta-500',
                    !v.disponible && 'cursor-not-allowed bg-arena-100 text-tinta-300 line-through')}>{v.talla}</button>
              ))}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="flex h-12 items-center rounded-xl bg-white ring-1 ring-arena-300">
              <button className="px-3" onClick={() => setCantidad(Math.max(1, cantidad - 1))} aria-label="Menos"><Minus className="h-4 w-4" /></button>
              <span className="w-8 text-center font-bold" aria-live="polite">{cantidad}</span>
              <button className="px-3" onClick={() => setCantidad(Math.min(variante?.disponible || 1, cantidad + 1))} aria-label="Más"><Plus className="h-4 w-4" /></button>
            </div>
            <Boton tam="lg" className="flex-1 rounded-xl" disabled={!variante} cargando={agregar.isPending} icono={<ShoppingBag className="h-5 w-5" />}
              onClick={() => (tipo === 'cliente' ? agregar.mutate() : requiereSesion())}>
              {variante ? 'Agregar al carrito' : 'Elige una talla'}
            </Boton>
            <Boton tam="lg" variante="secundario" className="rounded-xl" aria-label="Favorito" onClick={() => (tipo === 'cliente' ? fav.mutate() : requiereSesion())}
              icono={<Heart className={cls('h-5 w-5', esFav && 'fill-coral-500 text-coral-500')} />} />
          </div>

          <div className="mt-8 rounded-2xl bg-white p-5 ring-1 ring-arena-200">
            <p className="mb-3 flex items-center gap-2 font-display font-bold"><Store className="h-4 w-4 text-menta-600" />Disponibilidad por sucursal {variante ? `· talla ${variante.talla}` : ''}</p>
            <ul className="divide-y divide-arena-200 text-sm">
              {p.disponibilidad_sucursal?.map((s) => {
                const n = variante ? s.variantes[String(variante.id)] || 0 : delColor.reduce((a, v) => a + (s.variantes[String(v.id)] || 0), 0);
                return (
                  <li key={s.sucursal_id} className="flex items-center justify-between py-2">
                    <span>{s.sucursal}</span>
                    <span className={cls('font-semibold', n > 5 ? 'text-menta-700' : n > 0 ? 'text-amber-700' : 'text-tinta-300')}>
                      {n > 5 ? 'Disponible' : n > 0 ? `Últimas ${n}` : 'Sin existencias'}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 flex items-start gap-2 text-xs text-tinta-400"><Truck className="mt-0.5 h-3.5 w-3.5" />Envío a domicilio desde la sucursal de tu zona, o recoge sin costo.</p>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
            {p.material && <div><dt className="text-tinta-400">Material</dt><dd className="font-semibold">{p.material}</dd></div>}
            {p.cuidados && <div><dt className="text-tinta-400">Cuidados</dt><dd className="font-semibold">{p.cuidados}</dd></div>}
            {p.puestos.length > 0 && <div className="col-span-2"><dt className="text-tinta-400">Recomendado para</dt><dd className="mt-1 flex flex-wrap gap-1">{p.puestos.map((x) => <span key={x} className="flex items-center gap-1 rounded-full bg-menta-50 px-2 py-0.5 text-xs font-semibold text-menta-800"><Check className="h-3 w-3" />{x}</span>)}</dd></div>}
          </dl>
        </div>
      </div>
      {!!p.relacionados?.length && (
        <section className="mt-16">
          <h2 className="mb-5 font-display text-2xl font-extrabold">También te puede servir</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">{p.relacionados.map((r) => <ProductoCard key={r.id} p={r} />)}</div>
        </section>
      )}
    </div>
  );
}
