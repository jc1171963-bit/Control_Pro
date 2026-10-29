import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeftRight, Bell, Boxes, Building2, ClipboardCheck, ClipboardList, CreditCard, FileBarChart, History,
  LayoutDashboard, LogOut, Menu, PackageOpen, Shirt, Tag, Undo2, Users, UserSquare2, X } from 'lucide-react';
import { get } from '../../api/cliente';
import type { Sucursal } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { cls } from '../../lib/formato';
import { Marca } from '../tienda/TiendaLayout';

export function useSucursalesAdmin() {
  return useQuery({ queryKey: ['admin-sucursales'], queryFn: () => get<Sucursal[]>('/admin/sucursales'), staleTime: 120_000 });
}

const GRUPOS: { titulo: string; items: [string, string, any, string][] }[] = [
  { titulo: 'General', items: [['', 'Panel', LayoutDashboard, 'reporte.ver'], ['notificaciones', 'Notificaciones', Bell, '']] },
  { titulo: 'Ventas', items: [['pedidos', 'Pedidos', ClipboardList, 'pedido.ver'], ['pagos', 'Pagos y reembolsos', CreditCard, 'pago.ver'], ['clientes', 'Clientes', UserSquare2, 'cliente.ver']] },
  { titulo: 'Operación', items: [['surtido', 'Surtido y envíos', PackageOpen, 'surtido.operar'], ['inventario', 'Inventario', Boxes, 'inventario.ver'],
    ['transferencias', 'Transferencias', ArrowLeftRight, 'inventario.ver']] },
  { titulo: 'Posventa', items: [['devoluciones', 'Devoluciones', Undo2, 'pedido.ver'], ['incidencias', 'Incidencias', AlertTriangle, 'incidencia.gestionar']] },
  { titulo: 'Catálogo', items: [['catalogo', 'Productos', Shirt, 'inventario.ver'], ['promociones', 'Promociones', Tag, 'inventario.ver']] },
  { titulo: 'Administración', items: [['reportes', 'Reportes', FileBarChart, 'reporte.ver'], ['sucursales', 'Sucursales', Building2, 'sucursal.ver'],
    ['usuarios', 'Usuarios y roles', Users, 'usuario.gestionar'], ['auditoria', 'Auditoría', History, 'auditoria.ver']] },
];

export default function AdminLayout() {
  const { usuario, puede, salir } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const loc = useLocation();
  const notif = useQuery({ queryKey: ['notif-admin', 'contador'], queryFn: () => get('/admin/notificaciones?por_pagina=1&no_leidas=1'), refetchInterval: 45_000 });
  const visibles = GRUPOS.map((g) => ({ ...g, items: g.items.filter(([, , , p]) => !p || puede(p)) })).filter((g) => g.items.length);
  const alcance = usuario?.rol.alcance_global ? 'Todas las sucursales' : usuario?.sucursales.map((s) => s.nombre).join(', ');

  const menu = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
      {visibles.map((g) => (
        <div key={g.titulo}>
          <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-tinta-400">{g.titulo}</p>
          {g.items.map(([to, n, Icono]) => (
            <NavLink key={to} to={`/admin${to ? `/${to}` : ''}`} end={!to} onClick={() => setAbierto(false)}
              className={({ isActive }) => cls('flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition', isActive ? 'bg-menta-500 text-white' : 'text-tinta-200 hover:bg-white/5 hover:text-white')}>
              <Icono className="h-4 w-4" />{n}
              {to === 'notificaciones' && !!notif.data?.no_leidas && <span className="ml-auto rounded-full bg-coral-500 px-1.5 text-[10px] text-white">{notif.data.no_leidas}</span>}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-tinta-50">
      <aside className={cls('fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-tinta-950 transition-transform lg:translate-x-0', abierto ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex h-16 items-center justify-between px-5"><Marca claro /><button className="text-white lg:hidden" onClick={() => setAbierto(false)} aria-label="Cerrar menú"><X className="h-5 w-5" /></button></div>
        <div className="mx-3 mb-4 rounded-xl bg-white/5 p-3 text-xs text-tinta-300 ring-1 ring-white/10">
          <p className="font-semibold text-white">{usuario?.nombre}</p>
          <p>{usuario?.rol.nombre}</p>
          <p className="mt-1 flex items-center gap-1 text-menta-300"><ClipboardCheck className="h-3 w-3" />{alcance}</p>
        </div>
        {menu}
        <div className="border-t border-white/10 p-3">
          <Link to="/" className="block rounded-lg px-3 py-2 text-xs font-semibold text-tinta-300 hover:text-white">Ver tienda</Link>
          <button onClick={salir} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-coral-100 hover:bg-white/5"><LogOut className="h-4 w-4" />Cerrar sesión</button>
        </div>
      </aside>
      {abierto && <div className="fixed inset-0 z-30 bg-tinta-950/40 lg:hidden" onClick={() => setAbierto(false)} />}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-tinta-100 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="lg:hidden" onClick={() => setAbierto(true)} aria-label="Menú"><Menu className="h-5 w-5" /></button>
          <p className="truncate text-sm font-semibold text-tinta-500">Control Pro · <span className="text-tinta-900">Panel de operación</span></p>
          <Link to="/admin/notificaciones" className="relative ml-auto rounded-lg p-2 text-tinta-500 hover:bg-tinta-50" aria-label="Notificaciones">
            <Bell className="h-5 w-5" />{!!notif.data?.no_leidas && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-coral-500" />}
          </Link>
        </header>
        <main className="mx-auto max-w-[1400px] p-4 sm:p-6" key={loc.pathname.split('/')[2] || 'inicio'}><Outlet /></main>
      </div>
    </div>
  );
}

export function Encabezado({ titulo, sub, children }: { titulo: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="font-display text-2xl font-extrabold tracking-tight text-tinta-900">{titulo}</h1>{sub && <p className="text-sm text-tinta-400">{sub}</p>}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function FiltroSucursal({ valor, onCambio }: { valor: string; onCambio: (v: string) => void }) {
  const { usuario } = useAuth();
  const sucs = useSucursalesAdmin();
  const visibles = usuario?.rol.alcance_global ? sucs.data : sucs.data?.filter((s) => usuario?.sucursales.some((x) => x.id === s.id));
  return (
    <select value={valor} onChange={(e) => onCambio(e.target.value)} aria-label="Sucursal" className="h-10 rounded-lg border-0 bg-white pr-8 text-sm ring-1 ring-tinta-200">
      <option value="">{usuario?.rol.alcance_global ? 'Todas las sucursales' : 'Mis sucursales'}</option>
      {visibles?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
    </select>
  );
}
