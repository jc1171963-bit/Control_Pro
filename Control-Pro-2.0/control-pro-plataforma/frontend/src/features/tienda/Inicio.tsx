import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, ClipboardCheck, ClipboardList, FileSignature, MapPin, PackageCheck, PackageOpen, ShieldCheck, Truck, UserCheck } from 'lucide-react';
import { get } from '../../api/cliente';
import type { ProductoResumen } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { useConfig } from '../../app/config';
import { Cargando, ErrorCaja } from '../../components/ui';
import { Aparecer } from '../../components/movimiento';
import { fecha } from '../../lib/formato';
import ProductoCard from './ProductoCard';

type Inicio = { destacados: ProductoResumen[]; novedades: ProductoResumen[]; promociones: ProductoResumen[];
  promociones_vigentes: { id: number; nombre: string; tipo: string; valor: string; fin: string }[] };

const CATS = [
  { n: 'Batas', s: 'batas', d: 'Biomédica y clínica' }, { n: 'Camisas y blusas', s: 'camisas-blusas', d: 'Oficina, gerencia y auditoría' },
  { n: 'Polos y playeras', s: 'polos-playeras', d: 'Staff, biomédica y soporte' }, { n: 'Quirúrgicos', s: 'quirurgicos', d: 'Conjuntos y filipinas' },
  { n: 'Pantalones', s: 'pantalones', d: 'Cargo de uso rudo' }, { n: 'Abrigo', s: 'abrigo', d: 'Chamarras, suéteres y chalecos' },
  { n: 'Calzado', s: 'calzado', d: 'Botas, tenis y zapatos de seguridad' }, { n: 'Protección', s: 'proteccion', d: 'Guantes y fajas' },
  { n: 'Accesorios', s: 'accesorios', d: 'Mandiles, mascadas y pin' },
];

function Seccion({ titulo, enlace, productos }: { titulo: string; enlace: string; productos: ProductoResumen[] }) {
  if (!productos.length) return null;
  return (
    <section className="contenedor mt-14">
      <div className="mb-5 flex items-end justify-between">
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-tinta-900">{titulo}</h2>
        <Link to={enlace} className="flex items-center gap-1 text-sm font-semibold text-menta-700 hover:text-menta-800">Ver todo <ArrowRight className="h-4 w-4" /></Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">{productos.slice(0, 8).map((p, i) => <ProductoCard key={p.id} p={p} orden={i} />)}</div>
    </section>
  );
}

const ETAPAS = [
  [ClipboardList, 'Solicitud por empleado', 'La sucursal asigna cada artículo a una persona y su puesto.'],
  [ShieldCheck, 'Revisión', 'El distribuidor aprueba, devuelve para corrección o rechaza.'],
  [PackageOpen, 'Surtido', 'Almacén prepara, registra faltantes y separa en paquetes.'],
  [Truck, 'Envío por paquete', 'Cada paquete tiene su guía y su propio seguimiento.'],
  [PackageCheck, 'Recepción', 'La sucursal confirma lo que llegó, artículo por artículo.'],
  [FileSignature, 'Entrega con firma', 'Cada empleado firma lo que recibe.'],
  [UserCheck, 'Conformidad', 'El empleado califica y reporta cualquier problema.'],
] as const;

