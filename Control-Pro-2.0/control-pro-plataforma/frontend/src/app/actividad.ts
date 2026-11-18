/**
 * Control de inactividad de la sesión (S2.4). El servidor es la autoridad; esta pestaña solo:
 * - mide la interacción humana con un reloj monótono (`performance.now()`) y la reporta como DURACIÓN (`inactivo_ms`);
 * - programa cuándo preguntar al servidor (aviso a los 28 min, límite a los 30) con duraciones que él mismo calcula;
 * - nunca toma una decisión global con su reloj local: solo un 401 del servidor o el usuario cierran la sesión en todas
 *   las pestañas. Sin red al llegar al límite, la pestaña se pausa sola (no revoca la sesión ni afecta a las demás).
 * Las consultas automáticas (polling, refetch) nunca cuentan como actividad: solo `pointerdown`, `keydown`, `wheel` y
 * `touchstart`.
 */
import { useSyncExternalStore } from 'react';
import { cabeceraCsrf, type InfoSesion, renovar, sesion, ultimaRenovacion, ultimoResultado } from '../api/cliente';

export type Fase = 'sin_sesion' | 'activa' | 'aviso' | 'pausada';
type Mensaje = { tipo: 'reportada'; sesion: InfoSesion } | { tipo: 'continuar' } | { tipo: 'cerrada'; motivo: string };
type Consulta = { tipo: 'ok'; info: InfoSesion } | { tipo: 'rechazo'; codigo: string } | { tipo: 'red' };
type Manejadores = {
  cierreGlobal: (motivo: string) => Promise<void> | void; // revocar en el servidor y limpiar esta pestaña
  cierreRemoto: (motivo: string) => void; // otra pestaña ya cerró: solo limpiar esta
  pausa: () => void;
  reanudado: (d: NonNullable<typeof ultimaRenovacion>) => void;
};

const EVENTOS_HUMANOS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
const REPORTE_ANTES_MS = 5 * 60_000; // la interacción pendiente llega al servidor antes de que nadie avise (minuto 25)
const REINTENTOS_MS = [1_000, 2_000, 4_000, 8_000];
const LLAVE_PAUSA = 'cp-sesion-pausada';
const LLAVE_EVENTO = 'cp-sesion-evento';

let fase: Fase = 'sin_sesion';
let info: InfoSesion | null = null;
let recibido = 0;
let ultimaInteraccion: number | null = null;
let pendiente = false;
let temporizadores: ReturnType<typeof setTimeout>[] = [];
let canal: BroadcastChannel | null = null;
let instalado = false;
let manejadores: Manejadores = { cierreGlobal: () => undefined, cierreRemoto: () => undefined, pausa: () => undefined, reanudado: () => undefined };
const suscriptores = new Set<() => void>();

const ahora = () => performance.now();
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const enSesion = () => fase === 'activa' || fase === 'aviso';

function fijarFase(f: Fase) {
  if (fase === f) return;
  fase = f;
  suscriptores.forEach((s) => s());
}

function leerPausa(): boolean {
  try { return sessionStorage.getItem(LLAVE_PAUSA) === '1'; } catch { return false; }
}
function guardarPausa(v: boolean) {
  try { if (v) sessionStorage.setItem(LLAVE_PAUSA, '1'); else sessionStorage.removeItem(LLAVE_PAUSA); } catch { /* sin almacenamiento */ }
}

// ---------------------------------------------------------------- tiempos (todo relativo a lo que dijo el servidor)

/** Milisegundos de inactividad que le quedan a la sesión según el último dato del servidor. */
export function restanteMs(): number {
  return info ? info.restante_inactividad_ms - (ahora() - recibido) : 0;
}

function limpiar() {
  temporizadores.forEach(clearTimeout);
  temporizadores = [];
}

function agendar(f: () => void, ms: number) {
  temporizadores.push(setTimeout(f, Math.max(0, ms)));
}

function programar() {
  limpiar();
  if (!info || !enSesion()) return;
  const r = restanteMs();
  agendar(() => { if (pendiente) void reportarConReintentos(); }, r - REPORTE_ANTES_MS);
  if (fase === 'activa') agendar(() => void alAviso(), info.aviso_en_ms - (ahora() - recibido));
  agendar(() => void alLimite(), Math.max(250, r)); // nunca en bucle cerrado si el servidor responde justo en la frontera
}

function actualizar(i: InfoSesion) {
  info = i;
  recibido = ahora();
  if (fase === 'aviso' && i.aviso_en_ms > 0) fijarFase('activa'); // otra pestaña o el usuario ya reportaron actividad
  programar();
}

