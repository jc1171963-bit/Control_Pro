/**
 * Portal del aprobador corporativo (lado Salud Digna). Mismo lenguaje visual que el portal de sucursales (fondo animado,
 * paneles de cristal) con un acento turquesa propio del rol. Solo lo que el aprobador necesita: seguimiento, solicitudes,
 * sucursales, divisiones y zonas, permisos de padrón, mensajes y notificaciones.
 */
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, Camera, ChevronDown, ChevronRight, ClipboardCheck, Inbox, KeyRound, LayoutDashboard, Menu, MessagesSquare, Network, Search,
  Store, Trash2, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { get } from '../../api/cliente';
import { useAuth } from '../../app/auth';
import { BASE_APROBADOR } from '../../app/panel';
import Avatar, { useFotoPerfil } from '../../components/Avatar';
import { Transicion } from '../../components/movimiento';
import { useAtraparFoco } from '../../components/useAtraparFoco';
import { useMediaQuery } from '../../components/useMediaQuery';
import { cls } from '../../lib/formato';
import { useMensajesNoLeidos } from '../colaboracion/Mensajes';
import FondoPortal from '../portal/FondoPortal';
import MarcaPortal from '../portal/MarcaPortal';
import { OpcionesAppMenu } from '../../components/AppDispositivo';
import InterruptorTema from '../../components/InterruptorTema';
import { useAplicarTema } from '../../app/tema';

/** Área del aprobador corporativo dentro de Salud Digna (se muestra junto a su nombre). */
export const AREA_APROBADOR = 'Gerencia de Compras';

type Clave = 'revisar' | 'permisos' | 'mensajes' | 'avisos';
const ITEMS: [string, string, LucideIcon, Clave | null][] = [
  ['', 'Panel', LayoutDashboard, null], ['solicitudes', 'Solicitudes', Inbox, 'revisar'], ['sucursales-cliente', 'Sucursales', Store, null],
  ['organizacion', 'Divisiones y zonas', Network, null], ['permisos', 'Permisos de padrón', KeyRound, 'permisos'],
  ['mensajes', 'Mensajes', MessagesSquare, 'mensajes'], ['notificaciones', 'Notificaciones', Bell, 'avisos'],
];


/** Pendientes del aprobador para los contadores del menú (se refrescan solos). */
export function useContadoresAprobador() {
  const revisar = useQuery({ queryKey: ['aprobador-resumen', 'revisar'], refetchInterval: 45_000,
    queryFn: () => get<{ total: number }>('/admin/pedidos?canal=corporativo&estado=en_revision&por_pagina=1') });
  const permisos = useQuery({ queryKey: ['aprobador-resumen', 'permisos'], refetchInterval: 45_000,
    queryFn: () => get<{ conteo: { pendientes: number; vigentes: number } }>('/admin/permisos-padron?estado=pendiente&por_pagina=1') });
  const avisos = useQuery({ queryKey: ['notif-admin', 'contador'], refetchInterval: 45_000,
    queryFn: () => get<{ no_leidas: number }>('/admin/notificaciones?por_pagina=1&no_leidas=1') });
  const mensajes = useMensajesNoLeidos();
  return {
    revisar: revisar.data?.total ?? 0, permisos: permisos.data?.conteo.pendientes ?? 0, vigentes: permisos.data?.conteo.vigentes ?? 0,
    mensajes: mensajes.data?.no_leidos ?? 0, avisos: avisos.data?.no_leidas ?? 0,
  };
}

function MenuUsuario({ nombre, foto, onSalir }: { nombre: string; foto?: string | null; onSalir: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const fotoPerfil = useFotoPerfil();
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    const fuera = (e: MouseEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false); };
    window.addEventListener('keydown', tecla);
    document.addEventListener('mousedown', fuera);
    return () => { window.removeEventListener('keydown', tecla); document.removeEventListener('mousedown', fuera); };
  }, [abierto]);
  return (
    <div ref={raiz} className="relative">
      <button type="button" onClick={() => setAbierto(!abierto)} aria-expanded={abierto} aria-haspopup="true"
        className="flex min-h-12 items-center gap-2 rounded-full border border-white/80 bg-white/60 pl-1.5 pr-1.5 text-sm sm:pr-3 font-semibold backdrop-blur-md transition hover:bg-white/80">
        <Avatar nombre={nombre} foto={foto} className="h-9 w-9 text-xs" />
        <span className="hidden max-w-[12rem] truncate sm:inline">{nombre}</span><span className="sr-only sm:hidden">{nombre}</span><ChevronDown className="hidden h-4 w-4 sm:block" aria-hidden />
      </button>
      {abierto && (
        <div className="absolute right-0 z-30 mt-2 w-56 rounded-2xl border border-white/80 bg-white/95 p-1 shadow-[0_18px_55px_rgba(25,91,87,.18)] backdrop-blur-xl">
          <div className="flex items-center gap-3 px-3 py-2">
            <Avatar nombre={nombre} foto={foto} className="h-11 w-11 text-sm" />
            <p className="min-w-0 text-xs text-tinta-500"><span className="block truncate font-semibold text-tinta-800">{nombre}</span>{AREA_APROBADOR} · Aprobador corporativo</p>
          </div>
          {fotoPerfil.input}
          <button type="button" onClick={fotoPerfil.elegir} disabled={fotoPerfil.subiendo}
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-tinta-800 hover:bg-[#e6f6f8] disabled:opacity-60">
            <Camera className="h-4 w-4" aria-hidden />{fotoPerfil.subiendo ? 'Subiendo foto…' : foto ? 'Cambiar foto' : 'Subir foto'}</button>
          {foto && <button type="button" onClick={fotoPerfil.quitar} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-tinta-600 hover:bg-tinta-50">
            <Trash2 className="h-4 w-4" aria-hidden />Quitar foto</button>}
          <OpcionesAppMenu claseOpcion="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold text-tinta-800 hover:bg-[#e6f6f8]" alTerminar={() => setAbierto(false)} />
          <button type="button" onClick={onSalir} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold text-coral-600 hover:bg-coral-50">Cerrar sesión</button>
        </div>
      )}
    </div>
  );
}

