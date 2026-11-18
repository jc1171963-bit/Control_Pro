/**
 * S2.4 · Integración de AuthProvider con el control de inactividad (M1): arranque en pausa, cierre global por el usuario
 * y cierre global cuando el servidor rechaza la renovación (401).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MIN = 60_000;
const INFO = { estado: 'activa', restante_inactividad_ms: 30 * MIN, aviso_en_ms: 28 * MIN, restante_absoluto_ms: 12 * 60 * MIN };
const USUARIO = { id: 1, nombre: 'Admin', correo: 'admin@x.mx', permisos: [], rol: { codigo: 'admin' }, sucursales: [] };
const json = (status: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

type Llamada = { url: string; init?: RequestInit };
let llamadas: Llamada[] = [];
let respuestas: Record<string, () => Response>;
const a = (fragmento: string) => llamadas.filter((l) => l.url.includes(fragmento));

class CanalFalso {
  static instancias: CanalFalso[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  enviados: unknown[] = [];
  constructor() { CanalFalso.instancias.push(this); }
  postMessage(m: unknown) { this.enviados.push(m); }
  close() {}
}

let desinstalar: (() => void) | null = null;

async function montar() {
  vi.resetModules();
  CanalFalso.instancias = [];
  const { AuthProvider, useAuth } = await import('../app/auth');
  const cliente = await import('../api/cliente');
  const actividad = await import('../app/actividad');
  desinstalar = actividad._desinstalar;
  function Consumidor() {
    const auth = useAuth();
    return (
      <div>
        <span data-testid="estado">{auth.cargando ? 'cargando' : auth.tipo ?? 'anon'}</span>
        <button onClick={() => void auth.salir()}>Salir</button>
      </div>
    );
  }
  render(<QueryClientProvider client={new QueryClient()}><AuthProvider><Consumidor /></AuthProvider></QueryClientProvider>);
  return { cliente, actividad };
}

beforeEach(() => {
  llamadas = [];
  respuestas = {
    '/api/auth/refresh': () => json(200, { access_token: 'tok-1', tipo: 'usuario', cuenta: USUARIO, sesion: INFO }),
    '/api/auth/logout': () => json(200, { ok: true }),
    '/api/auth/sesion': () => json(200, INFO),
  };
  vi.stubGlobal('BroadcastChannel', CanalFalso);
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    llamadas.push({ url, init });
    const clave = Object.keys(respuestas).find((k) => url.startsWith(k));
    return clave ? respuestas[clave]() : json(200, {});
  }));
  sessionStorage.clear();
});

afterEach(() => {
  desinstalar?.();
  desinstalar = null;
  vi.unstubAllGlobals();
});

describe('AuthProvider con el control de inactividad', () => {
  it('una pestaña pausada no renueva sola al arrancar: muestra la pausa y espera', async () => {
    sessionStorage.setItem('cp-sesion-pausada', '1');
    const { actividad, cliente } = await montar();
    expect(await screen.findByRole('dialog', { name: 'Sesión en pausa en esta pestaña' })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50)); // da tiempo a cualquier renovación indebida
    expect(a('/api/auth/refresh')).toHaveLength(0);
    expect(screen.getByTestId('estado')).toHaveTextContent('cargando'); // no se declara autenticada ni anónima
    expect(actividad.obtenerFase()).toBe('pausada');
    expect(cliente.sesion.pausada()).toBe(true);
  });

  it('al arrancar normalmente renueva, aplica la cuenta e inicia el control de inactividad', async () => {
    const { actividad } = await montar();
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('usuario'));
    expect(a('/api/auth/refresh')).toHaveLength(1);
    expect(actividad.obtenerFase()).toBe('activa');
  });

  it('«salir» es un cierre global: revoca en el servidor, limpia la pestaña y avisa a las demás', async () => {
    const { actividad, cliente } = await montar();
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('usuario'));
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('anon'));
    const [cierre] = a('/api/auth/logout');
    expect(cierre).toBeDefined();
    expect((cierre.init?.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
    expect(CanalFalso.instancias[0].enviados).toContainEqual({ tipo: 'cerrada', motivo: 'cierre' });
    expect(cliente.sesion.token()).toBeNull();
    expect(actividad.obtenerFase()).toBe('sin_sesion');
  });

  it('un 401 confirmado al renovar produce el cierre global con el motivo del servidor', async () => {
    const { actividad, cliente } = await montar();
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('usuario'));
    respuestas['/api/admin/pedidos'] = () => json(401, { error: { codigo: 'token_expirado' } });
    respuestas['/api/auth/refresh'] = () => json(401, { error: { codigo: 'sesion_inactiva' } });
    await expect(cliente.api('/admin/pedidos')).rejects.toMatchObject({ status: 401 });
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('anon'));
    await waitFor(() => expect(a('/api/auth/logout')).toHaveLength(1));
    expect(CanalFalso.instancias[0].enviados).toContainEqual({ tipo: 'cerrada', motivo: 'sesion_inactiva' });
    expect(actividad.obtenerFase()).toBe('sin_sesion');
  });

  it('un error transitorio (503) al renovar no cierra la sesión ni llama al cierre', async () => {
    const { actividad, cliente } = await montar();
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('usuario'));
    respuestas['/api/admin/pedidos'] = () => json(401, { error: { codigo: 'token_expirado' } });
    respuestas['/api/auth/refresh'] = () => json(503, {});
    await expect(cliente.api('/admin/pedidos')).rejects.toMatchObject({ status: 401 });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('estado')).toHaveTextContent('usuario');
    expect(a('/api/auth/logout')).toHaveLength(0);
    expect(cliente.sesion.token()).toBe('tok-1');
    expect(actividad.obtenerFase()).toBe('activa');
  });

  it('el cierre recibido de otra pestaña limpia esta sin volver a llamar al servidor', async () => {
    const { actividad } = await montar();
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('usuario'));
    CanalFalso.instancias[0].onmessage?.({ data: { tipo: 'cerrada', motivo: 'cierre' } });
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('anon'));
    expect(a('/api/auth/logout')).toHaveLength(0);
    expect(actividad.obtenerFase()).toBe('sin_sesion');
  });
});
