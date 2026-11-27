import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import { get, post } from '../api/cliente';
import PresentacionEnVivo, { dispositivo, type EnVivo } from '../features/admin/PresentacionEnVivo';

vi.mock('../api/cliente', async (original) => ({
  ApiError: (await original<typeof import('../api/cliente')>()).ApiError,
  get: vi.fn(), post: vi.fn(),
}));
vi.mock('../app/auth', () => ({
  useAuth: () => ({ puede: () => true, usuario: { rol: { codigo: 'admin', nombre: '', alcance_global: true }, sucursales: [], permisos: [] } }),
}));

const CHROME_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const hace = (s: number) => new Date(Date.now() - s * 1000).toISOString();
const fila = (clave: string, s: number, accion: string, detalle: Record<string, unknown>, extra = {}) =>
  ({ clave, fecha: hace(s), accion, entidad: 'presentacion', entidad_id: null, detalle: { ...detalle, prueba: true }, ip: null, sistema: false, ...extra });

const datos = (extra: Partial<EnVivo> = {}): EnVivo => ({
  configurada: true, ahora: new Date().toISOString(),
  persona: { nombre: 'Jesús Antonio Castillo Lizarraga', correo: 'aprobador.demo@controlpro.mx', empresa: 'LURIMA', solo_lectura: false },
  cuenta_activa: true,
  horario: { desde: hace(-18 * 3600), hasta: hace(-23 * 3600) },
  prueba: { desde: hace(600), hasta: hace(-3 * 3600) },
  ventana: { tipo: 'prueba', desde: hace(600), hasta: hace(-3 * 3600) },
  sesion: { inicio: hace(300), actividad_en: hace(3), agente: CHROME_WINDOWS, ip: '189.1.2.3' },
  ultimo_pulso: hace(1),
  conteos: { pantallas: 2, acciones: 1, alertas: 1, salidas: 0, decisiones: 1 },
  conteo_desde: hace(600),
  folios: { 52: 'SIM-00052' },
  actividad: [
    { clave: 'd1', fecha: hace(10), accion: 'presentacion.decision', entidad: 'pedido', entidad_id: 52, detalle: { decision: 'aprobado', motivo: null }, ip: null, sistema: false },
    fila('a5', 20, 'presentacion.evento.captura', { detalle: 'Tecla Imprimir Pantalla' }),
    fila('a4', 30, 'presentacion.peticion', { metodo: 'GET', ruta: '/api/admin/pedidos?por_pagina=20', estado: 200 }),
    fila('a3', 40, 'presentacion.vista', { ruta: '/aprobador/pedidos/52' }),
    fila('a2', 60, 'presentacion.vista', { ruta: '/aprobador/seguimiento' }),
    fila('a1', 300, 'presentacion.entrada', { agente: CHROME_WINDOWS }, { ip: '189.1.2.3' }),
  ],
  ...extra,
});

function montar(d: EnVivo) {
  vi.mocked(get).mockResolvedValue(d as never);
  const router = createMemoryRouter([{ path: '/admin/presentacion', element: <PresentacionEnVivo /> }], { initialEntries: ['/admin/presentacion'] });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
}

beforeEach(() => { vi.mocked(get).mockReset(); vi.mocked(post).mockReset(); });

describe('presentación en vivo', () => {
  it('muestra quién es, si está en línea, en qué pantalla está y lo que hace, en palabras', async () => {
    montar(datos());
    expect(await screen.findByText('Jesús Antonio Castillo Lizarraga')).toBeInTheDocument();
    expect(screen.getByText('En línea, viendo el sistema')).toBeInTheDocument();
    expect(screen.getAllByText('Ventana de pruebas').length).toBeGreaterThan(0);
    expect(screen.getByText('Solicitud SIM-00052')).toBeInTheDocument(); // pantalla actual
    expect(screen.getByText('Chrome en Windows')).toBeInTheDocument();
    expect(screen.getByText('Aprobó la solicitud SIM-00052')).toBeInTheDocument();
    expect(screen.getByText('Intentó tomar una captura de pantalla')).toBeInTheDocument();
    expect(screen.getByText('Abrió el seguimiento de solicitudes')).toBeInTheDocument();
    expect(screen.getByText('Entró al sistema')).toBeInTheDocument();
    expect(screen.getAllByText('prueba').length).toBeGreaterThan(0); // lo de la ventana de pruebas se distingue
    // Las consultas automáticas al servidor solo si se piden
    expect(screen.queryByText('Consultó la lista de solicitudes')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Mostrar consultas al servidor'));
    expect(screen.getByText('Consultó la lista de solicitudes')).toBeInTheDocument();
  });

  it('el filtro de alertas deja solo los intentos', async () => {
    montar(datos());
    fireEvent.click(await screen.findByRole('button', { name: 'Alertas' }));
    expect(screen.getByText('Intentó tomar una captura de pantalla')).toBeInTheDocument();
    expect(screen.queryByText('Aprobó la solicitud SIM-00052')).not.toBeInTheDocument();
    expect(screen.queryByText('Abrió el seguimiento de solicitudes')).not.toBeInTheDocument();
  });

  it('con la sesión abierta pero sin pulso: avisa que no está viendo el sistema', async () => {
    montar(datos({ ultimo_pulso: hace(40) }));
    expect(await screen.findByText('Sesión abierta, pero sin ver el sistema')).toBeInTheDocument();
  });

  it('extender 30 min y terminar (con confirmación)', async () => {
    vi.mocked(post).mockResolvedValue({ hasta: hace(-4 * 3600) } as never);
    montar(datos());
    fireEvent.click(await screen.findByRole('button', { name: /Extender 30 min/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/presentacion/extender', { minutos: 30 }));
    fireEvent.click(screen.getByRole('button', { name: /Terminar presentación/ }));
    expect(screen.getByText('¿Terminar la presentación ahora?')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalledWith('/admin/presentacion/cerrar', {});
    fireEvent.click(screen.getByRole('button', { name: /Terminar ahora/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/presentacion/cerrar', {}));
  });

  it('oculta los pasos automáticos al entrar y alerta si intenta abrir el panel de la distribuidora', async () => {
    montar(datos({ actividad: [
      fila('b4', 5, 'presentacion.vista', { ruta: '/admin/usuarios' }),
      fila('b3', 10, 'presentacion.vista', { ruta: '/cuenta' }),
      fila('b2', 12, 'presentacion.vista', { ruta: '/entrar' }),
      fila('b1', 14, 'presentacion.peticion', { metodo: 'POST', ruta: '/api/auth/portal/login', estado: 200 }),
      fila('b0', 20, 'presentacion.vista', { ruta: '/aprobador/seguimiento' }),
    ] }));
    expect(await screen.findByText('Intentó abrir el panel de la distribuidora')).toBeInTheDocument();
    expect(screen.queryByText(/Abrió \/(entrar|cuenta)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/auth\/portal\/login/)).not.toBeInTheDocument();
    expect(screen.getByText('Seguimiento de solicitudes')).toBeInTheDocument(); // pantalla actual: la última de verdad
  });

  it('sin presentación configurada lo dice claramente', async () => {
    montar({ configurada: false, ahora: new Date().toISOString() });
    expect(await screen.findByText('No hay ninguna presentación configurada')).toBeInTheDocument();
  });

  it('reconoce el dispositivo', () => {
    expect(dispositivo(CHROME_WINDOWS)?.texto).toBe('Chrome en Windows');
    expect(dispositivo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'))
      .toEqual({ texto: 'Safari en iPhone', movil: true });
    expect(dispositivo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0')?.texto).toBe('Edge en Windows');
  });
});
