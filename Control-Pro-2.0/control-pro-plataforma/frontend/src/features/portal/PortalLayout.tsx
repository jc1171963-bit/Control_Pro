/**
 * Marco del portal de sucursales (identidad Salud Digna), independiente de la tienda LURIMA.
 * Navegación: drawer con foco atrapado por debajo de 1024 px, riel de íconos de 1024 a 1365 px y barra expandida desde
 * 1366 px. El usuario puede contraer o expandir la barra en escritorio y la elección se recuerda (solo comodidad).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, ChevronsLeft, ChevronsRight, ClipboardList, Home, Menu, PenLine, PlusCircle, Shirt, User, Users, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../app/auth';
import { useBorradores } from '../../app/borradores';
import { useContadorNotificaciones } from '../../app/notificaciones';
import { Transicion } from '../../components/movimiento';
import { useAtraparFoco } from '../../components/useAtraparFoco';
import { useMediaQuery } from '../../components/useMediaQuery';
import { cls } from '../../lib/formato';
import { ContextoCatalogoCtx } from '../tienda/contextoCatalogo';
import MarcaPortal from './MarcaPortal';
import { CONTEXTO_CATALOGO_PORTAL, RUTA_CATALOGO_PORTAL } from './rutas';

// "Catálogo" abre el catálogo dentro del portal (/cuenta/catalogo).
// "Dirección de entrega" vive dentro de "Mi cuenta"; /cuenta/direcciones redirige allí.
const ITEMS: [string, string, LucideIcon][] = [
  ['/cuenta', 'Inicio', Home], [RUTA_CATALOGO_PORTAL, 'Catálogo', Shirt], ['/cuenta/solicitudes/nueva', 'Crear solicitud', PlusCircle],
  ['/cuenta/pedidos', 'Solicitudes', ClipboardList], ['/cuenta/empleados', 'Empleados', Users], ['/cuenta/notificaciones', 'Notificaciones', Bell],
  ['/cuenta/perfil', 'Mi cuenta', User],
];

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
        className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-tinta-800 hover:bg-sd-50">
        <User className="h-5 w-5" aria-hidden /><span className="hidden max-w-[12rem] truncate sm:inline">{nombre}</span><span className="sr-only sm:hidden">{nombre}</span>
        <ChevronDown className="h-4 w-4" aria-hidden />
      </button>
      {abierto && (
        <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl bg-white p-1 shadow-lg ring-1 ring-tinta-100">
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
    <div className={cls('tema-sd min-h-screen bg-sd-bg text-tinta-900', rail ? 'lg:pl-[72px]' : 'lg:pl-64')}>
      <ScrollRestoration />
      <a href="#contenido" className="sr-only z-50 rounded-lg bg-white px-4 py-2 font-semibold text-sd-900 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Saltar al contenido</a>
      {drawerAbierto && <div className="fixed inset-0 z-30 bg-tinta-950/50 lg:hidden" onClick={cerrarMenu} aria-hidden />}

      <aside id="navegacion-portal" ref={panel}
        {...(drawerAbierto ? { role: 'dialog', 'aria-modal': true, 'aria-label': 'Menú de navegación' } : {})}
        className={cls('fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col bg-sd-900 text-white transition-transform duration-200 lg:visible lg:z-30 lg:max-w-none lg:translate-x-0',
          rail ? 'lg:w-[72px]' : 'lg:w-64', menu ? 'translate-x-0' : 'invisible -translate-x-full')}>
        <div className={cls('flex items-center justify-between px-4 py-4 lg:px-5 lg:py-5', rail && 'lg:justify-center lg:px-0')}>
          <MarcaPortal claro compacta={rail} />
          <button type="button" onClick={cerrarMenu} aria-label="Cerrar menú" className="grid h-11 w-11 place-items-center rounded-lg text-white hover:bg-sd-700 lg:hidden"><X className="h-5 w-5" aria-hidden /></button>
        </div>
        <p className="px-5 pb-2 text-xs text-white/70 lg:hidden">{cliente?.razon_social || cliente?.nombre}</p>
        <nav aria-label="Principal" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3">
          {ITEMS.map(([to, nombre, Icono]) => (
            <NavLink key={to} to={to} end={to === '/cuenta'} title={rail ? nombre : undefined}
              className={({ isActive }) => cls('relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition', rail && 'lg:justify-center lg:px-0',
                isActive ? 'bg-sd-500 text-white' : 'text-white/85 hover:bg-sd-700 hover:text-white')}>
              <Icono className="h-5 w-5 shrink-0" aria-hidden /><span className={cls(rail && 'lg:sr-only')}>{nombre}</span>
              {to === '/cuenta/notificaciones' && noLeidas > 0 && (
                <span className={cls('ml-auto rounded-full bg-coral-500 px-1.5 text-[11px] font-bold text-white', rail && 'lg:absolute lg:right-1.5 lg:top-1 lg:ml-0')} aria-label={`${noLeidas} sin leer`}>{noLeidas}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-white/10 p-3 lg:block">
          <button type="button" onClick={alternar} aria-expanded={!rail} aria-controls="navegacion-portal" title={rail ? 'Expandir menú' : undefined}
            className={cls('flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold text-white/85 hover:bg-sd-700 hover:text-white', rail && 'justify-center px-0')}>
            {rail ? <ChevronsRight className="h-5 w-5" aria-hidden /> : <ChevronsLeft className="h-5 w-5" aria-hidden />}
            <span className={cls(rail && 'sr-only')}>{rail ? 'Expandir menú' : 'Contraer menú'}</span>
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-tinta-100 bg-white px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <button ref={botonMenu} type="button" onClick={() => setMenu(true)} aria-label="Abrir menú" aria-expanded={drawerAbierto} aria-controls="navegacion-portal"
            className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-tinta-800 hover:bg-sd-50 lg:hidden"><Menu className="h-5 w-5" aria-hidden /></button>
          <div className="lg:hidden"><MarcaPortal minima /></div>
          <div className="hidden min-w-0 lg:block">
            <p className="text-xs text-tinta-500">Sucursal</p>
            <p className="truncate font-display font-bold text-tinta-900">{cliente?.razon_social || cliente?.nombre}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {enCurso && (
            <Link to={`/cuenta/solicitudes/${enCurso.id}/editar`} data-destino-solicitud
              aria-label={`Continuar la solicitud en curso ${enCurso.folio}: ${enCurso.articulos} artículo(s)${otrosBorradores ? `; hay ${otrosBorradores} borrador(es) más` : ''}`}
              className="mr-1 flex min-h-11 items-center gap-2 rounded-lg bg-sd-50 px-2.5 text-sm font-semibold text-sd-950 ring-1 ring-sd-100 hover:bg-sd-100 sm:px-3">
              <PenLine className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">En curso · {enCurso.folio}</span>
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-menta-500 px-1 text-[11px] font-bold text-white" aria-hidden>{enCurso.articulos}</span>
            </Link>
          )}
          <Link to="/cuenta/notificaciones" className="relative grid h-11 w-11 place-items-center rounded-lg text-tinta-700 hover:bg-sd-50" aria-label={`Notificaciones${noLeidas ? `: ${noLeidas} sin leer` : ''}`}>
            <Bell className="h-5 w-5" aria-hidden />
            {noLeidas > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-coral-500 px-1 text-[10px] font-bold text-white" aria-hidden>{noLeidas}</span>}
          </Link>
          <MenuUsuario nombre={cliente?.nombre ?? 'Mi cuenta'} onSalir={salirDelPortal} />
        </div>
      </header>

      <main id="contenido" tabIndex={-1} className="px-4 py-6 focus:outline-none sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl"><Transicion clave={loc.pathname}><ContextoCatalogoCtx.Provider value={CONTEXTO_CATALOGO_PORTAL}><Outlet /></ContextoCatalogoCtx.Provider></Transicion></div>
      </main>
    </div>
  );
}
