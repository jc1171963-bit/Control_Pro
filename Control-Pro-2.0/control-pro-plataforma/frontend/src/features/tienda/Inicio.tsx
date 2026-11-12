import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, ClipboardCheck, ClipboardList, FileSignature, MapPin, PackageCheck, PackageOpen, ShieldCheck, Truck, UserCheck } from 'lucide-react';
import { get } from '../../api/cliente';
import type { ProductoResumen } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { useConfig } from '../../app/config';
import Carrusel, { Diapositiva } from '../../components/Carrusel';
import { Aparecer } from '../../components/movimiento';
import { Boton, Cargando, ErrorCaja } from '../../components/ui';
import { dinero, fecha } from '../../lib/formato';
import ProductoCard from './ProductoCard';

type Promocion = { id: number; nombre: string; tipo: string; valor: string; fin: string };
type DatosInicio = { destacados: ProductoResumen[]; novedades: ProductoResumen[]; promociones: ProductoResumen[]; promociones_vigentes: Promocion[] };
type Categoria = { id: number; nombre: string; slug: string; padre_id: number | null; productos: number };

const ETAPAS = [
  [ClipboardList, 'Solicitud por empleado', 'La sucursal asigna cada artículo a una persona y su puesto.'],
  [ShieldCheck, 'Revisión', 'El distribuidor aprueba, devuelve para corrección o rechaza.'],
  [PackageOpen, 'Surtido', 'Almacén prepara, registra faltantes y separa en paquetes.'],
  [Truck, 'Envío por paquete', 'Cada paquete tiene su guía y su propio seguimiento.'],
  [PackageCheck, 'Recepción', 'La sucursal confirma lo que llegó, artículo por artículo.'],
  [FileSignature, 'Entrega con firma', 'Cada empleado firma lo que recibe.'],
  [UserCheck, 'Conformidad', 'El empleado califica y reporta cualquier problema.'],
] as const;

const BENEFICIOS = [
  [MapPin, 'Surtido desde tu zona', 'El pedido se surte desde la sucursal de tu zona; si hace falta, se divide.'],
  [ShieldCheck, 'Reserva al confirmar', 'Las piezas se apartan al hacer el pedido: no vendemos lo que no hay.'],
  [Truck, 'Seguimiento por paquete', 'Cada paquete tiene guía y eventos registrados por la sucursal.'],
  [ClipboardCheck, 'Entrega por empleado', 'Para empresas: aprobación, recepción y firma de conformidad por persona.'],
] as const;

const enlaceBase = 'inline-flex h-12 items-center gap-2 rounded-full px-6 font-semibold transition';

function BotonesPortada() {
  const { tipo, cliente } = useAuth();
  const cuenta = tipo !== 'cliente' ? null : cliente?.tipo === 'empresa' ? ['/cuenta/solicitudes/nueva', 'Crear solicitud'] : ['/cuenta/pedidos', 'Mis pedidos'];
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <Link to="/catalogo" className={`${enlaceBase} bg-white text-lurima-900 hover:bg-lurima-50`}>Ver catálogo <ArrowRight className="h-4 w-4" /></Link>
      {cuenta ? <Link to={cuenta[0]} className={`${enlaceBase} bg-white/10 text-white ring-1 ring-white/40 hover:bg-white/20`}>{cuenta[1]}</Link>
        : <Link to="/entrar" className={`${enlaceBase} bg-white/10 text-white ring-1 ring-white/40 hover:bg-white/20`}><Building2 className="h-4 w-4" />Entrar</Link>}
    </div>
  );
}

function Portada() {
  return (
    <div className="contenedor grid items-center gap-8 pb-24 pt-12 md:grid-cols-[1.4fr_1fr] md:pb-28 md:pt-16">
      <div>
        <h1 className="texto-equilibrado font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">Salud y bienestar a tu alcance</h1>
        <p className="mt-5 max-w-xl text-base text-lurima-100 sm:text-lg">Productos de calidad para el cuidado de tu empresa y tu gente.</p>
        <BotonesPortada />
      </div>
      <div className="hidden place-items-center md:grid" aria-hidden>
        <span className="h-56 w-56 overflow-hidden rounded-full bg-white shadow-2xl ring-8 ring-white/15 lg:h-64 lg:w-64">
          <img src="/lurima-logo.jpeg" alt="" className="h-full w-full scale-[1.6] object-cover" />
        </span>
      </div>
    </div>
  );
}

function SlidePromocion({ p }: { p: Promocion }) {
  return (
    <div className="contenedor pb-24 pt-12 md:pb-28 md:pt-16">
      <p className="text-xs font-bold uppercase tracking-widest text-bienestar-100">Promoción vigente</p>
      <h2 className="texto-equilibrado mt-2 max-w-3xl font-display text-3xl font-extrabold tracking-tight sm:text-5xl">{p.nombre}</h2>
      <p className="mt-3 text-xl font-semibold text-white">{p.tipo === 'porcentaje' ? `${Number(p.valor)}% de descuento` : `${dinero(p.valor)} menos`}</p>
      <p className="text-sm text-lurima-100">Hasta el {fecha(p.fin)}</p>
      <Link to="/catalogo?promocion=1" className={`${enlaceBase} mt-8 bg-white text-lurima-900 hover:bg-lurima-50`}>Ver productos en promoción <ArrowRight className="h-4 w-4" /></Link>
    </div>
  );
}

