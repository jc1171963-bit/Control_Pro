/**
 * Cliente HTTP de la API de Control Pro.
 * - El access token vive solo en memoria (no en localStorage).
 * - El refresh token viaja en una cookie HttpOnly; al recargar o al vencer el access token se renueva solo.
 */
export type TipoSesion = 'cliente' | 'usuario';

export class ApiError extends Error {
  status: number;
  codigo: string;
  detalles?: unknown;
  constructor(status: number, codigo: string, mensaje: string, detalles?: unknown) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

/** Duraciones de la sesión calculadas por el servidor (S2.4): el navegador nunca recibe ni envía fechas. */
export type InfoSesion = { estado: 'activa'; restante_inactividad_ms: number; aviso_en_ms: number; restante_absoluto_ms: number };
/** Resultado de la última renovación: `rechazo` = 401 confirmado por el servidor; `red` = fallo transitorio;
 *  `otra_cuenta` = la cookie del navegador ya es de otra cuenta (se inició sesión en otra pestaña). */
export type ResultadoRenovacion = 'ok' | 'rechazo' | 'red' | 'otra_cuenta';

let accessToken: string | null = null;
let renovando: Promise<boolean> | null = null;
let pausada = false;
let motivoRechazo: string | null = null;
let antesDeRenovar: (() => Promise<void>) | null = null;
const oyentes = new Set<() => void>();
const oyentesInfo = new Set<(i: InfoSesion) => void>();
// Cuenta ("tipo|sub") del token que esta pestaña aplicó; la pausa no la borra. `epoca` sube al cambiar de cuenta: las
// respuestas que salieron antes ya no se entregan (no pueden repoblar la interfaz con datos de la cuenta anterior).
let identidad: string | null = null;
let epoca = 0;

/** Claims del JWT, sin verificar: solo para decidir en el navegador. La autoridad es siempre el servidor. */
function claims(token: string | null | undefined): Record<string, unknown> | null {
  const parte = token?.split('.')[1];
  if (!parte) return null;
  try {
    return JSON.parse(atob(parte.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

function identidadDe(token: string | null | undefined): string | null {
  const c = claims(token);
  return c && typeof c.tipo === 'string' && typeof c.sub === 'string' ? `${c.tipo}|${c.sub}` : null;
}

/** Recargar la página: única forma de garantizar que no queda en memoria nada de la cuenta anterior. */
export const navegador = { recargar: () => window.location.reload() };
let alCambiarIdentidad: () => void = () => navegador.recargar();

export const sesion = {
  token: () => accessToken,
  /** `sid` del access token en memoria, o null. Solo para saber si cambió la sesión: la autoridad es el servidor. */
  sid(): string | null {
    const sid = claims(accessToken)?.sid;
    return typeof sid === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sid) ? sid : null;
  },
  fijar(token: string | null) {
    accessToken = token;
    identidad = token ? identidadDe(token) : null; // inicio de sesión en esta pestaña, renovación o cierre
    oyentes.forEach((f) => f());
  },
  /** Qué hacer si una renovación trae otra cuenta (por omisión, recargar). Devuelve cómo deshacer el registro. */
  alCambiarIdentidad(f: () => void) {
    alCambiarIdentidad = f;
    return () => { alCambiarIdentidad = () => navegador.recargar(); };
  },
  alExpirar(f: () => void) {
    oyentes.add(f);
    return () => oyentes.delete(f);
  },
  /** Pausa local preventiva: esta pestaña deja de operar sin revocar la sesión ni avisar a las demás. */
  pausada: () => pausada,
  pausar() {
    pausada = true;
    accessToken = null; // sin notificar: la pestaña conserva la identidad mostrada mientras está en pausa
  },
  reanudar() {
    pausada = false;
  },
  /** Código del último 401 del refresh (p. ej. `sesion_inactiva`). */
  motivo: () => motivoRechazo,
  alInfo(f: (i: InfoSesion) => void) {
    oyentesInfo.add(f);
    return () => oyentesInfo.delete(f);
  },
  publicarInfo(i: InfoSesion | undefined) {
    if (i) oyentesInfo.forEach((f) => f(i));
  },
  /** El módulo de actividad reporta aquí la interacción pendiente antes de renovar. */
  fijarAntesDeRenovar(f: (() => Promise<void>) | null) {
    antesDeRenovar = f;
  },
};

function leerCookie(nombre: string) {
  return document.cookie.split('; ').find((c) => c.startsWith(nombre + '='))?.split('=')[1];
}

export function cabeceraCsrf(): Record<string, string> {
  const csrf = leerCookie('csrf_refresh_token');
  return csrf ? { 'X-CSRF-TOKEN': decodeURIComponent(csrf) } : {};
}

export let ultimoResultado: ResultadoRenovacion | null = null;

/** Renueva el access. En pausa no lo hace salvo `forzar` (solo la reanudación, tras consultar al servidor). */
export async function renovar(forzar = false): Promise<boolean> {
  if (pausada && !forzar) return false;
  if (!renovando) {
    renovando = (async () => {
      try {
        if (antesDeRenovar) await antesDeRenovar().catch(() => undefined);
        const r = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include', headers: cabeceraCsrf() });
        if (r.status === 401 || r.status === 403) {
          motivoRechazo = (await r.json().catch(() => ({})))?.error?.codigo ?? 'no_autenticado';
          ultimoResultado = 'rechazo';
          sesion.fijar(null);
          return false;
        }
        if (!r.ok) {
          ultimoResultado = 'red'; // 5xx o 429: transitorio, no cierra una sesión que puede seguir válida
          return false;
        }
        const d = await r.json();
        const nueva = identidadDe(d.access_token);
        if (identidad && nueva && nueva !== identidad) {
          // La cookie es de otra cuenta: su token NO se entrega a esta pestaña, que aún muestra datos de la anterior.
          // Sin token y sin avisar a los oyentes (no es un cierre: la sesión de la otra cuenta sigue viva).
          accessToken = null;
          epoca += 1;
          ultimoResultado = 'otra_cuenta';
          alCambiarIdentidad();
          return false;
        }
        motivoRechazo = null;
        ultimoResultado = 'ok';
        sesion.fijar(d.access_token);
        ultimaRenovacion = d;
        sesion.publicarInfo(d.sesion);
        return true;
      } catch {
        ultimoResultado = 'red';
        return false;
      } finally {
        setTimeout(() => (renovando = null), 0);
      }
    })();
  }
  return renovando;
}

export let ultimaRenovacion: { tipo: TipoSesion; cuenta: unknown; sesion?: InfoSesion } | null = null;

type Opciones = { metodo?: string; cuerpo?: unknown; form?: FormData; crudo?: boolean; reintento?: boolean };

export async function api<T = any>(ruta: string, op: Opciones = {}): Promise<T> {
  if (pausada) throw new ApiError(0, 'sesion_pausada', 'La sesión está en pausa en esta pestaña: sin conexión con el servidor.');
  const mia = epoca;
  const vigente = () => {
    if (mia !== epoca) throw new ApiError(0, 'otra_cuenta', 'La sesión de este navegador cambió de cuenta.');
  };
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (op.cuerpo !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(`/api${ruta}`, {
    method: op.metodo || (op.cuerpo !== undefined || op.form ? 'POST' : 'GET'),
    headers,
    credentials: 'include',
    body: op.form ?? (op.cuerpo !== undefined ? JSON.stringify(op.cuerpo) : undefined),
  });
  if (r.status === 401 && !op.reintento && !ruta.startsWith('/auth/')) {
    const cuerpo = await r.clone().json().catch(() => ({}));
    const renovable = ['token_expirado', 'no_autenticado', 'token_revocado', 'sesion_invalida', 'sesion_revocada', 'sesion_expirada',
      'sesion_inactiva'];
    if (renovable.includes(cuerpo?.error?.codigo) && (await renovar())) {
      return api<T>(ruta, { ...op, reintento: true });
    }
  }
  vigente();
  if (!r.ok) {
    const cuerpo = await r.json().catch(() => ({}));
    const e = cuerpo?.error || {};
    throw new ApiError(r.status, e.codigo || 'error', e.mensaje || `Error ${r.status}`, e.detalles);
  }
  if (op.crudo) return r as unknown as T;
  if (r.status === 204) return undefined as T;
  const datos = await r.json();
  vigente(); // una respuesta tardía de la cuenta anterior no se entrega
  return datos;
}

export const get = <T = any>(ruta: string) => api<T>(ruta);
export const post = <T = any>(ruta: string, cuerpo: unknown = {}) => api<T>(ruta, { cuerpo });
export const put = <T = any>(ruta: string, cuerpo: unknown = {}) => api<T>(ruta, { metodo: 'PUT', cuerpo });
export const patch = <T = any>(ruta: string, cuerpo: unknown = {}) => api<T>(ruta, { metodo: 'PATCH', cuerpo });
export const del = <T = any>(ruta: string) => api<T>(ruta, { metodo: 'DELETE' });

/** Descarga un archivo autenticado (CSV, Excel, PDF o comprobante). */
export async function descargar(ruta: string, nombre?: string) {
  const r = await api<Response>(ruta, { crudo: true });
  const blob = await r.blob();
  const disp = r.headers.get('Content-Disposition') || '';
  const sugerido = nombre || disp.match(/filename=([^;]+)/)?.[1] || 'archivo';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sugerido.replace(/"/g, '');
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function abrirPrivado(url: string) {
  const r = await api<Response>(url.replace(/^\/api/, ''), { crudo: true });
  const blob = await r.blob();
  window.open(URL.createObjectURL(blob), '_blank', 'noopener');
}

export async function subirArchivo(archivo: File, publico = false): Promise<string> {
  const form = new FormData();
  form.append('archivo', archivo);
  const r = await api<{ url: string }>(publico ? '/archivos/publicos' : '/archivos/privados', { form });
  return r.url;
}

export function claveIdempotencia(prefijo = 'op') {
  const aleatorio = crypto.getRandomValues(new Uint32Array(2));
  return `${prefijo}-${Date.now().toString(36)}-${aleatorio[0].toString(36)}${aleatorio[1].toString(36)}`;
}
