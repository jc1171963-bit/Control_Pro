import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, ClipboardCheck, MapPin, ShieldCheck, Shirt, SlidersHorizontal, Store, Truck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { get } from '../../api/cliente';
import type { ProductoResumen } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { useConfig } from '../../app/config';
import Carrusel, { Diapositiva } from '../../components/Carrusel';
import { Aparecer } from '../../components/movimiento';
import { Boton, Cargando, ErrorCaja } from '../../components/ui';
import { cls, dinero, fecha } from '../../lib/formato';
import { Cintas, PUNTOS } from './Decoracion';
import ProductoCard, { ImagenProducto } from './ProductoCard';
import { useSucursalesPublicas } from './Ubicaciones';

type Promocion = { id: number; nombre: string; tipo: string; valor: string; fin: string };
type DatosInicio = { destacados: ProductoResumen[]; novedades: ProductoResumen[]; promociones: ProductoResumen[]; promociones_vigentes: Promocion[] };
type Categoria = { id: number; nombre: string; slug: string; padre_id: number | null; productos: number };

type Ventaja = readonly [LucideIcon, string, string];

/** Solo lo que el sistema ofrece de verdad (sin cifras comerciales, certificaciones ni promesas inventadas). */
const ventajas = (ubicaciones?: number): Ventaja[] => [
  [MapPin, ubicaciones ? `${ubicaciones} ubicaciones cerca de ti` : 'Ubicaciones cerca de ti', 'Consulta la dirección, el teléfono y el horario de cada sucursal.'],
  [Store, 'Disponibilidad a la vista', 'Cada ficha muestra si el producto está disponible en cada una de nuestras ubicaciones.'],
  [SlidersHorizontal, 'Tu talla y tu color', 'Explora el catálogo por categoría, talla y color hasta dar con lo que tu equipo necesita.'],
  [Building2, 'Atención para empresas', 'Las sucursales solicitan uniformes por empleado y puesto desde su portal, con seguimiento de cada entrega.'],
];

const BENEFICIOS: Ventaja[] = [
  [MapPin, 'Surtido desde tu zona', 'El pedido se surte desde la sucursal de tu zona; si hace falta, se divide.'],
  [ShieldCheck, 'Reserva al confirmar', 'Las piezas se apartan al hacer el pedido: no vendemos lo que no hay.'],
  [Truck, 'Seguimiento por paquete', 'Cada paquete tiene guía y eventos registrados por la sucursal.'],
  [ClipboardCheck, 'Entrega por empleado', 'Para empresas: aprobación, recepción y firma de conformidad por persona.'],
];

const enlaceBase = 'inline-flex h-12 items-center gap-2 rounded-full px-6 font-semibold transition';

function BotonesPortada() {
  const { tipo, cliente } = useAuth();
  const cuenta = tipo !== 'cliente' ? null : cliente?.tipo === 'empresa' ? ['/cuenta/solicitudes/nueva', 'Crear solicitud'] : ['/cuenta/pedidos', 'Mis pedidos'];
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <Link to="/catalogo" className={`${enlaceBase} bg-white text-lurima-900 shadow-lg shadow-lurima-950/30 hover:bg-lurima-50`}>Ver catálogo <ArrowRight className="h-4 w-4" /></Link>
      {cuenta ? <Link to={cuenta[0]} className={`${enlaceBase} bg-white/10 text-white ring-1 ring-white/40 hover:bg-white/20`}>{cuenta[1]}</Link>
        : <Link to="/entrar" className={`${enlaceBase} bg-white/10 text-white ring-1 ring-white/40 hover:bg-white/20`}><Building2 className="h-4 w-4" />Entrar</Link>}
    </div>
  );
}