/** Foto de la tarjeta del menú: un clic la cambia (con un ícono de cámara al pasar el cursor). */
function FotoTarjeta({ nombre, foto }: { nombre?: string | null; foto?: string | null }) {
  const fotoPerfil = useFotoPerfil();
  return (
    <>
      {fotoPerfil.input}
      <button type="button" onClick={fotoPerfil.elegir} disabled={fotoPerfil.subiendo} title={foto ? 'Cambiar foto' : 'Subir foto'}
        aria-label={foto ? 'Cambiar foto de perfil' : 'Subir foto de perfil'} className="group relative shrink-0 rounded-full ring-2 ring-white/40">
        <Avatar nombre={nombre} foto={foto} className="h-11 w-11 text-xs" degradado="from-[#0e7490] to-[#5ec8d8]" />
        <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          <Camera className="h-4 w-4 text-white" aria-hidden /></span>
      </button>
    </>
  );
}

export default function AprobadorLayout() {
  useAplicarTema();
  const { usuario, salir } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const cuentas = useContadoresAprobador();
  const escritorio = useMediaQuery('(min-width: 1024px)');
  const [menu, setMenu] = useState(false);
  const drawerAbierto = menu && !escritorio;
  const panel = useRef<HTMLElement>(null);
  const botonMenu = useRef<HTMLButtonElement>(null);
  const cerrarMenu = useCallback(() => setMenu(false), []);
  useAtraparFoco(panel, drawerAbierto, cerrarMenu, botonMenu);
  useEffect(() => setMenu(false), [loc.pathname]);
  const [q, setQ] = useState('');
  const buscar = (e: FormEvent) => { e.preventDefault(); nav(`${BASE_APROBADOR}/sucursales-cliente${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`); };
  const salirDelPortal = async () => { await salir(); nav('/entrar', { replace: true }); };

  return (
    <div className="tema-sd relative isolate min-h-screen bg-[#d9eee9] text-[#102a31] lg:pl-[304px]">
      <ScrollRestoration />
      <FondoPortal />
      <a href="#contenido" className="sr-only z-50 rounded-lg bg-white px-4 py-2 font-semibold focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Saltar al contenido</a>
      {drawerAbierto && <div className="fixed inset-0 z-30 bg-[#092f2b]/40 backdrop-blur-sm lg:hidden" onClick={cerrarMenu} aria-hidden />}

      <aside id="navegacion-aprobador" ref={panel} {...(drawerAbierto ? { role: 'dialog', 'aria-modal': true, 'aria-label': 'Menú de navegación' } : {})}
        className={cls('fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col bg-white/90 shadow-[0_18px_55px_rgba(25,91,87,.13)] backdrop-blur-2xl transition-transform duration-200',
          'lg:visible lg:inset-y-6 lg:left-6 lg:z-30 lg:w-64 lg:translate-x-0 lg:rounded-[28px] lg:border lg:border-white/80 lg:bg-white/50',
          menu ? 'translate-x-0' : 'invisible -translate-x-full')}>
        <div className="flex min-h-16 items-center justify-between px-4 pt-2 lg:px-5 lg:pt-5">
          <MarcaPortal />
          <button type="button" onClick={cerrarMenu} aria-label="Cerrar menú" className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/70 lg:hidden"><X className="h-5 w-5" aria-hidden /></button>
        </div>
        <div className="mx-3 mb-4 mt-4 flex items-center gap-2.5 rounded-[18px] bg-gradient-to-br from-[#0b3f57] to-[#0e7490] p-3 text-white shadow-[0_8px_24px_#0e749033]">
          <FotoTarjeta nombre={usuario?.nombre} foto={usuario?.foto} />
          <span className="min-w-0 text-xs"><span className="block font-display text-[13px] font-bold">Aprobador corporativo</span>
            <span className="block truncate text-white/75">{AREA_APROBADOR}</span>
            <span className="block truncate text-white/90">{usuario?.nombre}</span></span>
        </div>
        <p className="px-6 pb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#71858b]">Menú</p>
        <nav aria-label="Principal" className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 pb-3">
          {ITEMS.map(([to, nombre, Icono, clave]) => {
            const n = clave ? cuentas[clave] : 0;
            return (
              <NavLink key={to} to={`${BASE_APROBADOR}${to ? `/${to}` : ''}`} end={!to}
                className={({ isActive }) => cls('flex min-h-12 items-center gap-3 rounded-[17px] px-3.5 text-sm font-semibold transition duration-200',
                  isActive ? 'bg-gradient-to-r from-[#0b4f6c] via-[#0e7490] to-[#5ec8d8] text-white shadow-[0_8px_24px_#0e749055,inset_0_1px_1px_#ffffffa6]' : 'hover:translate-x-0.5 hover:bg-white/60')}>
                {({ isActive }) => (
                  <>
                    <Icono className="h-5 w-5 shrink-0" aria-hidden /><span>{nombre}</span>
                    {n > 0 ? <span className={cls('ml-auto grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold', clave === 'revisar' || clave === 'permisos' ? 'bg-amber-400 text-amber-950' : 'bg-[#f04444] text-white')}
                      aria-label={`${n} pendiente(s)`}>{n}</span> : isActive && <ChevronRight className="ml-auto h-4 w-4" aria-hidden />}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
        <div className="lema-panel mx-3 mb-3 rounded-[22px] bg-gradient-to-br from-[#d6f3f7cc] to-[#a8e6d4aa] p-4 text-[13px] font-bold leading-snug">
          <ClipboardCheck className="mb-2 h-5 w-5 text-[#0e7490]" aria-hidden />
          Revisas, apruebas y das<br />seguimiento a las sucursales
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex min-h-[70px] items-center gap-3 px-4 py-2.5 backdrop-blur-md sm:px-6 lg:mt-3 lg:pl-0 lg:pr-8 lg:backdrop-blur-none">
        <button ref={botonMenu} type="button" onClick={() => setMenu(true)} aria-label="Abrir menú" aria-expanded={drawerAbierto} aria-controls="navegacion-aprobador"
          className="-ml-1 grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/80 bg-white/60 backdrop-blur-md lg:hidden"><Menu className="h-5 w-5" aria-hidden /></button>
        <div className="shrink-0 lg:hidden"><MarcaPortal minima /></div>
        <form role="search" onSubmit={buscar}
          className="hidden h-12 max-w-[560px] flex-1 items-center gap-3 rounded-[18px] border border-white/80 bg-white/55 px-4 backdrop-blur-xl focus-within:ring-2 focus-within:ring-[#0e7490] md:flex">
          <Search className="h-5 w-5 shrink-0 text-[#52636a]" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar sucursal por nombre o correo..." aria-label="Buscar sucursal"
            className="w-full border-0 bg-transparent p-0 text-sm focus:outline-none focus:ring-0" />
        </form>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Link to={`${BASE_APROBADOR}/mensajes`} className="relative hidden h-12 w-12 sm:grid place-items-center rounded-full border border-white/80 bg-white/60 backdrop-blur-md transition hover:bg-white/80"
            aria-label={`Mensajes${cuentas.mensajes ? `: ${cuentas.mensajes} sin leer` : ''}`}>
            <MessagesSquare className="h-5 w-5" aria-hidden />
            {cuentas.mensajes > 0 && <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#e43e43] px-1 text-[10px] font-bold text-white" aria-hidden>{cuentas.mensajes}</span>}
          </Link>
          <InterruptorTema className="h-12 w-12 shrink-0" />
          <Link to={`${BASE_APROBADOR}/notificaciones`} className="relative grid h-12 w-12 place-items-center rounded-full border border-white/80 bg-white/60 backdrop-blur-md transition hover:bg-white/80"
            aria-label={`Notificaciones${cuentas.avisos ? `: ${cuentas.avisos} sin leer` : ''}`}>
            <Bell className="h-5 w-5" aria-hidden />
            {cuentas.avisos > 0 && <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#e43e43] px-1 text-[10px] font-bold text-white" aria-hidden>{cuentas.avisos}</span>}
          </Link>
          <MenuUsuario nombre={usuario?.nombre ?? 'Aprobador'} foto={usuario?.foto} onSalir={salirDelPortal} />
        </div>
      </header>

      <main id="contenido" tabIndex={-1} className="px-4 pb-8 pt-4 focus:outline-none sm:px-6 lg:pl-0 lg:pr-8">
        <div className="mx-auto max-w-[1500px]"><Transicion clave={loc.pathname}><Outlet /></Transicion></div>
      </main>
    </div>
  );
}
