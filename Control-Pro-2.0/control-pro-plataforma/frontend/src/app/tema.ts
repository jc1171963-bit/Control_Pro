/**
 * Modo claro / oscuro de los paneles (sucursales, aprobador y distribuidora).
 *
 * - La preferencia se guarda por navegador. Sin preferencia guardada se sigue la del sistema operativo.
 * - Solo los layouts de los paneles aplican la clase `oscuro` en <html> (useAplicarTema) y la quitan al salir: la tienda
 *   pública y las pantallas de acceso conservan su diseño claro.
 * - Al cambiar, el nuevo tema se revela en un círculo que crece desde el botón (View Transitions, si el navegador la tiene
 *   y no se pidió reducir movimiento); si no, cambia con una transición suave de colores.
 */
import { useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

export type Tema = 'claro' | 'oscuro';
const CLAVE = 'cp-tema';
const COLOR_BARRA: Record<Tema, string> = { claro: '#0F2238', oscuro: '#0b1420' };

const sistemaOscuro = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
function leerGuardado(): Tema | null {
  try { const v = localStorage.getItem(CLAVE); return v === 'claro' || v === 'oscuro' ? v : null; } catch { return null; }
}

let tema: Tema = leerGuardado() ?? (sistemaOscuro() ? 'oscuro' : 'claro');
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());
const suscribir = (f: () => void) => { oyentes.add(f); return () => { oyentes.delete(f); }; };

if (typeof window !== 'undefined') {
  // Si la persona nunca eligió, el panel acompaña los cambios del sistema (p. ej. modo oscuro automático al anochecer).
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', (e) => {
    if (leerGuardado()) return;
    tema = e.matches ? 'oscuro' : 'claro';
    avisar();
  });
}

/** Deja de recordar una elección y acompaña al sistema operativo. */
function seguirSistema() {
  try { localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ }
  tema = sistemaOscuro() ? 'oscuro' : 'claro';
  avisar();
}

function fijar(nuevo: Tema) {
  tema = nuevo;
  try { localStorage.setItem(CLAVE, nuevo); } catch { /* sin almacenamiento: dura mientras la página esté abierta */ }
  avisar();
}

const reducir = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Cambia de tema; con `origen` (el botón) el nuevo tema se revela desde ahí. */
function alternar(origen?: HTMLElement | null) {
  const nuevo: Tema = tema === 'oscuro' ? 'claro' : 'oscuro';
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  if (!doc.startViewTransition || reducir()) {
    const html = document.documentElement;
    html.classList.add('tema-cambiando');
    fijar(nuevo);
    window.setTimeout(() => html.classList.remove('tema-cambiando'), 350);
    return;
  }
  const r = origen?.getBoundingClientRect();
  const x = r ? r.left + r.width / 2 : window.innerWidth - 40;
  const y = r ? r.top + r.height / 2 : 40;
  const radio = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const t = doc.startViewTransition(() => { flushSync(() => fijar(nuevo)); });
  t.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radio}px at ${x}px ${y}px)`] },
      { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)', pseudoElement: '::view-transition-new(root)' },
    );
  }).catch(() => undefined);
}

export function useTema() {
  const actual = useSyncExternalStore(suscribir, () => tema, () => tema);
  const preferencia: Tema | 'sistema' = leerGuardado() ?? 'sistema';
  return { tema: actual, oscuro: actual === 'oscuro', preferencia, alternar, fijar, seguirSistema };
}

/** Lo llaman los layouts de los paneles: aplica el tema mientras el panel está en pantalla. */
export function useAplicarTema() {
  const { tema: actual } = useTema();
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.classList.toggle('oscuro', actual === 'oscuro');
    const meta = document.querySelector('meta[name="theme-color"]');
    const previo = meta?.getAttribute('content');
    meta?.setAttribute('content', COLOR_BARRA[actual]);
    return () => { html.classList.remove('oscuro'); if (meta && previo) meta.setAttribute('content', previo); };
  }, [actual]);
  // Otra pestaña del mismo navegador cambió el tema: se sincroniza.
  useEffect(() => {
    const cambio = (e: StorageEvent) => { if (e.key === CLAVE && (e.newValue === 'claro' || e.newValue === 'oscuro')) { tema = e.newValue; avisar(); } };
    window.addEventListener('storage', cambio);
    return () => window.removeEventListener('storage', cambio);
  }, []);
}
