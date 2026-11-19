/**
 * H1.9 (H-14): si una renovación devuelve OTRA cuenta (la cookie del navegador cambió porque se inició sesión en otra
 * pestaña), esta pestaña no recibe ese token ni entrega respuestas pendientes de la cuenta anterior: vacía la caché y se
 * recarga. Una renovación de la misma cuenta sigue igual. Cliente de API real; solo fetch y BroadcastChannel simulados.
 */
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (sub: string, sid: string, gen = 1) =>
  `${b64url({ alg: 'HS256' })}.${b64url({ sub, tipo: sub.startsWith('u') ? 'usuario' : 'cliente', sid, gen })}.firma`;
const SID_A = '11111111-1111-4111-8111-111111111111';
const SID_B = '22222222-2222-4222-8222-222222222222';
const A1 = jwt('u:7', SID_A, 1);
const A2 = jwt('u:7', SID_A, 2);
const B1 = jwt('c:9', SID_B, 1);
const INFO = { estado: 'activa', restante_inactividad_ms: 1_800_000, aviso_en_ms: 1_680_000, restante_absoluto_ms: 4e7 };

const json = (status: number, cuerpo: unknown) =>
  ({ ok: status < 400, status, json: async () => cuerpo, clone() { return this; } }) as unknown as Response;

let cookie: string; // token que devuelve /auth/refresh: la cookie compartida por todas las pestañas del navegador
let rutas: Record<string, (init?: RequestInit) => Response | Promise<Response>>;
let llamadas: string[];
let mensajes: unknown[];
const refresh = () => json(200, { access_token: cookie, tipo: cookie === B1 ? 'cliente' : 'usuario', cuenta: { id: 1 }, sesion: INFO });

beforeEach(() => {
  vi.resetModules();
  cookie = A2;
  llamadas = [];
  mensajes = [];
  rutas = {};
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push(url);
    if (url === '/api/auth/refresh') return refresh();
    const f = rutas[url];
    return f ? f(init) : json(200, {});
  }));
  vi.stubGlobal('BroadcastChannel', class { onmessage = null; postMessage(m: unknown) { mensajes.push(m); } close() {} });
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function pestana() {
  vi.resetModules(); // cada pestaña es su propia instancia de JavaScript (su propio token en memoria)
  const cliente = await import('../api/cliente');
  const recargar = vi.spyOn(cliente.navegador, 'recargar').mockImplementation(() => undefined);
  // `ultimoResultado` y `ultimaRenovacion` son `export let`: se leen del módulo para conservar el enlace en vivo
  return { ...cliente, recargar, estado: () => ({ resultado: cliente.ultimoResultado, renovacion: cliente.ultimaRenovacion }) };
}

test('renovar la misma cuenta (mismo sid, otra gen) sigue igual', async () => {
  const t = await pestana();
  t.sesion.fijar(A1);
  expect(await t.renovar()).toBe(true);
  expect(t.sesion.token()).toBe(A2);
  expect(t.estado().resultado).toBe('ok');
  expect(t.recargar).not.toHaveBeenCalled();
});

test('una renovación de otra cuenta no entrega su token, no avisa a los oyentes y recarga la pestaña', async () => {
  const t = await pestana();
  t.sesion.fijar(A1);
  const oyente = vi.fn();
  expect(await t.renovar()).toBe(true); // renovación normal de A
  await new Promise((r) => setTimeout(r, 0)); // `renovar` libera su promesa en el siguiente ciclo
  t.sesion.alExpirar(oyente);
  cookie = B1; // otra pestaña inició sesión con otra cuenta
  expect(await t.renovar()).toBe(false);
  expect(t.sesion.token()).toBeNull(); // el token de B no queda en esta pestaña
  expect(t.estado().resultado).toBe('otra_cuenta');
  expect((t.estado().renovacion as { access_token?: string })?.access_token).toBe(A2); // la de B no se aplica sobre A
  expect(oyente).not.toHaveBeenCalled(); // no es un cierre: no dispara el cierre global ni el registro push
  expect(t.recargar).toHaveBeenCalledOnce();
  expect(llamadas).not.toContain('/api/auth/logout'); // la sesión de B sigue viva
});

