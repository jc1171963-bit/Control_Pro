import { FormEvent, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, Building2, FilePlus2, Heart, LogOut, Menu, Package, Search, ShoppingBag, User, X } from 'lucide-react';
import { get } from '../../api/cliente';
import type { Carrito } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { useConfig } from '../../app/config';
import { Transicion } from '../../components/movimiento';
import { cls } from '../../lib/formato';
import { useSucursalesPublicas } from './Ubicaciones';

export function Marca({ claro = false }: { claro?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="Control Pro, inicio">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-menta-500 text-white shadow-sm">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden><path d="M6 7.5 10 5l2 2 2-2 4 2.5-1.6 3.2-1.6-.8V19H9.2v-9.1l-1.6.8z" /></svg>
      </span>
      <span className={cls('font-display text-lg font-extrabold leading-none tracking-tight', claro ? 'text-white' : 'text-tinta-900')}>
        Control<span className="text-menta-500">Pro</span>
      </span>
    </Link>
  );
}

export function useCarrito() {
  const { tipo } = useAuth();
  const { canalTienda } = useConfig();
  return useQuery({ queryKey: ['carrito'], queryFn: () => get<Carrito>('/cuenta/carrito'), enabled: tipo === 'cliente' && canalTienda });
}

/** Marca de la tienda pública (Distribuidora LURIMA). `Marca` queda para el panel interno. */
export function MarcaLurima({ claro = false }: { claro?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="Distribuidora Lurima, inicio">
      {/* Logotipo oficial en JPEG con fondo gris: se recorta en círculo hasta tener una versión transparente. */}
      <span className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-lurima-100">
        <img src="/lurima-logo.jpeg" alt="" className="h-full w-full scale-[1.6] object-cover" />
      </span>
      <span className="leading-tight">
        <span className={cls('block font-display text-[15px] font-extrabold tracking-tight sm:text-base', claro ? 'text-white' : 'text-lurima-900')}>Distribuidora Lurima</span>
        <span className={cls('hidden text-[11px] sm:block', claro ? 'text-lurima-200' : 'text-lurima-500')}>Salud y bienestar a tu alcance</span>
      </span>
    </Link>
  );
}

const FONDO_BLANCO = ['/', '/catalogo', '/acerca', '/preguntas-frecuentes', '/contacto', '/sucursales'];
const ENLACES: [string, string][] = [
  ['/', 'Inicio'], ['/catalogo', 'Catálogo'], ['/acerca', 'Acerca de nosotros'], ['/preguntas-frecuentes', 'Preguntas frecuentes'], ['/contacto', 'Contacto'],
];

