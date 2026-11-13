/**
 * Marco del portal de sucursales (identidad Salud Digna), independiente de la tienda LURIMA.
 * Navegación: drawer con foco atrapado por debajo de 1024 px, riel de íconos de 1024 a 1365 px y barra expandida desde
 * 1366 px. El usuario puede contraer o expandir la barra en escritorio y la elección se recuerda (solo comodidad).
 */
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Bell, Building2, ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, ClipboardList, Heart, Home, Menu, PenLine, PlusCircle, Search, Shirt, User, Users, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../app/auth';
import { useBorradores } from '../../app/borradores';
import { useContadorNotificaciones } from '../../app/notificaciones';
import { Transicion } from '../../components/movimiento';
import { useAtraparFoco } from '../../components/useAtraparFoco';
import { useMediaQuery } from '../../components/useMediaQuery';
import { cls } from '../../lib/formato';
import { ContextoCatalogoCtx } from '../tienda/contextoCatalogo';
import FondoPortal from './FondoPortal';
import MarcaPortal from './MarcaPortal';
import { CONTEXTO_CATALOGO_PORTAL, RUTA_CATALOGO_PORTAL } from './rutas';

// "Catálogo" abre el catálogo dentro del portal (/cuenta/catalogo).
// "Dirección de entrega" vive dentro de "Mi cuenta"; /cuenta/direcciones redirige allí.
const ITEMS: [string, string, LucideIcon][] = [
  ['/cuenta', 'Inicio', Home], [RUTA_CATALOGO_PORTAL, 'Catálogo', Shirt], ['/cuenta/solicitudes/nueva', 'Crear solicitud', PlusCircle],
  ['/cuenta/pedidos', 'Solicitudes', ClipboardList], ['/cuenta/empleados', 'Empleados', Users], ['/cuenta/notificaciones', 'Notificaciones', Bell],
  ['/cuenta/perfil', 'Mi cuenta', User],
];

const iniciales = (s?: string | null) => (s ?? '').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '·';

type Preferencia = 'contraido' | 'expandido';
const CLAVE_PREFERENCIA = 'portal-menu';
const leerPreferencia = (): Preferencia | null => {
  try { const v = localStorage.getItem(CLAVE_PREFERENCIA); return v === 'contraido' || v === 'expandido' ? v : null; } catch { return null; }
};
const guardarPreferencia = (v: Preferencia) => { try { localStorage.setItem(CLAVE_PREFERENCIA, v); } catch { /* sin almacenamiento: solo se pierde la comodidad */ } };

function MenuUsuario({ nombre, onSalir }: { nombre: string; onSalir: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAbierto(false); boton.current?.focus(); } };
    const fuera = (e: MouseEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false); };
    window.addEventListener('keydown', tecla);
    document.addEventListener('mousedown', fuera);
    return () => { window.removeEventListener('keydown', tecla); document.removeEventListener('mousedown', fuera); };
  }, [abierto]);
  const opcion = 'flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold text-tinta-800 hover:bg-sd-50';
  return (
    <div ref={raiz} className="relative">
      <button ref={boton} type="button" onClick={() => setAbierto(!abierto)} aria-expanded={abierto} aria-haspopup="true"
        className="flex min-h-12 items-center gap-2 rounded-full border border-white/80 bg-white/60 px-3 text-sm font-semibold text-[#102a31] backdrop-blur-md transition hover:bg-white/80">
        <User className="h-5 w-5" aria-hidden /><span className="hidden max-w-[12rem] truncate sm:inline">{nombre}</span><span className="sr-only sm:hidden">{nombre}</span>
        <ChevronDown className="h-4 w-4" aria-hidden />
      </button>
      {abierto && (
        <div className="absolute right-0 z-30 mt-2 w-56 rounded-2xl border border-white/80 bg-white/90 p-1 shadow-[0_18px_55px_rgba(25,91,87,.18)] backdrop-blur-xl">
          <Link to="/cuenta/perfil" onClick={() => setAbierto(false)} className={opcion}>Mi cuenta</Link>
          <button type="button" onClick={onSalir} className={cls(opcion, 'text-coral-600 hover:bg-coral-50')}>Cerrar sesión</button>
        </div>
      )}
    </div>
  );
}