test('la petición que provocó la renovación no se reintenta con la otra cuenta', async () => {
  const t = await pestana();
  t.sesion.fijar(A1);
  cookie = B1;
  rutas['/api/cuenta/pedidos'] = () => json(401, { error: { codigo: 'sesion_revocada' } });
  await expect(t.get('/cuenta/pedidos')).rejects.toMatchObject({ codigo: 'otra_cuenta' });
  expect(llamadas.filter((u) => u === '/api/cuenta/pedidos')).toHaveLength(1); // ningún reintento con el token de B
});

test('una respuesta tardía de la cuenta anterior no se entrega después del cambio', async () => {
  const t = await pestana();
  t.sesion.fijar(A1);
  let liberar!: (r: Response) => void;
  rutas['/api/lento'] = () => new Promise<Response>((r) => { liberar = r; });
  const lenta = t.get('/lento');
  await new Promise((r) => setTimeout(r, 0));
  cookie = B1;
  await t.renovar(); // cambio de cuenta mientras la petición seguía en vuelo
  liberar(json(200, { privado: 'datos de A' }));
  await expect(lenta).rejects.toMatchObject({ codigo: 'otra_cuenta' });
});

test('dos pestañas de la misma cuenta renuevan sin recargar', async () => {
  const p1 = await pestana();
  const p2 = await pestana();
  p1.sesion.fijar(A1);
  p2.sesion.fijar(A1);
  expect(await p1.renovar()).toBe(true);
  expect(await p2.renovar()).toBe(true);
  expect(p1.recargar).not.toHaveBeenCalled();
  expect(p2.recargar).not.toHaveBeenCalled();
});

test('con tokens distintos y la cookie compartida, solo la pestaña de la cuenta anterior cambia', async () => {
  const vieja = await pestana();
  const nueva = await pestana();
  vieja.sesion.fijar(A1);
  nueva.sesion.fijar(B1); // inicio de sesión en la otra pestaña: la cookie pasa a ser de B
  cookie = B1;
  expect(await nueva.renovar()).toBe(true);
  expect(nueva.recargar).not.toHaveBeenCalled();
  expect(await vieja.renovar()).toBe(false);
  expect(vieja.recargar).toHaveBeenCalledOnce();
  expect(vieja.sesion.token()).toBeNull();
});

test('la pausa conserva la identidad: al reanudar con otra cuenta también se recarga', async () => {
  const t = await pestana();
  t.sesion.fijar(A1);
  t.sesion.pausar();
  cookie = B1;
  expect(await t.renovar(true)).toBe(false);
  expect(t.recargar).toHaveBeenCalledOnce();
});

test('con AuthProvider: vacía la caché privada antes de recargar y no cierra la sesión global', async () => {
  const { AuthProvider } = await import('../app/auth');
  const cliente = await import('../api/cliente');
  const actividad = await import('../app/actividad');
  const recargar = vi.spyOn(cliente.navegador, 'recargar').mockImplementation(() => undefined);
  cookie = A1;
  const qc = new QueryClient();
  render(<QueryClientProvider client={qc}><AuthProvider><span /></AuthProvider></QueryClientProvider>);
  await waitFor(() => expect(cliente.sesion.token()).toBe(A1)); // arranque: aplica la cuenta A
  qc.setQueryData(['mis-pedidos'], { privado: 'pedidos de A' });
  cookie = B1;
  rutas['/api/cuenta/pedidos'] = () => json(401, { error: { codigo: 'sesion_revocada' } });
  await expect(cliente.get('/cuenta/pedidos')).rejects.toMatchObject({ codigo: 'otra_cuenta' });
  expect(qc.getQueryData(['mis-pedidos'])).toBeUndefined();
  expect(recargar).toHaveBeenCalledOnce();
  expect(llamadas).not.toContain('/api/auth/logout');
  expect(mensajes).toEqual([]); // ni cierre ni nada difundido a otras pestañas
  actividad._desinstalar();
});

test('no guarda ni difunde tokens ni sid', async () => {
  const guardar = vi.spyOn(Storage.prototype, 'setItem');
  const t = await pestana();
  t.sesion.fijar(A1);
  await t.renovar();
  await new Promise((r) => setTimeout(r, 0));
  cookie = B1;
  expect(await t.renovar()).toBe(false);
  const escrito = JSON.stringify([guardar.mock.calls, mensajes, document.cookie]);
  for (const secreto of [A1, A2, B1, SID_A, SID_B]) expect(escrito).not.toContain(secreto);
});