export default function TiendaLayout() {
  const { tipo, cliente, usuario, salir } = useAuth();
  const { canalTienda } = useConfig();
  const carrito = useCarrito();
  const nav = useNavigate();
  const loc = useLocation();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [loc.pathname]);
  useEffect(() => {
    if (!menu) return;
    const f = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [menu]);
  const categorias = useQuery({ queryKey: ['categorias'], queryFn: () => get<{ id: number; nombre: string; slug: string; padre_id: number | null }[]>('/tienda/categorias'), staleTime: 300_000 });
  const notif = useQuery({ queryKey: ['notif-cliente', 'contador'], queryFn: () => get<{ no_leidas: number }>('/cuenta/notificaciones?por_pagina=1'),
    enabled: tipo === 'cliente', refetchInterval: 30_000 });
  const sucursales = useSucursalesPublicas();

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    nav(`/catalogo?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    // Fondo blanco solo donde ya se aplicó la identidad LURIMA; se extiende a más rutas en los siguientes bloques.
    <div className={cls('flex min-h-screen flex-col', (FONDO_BLANCO.includes(loc.pathname) || loc.pathname.startsWith('/producto/')) && 'bg-white')}>
      <ScrollRestoration />
      <div className="bg-lurima-900 text-[12px] text-lurima-100">
        <div className="contenedor flex h-8 items-center justify-between gap-4">
          <span className="truncate">Salud y bienestar a tu alcance</span>
          <Link to="/sucursales" className="hidden shrink-0 font-semibold text-white/90 hover:text-white sm:inline">{canalTienda ? 'Recoge en sucursal →' : 'Nuestras ubicaciones →'}</Link>
        </div>
      </div>
      <header className="sticky top-0 z-40 border-b border-lurima-100 bg-white/95 shadow-sm backdrop-blur">
        <div className="contenedor flex h-16 items-center gap-3 lg:gap-5">
          <button className="rounded-lg p-2 text-lurima-800 hover:bg-lurima-50 lg:hidden" onClick={() => setMenu(!menu)} aria-label={menu ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menu} aria-controls="menu-movil">
            {menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <MarcaLurima />
          <nav aria-label="Principal" className="mx-auto hidden items-center gap-1 rounded-full bg-lurima-50 p-1 text-sm font-semibold lg:flex">
            {ENLACES.map(([to, nombre]) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cls('rounded-full px-3.5 py-1.5 transition', isActive ? 'bg-lurima-800 text-white shadow-sm' : 'text-lurima-800 hover:bg-white')}>{nombre}</NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-2 lg:ml-0">
            {tipo === 'usuario' && <Link to="/admin" className="hidden rounded-full bg-lurima-900 px-3 py-1.5 text-xs font-semibold text-white sm:block">Panel interno</Link>}
            {tipo === 'cliente' ? (
              <>
                <Link to="/cuenta/notificaciones" className="relative rounded-full p-2 text-lurima-800 hover:bg-lurima-50" aria-label={`Notificaciones${notif.data?.no_leidas ? `: ${notif.data.no_leidas} sin leer` : ''}`}>
                  <Bell className="h-5 w-5" />
                  {!!notif.data?.no_leidas && <span key={notif.data.no_leidas} className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 animate-rebote place-items-center rounded-full bg-coral-500 px-1 text-[10px] font-bold text-white">{notif.data.no_leidas}</span>}
                </Link>
                {canalTienda && <Link to="/cuenta/favoritos" className="rounded-full p-2 text-lurima-800 hover:bg-lurima-50" aria-label="Favoritos"><Heart className="h-5 w-5" /></Link>}
                <Link to={cliente?.tipo === 'empresa' ? '/cuenta' : '/cuenta/pedidos'} className="flex items-center gap-2 rounded-full px-2 py-1.5 text-sm font-semibold text-lurima-900 hover:bg-lurima-50">
                  <User className="h-5 w-5" /><span className="hidden max-w-[10rem] truncate sm:inline">{cliente?.razon_social || cliente?.nombre.split(' ')[0]}</span>
                </Link>
              </>
            ) : tipo !== 'usuario' && (
              <Link to="/entrar" className="flex items-center gap-2 rounded-full bg-bienestar-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-bienestar-700"><Building2 className="h-4 w-4" /><span className="hidden sm:inline">Acceso empresas</span><span className="sm:hidden">Entrar</span></Link>
            )}
            {canalTienda ? (
              <Link to="/carrito" className="relative flex items-center gap-2 rounded-full bg-lurima-800 px-3.5 py-2 text-sm font-semibold text-white hover:bg-lurima-700" aria-label={`Carrito${carrito.data?.articulos ? `: ${carrito.data.articulos} artículos` : ''}`}>
                <ShoppingBag className="h-4 w-4" />
                <span className="hidden sm:inline">Carrito</span>
                {!!carrito.data?.articulos && <span key={carrito.data.articulos} className="grid h-5 min-w-5 animate-rebote place-items-center rounded-full bg-bienestar-500 px-1 text-[11px] font-bold text-white">{carrito.data.articulos}</span>}
              </Link>
            ) : cliente?.tipo === 'empresa' && (
              <Link to="/cuenta/solicitudes/nueva" className="flex items-center gap-2 rounded-full bg-lurima-800 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-lurima-700">
                <FilePlus2 className="h-4 w-4" /><span className="hidden sm:inline">Crear solicitud</span>
              </Link>
            )}
          </div>
        </div>
        <div className="border-t border-lurima-50">
          <div className="contenedor hidden h-11 items-center gap-6 text-sm font-semibold text-lurima-700 md:flex">
            <form onSubmit={buscar} className="relative w-72 shrink-0" role="search">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-lurima-300" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar productos o SKU" aria-label="Buscar productos"
                className="h-8 w-full rounded-full border-0 bg-lurima-50 pl-9 pr-3 text-sm font-normal ring-1 ring-lurima-100 placeholder:text-lurima-300 focus:bg-white focus:ring-2 focus:ring-lurima-500" />
            </form>
            <ul className="hidden items-center gap-5 overflow-x-auto lg:flex">
              {(categorias.data || []).filter((c) => !c.padre_id).map((c) => (
                <li key={c.slug} className="shrink-0"><Link to={`/catalogo?categoria=${c.slug}`} aria-current={params.get('categoria') === c.slug ? 'true' : undefined}
                  className={cls('hover:text-lurima-900', params.get('categoria') === c.slug && 'text-bienestar-600')}>{c.nombre}</Link></li>
              ))}
            </ul>
          </div>
        </div>
        {menu && (
          <div id="menu-movil" className="max-h-[calc(100vh-6rem)] overflow-y-auto border-t border-lurima-100 bg-white lg:hidden">
            <form onSubmit={buscar} className="contenedor py-3 md:hidden" role="search">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar productos" aria-label="Buscar productos"
                className="h-11 w-full rounded-full border-0 bg-lurima-50 px-4 text-sm ring-1 ring-lurima-100 focus:ring-2 focus:ring-lurima-500" />
            </form>
            <nav aria-label="Principal (móvil)" className="contenedor grid gap-1 py-2 text-sm font-semibold">
              {ENLACES.map(([to, nombre]) => (
                <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cls('flex min-h-11 items-center rounded-xl px-3', isActive ? 'bg-lurima-800 text-white' : 'text-lurima-900 hover:bg-lurima-50')}>{nombre}</NavLink>
              ))}
            </nav>
            {!!categorias.data?.length && (
              <div className="contenedor pb-3">
                <p className="mb-2 mt-2 text-xs font-bold uppercase tracking-widest text-lurima-400">Categorías</p>
                <div className="grid grid-cols-2 gap-2 text-sm font-semibold">
                  {categorias.data.filter((c) => !c.padre_id).map((c) => <Link key={c.slug} to={`/catalogo?categoria=${c.slug}`} className="flex min-h-11 items-center rounded-xl bg-lurima-50 px-3 text-lurima-800">{c.nombre}</Link>)}
                </div>
              </div>
            )}
            <div className="contenedor grid gap-2 pb-4 text-sm font-semibold">
              {tipo !== 'cliente' && tipo !== 'usuario' && <Link to="/entrar" className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-bienestar-600 px-3 text-white"><Building2 className="h-4 w-4" />Acceso empresas</Link>}
              {tipo === 'cliente' && <button onClick={salir} className="min-h-11 rounded-xl bg-coral-50 px-3 text-left text-coral-600">Cerrar sesión</button>}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1"><Transicion clave={loc.pathname}><Outlet /></Transicion></main>

      <footer className="mt-16 bg-lurima-950 text-lurima-100">
        <div className="contenedor grid gap-10 py-12 md:grid-cols-2 lg:grid-cols-[1fr_auto_2fr] lg:gap-14">
          <div className="space-y-3">
            <MarcaLurima claro />
            <p className="max-w-xs text-sm text-lurima-200">Productos de calidad para el cuidado de tu empresa y tu gente.</p>
            {usuario ? null : <Link to="/admin/entrar" className="inline-block text-xs text-lurima-300 hover:text-white">Acceso para personal</Link>}
          </div>
          <nav aria-label="Pie de página">
            <p className="mb-3 font-display text-sm font-bold text-white">Navegación</p>
            <ul className="space-y-2 text-sm">
              {ENLACES.map(([to, nombre]) => <li key={to}><Link to={to} className="inline-flex min-h-8 items-center text-lurima-200 hover:text-white">{nombre}</Link></li>)}
            </ul>
          </nav>
          {!!sucursales.data?.length && (
            <div className="md:col-span-2 lg:col-span-1">
              <p className="mb-3 font-display text-sm font-bold text-white">Ubicaciones</p>
              <ul className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(11rem,1fr))]">
                {sucursales.data.map((s) => (
                  <li key={s.id} className="text-sm">
                    <p className="font-display font-bold text-white">{s.nombre}</p>
                    <p className="mt-1 text-lurima-200">{s.direccion}</p>
                    <p className="text-lurima-200">{s.ciudad}, {s.estado} · CP {s.cp}</p>
                    {s.telefono && <p className="mt-1"><a href={`tel:${s.telefono.replace(/[^\d+]/g, '')}`} className="text-lurima-300 hover:text-white">Tel. {s.telefono}</a></p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="border-t border-white/10">
          <div className="contenedor flex flex-wrap items-center justify-between gap-2 py-4 text-xs text-lurima-300">
            <span>© {new Date().getFullYear()} Distribuidora Lurima{canalTienda ? ' · Precios en MXN con IVA incluido.' : ''}</span>
            <span className="flex items-center gap-4">
              <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" aria-hidden />{canalTienda ? 'Pago por transferencia o en sucursal' : 'Trazabilidad por paquete y por empleado'}</span>
              {tipo === 'cliente' && <button onClick={salir} className="flex min-h-8 items-center gap-1 hover:text-white"><LogOut className="h-3.5 w-3.5" aria-hidden />Salir</button>}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