/** Cifras reales de la API (categorías y ubicaciones publicadas); si aún no llegan, la tarjeta no se muestra. */
function Portada({ categorias, sucursales }: { categorias?: number; sucursales?: number }) {
  return (
    <div className="contenedor relative grid items-center gap-10 pb-24 pt-12 md:grid-cols-[1.25fr_1fr] md:pb-28 md:pt-16 lg:gap-16">
      <div className="relative z-10">
        <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-lurima-100 ring-1 ring-white/20">
          <span className="h-1.5 w-1.5 rounded-full bg-bienestar-400" aria-hidden />Distribuidora Lurima
        </p>
        <h1 className="texto-equilibrado mt-5 font-display text-[2.6rem] font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
          Salud y bienestar <span className="relative whitespace-nowrap text-bienestar-400">a tu alcance<svg viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden className="absolute -bottom-2 left-0 h-3 w-full"><path d="M2 14 C 80 2, 200 2, 298 10" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" /></svg></span>
        </h1>
        <p className="mt-6 max-w-xl text-base text-lurima-100 sm:text-lg">Productos de calidad para el cuidado de tu empresa y tu gente.</p>
        <BotonesPortada />
      </div>
      <div className="relative mx-auto hidden w-full max-w-sm md:block" aria-hidden>
        <div className="absolute -inset-6 rounded-t-full bg-gradient-to-b from-bienestar-500/40 to-transparent blur-2xl" />
        <div className="relative aspect-[4/5] overflow-hidden rounded-b-[2rem] rounded-t-full ring-8 ring-white/10">
          <img src="/assets/escenas/uniformes-clinicos.webp" alt="" width={1200} height={1200} className="h-full w-full object-cover object-[50%_30%]" />
        </div>
        <span className="absolute -left-10 top-10 grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-white shadow-2xl ring-4 ring-lurima-950/40">
          <img src="/lurima-logo.jpeg" alt="" className="h-full w-full scale-[1.6] object-cover" />
        </span>
        {!!categorias && (
          <span className="absolute -left-12 bottom-14 rounded-2xl bg-white px-4 py-3 text-lurima-900 shadow-2xl">
            <span className="flex items-center gap-2 font-display text-2xl font-extrabold"><Shirt className="h-5 w-5 text-bienestar-600" />{categorias}</span>
            <span className="text-xs font-semibold text-tinta-500">categorías de producto</span>
          </span>
        )}
        {!!sucursales && (
          <span className="absolute -right-6 bottom-32 rounded-2xl bg-white px-4 py-3 text-lurima-900 shadow-2xl">
            <span className="flex items-center gap-2 font-display text-2xl font-extrabold"><MapPin className="h-5 w-5 text-coral-600" />{sucursales}</span>
            <span className="text-xs font-semibold text-tinta-500">ubicaciones</span>
          </span>
        )}
      </div>
    </div>
  );
}

function SlidePromocion({ p }: { p: Promocion }) {
  return (
    <div className="contenedor relative pb-24 pt-12 md:pb-28 md:pt-16">
      <p className="text-xs font-bold uppercase tracking-widest text-bienestar-100">Promoción vigente</p>
      <h2 className="texto-equilibrado mt-2 max-w-3xl font-display text-3xl font-extrabold tracking-tight sm:text-5xl">{p.nombre}</h2>
      <p className="mt-3 text-xl font-semibold text-white">{p.tipo === 'porcentaje' ? `${Number(p.valor)}% de descuento` : `${dinero(p.valor)} menos`}</p>
      <p className="text-sm text-lurima-100">Hasta el {fecha(p.fin)}</p>
      <Link to="/catalogo?promocion=1" className={`${enlaceBase} mt-8 bg-white text-lurima-900 hover:bg-lurima-50`}>Ver productos en promoción <ArrowRight className="h-4 w-4" /></Link>
    </div>
  );
}

function Titulo({ id, eyebrow, children, enlace }: { id: string; eyebrow: string; children: React.ReactNode; enlace?: string }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-3">
      <div>
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-bienestar-700"><span className="h-px w-6 bg-bienestar-500" aria-hidden />{eyebrow}</p>
        <h2 id={id} className="mt-1 font-display text-2xl font-extrabold tracking-tight text-lurima-900 sm:text-3xl">{children}</h2>
      </div>
      {enlace && <Link to={enlace} className="group flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-lurima-800 hover:text-lurima-600">Ver todo <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></Link>}
    </div>
  );
}

function Seccion({ id, eyebrow, titulo, enlace, productos }: { id: string; eyebrow: string; titulo: string; enlace: string; productos: ProductoResumen[] }) {
  if (!productos.length) return null;
  return (
    <section className="contenedor mt-16 sm:mt-20" aria-labelledby={id}>
      <Titulo id={id} eyebrow={eyebrow} enlace={enlace}>{titulo}</Titulo>
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">{productos.slice(0, 8).map((p, i) => <ProductoCard key={p.id} p={p} orden={i} />)}</div>
    </section>
  );
}

