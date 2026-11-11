import { FormEvent, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, Building2, FilePlus2, Heart, LogOut, Menu, Package, Search, ShoppingBag, User, X } from 'lucide-react';
import { get } from '../../api/cliente';
import type { Carrito, Sucursal } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { useConfig } from '../../app/config';
import { Transicion } from '../../components/movimiento';
import { cls } from '../../lib/formato';

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

// Deben coincidir con las categorías de backend/seeds/catalogo.py.
const CATEGORIAS = [
  ['Batas', 'batas'], ['Camisas y blusas', 'camisas-blusas'], ['Polos y playeras', 'polos-playeras'],
  ['Quirúrgicos', 'quirurgicos'], ['Pantalones', 'pantalones'], ['Abrigo', 'abrigo'], ['Calzado', 'calzado'],
  ['Protección', 'proteccion'], ['Accesorios', 'accesorios'],
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
  const notif = useQuery({ queryKey: ['notif-cliente', 'contador'], queryFn: () => get<{ no_leidas: number }>('/cuenta/notificaciones?por_pagina=1'),
    enabled: tipo === 'cliente', refetchInterval: 30_000 });
  const sucursales = useQuery({ queryKey: ['sucursales-publicas'], queryFn: () => get<Sucursal[]>('/tienda/sucursales'), staleTime: 300_000 });

  const buscar = (e: FormEvent) => {
    e.preventDefault();
    nav(`/catalogo?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <ScrollRestoration />
      <div className="bg-tinta-900 text-[12px] text-tinta-200">
        <div className="contenedor flex h-8 items-center justify-between gap-4">
          <span className="truncate">{canalTienda ? 'Surtimos desde Toluca, Querétaro y Puebla · Envío sin costo desde $1,500' : 'Control Pro · Gestión inteligente y trazabilidad integral de uniformes'}</span>
          {canalTienda && <Link to="/sucursales" className="hidden shrink-0 font-semibold text-menta-300 hover:text-white sm:inline">Recoge en sucursal →</Link>}
        </div>
      </div>
      <header className="sticky top-0 z-40 border-b border-arena-200 bg-arena-50/90 backdrop-blur">
        <div className="contenedor flex h-16 items-center gap-3 sm:gap-6">
          <button className="rounded-lg p-2 text-tinta-700 lg:hidden" onClick={() => setMenu(!menu)} aria-label="Menú">{menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          <Marca />
          <form onSubmit={buscar} className="relative hidden flex-1 md:block" role="search">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-300" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca batas, botas, polos, SKU…" aria-label="Buscar productos"
              className="h-10 w-full rounded-full border-0 bg-white pl-10 pr-4 text-sm ring-1 ring-arena-300 placeholder:text-tinta-300 focus:ring-2 focus:ring-menta-500" />
          </form>
          <nav className="ml-auto flex items-center gap-1 sm:gap-2">
            {tipo === 'usuario' && <Link to="/admin" className="hidden rounded-full bg-tinta-900 px-3 py-1.5 text-xs font-semibold text-white sm:block">Panel interno</Link>}
            {tipo === 'cliente' ? (
              <>
                <Link to="/cuenta/notificaciones" className="relative rounded-full p-2 text-tinta-700 hover:bg-arena-200" aria-label={`Notificaciones${notif.data?.no_leidas ? `: ${notif.data.no_leidas} sin leer` : ''}`}>
                  <Bell className="h-5 w-5" />
                  {!!notif.data?.no_leidas && <span key={notif.data.no_leidas} className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 animate-rebote place-items-center rounded-full bg-coral-500 px-1 text-[10px] font-bold text-white">{notif.data.no_leidas}</span>}
                </Link>
                {canalTienda && <Link to="/cuenta/favoritos" className="rounded-full p-2 text-tinta-700 hover:bg-arena-200" aria-label="Favoritos"><Heart className="h-5 w-5" /></Link>}
                <Link to={cliente?.tipo === 'empresa' ? '/cuenta' : '/cuenta/pedidos'} className="flex items-center gap-2 rounded-full px-2 py-1.5 text-sm font-semibold text-tinta-800 hover:bg-arena-200">
                  <User className="h-5 w-5" /><span className="hidden max-w-[10rem] truncate sm:inline">{cliente?.razon_social || cliente?.nombre.split(' ')[0]}</span>
                </Link>
              </>
            ) : tipo !== 'usuario' && (
              <Link to="/entrar" className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold text-tinta-800 hover:bg-arena-200"><User className="h-5 w-5" /><span className="hidden sm:inline">Entrar</span></Link>
            )}
            {canalTienda ? (
              <Link to="/carrito" className="relative flex items-center gap-2 rounded-full bg-tinta-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-tinta-700" aria-label="Carrito">
                <ShoppingBag className="h-4 w-4" />
                <span className="hidden sm:inline">Carrito</span>
                {!!carrito.data?.articulos && <span key={carrito.data.articulos} className="grid h-5 min-w-5 animate-rebote place-items-center rounded-full bg-menta-400 px-1 text-[11px] font-bold text-tinta-950">{carrito.data.articulos}</span>}
              </Link>
            ) : cliente?.tipo === 'empresa' && (
              <Link to="/cuenta/solicitudes/nueva" className="flex items-center gap-2 rounded-full bg-tinta-900 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-tinta-700">
                <FilePlus2 className="h-4 w-4" /><span className="hidden sm:inline">Crear solicitud</span>
              </Link>
            )}
          </nav>
        </div>
        <div className="contenedor hidden h-11 items-center gap-6 text-sm font-semibold text-tinta-600 lg:flex">
          <NavLink to="/catalogo" end className={({ isActive }) => cls('hover:text-tinta-900', isActive && !params.get('categoria') && 'text-tinta-900')}>Todo</NavLink>
          {CATEGORIAS.map(([n, s]) => (
            <Link key={s} to={`/catalogo?categoria=${s}`} className={cls('hover:text-tinta-900', params.get('categoria') === s && 'text-menta-600')}>{n}</Link>
          ))}
          {cliente?.tipo === 'empresa' && <Link to="/cuenta/solicitudes/nueva" className="ml-auto flex items-center gap-1.5 text-menta-700"><Building2 className="h-4 w-4" />Solicitud por empleado</Link>}
        </div>
        {menu && (
          <div className="border-t border-arena-200 bg-arena-50 lg:hidden">
            <form onSubmit={buscar} className="contenedor py-3 md:hidden" role="search">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar productos" aria-label="Buscar productos"
                className="h-10 w-full rounded-full border-0 bg-white px-4 text-sm ring-1 ring-arena-300" />
            </form>
            <div className="contenedor grid grid-cols-2 gap-2 pb-4 text-sm font-semibold">
              <Link to="/catalogo" className="rounded-lg bg-white px-3 py-2">Todo el catálogo</Link>
              {CATEGORIAS.map(([n, s]) => <Link key={s} to={`/catalogo?categoria=${s}`} className="rounded-lg bg-white px-3 py-2">{n}</Link>)}
              {tipo === 'cliente' && <button onClick={salir} className="rounded-lg bg-white px-3 py-2 text-left text-coral-600">Cerrar sesión</button>}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1"><Transicion clave={loc.pathname}><Outlet /></Transicion></main>

      <footer className="mt-16 bg-tinta-950 text-tinta-300">
        <div className="contenedor grid gap-10 py-12 md:grid-cols-[1.2fr_2fr]">
          <div className="space-y-3">
            <Marca claro />
            <p className="max-w-xs text-sm">{canalTienda ? 'Uniformes y equipo de trabajo con inventario en tres sucursales y trazabilidad de cada pedido, de la compra a la entrega.'
              : 'Gestión inteligente y trazabilidad integral: de la solicitud de cada sucursal a la firma de entrega de cada empleado.'}</p>
            {usuario ? null : <Link to="/admin/entrar" className="inline-block text-xs text-tinta-400 hover:text-white">Acceso para personal</Link>}
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {(sucursales.data || []).map((s) => (
              <div key={s.id} className="text-sm">
                <p className="font-display font-bold text-white">{s.nombre}</p>
                <p className="mt-1">{s.direccion}</p>
                <p>{s.ciudad}, {s.estado} · CP {s.cp}</p>
                {s.telefono && <p className="mt-1 text-tinta-400">Tel. {s.telefono}</p>}
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="contenedor flex flex-wrap items-center justify-between gap-2 py-4 text-xs text-tinta-400">
            <span>© {new Date().getFullYear()} Control Pro{canalTienda ? ' · Precios en MXN con IVA incluido.' : ''}</span>
            <span className="flex items-center gap-4">
              <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />{canalTienda ? 'Pago por transferencia o en sucursal' : 'Trazabilidad por paquete y por empleado'}</span>
              {tipo === 'cliente' && <button onClick={salir} className="flex items-center gap-1 hover:text-white"><LogOut className="h-3.5 w-3.5" />Salir</button>}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
