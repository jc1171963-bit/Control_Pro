/**
 * H1.5: la suscripción push se sincroniza por SESIÓN (sid del access token en memoria), no por cuenta.
 * Cada prueba recarga los módulos para empezar sin estado, con push, service worker y fetch simulados.
 */
import { renderHook, act } from '@testing-library/react';

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/dispositivo';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (claims: Record<string, unknown>) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(claims)}.firma`;
const token = (sid: string, gen = 1, sub = 'u:7') => jwt({ sub, tipo: sub.startsWith('u') ? 'usuario' : 'cliente', sid, gen });

type Resp = { status: number; body?: unknown };
const respuesta = ({ status, body = {} }: Resp) =>
  ({ ok: status < 400, status, json: async () => body, clone() { return this; } }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;
let respuestas: Array<Resp | Promise<Resp>>; // cola para POST /push/suscripcion; vacía = 201
let sub: { endpoint: string; toJSON: () => unknown; unsubscribe: ReturnType<typeof vi.fn> };
let mensajesEntrePestanas: unknown[];

async function cargar() {
  const cliente = await import('../api/cliente');
  const pwa = await import('../app/pwa');
  pwa.registrarServiceWorker(() => undefined); // arranque (main.tsx): instala el oyente de cambios del token
  return { sesion: cliente.sesion, pwa };
}

const esperar = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
const llamadas = (metodo: string) =>
  fetchMock.mock.calls.filter(([url, op]) => url === '/api/push/suscripcion' && op.method === metodo);
const posts = () => llamadas('POST');

beforeEach(() => {
  vi.resetModules();
  respuestas = [];
  mensajesEntrePestanas = [];
  sub = { endpoint: ENDPOINT, toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'p'.repeat(30), auth: 'a'.repeat(10) } }),
    unsubscribe: vi.fn(async () => true) };
  fetchMock = vi.fn(async (url: string, op: RequestInit) => {
    if (url === '/api/push/clave') return respuesta({ status: 200, body: { clave: 'AAAA' } });
    if (url === '/api/push/suscripcion' && op.method === 'POST' && respuestas.length) return respuesta(await respuestas.shift()!);
    return respuesta({ status: url === '/api/push/suscripcion' && op.method === 'POST' ? 201 : 200, body: { ok: true } });
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('Notification', { permission: 'granted', requestPermission: vi.fn(async () => 'granted') });
  vi.stubGlobal('PushManager', function PushManager() {});
  vi.stubGlobal('BroadcastChannel', class { postMessage(m: unknown) { mensajesEntrePestanas.push(m); } close() {} addEventListener() {} });
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  const registro = { pushManager: { getSubscription: async () => sub, subscribe: vi.fn(async () => sub) } };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: async () => registro, ready: Promise.resolve(registro), addEventListener() {}, register: async () => registro },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (navigator as any).serviceWorker;
  vi.restoreAllMocks();
});

test('primera sesión: registra la suscripción con el token en memoria y sin enviar el sid', async () => {
  const { sesion } = await cargar();
  sesion.fijar(token(A));
  await esperar();
  expect(posts()).toHaveLength(1);
  const [, op] = posts()[0];
  expect(op.headers.Authorization).toBe(`Bearer ${token(A)}`); // el servidor toma el sid de su token verificado
  expect(JSON.parse(op.body)).toEqual(sub.toJSON()); // mismo contrato: sin campo sid
});

test('el sid sale del JWT en memoria; un token ausente, malformado o sin sid no registra nada', async () => {
  const { sesion, pwa } = await cargar();
  expect(sesion.sid()).toBeNull();
  for (const t of ['no-es-jwt', 'a.b.c', `x.${btoa('no json')}.y`, jwt({ sub: 'u:7', gen: 1 }), jwt({ sid: 'no-uuid' }), jwt({ sid: 42 })]) {
    sesion.fijar(t);
    expect(sesion.sid()).toBeNull();
    await pwa.revisarSuscripcion();
  }
  await esperar();
  expect(posts()).toHaveLength(0);
  sesion.fijar(token(A));
  expect(sesion.sid()).toBe(A);
});

test('no guarda el sid ni el token en almacenamiento persistente ni lo difunde a otras pestañas', async () => {
  const guardar = vi.spyOn(Storage.prototype, 'setItem');
  const cookies = document.cookie;
  const { sesion, pwa } = await cargar();
  sesion.fijar(token(A));
  await esperar();
  sesion.fijar(token(B));
  await esperar();
  await pwa.olvidarDispositivo();
  const escrito = JSON.stringify([guardar.mock.calls, mensajesEntrePestanas, document.cookie]);
  expect(escrito).not.toContain(A);
  expect(escrito).not.toContain(B);
  expect(escrito).not.toContain(token(A));
  expect(guardar).not.toHaveBeenCalled();
  expect(mensajesEntrePestanas).toEqual([]);
  expect(document.cookie).toBe(cookies);
});

test('renovar (mismo sid, otra gen) no vuelve a registrar', async () => {
  const { sesion } = await cargar();
  sesion.fijar(token(A, 1));
  await esperar();
  for (const gen of [2, 3, 4]) sesion.fijar(token(A, gen));
  await esperar();
  expect(posts()).toHaveLength(1);
});