/** Mosaico de categorías: cada una toma la imagen de un producto real suyo que ya esté en pantalla; si no hay, un fondo gráfico. */
function Categorias({ cats, productos }: { cats: Categoria[]; productos: ProductoResumen[] }) {
  return (
    <section className="contenedor mt-16 sm:mt-20" aria-labelledby="t-categorias">
      <Titulo id="t-categorias" eyebrow="Explora" enlace="/catalogo">Categorías</Titulo>
      <ul className="grid auto-rows-[9.5rem] grid-cols-2 gap-3 sm:auto-rows-[11rem] sm:gap-4 lg:grid-cols-3">
        {cats.map((c, i) => {
          const muestra = productos.find((p) => p.categoria.slug === c.slug);
          return (
            <Aparecer como="li" orden={i} key={c.slug} className={cls(i === 0 && 'lg:col-span-2 lg:row-span-2')}>
              <Link to={`/catalogo?categoria=${c.slug}`} className="group relative flex h-full overflow-hidden rounded-3xl bg-lurima-800 ring-1 ring-lurima-100">
                {muestra ? <ImagenProducto src={muestra.imagen} alt="" className="absolute inset-0 transition duration-700 group-hover:scale-105" />
                  : <span className={cls('absolute inset-0 opacity-30', PUNTOS)} aria-hidden />}
                <span className="absolute inset-0 bg-gradient-to-t from-lurima-950/90 via-lurima-950/35 to-transparent" aria-hidden />
                <span className="relative mt-auto flex w-full items-end justify-between gap-2 p-4 sm:p-5">
                  <span>
                    <span className={cls('block font-display font-extrabold leading-tight text-white', i === 0 ? 'text-lg lg:text-3xl' : 'text-lg')}>{c.nombre}</span>
                    <span className="text-xs font-semibold text-lurima-100">{c.productos} producto{c.productos === 1 ? '' : 's'}</span>
                  </span>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/30 transition group-hover:bg-white group-hover:text-lurima-900" aria-hidden><ArrowRight className="h-4 w-4" /></span>
                </span>
              </Link>
            </Aparecer>
          );
        })}
      </ul>
    </section>
  );
}