export default function PortalLayout() {
  const { cliente, salir } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const noLeidas = useContadorNotificaciones().data?.no_leidas ?? 0;
  // "Solicitud en curso": el borrador más reciente (no es un carrito: no hay importes ni pago).
  const borradores = useBorradores().data;
  const enCurso = borradores?.items?.[0];
  const otrosBorradores = Math.max(0, (borradores?.total ?? 0) - 1);
  const salirDelPortal = async () => { await salir(); nav('/', { replace: true }); };
  const nombreSucursal = cliente?.razon_social || cliente?.nombre;

  // Buscador del encabezado: lleva al catálogo del portal. Ctrl + K lo enfoca.
  const [q, setQ] = useState('');
  const buscador = useRef<HTMLInputElement>(null);
  const buscar = (e: FormEvent) => { e.preventDefault(); nav(`${RUTA_CATALOGO_PORTAL}${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`); };
  useEffect(() => {
    const atajo = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); buscador.current?.focus(); } };
    window.addEventListener('keydown', atajo);
    return () => window.removeEventListener('keydown', atajo);
  }, []);

  const escritorio = useMediaQuery('(min-width: 1024px)');
  const ancho = useMediaQuery('(min-width: 1366px)');
  const [preferencia, setPreferencia] = useState<Preferencia | null>(leerPreferencia);
  const rail = preferencia ? preferencia === 'contraido' : !ancho;
  const alternar = () => { const nueva: Preferencia = rail ? 'expandido' : 'contraido'; setPreferencia(nueva); guardarPreferencia(nueva); };

  const [menu, setMenu] = useState(false);
  const drawerAbierto = menu && !escritorio;
  const panel = useRef<HTMLElement>(null);
  const cerrarMenu = useCallback(() => setMenu(false), []);
  const botonMenu = useRef<HTMLButtonElement>(null);
  useAtraparFoco(panel, drawerAbierto, cerrarMenu, botonMenu);
  useEffect(() => setMenu(false), [loc.pathname]);
  useEffect(() => { if (escritorio) setMenu(false); }, [escritorio]);
  useEffect(() => {
    if (!drawerAbierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previo; };
  }, [drawerAbierto]);

  return (
    <div className={cls('tema-sd relative isolate min-h-screen bg-[#d9eee9] text-[#102a31]', rail ? 'lg:pl-[120px]' : 'lg:pl-[304px]')}>
      <ScrollRestoration />
      <FondoPortal />
      <a href="#contenido" className="sr-only z-50 rounded-lg bg-white px-4 py-2 font-semibold text-sd-900 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Saltar al contenido</a>
      {drawerAbierto && <div className="fixed inset-0 z-30 bg-[#092f2b]/40 backdrop-blur-sm lg:hidden" onClick={cerrarMenu} aria-hidden />}

      {/* Barra lateral de cristal: en escritorio flota separada de los bordes; en móvil es un drawer. */}
      <aside id="navegacion-portal" ref={panel}
        {...(drawerAbierto ? { role: 'dialog', 'aria-modal': true, 'aria-label': 'Menú de navegación' } : {})}
        className={cls('fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col bg-white/90 text-[#142d32] shadow-[0_18px_55px_rgba(25,91,87,.13)] backdrop-blur-2xl transition-[transform,width] duration-200',
          'lg:visible lg:inset-y-6 lg:left-6 lg:z-30 lg:max-w-none lg:translate-x-0 lg:rounded-[28px] lg:border lg:border-white/80 lg:bg-white/50',
          rail ? 'lg:w-[72px]' : 'lg:w-64', menu ? 'translate-x-0' : 'invisible -translate-x-full')}>
        <div className={cls('flex min-h-16 items-center justify-between px-4 pt-2 lg:px-5 lg:pt-5', rail && 'lg:hidden')}>
          <MarcaPortal />
          <button type="button" onClick={cerrarMenu} aria-label="Cerrar menú" className="grid h-11 w-11 place-items-center rounded-full text-tinta-700 hover:bg-white/70 lg:hidden"><X className="h-5 w-5" aria-hidden /></button>
        </div>
        {/* Sucursal activa (tarjeta del archivo de diseño). Con la barra contraída se nombra en el encabezado. */}
        <div className={cls('mx-3 mb-4 mt-4 flex items-center gap-2.5 rounded-[18px] bg-white/65 p-3 text-xs font-bold', rail && 'lg:hidden')}>
          <Building2 className="h-5 w-5 shrink-0 text-[#0b9b6d]" aria-hidden />
          <span className="min-w-0"><span className="block truncate font-display text-[13px] text-[#102a31]">{nombreSucursal}</span><span className="mt-0.5 block font-medium text-[#71858b]">Sucursal</span></span>
        </div>
        <div className={cls('hidden lg:block', rail ? 'h-5' : 'h-0')} aria-hidden />
        <p className={cls('px-6 pb-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#71858b]', rail && 'lg:sr-only')}>Menú</p>
        <nav aria-label="Principal" className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 pb-3">
          {ITEMS.map(([to, nombre, Icono]) => (
            <NavLink key={to} to={to} end={to === '/cuenta'} title={rail ? nombre : undefined}
              className={({ isActive }) => cls('relative flex min-h-12 items-center gap-3 rounded-[17px] px-3.5 text-sm font-semibold transition duration-200', rail && 'lg:justify-center lg:px-0',
                isActive ? 'bg-gradient-to-r from-[#00754f] via-[#009b6b] to-[#70e8bf] text-white shadow-[0_8px_24px_#0b9d6b55,inset_0_1px_1px_#ffffffa6]' : 'text-[#142d32] hover:translate-x-0.5 hover:bg-white/60')}>
              {({ isActive }) => (
                <>
                  <Icono className="h-5 w-5 shrink-0" aria-hidden /><span className={cls(rail && 'lg:sr-only')}>{nombre}</span>
                  {to === '/cuenta/notificaciones' && noLeidas > 0 ? (
                    <span className={cls('ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-[#f04444] px-1 text-[10px] font-bold text-white', rail && 'lg:absolute lg:right-1.5 lg:top-1 lg:ml-0')} aria-label={`${noLeidas} sin leer`}>{noLeidas}</span>
                  ) : isActive && <ChevronRight className={cls('ml-auto h-4 w-4', rail && 'lg:hidden')} aria-hidden />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        {/* Tarjeta institucional y perfil (decorativos, sin acciones: cerrar sesión vive en el menú de usuario). */}
        <div className={cls('mx-3 mt-2 rounded-[22px] bg-gradient-to-br from-[#d8f7e9cc] to-[#a8e6d4aa] p-4 text-[13px] font-bold leading-snug', rail && 'lg:hidden')}>
          <Heart className="mb-2 h-5 w-5 text-[#0b9b6d]" aria-hidden />
          Juntos por una<br />mejor salud
          <ArrowRight className="ml-auto mt-1 h-5 w-5" aria-hidden />
        </div>
        <div className={cls('mx-3 mt-3 flex items-center gap-2.5 rounded-[20px] border border-white/80 bg-white/60 p-3 text-xs font-bold', rail && 'lg:hidden')}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#183d42] to-[#b9d8c8] text-sm text-white" aria-hidden>{iniciales(cliente?.nombre || nombreSucursal)}</span>
          <span className="min-w-0"><span className="block truncate">{cliente?.nombre}</span><span className="mt-0.5 block truncate font-medium text-[#71858b]">Contacto de la sucursal</span></span>
        </div>
        <div className="hidden p-3 lg:block">
          <button type="button" onClick={alternar} aria-expanded={!rail} aria-controls="navegacion-portal" title={rail ? 'Expandir menú' : undefined}
            className={cls('flex min-h-11 w-full items-center gap-3 rounded-[17px] px-3 text-sm font-semibold text-[#52636a] hover:bg-white/60 hover:text-[#102a31]', rail && 'justify-center px-0')}>
            {rail ? <ChevronsRight className="h-5 w-5" aria-hidden /> : <ChevronsLeft className="h-5 w-5" aria-hidden />}
            <span className={cls(rail && 'sr-only')}>{rail ? 'Expandir menú' : 'Contraer menú'}</span>
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex min-h-[70px] items-center gap-3 px-4 py-2.5 backdrop-blur-md sm:px-6 lg:mt-3 lg:pl-0 lg:pr-8 lg:backdrop-blur-none">
        <button ref={botonMenu} type="button" onClick={() => setMenu(true)} aria-label="Abrir menú" aria-expanded={drawerAbierto} aria-controls="navegacion-portal"
          className="-ml-1 grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/80 bg-white/60 text-tinta-800 backdrop-blur-md lg:hidden"><Menu className="h-5 w-5" aria-hidden /></button>
        {/* El logotipo vive en la barra lateral; en móvil y con la barra contraída pasa al encabezado. */}
        <div className={cls('shrink-0', !rail && 'lg:hidden')}><MarcaPortal minima /></div>
        <div className={cls('hidden min-w-0 shrink-0 border-l border-white/80 pl-4', rail && 'lg:block')}>
          <p className="text-xs text-[#71858b]">Portal empresarial</p>
          <p className="max-w-[14rem] truncate font-display font-bold">{nombreSucursal}</p>
        </div>
        <form role="search" onSubmit={buscar}
          className="hidden h-12 max-w-[560px] flex-1 items-center gap-3 rounded-[18px] border border-white/80 bg-white/55 px-4 backdrop-blur-xl focus-within:ring-2 focus-within:ring-menta-400 md:flex">
          <Search className="h-5 w-5 shrink-0 text-[#52636a]" aria-hidden />
          <input ref={buscador} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar productos en el catálogo..." aria-label="Buscar productos en el catálogo"
            className="w-full border-0 bg-transparent p-0 text-sm text-[#102a31] focus:outline-none focus:ring-0" />
          <kbd className="hidden whitespace-nowrap font-sans text-[10px] text-[#71858b] lg:inline">Ctrl + K</kbd>
        </form>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {enCurso && (
            <Link to={`/cuenta/solicitudes/${enCurso.id}/editar`} data-destino-solicitud
              aria-label={`Continuar la solicitud en curso ${enCurso.folio}: ${enCurso.articulos} artículo(s)${otrosBorradores ? `; hay ${otrosBorradores} borrador(es) más` : ''}`}
              className="flex min-h-12 items-center gap-2 rounded-full border border-white/80 bg-white/60 px-3 text-sm font-semibold text-sd-950 backdrop-blur-md transition hover:bg-white/80 sm:px-4">
              <PenLine className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">En curso · {enCurso.folio}</span>
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-menta-500 px-1 text-[11px] font-bold text-white" aria-hidden>{enCurso.articulos}</span>
            </Link>
          )}
          <Link to="/cuenta/notificaciones" className="relative grid h-12 w-12 place-items-center rounded-full border border-white/80 bg-white/60 text-[#102a31] backdrop-blur-md transition hover:bg-white/80" aria-label={`Notificaciones${noLeidas ? `: ${noLeidas} sin leer` : ''}`}>
            <Bell className="h-5 w-5" aria-hidden />
            {noLeidas > 0 && <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#e43e43] px-1 text-[10px] font-bold text-white" aria-hidden>{noLeidas}</span>}
          </Link>
          <span className="hidden min-h-12 items-center gap-2.5 rounded-full border border-white/80 bg-white/60 px-4 text-[13px] font-semibold backdrop-blur-md xl:flex">
            <i className="h-2.5 w-2.5 rounded-full bg-[#08a86d] shadow-[0_0_0_5px_#08a86d1c]" aria-hidden />En línea
          </span>
          <MenuUsuario nombre={cliente?.nombre ?? 'Mi cuenta'} onSalir={salirDelPortal} />
        </div>
      </header>

      <main id="contenido" tabIndex={-1} className="px-4 pb-8 pt-4 focus:outline-none sm:px-6 lg:pl-0 lg:pr-8">
        <div className="mx-auto max-w-[1500px]"><Transicion clave={loc.pathname}><ContextoCatalogoCtx.Provider value={CONTEXTO_CATALOGO_PORTAL}><Outlet /></ContextoCatalogoCtx.Provider></Transicion></div>
      </main>
    </div>
  );
}
