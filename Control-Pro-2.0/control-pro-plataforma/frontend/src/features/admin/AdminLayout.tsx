import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeftRight, Bell, Boxes, ClipboardCheck, ClipboardList, CreditCard, FileBarChart, History,
  ChevronRight, Gauge, Inbox, Network, LayoutDashboard, LogOut, Menu, MessagesSquare, PackageOpen, Shirt, Store, Tag, Undo2, Users, UserSquare2, Warehouse, X } from 'lucide-react';
import { get } from '../../api/cliente';
import type { Sucursal } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { cls } from '../../lib/formato';
import { MarcaLurima } from '../tienda/TiendaLayout';
import FondoPortal from '../portal/FondoPortal';
import { useMensajesNoLeidos } from '../colaboracion/Mensajes';
import InterruptorTema from '../../components/InterruptorTema';
import { useAplicarTema } from '../../app/tema';

export function useSucursalesAdmin() {
  return useQuery({ queryKey: ['admin-sucursales'], queryFn: () => get<Sucursal[]>('/admin/sucursales'), staleTime: 120_000 });
}

const GRUPOS: { titulo: string; items: [string, string, any, string][] }[] = [
  { titulo: 'General', items: [['', 'Panel', LayoutDashboard, ''], ['indicadores', 'Indicadores de solicitudes', Gauge, 'reporte.ver'],
    ['notificaciones', 'Notificaciones', Bell, ''], ['mensajes', 'Mensajes con el aprobador', MessagesSquare, 'orden.recibir']] },
  { titulo: 'Solicitudes', items: [['solicitudes', 'Solicitudes de sucursales', Inbox, 'pedido.ver'], ['sucursales-cliente', 'Sucursales', Store, 'cliente.ver'], ['organizacion', 'Divisiones y zonas', Network, 'cliente.ver'],
    ['pedidos', 'Todos los pedidos', ClipboardList, 'pedido.ver'], ['pagos', 'Pagos y reembolsos', CreditCard, 'pago.ver'], ['clientes', 'Clientes', UserSquare2, 'cliente.ver']] },
  { titulo: 'Operación', items: [['surtido', 'Surtido y envíos', PackageOpen, 'surtido.operar'], ['inventario', 'Inventario', Boxes, 'inventario.ver'],
    ['transferencias', 'Transferencias', ArrowLeftRight, 'inventario.ver']] },
  { titulo: 'Posventa', items: [['devoluciones', 'Devoluciones', Undo2, 'pedido.ver'], ['incidencias', 'Incidencias', AlertTriangle, 'incidencia.gestionar']] },
  { titulo: 'Catálogo', items: [['catalogo', 'Productos', Shirt, 'inventario.ver'], ['promociones', 'Promociones', Tag, 'inventario.ver']] },
  { titulo: 'Administración', items: [['reportes', 'Reportes', FileBarChart, 'reporte.ver'], ['sucursales', 'Centros de distribución', Warehouse, 'sucursal.ver'],
    ['usuarios', 'Usuarios y roles', Users, 'usuario.gestionar'], ['auditoria', 'Auditoría', History, 'auditoria.ver']] },
];

/**
 * Panel de la distribuidora con la identidad de LURIMA: mismo lenguaje visual que los portales (fondo animado, barra
 * lateral de cristal flotante, paneles de cristal) con la paleta de la tienda: azul LURIMA, verde bienestar y coral.
 */
