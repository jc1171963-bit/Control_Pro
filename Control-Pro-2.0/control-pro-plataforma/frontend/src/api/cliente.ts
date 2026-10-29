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

let accessToken: string | null = null;
let renovando: Promise<boolean> | null = null;
const oyentes = new Set<() => void>();

export const sesion = {
  token: () => accessToken,
  fijar(token: string | null) {
    accessToken = token;
    oyentes.forEach((f) => f());
  },
  alExpirar(f: () => void) {
    oyentes.add(f);
    return () => oyentes.delete(f);
  },
};

function leerCookie(nombre: string) {
  return document.cookie.split('; ').find((c) => c.startsWith(nombre + '='))?.split('=')[1];
}

export async function renovar(): Promise<boolean> {
  if (!renovando) {
    renovando = (async () => {
      try {
        const csrf = leerCookie('csrf_refresh_token');
        const r = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: csrf ? { 'X-CSRF-TOKEN': decodeURIComponent(csrf) } : {},
        });
        if (!r.ok) {
          sesion.fijar(null);
          return false;
        }
        const d = await r.json();
        sesion.fijar(d.access_token);
        ultimaRenovacion = d;
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => (renovando = null), 0);
      }
    })();
  }
  return renovando;
}

export let ultimaRenovacion: { tipo: TipoSesion; cuenta: unknown } | null = null;

type Opciones = { metodo?: string; cuerpo?: unknown; form?: FormData; crudo?: boolean; reintento?: boolean };

export async function api<T = any>(ruta: string, op: Opciones = {}): Promise<T> {
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
    if (['token_expirado', 'no_autenticado', 'token_revocado'].includes(cuerpo?.error?.codigo) && (await renovar())) {
      return api<T>(ruta, { ...op, reintento: true });
    }
  }
  if (!r.ok) {
    const cuerpo = await r.json().catch(() => ({}));
    const e = cuerpo?.error || {};
    throw new ApiError(r.status, e.codigo || 'error', e.mensaje || `Error ${r.status}`, e.detalles);
  }
  if (op.crudo) return r as unknown as T;
  if (r.status === 204) return undefined as T;
  return r.json();
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