function InicioPortal() {
  const { cliente } = useAuth();
  const q = useQuery({ queryKey: ['inicio'], queryFn: () => get<Inicio>('/tienda/inicio') });
  return (
    <>
      <section className="relative overflow-hidden bg-tinta-900 text-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 animate-pulse rounded-full bg-menta-500/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-40 w-[40rem] rounded-full bg-sky-400/10 blur-3xl" />
        <div className="contenedor relative py-14 md:py-20">
          <Aparecer>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-menta-200">
              <span className="h-1.5 w-1.5 rounded-full bg-menta-400" /> Gestión inteligente y trazabilidad integral
            </p>
          </Aparecer>
          <Aparecer orden={1}>
            <h1 className="texto-equilibrado max-w-4xl font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Uniformes para cada empleado, rastreados de la solicitud a la firma de entrega.
            </h1>
          </Aparecer>
          <Aparecer orden={2}>
            <p className="mt-5 max-w-2xl text-base text-tinta-200 sm:text-lg">
              Cada sucursal solicita por persona y puesto; el distribuidor revisa, surte y envía por paquete; la sucursal recibe y cada empleado confirma con su firma.
            </p>
          </Aparecer>
          <Aparecer orden={3}>
            <div className="mt-8 flex flex-wrap gap-3">
              {cliente?.tipo === 'empresa' ? (
                <Link to="/cuenta/solicitudes/nueva" className="inline-flex h-12 items-center gap-2 rounded-full bg-menta-500 px-6 font-semibold text-white transition hover:bg-menta-400">Crear solicitud <ArrowRight className="h-4 w-4" /></Link>
              ) : (
                <Link to="/entrar" className="inline-flex h-12 items-center gap-2 rounded-full bg-menta-500 px-6 font-semibold text-white transition hover:bg-menta-400"><Building2 className="h-4 w-4" />Entrar como sucursal</Link>
              )}
              <Link to="/catalogo" className="inline-flex h-12 items-center gap-2 rounded-full bg-white/10 px-6 font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/15">Ver catálogo <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </Aparecer>
        </div>
      </section>

      <section className="contenedor relative z-10 -mt-8">
        <ol className="grid gap-3 rounded-3xl bg-white p-4 shadow-suave ring-1 ring-arena-200 sm:grid-cols-2 lg:grid-cols-7">
          {ETAPAS.map(([Icono, t, d], i) => (
            <Aparecer como="li" orden={i + 4} key={t} className="group relative rounded-2xl p-3 transition hover:bg-arena-50">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-menta-50 text-menta-700 transition group-hover:scale-110 group-hover:bg-menta-500 group-hover:text-white"><Icono className="h-5 w-5" /></span>
              <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-tinta-400">Paso {i + 1}</p>
              <p className="font-display text-sm font-bold text-tinta-900">{t}</p>
              <p className="mt-1 text-xs text-tinta-500">{d}</p>
            </Aparecer>
          ))}
        </ol>
      </section>

      <section className="contenedor mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {CATS.map((c, i) => (
          <Aparecer key={c.s} orden={i}>
            <Link to={`/catalogo?categoria=${c.s}`} className="block rounded-2xl bg-white p-4 shadow-suave ring-1 ring-arena-200 transition hover:-translate-y-0.5 hover:ring-menta-400">
              <p className="font-display font-bold text-tinta-900">{c.n}</p>
              <p className="text-xs text-tinta-400">{c.d}</p>
            </Link>
          </Aparecer>
        ))}
      </section>

      {q.isLoading && <Cargando />}
      <div className="contenedor"><ErrorCaja error={q.error} /></div>
      {q.data && <Seccion titulo="Artículos destacados" enlace="/catalogo" productos={q.data.destacados} />}
    </>
  );
}

export default function Inicio() {
  const { canalTienda, cargando } = useConfig();
  if (cargando) return <Cargando />;
  return canalTienda ? <InicioTienda /> : <InicioPortal />;
}