export default function AdminLayout() {
  useAplicarTema();
  const { usuario, puede, salir } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const loc = useLocation();
  const notif = useQuery({ queryKey: ['notif-admin', 'contador'], queryFn: () => get<{ no_leidas: number }>('/admin/notificaciones?por_pagina=1&no_leidas=1'), refetchInterval: 45_000 });
  const mensajes = useMensajesNoLeidos(puede('orden.recibir'));
  const visibles = GRUPOS.map((g) => ({ ...g, items: g.items.filter(([, , , p]) => !p || puede(p)) })).filter((g) => g.items.length);
  const alcance = usuario?.rol.alcance_global ? 'Todas las sucursales' : usuario?.sucursales.map((s) => s.nombre).join(', ');
  const noLeidas = notif.data?.no_leidas ?? 0;
  const sinLeer = mensajes.data?.no_leidos ?? 0;
  useEffect(() => setAbierto(false), [loc.pathname]);
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [abierto]);
  const iniciales = (usuario?.nombre ?? '').trim().split(/\s+/).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? '').join('') || '·';
  const insignia = (n: number) => n > 0 && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-coral-500 px-1 text-[10px] font-bold text-white" aria-label={`${n} sin leer`}>{n}</span>;

  return (
    <div className="tema-lu relative isolate min-h-screen bg-[#e8eef8] text-lurima-950 lg:pl-[304px]">
      <FondoPortal paleta="lurima" />
      {abierto && <div className="fixed inset-0 z-30 bg-lurima-950/40 backdrop-blur-sm lg:hidden" onClick={() => setAbierto(false)} aria-hidden />}

      <aside className={cls('fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col overflow-hidden bg-white/90 shadow-[0_18px_55px_rgba(18,58,115,.15)] backdrop-blur-2xl transition-transform duration-200',
        'lg:inset-y-6 lg:left-6 lg:w-64 lg:translate-x-0 lg:rounded-[28px] lg:border lg:border-white/80 lg:bg-white/55', abierto ? 'translate-x-0' : '-translate-x-full')}>
        <div className="h-1 shrink-0 bg-gradient-to-r from-lurima-500 via-bienestar-500 to-coral-500" aria-hidden />
        <div className="flex min-h-16 items-center justify-between px-4 pt-3 lg:px-5">
          <MarcaLurima />
          <button type="button" className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/70 lg:hidden" onClick={() => setAbierto(false)} aria-label="Cerrar menú"><X className="h-5 w-5" /></button>
        </div>
        <div className="mx-3 mb-3 mt-3 flex items-center gap-2.5 rounded-[18px] bg-gradient-to-br from-lurima-900 to-lurima-600 p-3 text-white shadow-[0_8px_24px_rgba(18,58,115,.25)]">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 text-xs font-bold ring-1 ring-white/25" aria-hidden>{iniciales}</span>
          <span className="min-w-0 text-xs">
            <span className="block truncate font-display text-[13px] font-bold">{usuario?.nombre}</span>
            <span className="block truncate text-white/75">{usuario?.rol.nombre}</span>
            <span className="mt-0.5 flex items-center gap-1 truncate text-bienestar-100"><ClipboardCheck className="h-3 w-3 shrink-0" />{alcance}</span>
          </span>
        </div>
        <nav aria-label="Principal" className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          {visibles.map((g) => (
            <div key={g.titulo}>
              <p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-lurima-400">{g.titulo}</p>
              <div className="space-y-1">
                {g.items.map(([to, n, Icono]) => (
                  <NavLink key={to} to={`/admin${to ? `/${to}` : ''}`} end={!to}
                    className={({ isActive }) => cls('flex min-h-10 items-center gap-2.5 rounded-[14px] px-3 text-[13px] font-semibold transition duration-200',
                      isActive ? 'bg-gradient-to-r from-lurima-800 via-lurima-600 to-lurima-400 text-white shadow-[0_8px_22px_rgba(31,81,146,.35),inset_0_1px_1px_#ffffff80]'
                        : 'text-lurima-900 hover:translate-x-0.5 hover:bg-white/70')}>
                    {({ isActive }) => {
                      const n2 = to === 'notificaciones' ? noLeidas : to === 'mensajes' ? sinLeer : 0;
                      return (
                        <>
                          <Icono className="h-4 w-4 shrink-0" aria-hidden /><span className="truncate">{n}</span>
                          {n2 > 0 ? insignia(n2) : isActive && <ChevronRight className="ml-auto h-4 w-4 shrink-0" aria-hidden />}
                        </>
                      );
                    }}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="space-y-1 border-t border-lurima-100/70 p-3">
          <Link to="/" className="flex min-h-10 items-center gap-2 rounded-[14px] px-3 text-xs font-semibold text-lurima-700 hover:bg-white/70"><Store className="h-4 w-4" />Ver tienda</Link>
          <button type="button" onClick={salir} className="flex min-h-10 w-full items-center gap-2 rounded-[14px] px-3 text-xs font-semibold text-coral-600 hover:bg-coral-50"><LogOut className="h-4 w-4" />Cerrar sesión</button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex min-h-[68px] items-center gap-3 px-4 py-2.5 backdrop-blur-md sm:px-6 lg:mt-3 lg:pl-0 lg:pr-8 lg:backdrop-blur-none">
        <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/80 bg-white/60 backdrop-blur-md lg:hidden" onClick={() => setAbierto(true)} aria-label="Menú"><Menu className="h-5 w-5" /></button>
        <div className="min-w-0 rounded-full border border-white/80 bg-white/55 px-4 py-2 backdrop-blur-xl">
          <p className="truncate text-sm font-semibold text-lurima-500">Distribuidora Lurima · <span className="text-lurima-900">Panel de operación</span></p>
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {puede('orden.recibir') && (
            <Link to="/admin/mensajes" className="relative hidden h-11 w-11 place-items-center rounded-full border border-white/80 bg-white/60 text-lurima-900 backdrop-blur-md transition hover:bg-white/85 sm:grid"
              aria-label={`Mensajes con el aprobador${sinLeer ? `: ${sinLeer} sin leer` : ''}`}>
              <MessagesSquare className="h-5 w-5" />{sinLeer > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-coral-500 px-1 text-[10px] font-bold text-white" aria-hidden>{sinLeer}</span>}
            </Link>
          )}
          <InterruptorTema className="h-11 w-11 shrink-0" />
          <Link to="/admin/notificaciones" className="relative grid h-11 w-11 place-items-center rounded-full border border-white/80 bg-white/60 text-lurima-900 backdrop-blur-md transition hover:bg-white/85" aria-label="Notificaciones">
            <Bell className="h-5 w-5" />{noLeidas > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-coral-500 px-1 text-[10px] font-bold text-white" aria-hidden>{noLeidas}</span>}
          </Link>
          <span className="hidden min-h-11 items-center gap-2 rounded-full border border-white/80 bg-white/60 pl-1.5 pr-4 text-sm font-semibold backdrop-blur-md md:flex">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-lurima-800 to-bienestar-500 text-xs font-bold text-white" aria-hidden>{iniciales}</span>
            <span className="max-w-[12rem] truncate">{usuario?.nombre}</span>
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] animate-aparecer px-4 pb-8 pt-3 sm:px-6 lg:pl-0 lg:pr-8" key={loc.pathname.split('/')[2] || 'inicio'}><Outlet /></main>
    </div>
  );
}

export function Encabezado({ titulo, sub, children }: { titulo: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="font-display text-2xl font-extrabold tracking-tight text-lurima-950 sm:text-[28px]">{titulo}</h1>{sub && <p className="text-sm text-tinta-500">{sub}</p>}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function FiltroSucursal({ valor, onCambio }: { valor: string; onCambio: (v: string) => void }) {
  const { usuario } = useAuth();
  const sucs = useSucursalesAdmin();
  const visibles = usuario?.rol.alcance_global ? sucs.data : sucs.data?.filter((s) => usuario?.sucursales.some((x) => x.id === s.id));
  return (
    <select value={valor} onChange={(e) => onCambio(e.target.value)} aria-label="Sucursal" className="h-10 rounded-full border-0 bg-white/80 pr-8 text-sm ring-1 ring-lurima-100 backdrop-blur">
      <option value="">{usuario?.rol.alcance_global ? 'Todas las sucursales' : 'Mis sucursales'}</option>
      {visibles?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
    </select>
  );
}
