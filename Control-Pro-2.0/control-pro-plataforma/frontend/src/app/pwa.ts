/**
 * App instalable (PWA) y notificaciones push en este dispositivo.
 *
 * - `registrarServiceWorker()` se llama una vez al arrancar (main.tsx).
 * - `usePush()`: estado y acciones de los avisos push de la cuenta con sesión (activar, desactivar, probar).
 * - `useInstalarApp()`: ofrece "Instalar app" cuando el navegador lo permite; en iPhone/iPad explica cómo hacerlo.
 * - `olvidarDispositivo()`: al cerrar sesión, el dispositivo deja de recibir avisos de esa cuenta.
 *
 * El estado se comparte entre todos los componentes que usan los hooks (menú de usuario, página de notificaciones).
 */
import { useEffect, useSyncExternalStore } from 'react';
import { api, get, post, sesion } from '../api/cliente';

// ---------- pequeño almacén compartido ----------
type EstadoPwa = {
  permiso: NotificationPermission | 'no-soportado';
  activo: boolean | null; // null = todavía no se sabe
  ocupado: boolean;
  instalable: boolean;
  instalada: boolean;
};
let estado: EstadoPwa = {
  permiso: typeof Notification === 'undefined' ? 'no-soportado' : Notification.permission,
  activo: null, ocupado: false, instalable: false,
  instalada: typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true),
};
const oyentes = new Set<() => void>();
const fijar = (cambios: Partial<EstadoPwa>) => { estado = { ...estado, ...cambios }; oyentes.forEach((f) => f()); };
const suscribirse = (f: () => void) => { oyentes.add(f); return () => { oyentes.delete(f); }; };
const useEstado = () => useSyncExternalStore(suscribirse, () => estado, () => estado);

// ---------- capacidades del navegador ----------
export const pushSoportado = () =>
  typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';
export const esIOS = () => typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

// ---------- instalación ----------
type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let eventoInstalar: EventoInstalar | null = null;
if (typeof window !== 'undefined') {
  // Se escucha desde que carga el módulo: el navegador puede ofrecer la instalación antes de que React monte.
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); eventoInstalar = e as EventoInstalar; fijar({ instalable: true }); });
  window.addEventListener('appinstalled', () => { eventoInstalar = null; fijar({ instalable: false, instalada: true }); });
}

export function useInstalarApp() {
  const e = useEstado();
  return {
    /** El navegador puede instalarla con un clic (Chrome, Edge, Android). */
    disponible: e.instalable && !e.instalada,
    instalada: e.instalada,
    /** iPhone/iPad: se instala desde Compartir → "Agregar a inicio". */
    soloManual: !e.instalada && !e.instalable && esIOS(),
    async instalar() {
      if (!eventoInstalar) return false;
      await eventoInstalar.prompt();
      const { outcome } = await eventoInstalar.userChoice;
      eventoInstalar = null;
      fijar({ instalable: false, instalada: outcome === 'accepted' || estado.instalada });
      return outcome === 'accepted';
    },
  };
}

// ---------- service worker ----------
export function registrarServiceWorker(navegar: (ruta: string) => void) {
  if (typeof window === 'undefined') return;
  // Instalada, la ventana de la app lleva el nombre de la distribuidora.
  if (estado.instalada) document.title = 'LURIMA · Uniformes';
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  // Al tocar un aviso con la app abierta, el service worker pide navegar sin recargar.
  navigator.serviceWorker.addEventListener('message', (ev) => {
    if (ev.data?.tipo !== 'navegar') return;
    const u = new URL(ev.data.url, location.origin);
    if (u.origin === location.origin) navegar(u.pathname + u.search + u.hash);
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(() => revisarSuscripcion())
      .catch(() => undefined); // sin service worker la app funciona igual (solo sin instalación ni avisos)
  });
}

// ---------- push ----------
const claveAplicacion = (base64: string) => {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
  const bin = atob((base64 + relleno).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function suscripcionActual() {
  if (!pushSoportado()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

let cuentaActual = '';
let ultimaSincronizada = '';
/** Revisa si este dispositivo ya recibe avisos y, si hay sesión, asocia la suscripción a la cuenta actual
 *  (`cuenta` = "tipo:id"; el mismo navegador puede pasar de una cuenta a otra). */
export async function revisarSuscripcion(cuenta?: string) {
  if (cuenta !== undefined) cuentaActual = cuenta;
  if (!pushSoportado()) { fijar({ activo: false, permiso: 'no-soportado' }); return; }
  try {
    const sub = await suscripcionActual();
    fijar({ permiso: Notification.permission, activo: !!sub && Notification.permission === 'granted' });
    if (sub && cuentaActual && sesion.token() && Notification.permission === 'granted' && ultimaSincronizada !== cuentaActual) {
      ultimaSincronizada = cuentaActual;
      await post('/push/suscripcion', sub.toJSON());
    }
  } catch { /* se reintenta en la próxima revisión */ }
}

async function activar(): Promise<'ok' | 'denegado' | 'error'> {
  if (!pushSoportado()) return 'error';
  fijar({ ocupado: true });
  try {
    const permiso = await Notification.requestPermission();
    fijar({ permiso });
    if (permiso !== 'granted') return 'denegado';
    const reg = await navigator.serviceWorker.ready;
    const { clave } = await get<{ clave: string }>('/push/clave');
    const opciones = { userVisibleOnly: true, applicationServerKey: claveAplicacion(clave) };
    let sub = await reg.pushManager.getSubscription();
    try {
      sub = sub ?? (await reg.pushManager.subscribe(opciones));
    } catch {
      // La suscripción previa era de otra clave del servidor: se renueva.
      await sub?.unsubscribe();
      sub = await reg.pushManager.subscribe(opciones);
    }
    await post('/push/suscripcion', sub.toJSON());
    ultimaSincronizada = cuentaActual;
    fijar({ activo: true });
    return 'ok';
  } catch {
    return 'error';
  } finally {
    fijar({ ocupado: false });
  }
}

async function desactivar() {
  fijar({ ocupado: true });
  try { await olvidarDispositivo(); } finally { fijar({ ocupado: false, activo: false }); }
}

/** El dispositivo deja de recibir avisos (en el servidor y en el navegador). Nunca bloquea el cierre de sesión. */
export async function olvidarDispositivo() {
  try {
    const sub = await suscripcionActual();
    if (!sub) return;
    const limite = new Promise((r) => setTimeout(r, 2500));
    await Promise.race([api('/push/suscripcion', { metodo: 'DELETE', cuerpo: { endpoint: sub.endpoint } }).catch(() => undefined), limite]);
    await sub.unsubscribe();
    ultimaSincronizada = '';
    cuentaActual = '';
    fijar({ activo: false });
  } catch { /* sin conexión: el servidor la limpiará cuando el servicio push la rechace */ }
}

export function usePush() {
  const e = useEstado();
  useEffect(() => { if (e.activo === null) revisarSuscripcion(); }, [e.activo]);
  return {
    soportado: e.permiso !== 'no-soportado',
    /** En iPhone/iPad los avisos solo funcionan con la app instalada en la pantalla de inicio. */
    requiereInstalar: !pushSoportado() && esIOS() && !e.instalada,
    permiso: e.permiso,
    activo: !!e.activo,
    ocupado: e.ocupado,
    activar,
    desactivar,
    probar: () => post<{ dispositivos: number }>('/push/prueba'),
  };
}