function InicioTienda() {
  const q = useQuery({ queryKey: ['inicio'], queryFn: () => get<Inicio>('/tienda/inicio') });
  return (
    <>
      <section className="relative overflow-hidden bg-tinta-900 text-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-menta-500/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-40 w-[40rem] rounded-full bg-coral-500/10 blur-3xl" />
        <div className="contenedor relative grid gap-10 py-14 md:grid-cols-[1.25fr_1fr] md:py-20">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-menta-200">
              <span className="h-1.5 w-1.5 rounded-full bg-menta-400" /> Tres sucursales, un solo inventario visible
            </p>
            <h1 className="texto-equilibrado font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Uniformes listos para trabajar, surtidos desde la sucursal más cercana.
            </h1>
            <p className="mt-5 max-w-xl text-base text-tinta-200 sm:text-lg">
              Compra por talla y color con existencias reales. Paga por transferencia o recoge y paga en Toluca, Querétaro o Puebla.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/catalogo" className="inline-flex h-12 items-center gap-2 rounded-full bg-menta-500 px-6 font-semibold text-white hover:bg-menta-400">Ver catálogo <ArrowRight className="h-4 w-4" /></Link>
              <Link to="/registro?tipo=empresa" className="inline-flex h-12 items-center gap-2 rounded-full bg-white/10 px-6 font-semibold text-white ring-1 ring-white/20 hover:bg-white/15"><Building2 className="h-4 w-4" />Cuenta para empresas</Link>
            </div>
          </div>
          <ul className="grid content-center gap-3 text-sm">
            {[
              [MapPin, 'Asignación por cercanía', 'El pedido se surte desde la sucursal de tu zona; si hace falta, se divide.'],
              [ShieldCheck, 'Reserva al confirmar', 'Las piezas se apartan al hacer el pedido: no vendemos lo que no hay.'],
              [Truck, 'Seguimiento por paquete', 'Cada paquete tiene guía y eventos registrados por la sucursal.'],
              [ClipboardCheck, 'Entrega por empleado', 'Para empresas: aprobación, recepción y firma de conformidad por persona.'],
            ].map(([Icono, t, d]: any) => (
              <li key={t} className="flex gap-3 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <Icono className="mt-0.5 h-5 w-5 shrink-0 text-menta-300" />
                <div><p className="font-semibold text-white">{t}</p><p className="text-tinta-300">{d}</p></div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="contenedor relative z-10 -mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {CATS.map((c) => (
          <Link key={c.s} to={`/catalogo?categoria=${c.s}`} className="rounded-2xl bg-white p-4 shadow-suave ring-1 ring-arena-200 transition hover:ring-menta-400">
            <p className="font-display font-bold text-tinta-900">{c.n}</p>
            <p className="text-xs text-tinta-400">{c.d}</p>
          </Link>
        ))}
      </section>

      {q.isLoading && <Cargando />}
      <div className="contenedor"><ErrorCaja error={q.error} /></div>
      {q.data && (
        <>
          {q.data.promociones_vigentes.length > 0 && (
            <section className="contenedor mt-12">
              <div className="flex flex-col gap-3 rounded-3xl bg-coral-500 p-6 text-white sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-coral-100">Promoción vigente</p>
                  {q.data.promociones_vigentes.map((p) => (
                    <p key={p.id} className="font-display text-xl font-extrabold">{p.nombre} · {p.tipo === 'porcentaje' ? `${Number(p.valor)}% de descuento` : `$${Number(p.valor)} menos`} <span className="text-sm font-semibold text-coral-100">hasta el {fecha(p.fin)}</span></p>
                  ))}
                </div>
                <Link to="/catalogo?promocion=1" className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-coral-600">Aprovechar <ArrowRight className="h-4 w-4" /></Link>
              </div>
            </section>
          )}
          <Seccion titulo="Más pedidos por los equipos" enlace="/catalogo" productos={q.data.destacados} />
          <Seccion titulo="En promoción" enlace="/catalogo" productos={q.data.promociones} />
          <Seccion titulo="Novedades" enlace="/catalogo?orden=nuevos" productos={q.data.novedades} />
        </>
      )}

      <section className="contenedor mt-16">
        <div className="grid gap-6 rounded-3xl bg-white p-8 ring-1 ring-arena-200 md:grid-cols-[1.4fr_1fr] md:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-menta-700">Canal corporativo</p>
            <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tight">¿Vistes a todo un equipo?</h2>
            <p className="mt-2 text-tinta-500">Registra a tus empleados, arma el pedido por persona y puesto, y recibe cada kit con firma de conformidad individual. Las excepciones por puesto pasan por aprobación.</p>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <Link to="/registro?tipo=empresa" className="inline-flex h-11 items-center rounded-full bg-tinta-900 px-5 text-sm font-semibold text-white">Crear cuenta de empresa</Link>
            <Link to="/entrar" className="inline-flex h-11 items-center rounded-full px-5 text-sm font-semibold text-tinta-800 ring-1 ring-tinta-200">Ya tengo cuenta</Link>
          </div>
        </div>
      </section>
    </>
  );
}