function Seccion({ id, titulo, enlace, productos }: { id: string; titulo: string; enlace: string; productos: ProductoResumen[] }) {
  if (!productos.length) return null;
  return (
    <section className="contenedor mt-14" aria-labelledby={id}>
      <div className="mb-5 flex items-end justify-between gap-3">
        <h2 id={id} className="font-display text-2xl font-extrabold tracking-tight text-lurima-900">{titulo}</h2>
        <Link to={enlace} className="flex shrink-0 items-center gap-1 text-sm font-semibold text-bienestar-600 hover:text-bienestar-700">Ver todo <ArrowRight className="h-4 w-4" /></Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">{productos.slice(0, 8).map((p, i) => <ProductoCard key={p.id} p={p} orden={i} />)}</div>
    </section>
  );
}

export default function Inicio() {
  const { canalTienda, cargando } = useConfig();
  const q = useQuery({ queryKey: ['inicio'], queryFn: () => get<DatosInicio>('/tienda/inicio') });
  const categorias = useQuery({ queryKey: ['categorias'], queryFn: () => get<Categoria[]>('/tienda/categorias'), staleTime: 300_000 });
  if (cargando) return <Cargando />;

  // Las promociones solo se anuncian donde hay precios (tienda en línea encendida).
  const promociones = canalTienda ? q.data?.promociones_vigentes ?? [] : [];
  const diapositivas: Diapositiva[] = [
    { id: 'portada', contenido: <Portada /> },
    ...promociones.map((p) => ({ id: `promo-${p.id}`, contenido: <SlidePromocion p={p} /> })),
  ];
  const cats = (categorias.data || []).filter((c) => !c.padre_id);

  return (
    <>
      <Carrusel etiqueta="Destacados de la tienda" diapositivas={diapositivas} className="overflow-hidden bg-gradient-to-br from-lurima-950 via-lurima-800 to-lurima-600 text-white" />

      {q.isLoading && <Cargando />}
      <div className="contenedor mt-6 space-y-3">
        <ErrorCaja error={q.error} />
        {q.error && <Boton variante="secundario" onClick={() => q.refetch()}>Reintentar</Boton>}
      </div>
      {q.data && (
        <>
          <Seccion id="t-destacados" titulo="Artículos destacados" enlace="/catalogo" productos={q.data.destacados} />
          {canalTienda && <Seccion id="t-promos" titulo="En promoción" enlace="/catalogo?promocion=1" productos={q.data.promociones} />}
          <Seccion id="t-novedades" titulo="Novedades" enlace="/catalogo?orden=nuevos" productos={q.data.novedades} />
        </>
      )}

      {cats.length > 0 && (
        <section className="contenedor mt-14" aria-labelledby="t-categorias">
          <h2 id="t-categorias" className="mb-5 font-display text-2xl font-extrabold tracking-tight text-lurima-900">Categorías</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {cats.map((c, i) => (
              <Aparecer como="li" orden={i} key={c.slug}>
                <Link to={`/catalogo?categoria=${c.slug}`} className="block h-full rounded-2xl bg-lurima-50 p-4 ring-1 ring-lurima-100 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-suave hover:ring-bienestar-400">
                  <span className="block font-display font-bold text-lurima-900">{c.nombre}</span>
                  <span className="text-xs text-lurima-500">{c.productos} producto(s)</span>
                </Link>
              </Aparecer>
            ))}
          </ul>
        </section>
      )}

      {canalTienda ? (
        <section className="contenedor mt-14" aria-labelledby="t-beneficios">
          <h2 id="t-beneficios" className="mb-5 font-display text-2xl font-extrabold tracking-tight text-lurima-900">Por qué comprar con nosotros</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {BENEFICIOS.map(([Icono, t, d]) => (
              <li key={t} className="rounded-2xl bg-white p-5 shadow-suave ring-1 ring-lurima-100">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-bienestar-50 text-bienestar-600"><Icono className="h-5 w-5" /></span>
                <p className="mt-3 font-display font-bold text-lurima-900">{t}</p>
                <p className="mt-1 text-sm text-lurima-700">{d}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="contenedor mt-14" aria-labelledby="t-proceso">
          <h2 id="t-proceso" className="mb-5 font-display text-2xl font-extrabold tracking-tight text-lurima-900">Así funciona la solicitud de tu sucursal</h2>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ETAPAS.map(([Icono, t, d], i) => (
              <li key={t} className="rounded-2xl bg-white p-5 shadow-suave ring-1 ring-lurima-100">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-bienestar-50 text-bienestar-600"><Icono className="h-5 w-5" /></span>
                <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-lurima-400">Paso {i + 1}</p>
                <p className="font-display font-bold text-lurima-900">{t}</p>
                <p className="mt-1 text-sm text-lurima-700">{d}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {canalTienda && (
        <section className="contenedor mt-14" aria-labelledby="t-corporativo">
          <div className="grid gap-6 rounded-3xl bg-lurima-50 p-8 ring-1 ring-lurima-100 md:grid-cols-[1.4fr_1fr] md:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-bienestar-600">Canal corporativo</p>
              <h2 id="t-corporativo" className="mt-2 font-display text-2xl font-extrabold tracking-tight text-lurima-900">¿Vistes a todo un equipo?</h2>
              <p className="mt-2 text-lurima-700">Registra a tus empleados, arma el pedido por persona y puesto, y recibe cada kit con firma de conformidad individual. Las excepciones por puesto pasan por aprobación.</p>
            </div>
            <div className="flex flex-wrap gap-3 md:justify-end">
              <Link to="/registro?tipo=empresa" className="inline-flex h-11 items-center rounded-full bg-lurima-800 px-5 text-sm font-semibold text-white hover:bg-lurima-700">Crear cuenta de empresa</Link>
              <Link to="/entrar" className="inline-flex h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-lurima-800 ring-1 ring-lurima-200 hover:bg-lurima-50">Ya tengo cuenta</Link>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
