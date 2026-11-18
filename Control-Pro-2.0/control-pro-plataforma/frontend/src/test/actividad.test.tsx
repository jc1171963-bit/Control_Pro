/**
 * S2.4 · Control de inactividad en el navegador. Reloj (`performance.now`, temporizadores) simulado; el servidor se
 * simula con un `fetch` falso. Cada prueba carga módulos nuevos y desinstala las escuchas al terminar.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MIN = 60_000;
const info = (restante: number, aviso: number) => ({ estado: 'activa', restante_inactividad_ms: restante, aviso_en_ms: aviso, restante_absoluto_ms: 10 * 60 * MIN });
const json = (status: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

type Llamada = { url: string; init?: RequestInit };
let llamadas: Llamada[] = [];
let servidor: (url: string, init?: RequestInit) => Promise<Response>;

class CanalFalso {
  static instancias: CanalFalso[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  enviados: unknown[] = [];
  constructor() { CanalFalso.instancias.push(this); }
  postMessage(m: unknown) { this.enviados.push(m); }
  close() {}
}

async function cargar({ conCanal = true } = {}) {
  vi.resetModules();
  CanalFalso.instancias = [];
  vi.stubGlobal('BroadcastChannel', conCanal ? CanalFalso : undefined);
  const cliente = await import('../api/cliente');
  const actividad = await import('../app/actividad');
  const cierres: string[] = [];
  const remotos: string[] = [];
  actividad.configurar({ cierreGlobal: (m) => { cierres.push(m); }, cierreRemoto: (m) => { remotos.push(m); } });
  actividad.instalar();
  return { cliente, actividad, cierres, remotos };
}

const avanzar = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const a = (fragmento: string) => llamadas.filter((l) => l.url.includes(fragmento));
let modulo: { _desinstalar: () => void } | null = null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
  llamadas = [];
  servidor = async () => json(200, {});
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { llamadas.push({ url, init }); return servidor(url, init); }));
  document.cookie = 'csrf_refresh_token=csrf-123; path=/';
  sessionStorage.clear();
});

afterEach(() => {
  modulo?._desinstalar();
  modulo = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('aviso y límite, siempre confirmados por el servidor', () => {
  it('a los 28 min consulta al servidor y, si lo confirma, muestra el aviso; antes no pregunta', async () => {
    const { actividad } = await cargar(); modulo = actividad;
    servidor = async (url) => (url.includes('/auth/sesion') ? json(200, info(2 * MIN, 0)) : json(200, {}));
    actividad.iniciar(info(30 * MIN, 28 * MIN) as any);
    await avanzar(28 * MIN - 1_000);
    expect(a('/auth/sesion')).toHaveLength(0);
    expect(actividad.obtenerFase()).toBe('activa');
    await avanzar(1_000);
    expect(a('/auth/sesion')).toHaveLength(1);
    expect(actividad.obtenerFase()).toBe('aviso');
  });

  it('si el servidor dice que queda tiempo (otra pestaña reportó), reprograma sin avisar ni cerrar', async () => {
    const { actividad, cierres } = await cargar(); modulo = actividad;
    servidor = async (url) => (url.includes('/auth/sesion') ? json(200, info(25 * MIN, 23 * MIN)) : json(200, {}));
    actividad.iniciar(info(30 * MIN, 28 * MIN) as any);
    await avanzar(30 * MIN + 1_000); // el reloj local ya pasó el límite
    expect(actividad.obtenerFase()).toBe('activa');
    expect(cierres).toEqual([]);
    expect(a('/auth/logout')).toHaveLength(0);
  });

  it('un 401 confirmado al consultar produce el cierre global con su motivo', async () => {
    const { actividad, cierres } = await cargar(); modulo = actividad;
    servidor = async () => json(401, { error: { codigo: 'sesion_inactiva' } });
    actividad.iniciar(info(30 * MIN, 28 * MIN) as any);
    await avanzar(28 * MIN);
    expect(cierres).toEqual(['sesion_inactiva']);
    expect(CanalFalso.instancias[0].enviados).toContainEqual({ tipo: 'cerrada', motivo: 'sesion_inactiva' });
  });
});

describe('qué cuenta como actividad', () => {
  it('las consultas automáticas no marcan actividad; una interacción humana sí', async () => {
    const { actividad, cliente } = await cargar(); modulo = actividad;
    actividad.iniciar(info(30 * MIN, 28 * MIN) as any);
    for (let i = 0; i < 5; i++) await cliente.api('/admin/notificaciones');
    expect(actividad._interno.pendiente()).toBe(false);
    window.dispatchEvent(new Event('pointerdown'));
    expect(actividad._interno.pendiente()).toBe(true);
  });

  it('volver a la pestaña resincroniza con el servidor pero no cuenta como actividad', async () => {
    const { actividad } = await cargar(); modulo = actividad;
    servidor = async () => json(200, info(20 * MIN, 18 * MIN));
    actividad.iniciar(info(30 * MIN, 28 * MIN) as any);
    document.dispatchEvent(new Event('visibilitychange'));
    await avanzar(0);
    expect(a('/auth/sesion')).toHaveLength(1);
    expect(actividad._interno.pendiente()).toBe(false);
    expect(actividad._interno.info()?.restante_inactividad_ms).toBe(20 * MIN);
  });

  it('sin interacción no se reporta nada, ni siquiera en el minuto 25', async () => {
    const { actividad } = await cargar(); modulo = actividad;
    servidor = async (url) => (url.includes('/auth/sesion') ? json(200, info(2 * MIN, 0)) : json(200, {}));
    actividad.iniciar(info(30 * MIN, 28 * MIN) as any);
    await avanzar(27 * MIN);
    expect(a('/auth/actividad')).toHaveLength(0);
  });
});

describe('reportes de actividad', () => {
  it('reporta la interacción pendiente en el minuto 25 como duración, con CSRF', async () => {
    const { actividad } = await cargar(); modulo = actividad;
    servidor = async (url) => (url.includes('/auth/actividad') ? json(200, { resultado: 'registrada', sesion: info(29 * MIN, 27 * MIN) }) : json(200, {}));
    actividad.iniciar(info(30 * MIN, 28 * MIN) as any);
    await avanzar(1 * MIN);
    window.dispatchEvent(new Event('keydown'));
    await avanzar(24 * MIN);
    const [reporte] = a('/auth/actividad');
    expect(reporte).toBeDefined();
    const cuerpo = JSON.parse(String(reporte.init?.body));
    expect(Math.abs(cuerpo.inactivo_ms - 24 * MIN)).toBeLessThan(1_000); // duración monótona, nunca una fecha
    expect((reporte.init?.headers as Record<string, string>)['X-CSRF-TOKEN']).toBe('csrf-123');
    expect(actividad._interno.pendiente()).toBe(false);
  });

  it('al cerrar la pestaña con interacción pendiente envía un único reporte con keepalive', async () => {
    const { actividad } = await cargar(); modulo = actividad;
    actividad.iniciar(info(30 * MIN, 28 * MIN) as any);
    window.dispatchEvent(new Event('touchstart'));
    window.dispatchEvent(new Event('pagehide'));
    await avanzar(0);
    const reportes = a('/auth/actividad');
    expect(reportes).toHaveLength(1);
    expect(reportes[0].init?.keepalive).toBe(true);
  });

  it('un fallo de red al reportar se reintenta (1, 2, 4 y 8 s) sin cerrar la sesión', async () => {
    const { actividad, cierres } = await cargar(); modulo = actividad;
    servidor = async (url) => { if (url.includes('/auth/actividad')) throw new TypeError('sin red'); return json(200, {}); };
    actividad.iniciar(info(30 * MIN, 28 * MIN) as any);
    actividad.continuar();
    await avanzar(15_000);
    expect(a('/auth/actividad')).toHaveLength(5);
    expect(actividad.obtenerFase()).toBe('activa');
    expect(cierres).toEqual([]);
  });
});

describe('pausa local frente a cierre global', () => {
  it('sin red al llegar al límite: pausa solo esta pestaña, sin cerrar sesión ni avisar a las demás', async () => {
    const { actividad, cliente, cierres } = await cargar(); modulo = actividad;
    servidor = async () => { throw new TypeError('sin red'); };
    actividad.iniciar(info(30 * MIN, 28 * MIN) as any);
    await avanzar(30 * MIN + 1_000);
    expect(actividad.obtenerFase()).toBe('pausada');
    expect(cierres).toEqual([]);
    expect(a('/auth/logout')).toHaveLength(0);
    expect(CanalFalso.instancias[0].enviados).not.toContainEqual(expect.objectContaining({ tipo: 'cerrada' }));
    expect(cliente.sesion.pausada()).toBe(true);
    await expect(cliente.api('/admin/pedidos')).rejects.toMatchObject({ codigo: 'sesion_pausada' });
    expect(sessionStorage.getItem('cp-sesion-pausada')).toBe('1');
  });

  it('en pausa, un error de red la mantiene pausada; solo se recupera tras confirmar y renovar', async () => {
    const { actividad, cliente } = await cargar(); modulo = actividad;
    servidor = async () => { throw new TypeError('sin red'); };
    actividad.iniciar(info(30 * MIN, 28 * MIN) as any);
    await avanzar(30 * MIN + 1_000);
    expect(await actividad.reanudar()).toBe('red');
    expect(actividad.obtenerFase()).toBe('pausada');
    // vuelve la red, pero la renovación falla de forma transitoria: sigue en pausa
    servidor = async (url) => (url.includes('/auth/sesion') ? json(200, info(10 * MIN, 8 * MIN)) : json(503, {}));
    expect(await actividad.reanudar()).toBe('red');
    expect(actividad.obtenerFase()).toBe('pausada');
    await avanzar(0); // `renovar()` libera su promesa compartida en el siguiente ciclo del reloj
    // el servidor confirma y la renovación se completa: reanuda
    servidor = async (url) => (url.includes('/auth/sesion') ? json(200, info(10 * MIN, 8 * MIN))
      : json(200, { access_token: 'nuevo', tipo: 'usuario', cuenta: {}, sesion: info(10 * MIN, 8 * MIN) }));
    expect(await actividad.reanudar()).toBe('ok');
    expect(actividad.obtenerFase()).toBe('activa');
    expect(cliente.sesion.pausada()).toBe(false);
    expect(cliente.sesion.token()).toBe('nuevo');
  });

  it.each([
    ['la consulta', async () => json(401, { error: { codigo: 'sesion_inactiva' } })],
    ['la renovación', async (url: string) => (url.includes('/auth/sesion') ? json(200, info(10 * MIN, 8 * MIN)) : json(401, { error: { codigo: 'sesion_revocada' } }))],
  ])('en pausa, un 401 confirmado en %s produce el cierre global', async (_, respuesta) => {
    const { actividad, cierres } = await cargar(); modulo = actividad;
    servidor = async () => { throw new TypeError('sin red'); };
    actividad.iniciar(info(30 * MIN, 28 * MIN) as any);
    await avanzar(30 * MIN + 1_000);
    servidor = respuesta;
    expect(await actividad.reanudar()).toBe('rechazo');
    expect(cierres).toHaveLength(1);
    expect(actividad.obtenerFase()).toBe('sin_sesion');
  });
});

describe('coordinación entre pestañas', () => {
  it('con BroadcastChannel: un reporte de otra pestaña evita el aviso y «cerrada» cierra esta pestaña', async () => {
    const { actividad, remotos } = await cargar(); modulo = actividad;
    actividad.iniciar(info(30 * MIN, 28 * MIN) as any);
    await avanzar(20 * MIN);
    CanalFalso.instancias[0].onmessage?.({ data: { tipo: 'reportada', sesion: info(30 * MIN, 28 * MIN) } });
    await avanzar(9 * MIN); // minuto 29 desde el inicio: sin el reporte ajeno ya habría preguntado y avisado
    expect(a('/auth/sesion')).toHaveLength(0);
    expect(actividad.obtenerFase()).toBe('activa');
    CanalFalso.instancias[0].onmessage?.({ data: { tipo: 'cerrada', motivo: 'cierre' } });
    expect(remotos).toEqual(['cierre']);
    expect(actividad.obtenerFase()).toBe('sin_sesion');
  });

  it('«continuar» pulsado en otra pestaña retira el aviso aquí y reprograma con el reporte que le sigue', async () => {
    const { actividad } = await cargar(); modulo = actividad;
    servidor = async (url) => (url.includes('/auth/sesion') ? json(200, info(2 * MIN, 0)) : json(200, {}));
    actividad.iniciar(info(30 * MIN, 28 * MIN) as any);
    await avanzar(28 * MIN);
    expect(actividad.obtenerFase()).toBe('aviso');
    const canal = CanalFalso.instancias[0];
    canal.onmessage?.({ data: { tipo: 'continuar' } });
    expect(actividad.obtenerFase()).toBe('activa');
    // la pestaña que pulsó «Continuar» difunde después el reporte confirmado por el servidor
    canal.onmessage?.({ data: { tipo: 'reportada', sesion: info(30 * MIN, 28 * MIN) } });
    const consultasAntes = a('/auth/sesion').length;
    await avanzar(27 * MIN);
    expect(a('/auth/sesion')).toHaveLength(consultasAntes); // no vuelve a preguntar ni a avisar antes de su nuevo minuto 28
    expect(actividad.obtenerFase()).toBe('activa');
    expect(actividad._interno.info()?.restante_inactividad_ms).toBe(30 * MIN);
  });

  it('«continuar» recibido sin aviso abierto no cambia nada', async () => {
    const { actividad } = await cargar(); modulo = actividad;
    actividad.iniciar(info(30 * MIN, 28 * MIN) as any);
    CanalFalso.instancias[0].onmessage?.({ data: { tipo: 'continuar' } });
    expect(actividad.obtenerFase()).toBe('activa');
    expect(actividad._interno.pendiente()).toBe(false); // un mensaje de otra pestaña no es interacción en esta
  });

  it('sin BroadcastChannel: el respaldo por `storage` entrega el reporte de otra pestaña', async () => {
    const { actividad } = await cargar({ conCanal: false }); modulo = actividad;
    actividad.iniciar(info(30 * MIN, 28 * MIN) as any);
    await avanzar(20 * MIN);
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'cp-sesion-evento', newValue: JSON.stringify({ tipo: 'reportada', sesion: info(30 * MIN, 28 * MIN), n: 1 }),
    }));
    await avanzar(9 * MIN);
    expect(a('/auth/sesion')).toHaveLength(0);
    expect(actividad.obtenerFase()).toBe('activa');
  });
});

describe('AvisoSesion', () => {
  it('muestra la cuenta regresiva y «Continuar» reporta la actividad y vuelve a la fase activa', async () => {
    const { actividad } = await cargar(); modulo = actividad;
    const { AvisoSesion } = await import('../components/AvisoSesion');
    servidor = async (url) => (url.includes('/auth/sesion') ? json(200, info(2 * MIN, 0))
      : json(200, { resultado: 'registrada', sesion: info(30 * MIN, 28 * MIN) }));
    const cerrar = vi.fn();
    render(<AvisoSesion onCerrarSesion={cerrar} />);
    actividad.iniciar(info(30 * MIN, 28 * MIN) as any);
    await avanzar(28 * MIN);
    expect(screen.getByRole('dialog', { name: 'Tu sesión está por cerrarse' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await avanzar(0);
    expect(actividad.obtenerFase()).toBe('activa');
    expect(a('/auth/actividad')).toHaveLength(1);
    expect(cerrar).not.toHaveBeenCalled();
  });
});