test('una sesión nueva de la misma cuenta, u otra cuenta, vuelve a registrar', async () => {
  const { sesion } = await cargar();
  sesion.fijar(token(A, 1, 'u:7'));
  await esperar();
  sesion.fijar(token(B, 1, 'u:7')); // misma cuenta, otro inicio de sesión
  await esperar();
  sesion.fijar(token(C, 1, 'c:9')); // otra cuenta en el mismo navegador
  await esperar();
  expect(posts().map(([, op]) => op.headers.Authorization)).toEqual([`Bearer ${token(A, 1, 'u:7')}`,
    `Bearer ${token(B, 1, 'u:7')}`, `Bearer ${token(C, 1, 'c:9')}`]);
});

test('un POST fallido no marca la sesión y el siguiente intento la registra', async () => {
  respuestas.push({ status: 500 });
  const { sesion, pwa } = await cargar();
  sesion.fijar(token(A));
  await esperar();
  expect(posts()).toHaveLength(1);
  sesion.fijar(token(A, 2)); // la renovación es una nueva oportunidad: como no quedó marcada, reintenta
  await esperar();
  expect(posts()).toHaveLength(2);
  await pwa.revisarSuscripcion(); // ya confirmada: no repite
  expect(posts()).toHaveLength(2);
});

test('no hay reintentos en bucle tras un fallo', async () => {
  respuestas.push({ status: 503 });
  const { sesion } = await cargar();
  sesion.fijar(token(A));
  await esperar();
  await esperar();
  expect(posts()).toHaveLength(1); // espera a la próxima revisión (renovación, reanudación, aplicar)
});

test('una respuesta tardía de la sesión anterior no marca como sincronizada la nueva', async () => {
  let liberarA!: (r: Resp) => void;
  respuestas.push(new Promise<Resp>((r) => { liberarA = r; }), { status: 500 });
  const { sesion, pwa } = await cargar();
  sesion.fijar(token(A));
  await esperar(); // POST de A pendiente
  sesion.fijar(token(B));
  await esperar(); // POST de B: falla
  liberarA({ status: 201 }); // A responde tarde y bien
  await esperar();
  await pwa.revisarSuscripcion();
  expect(posts()).toHaveLength(3); // B sigue sin marcar y se registra de nuevo
  await pwa.revisarSuscripcion();
  expect(posts()).toHaveLength(3);
});

test('llamadas simultáneas en la misma pestaña hacen un solo POST', async () => {
  let liberar!: (r: Resp) => void;
  respuestas.push(new Promise<Resp>((r) => { liberar = r; }));
  const { sesion, pwa } = await cargar();
  sesion.fijar(token(A)); // dispara una revisión
  const varias = Promise.all([pwa.revisarSuscripcion(), pwa.revisarSuscripcion(), pwa.revisarSuscripcion()]);
  await esperar();
  liberar({ status: 201 });
  await varias;
  await esperar();
  expect(posts()).toHaveLength(1);
});

test('cerrar sesión limpia la marca aunque el DELETE falle, y conserva DELETE + unsubscribe', async () => {
  const { sesion, pwa } = await cargar();
  sesion.fijar(token(A));
  await esperar();
  fetchMock.mockImplementationOnce(async () => { throw new TypeError('sin red'); }); // el DELETE falla
  await pwa.olvidarDispositivo();
  expect(llamadas('DELETE')).toHaveLength(1);
  expect(JSON.parse(llamadas('DELETE')[0][1].body)).toEqual({ endpoint: ENDPOINT });
  expect(sub.unsubscribe).toHaveBeenCalledOnce();
  await pwa.revisarSuscripcion(); // misma sesión: la marca se borró, así que vuelve a registrar
  expect(posts()).toHaveLength(2);
});

test('cierre remoto (token a null) limpia la marca; volver a entrar con la misma cuenta registra la sesión nueva', async () => {
  const { sesion } = await cargar();
  sesion.fijar(token(A, 1, 'u:7'));
  await esperar();
  sesion.fijar(null); // otra pestaña cerró la sesión: limpiarLocal
  await esperar();
  expect(posts()).toHaveLength(1);
  sesion.fijar(token(A, 1, 'u:7')); // aun con el mismo sid, la marca ya no existe
  await esperar();
  sesion.fijar(null);
  sesion.fijar(token(B, 1, 'u:7')); // inicio de sesión nuevo de la misma cuenta
  await esperar();
  expect(posts()).toHaveLength(3);
});

test('la reanudación (aplicar sin cambio de token) comprueba la sesión actual', async () => {
  respuestas.push({ status: 500 });
  const { sesion, pwa } = await cargar();
  sesion.fijar(token(A));
  await esperar(); // falló
  sesion.pausar(); // sin notificar: la pestaña no tiene token
  await pwa.revisarSuscripcion();
  expect(posts()).toHaveLength(1); // en pausa no hay sid: no registra
  sesion.reanudar();
  sesion.fijar(token(A, 2)); // renovar(forzar) al reanudar
  await pwa.revisarSuscripcion(); // aplicar → revisarSuscripcion
  await esperar();
  expect(posts()).toHaveLength(2);
});

test('activar desde el menú sigue registrando con el contrato actual y marca la sesión', async () => {
  const { sesion, pwa } = await cargar();
  sesion.fijar(null);
  const { result } = renderHook(() => pwa.usePush());
  await act(async () => { await esperar(); });
  sesion.fijar(token(A)); // la sesión entra después de montar
  await act(async () => { await esperar(); });
  const antes = posts().length;
  let r: string | undefined;
  await act(async () => { r = await result.current.activar(); });
  expect(r).toBe('ok');
  expect(posts()).toHaveLength(antes + 1);
  expect(JSON.parse(posts()[antes][1].body)).toEqual(sub.toJSON());
  await pwa.revisarSuscripcion();
  expect(posts()).toHaveLength(antes + 1); // activar dejó la sesión marcada
});