// ---------------------------------------------------------------- red

async function codigoDe(r: Response) {
  return (await r.json().catch(() => ({})))?.error?.codigo ?? 'sesion_invalida';
}

async function consultar(): Promise<Consulta> {
  try {
    const r = await fetch('/api/auth/sesion', { credentials: 'include' });
    if (r.ok) return { tipo: 'ok', info: await r.json() };
    if (r.status === 401) return { tipo: 'rechazo', codigo: await codigoDe(r) };
    return { tipo: 'red' };
  } catch {
    return { tipo: 'red' };
  }
}

async function reportar(keepalive = false): Promise<'ok' | 'rechazo' | 'red'> {
  if (ultimaInteraccion === null) return 'ok';
  const marca = ultimaInteraccion;
  try {
    const r = await fetch('/api/auth/actividad', {
      method: 'POST', credentials: 'include', keepalive,
      headers: { 'Content-Type': 'application/json', ...cabeceraCsrf() },
      body: JSON.stringify({ inactivo_ms: Math.max(0, Math.round(ahora() - marca)) }),
    });
    if (r.ok) {
      const d = await r.json();
      if (ultimaInteraccion === marca) pendiente = false;
      actualizar(d.sesion);
      difundir({ tipo: 'reportada', sesion: d.sesion });
      return 'ok';
    }
    if (r.status === 401) {
      await cierreGlobal(await codigoDe(r));
      return 'rechazo';
    }
    if (r.status === 422) {
      pendiente = false;
      return 'ok';
    }
    return 'red';
  } catch {
    return 'red';
  }
}

async function reportarConReintentos() {
  for (const espera of [0, ...REINTENTOS_MS]) {
    if (espera) await dormir(espera);
    if (!enSesion() || restanteMs() <= 0) return;
    if ((await reportar()) !== 'red') return;
  }
}

// ---------------------------------------------------------------- decisiones (siempre confirmadas con el servidor)

async function alAviso() {
  if (fase !== 'activa') return;
  const c = await consultar();
  if (c.tipo === 'rechazo') return cierreGlobal(c.codigo);
  if (c.tipo === 'ok') {
    info = c.info;
    recibido = ahora();
    if (c.info.aviso_en_ms > 0) return programar(); // otra pestaña reportó: se reprograma, sin aviso
  }
  fijarFase('aviso'); // confirmado por el servidor, o sin red (dirección segura: avisar)
  programar();
}

async function alLimite() {
  if (!enSesion()) return;
  const c = await consultar();
  if (c.tipo === 'rechazo') return cierreGlobal(c.codigo);
  if (c.tipo === 'ok') return actualizar(c.info); // aún activa (p. ej. otra pestaña reportó): se reprograma
  pausar(); // sin poder confirmar: pausa local, nunca cierre global
}

function pausar() {
  limpiar();
  guardarPausa(true);
  sesion.pausar();
  fijarFase('pausada');
  manejadores.pausa();
}

/** Recupera una pestaña pausada solo si el servidor confirma la sesión y la renovación se completa. */
export async function reanudar(): Promise<'ok' | 'red' | 'rechazo'> {
  if (fase !== 'pausada') return 'ok';
  const c = await consultar();
  if (c.tipo === 'red') return 'red';
  if (c.tipo === 'rechazo') {
    await cierreGlobal(c.codigo);
    return 'rechazo';
  }
  const ok = await renovar(true);
  if (!ok) {
    if (ultimoResultado === 'rechazo') {
      await cierreGlobal(sesion.motivo() ?? 'sesion_invalida');
      return 'rechazo';
    }
    return 'red'; // sigue en pausa
  }
  sesion.reanudar();
  guardarPausa(false);
  fijarFase('activa');
  actualizar(ultimaRenovacion?.sesion ?? c.info);
  if (ultimaRenovacion) manejadores.reanudado(ultimaRenovacion);
  return 'ok';
}

/** Cierre global: lo pide el usuario o lo confirmó el servidor (401). Revoca y avisa a todas las pestañas. */
export async function cierreGlobal(motivo: string) {
  const habia = fase !== 'sin_sesion';
  detener();
  if (habia) difundir({ tipo: 'cerrada', motivo });
  await manejadores.cierreGlobal(motivo);
}

/** El token se perdió por un 401 confirmado (p. ej. refresh rechazado): se trata como cierre global. */
export function sesionPerdida(motivo: string | null) {
  if (fase !== 'sin_sesion' && fase !== 'pausada') void cierreGlobal(motivo ?? 'sesion_invalida');
}