/** Banda oscura de propuesta de valor (misma composición visual que tenía la sección de pasos). */
function PorQueLurima({ items }: { items: Ventaja[] }) {
  return (
    <section className="relative mt-20 overflow-hidden bg-lurima-950 py-16 text-white sm:mt-24 sm:py-20" aria-labelledby="t-por-que">
      <Cintas className="absolute -left-20 top-0 h-32 w-[40rem] rotate-180 opacity-40" />
      <div className="contenedor relative">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-bienestar-400"><span className="h-px w-6 bg-bienestar-400" aria-hidden />Distribuidora Lurima</p>
            <h2 id="t-por-que" className="texto-equilibrado mt-1 max-w-2xl font-display text-3xl font-extrabold tracking-tight sm:text-4xl">¿Por qué elegir LURIMA?</h2>
          </div>
          <Link to="/acerca" className="group inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-lurima-100 hover:text-white">Conoce más de nosotros <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></Link>
        </div>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(([Icono, t, d], i) => (
            <Aparecer como="li" orden={i} key={t} className="group rounded-3xl bg-white/[0.06] p-6 ring-1 ring-white/10 transition duration-300 hover:-translate-y-1 hover:bg-white/[0.1]">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-bienestar-400 ring-1 ring-white/15 transition group-hover:bg-bienestar-500 group-hover:text-white"><Icono className="h-6 w-6" aria-hidden /></span>
              <p className="mt-5 font-display text-lg font-bold leading-snug">{t}</p>
              <p className="mt-2 text-sm text-lurima-100">{d}</p>
            </Aparecer>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Presentación institucional con las ubicaciones reales de la API. */
function Presencia() {
  const s = useSucursalesPublicas();
  if (!s.data?.length) return null;
  return (
    <section className="contenedor mt-16 sm:mt-20" aria-labelledby="t-presencia">
      <div className="grid overflow-hidden rounded-[2rem] bg-lurima-50 ring-1 ring-lurima-100 md:grid-cols-2">
        <div className="relative min-h-56 md:min-h-full">
          <img src="/assets/escenas/almacen.webp" alt="" loading="lazy" width={1400} height={900} className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute inset-0 bg-gradient-to-tr from-lurima-950/50 to-transparent" aria-hidden />
        </div>
        <div className="relative p-7 sm:p-10">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-bienestar-700"><span className="h-px w-6 bg-bienestar-500" aria-hidden />Dónde estamos</p>
          <h2 id="t-presencia" className="mt-1 font-display text-2xl font-extrabold tracking-tight text-lurima-900 sm:text-3xl">Cerca de tu empresa y de tu gente</h2>
          <ul className="mt-6 space-y-3">
            {s.data.map((x) => (
              <li key={x.id} className="flex items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-lurima-100">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-lurima-900 text-white"><MapPin className="h-4 w-4" aria-hidden /></span>
                <span className="text-sm"><span className="block font-display font-bold text-lurima-900">{x.nombre}</span><span className="text-tinta-600">{x.ciudad}, {x.estado}</span></span>
              </li>
            ))}
          </ul>
          <Link to="/sucursales" className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-lurima-900 px-5 text-sm font-semibold text-white hover:bg-lurima-800">Ver ubicaciones y horarios <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </div>
    </section>
  );
}

export default function Inicio() {
  const { canalTienda, cargando } = useConfig();
  const q = useQuery({ queryKey: ['inicio'], queryFn: () => get<DatosInicio>('/tienda/inicio') });
  const categorias = useQuery({ queryKey: ['categorias'], queryFn: () => get<Categoria[]>('/tienda/categorias'), staleTime: 300_000 });
  const sucursales = useSucursalesPublicas();
  if (cargando) return <Cargando />;

  const cats = (categorias.data || []).filter((c) => !c.padre_id);
  // Las promociones solo se anuncian donde hay precios (tienda en línea encendida).
  const promociones = canalTienda ? q.data?.promociones_vigentes ?? [] : [];
  const diapositivas: Diapositiva[] = [
    { id: 'portada', contenido: <Portada categorias={cats.length} sucursales={sucursales.data?.length} /> },
    ...promociones.map((p) => ({ id: `promo-${p.id}`, contenido: <SlidePromocion p={p} /> })),
  ];
  const destacados = q.data?.destacados ?? [];
  // "Novedades" no repite lo que ya está en destacados.
  const novedades = (q.data?.novedades ?? []).filter((p) => !destacados.some((d) => d.id === p.id));
  const enPantalla = [...destacados, ...novedades, ...(q.data?.promociones ?? [])];

  return (
    <>
      <div className="relative overflow-hidden bg-gradient-to-br from-lurima-950 via-lurima-900 to-lurima-700 text-white">
        <div className="absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_1px_1px,#fff_1px,transparent_0)] [background-size:24px_24px]" aria-hidden />
        <Cintas className="absolute -bottom-6 left-0 h-40 w-full opacity-60" />
        <Carrusel etiqueta="Destacados de la tienda" diapositivas={diapositivas} className="relative" />
      </div>

      {q.isLoading && <Cargando />}
      <div className="contenedor mt-6 space-y-3">
        <ErrorCaja error={q.error} />
        {q.error && <Boton variante="secundario" onClick={() => q.refetch()}>Reintentar</Boton>}
      </div>
      {q.data && <Seccion id="t-destacados" eyebrow="Selección" titulo="Artículos destacados" enlace="/catalogo" productos={destacados} />}
      {cats.length > 0 && <Categorias cats={cats} productos={enPantalla} />}
      {q.data && (
        <>
          {canalTienda && <Seccion id="t-promos" eyebrow="Ahorra" titulo="En promoción" enlace="/catalogo?promocion=1" productos={q.data.promociones} />}
          <Seccion id="t-novedades" eyebrow="Recién llegados" titulo="Novedades" enlace="/catalogo?orden=nuevos" productos={novedades} />
        </>
      )}

      <PorQueLurima items={canalTienda ? BENEFICIOS : ventajas(sucursales.data?.length)} />
      <Presencia />

      {canalTienda && (
        <section className="contenedor mt-16" aria-labelledby="t-corporativo">
          <div className="relative grid gap-6 overflow-hidden rounded-[2rem] bg-lurima-900 p-8 text-white md:grid-cols-[1.4fr_1fr] md:items-center sm:p-10">
            <Cintas className="absolute -right-20 bottom-0 h-24 w-[30rem] opacity-50" />
            <div className="relative">
              <p className="text-xs font-bold uppercase tracking-widest text-bienestar-400">Canal corporativo</p>
              <h2 id="t-corporativo" className="mt-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">¿Vistes a todo un equipo?</h2>
              <p className="mt-2 text-lurima-100">Registra a tus empleados, arma el pedido por persona y puesto, y recibe cada kit con firma de conformidad individual. Las excepciones por puesto pasan por aprobación.</p>
            </div>
            <div className="relative flex flex-wrap gap-3 md:justify-end">
              <Link to="/registro?tipo=empresa" className="inline-flex h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-lurima-900 hover:bg-lurima-50">Crear cuenta de empresa</Link>
              <Link to="/entrar" className="inline-flex h-11 items-center rounded-full px-5 text-sm font-semibold text-white ring-1 ring-white/40 hover:bg-white/10">Ya tengo cuenta</Link>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