export function continuar() {
  registrarInteraccion();
  fijarFase('activa');
  difundir({ tipo: 'continuar' });
  void reportarConReintentos();
}

// ---------------------------------------------------------------- ciclo de vida

export function iniciar(i: InfoSesion | undefined) {
  if (!i || fase === 'pausada') return;
  fijarFase('activa');
  actualizar(i);
}

export function detener() {
  limpiar();
  info = null;
  pendiente = false;
  ultimaInteraccion = null;
  guardarPausa(false);
  sesion.reanudar();
  fijarFase('sin_sesion');
}

function registrarInteraccion() {
  if (!enSesion()) return;
  ultimaInteraccion = ahora();
  pendiente = true;
}

// ---------------------------------------------------------------- coordinación entre pestañas (sin horas)

function difundir(m: Mensaje) {
  if (canal) {
    canal.postMessage(m);
    return;
  }
  try { localStorage.setItem(LLAVE_EVENTO, JSON.stringify({ ...m, n: Math.random() })); } catch { /* sin almacenamiento */ }
}

function recibir(m: Mensaje) {
  if (m.tipo === 'cerrada') {
    if (fase === 'sin_sesion') return;
    detener();
    manejadores.cierreRemoto(m.motivo);
  } else if (m.tipo === 'reportada' && enSesion()) {
    actualizar(m.sesion);
  } else if (m.tipo === 'continuar' && fase === 'aviso') {
    fijarFase('activa');
    programar();
  }
}

function alVisibilidad() {
  if (document.visibilityState === 'hidden') {
    if (pendiente && enSesion()) void reportar(true);
    return;
  }
  if (!enSesion()) return;
  void consultar().then((c) => { // resincroniza; volver a la pestaña no cuenta como actividad
    if (c.tipo === 'ok') actualizar(c.info);
    else if (c.tipo === 'rechazo') void cierreGlobal(c.codigo);
  });
}

export function configurar(m: Partial<Manejadores>) {
  manejadores = { ...manejadores, ...m };
}

let quitarOyentes: (() => void)[] = [];

function escuchar(objetivo: Window | Document, evento: string, f: (e: any) => void, opciones?: AddEventListenerOptions) {
  objetivo.addEventListener(evento, f, opciones);
  quitarOyentes.push(() => objetivo.removeEventListener(evento, f, opciones));
}

export function instalar() {
  if (instalado) return;
  instalado = true;
  if (leerPausa()) {
    sesion.pausar();
    fijarFase('pausada'); // notifica: la interfaz ya pudo dibujarse con la fase anterior y debe mostrar la pausa
  }
  EVENTOS_HUMANOS.forEach((e) => escuchar(window, e, registrarInteraccion, { capture: true, passive: true }));
  escuchar(document, 'visibilitychange', alVisibilidad);
  escuchar(window, 'pagehide', () => { if (pendiente && enSesion()) void reportar(true); });
  escuchar(window, 'online', () => { if (fase === 'pausada') void reanudar(); });
  try {
    canal = typeof BroadcastChannel === 'function' ? new BroadcastChannel('cp-sesion') : null;
  } catch {
    canal = null;
  }
  if (canal) canal.onmessage = (e) => recibir(e.data as Mensaje);
  else escuchar(window, 'storage', (e: StorageEvent) => {
    if (e.key !== LLAVE_EVENTO || !e.newValue) return;
    try { recibir(JSON.parse(e.newValue)); } catch { /* mensaje ilegible */ }
  });
  quitarOyentes.push(sesion.alInfo((i) => { if (enSesion()) actualizar(i); }) as () => void);
  sesion.fijarAntesDeRenovar(async () => { if (pendiente && enSesion()) await reportar(); });
}

/** Solo para pruebas: retira todas las escuchas y vuelve al estado inicial. */
export function _desinstalar() {
  limpiar();
  quitarOyentes.forEach((q) => q());
  quitarOyentes = [];
  canal?.close();
  canal = null;
  instalado = false;
  info = null;
  pendiente = false;
  ultimaInteraccion = null;
  fase = 'sin_sesion';
  sesion.fijarAntesDeRenovar(null);
}

// ---------------------------------------------------------------- React

export const obtenerFase = () => fase;
export function suscribir(f: () => void) {
  suscriptores.add(f);
  return () => { suscriptores.delete(f); };
}
export function useFaseSesion(): Fase {
  return useSyncExternalStore(suscribir, obtenerFase, obtenerFase);
}

/** Solo para pruebas: estado interno observable. */
export const _interno = { pendiente: () => pendiente, info: () => info };
