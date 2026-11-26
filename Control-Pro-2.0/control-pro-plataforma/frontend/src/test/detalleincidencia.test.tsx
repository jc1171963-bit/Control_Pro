import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import { ApiError, get, patch } from '../api/cliente';
import type { Incidencia } from '../api/tipos';
import { IncidenciaDetalle } from '../features/admin/IncidenciaDetalle';
import { Incidencias } from '../features/admin/Posventa';
import { IncidenciaSucursal } from '../features/cuenta/Incidencias';

vi.mock('../api/cliente', async (original) => ({
  ApiError: (await original<typeof import('../api/cliente')>()).ApiError,
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), patch: vi.fn(), abrirPrivado: vi.fn(),
}));
vi.mock('../app/auth', () => ({
  useAuth: () => ({ puede: () => true, usuario: { rol: { codigo: 'atencion', nombre: '', alcance_global: true }, sucursales: [], permisos: [] } }),
}));

const inc = (extra: Partial<Incidencia> = {}) => ({
  id: 9, folio: 'INC-9', tipo: 'otro', prioridad: 'critica', estado: 'en_atencion', pedido_id: 1, pedido_folio: 'PED-1', paquete_id: null,
  devolucion_id: null, transferencia_id: null, sucursal_id: null, descripcion: 'Paquete con humedad.', resolucion: null, responsable_id: null,
  creado: '2026-11-20T10:00:00Z', actualizado: '2026-11-20T10:00:00Z', evidencias: [], empleado: null, articulo: null,
  cliente: 'Clínica San Rafael', turno: 'lurima_atender', turno_actor: 'lurima', turno_desde: null, ultima_actividad: null, reposicion_de: null,
  cierre_por_sucursal: true, transiciones: ['resuelta'], reposiciones: [], reposicion_sugerida: [],
  seguimiento: [
    { fecha: '2026-11-20T10:00:00Z', anterior: null, nuevo: 'abierta', comentario: 'Llegó mojado.', actor: 'Sucursal', responsable: null, lado: 'sucursal', clase: 'mensaje' },
    { fecha: '2026-11-20T11:00:00Z', anterior: 'abierta', nuevo: 'en_atencion', comentario: null, actor: 'Sistema', responsable: null, lado: 'sistema', clase: 'evento' },
  ],
  ...extra,
}) as Incidencia;

function montar(rutas: { path: string; element: JSX.Element }[], entrada: string | { pathname: string; state: unknown }) {
  const router = createMemoryRouter(rutas, { initialEntries: [entrada] });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}
const admin = [{ path: '/admin/incidencias', element: <Incidencias /> }, { path: '/admin/incidencias/:id', element: <IncidenciaDetalle /> }];

beforeEach(() => { vi.mocked(get).mockReset(); vi.mocked(patch).mockReset(); });

describe('detalle de incidencia en el panel', () => {
  it('encabezado con turno y prioridad; regreso a la bandeja de origen con sus filtros', async () => {
    vi.mocked(get).mockResolvedValue(inc() as never);
    montar(admin, { pathname: '/admin/incidencias/9', state: { bandeja: 'bandeja=por_atender&prioridad=critica&pagina=2' } });
    expect(await screen.findByRole('heading', { name: /Incidencia INC-9/ })).toBeInTheDocument();
    expect(vi.mocked(get)).toHaveBeenCalledWith('/admin/incidencias/9');
    expect(screen.getByText('Por atender')).toBeInTheDocument();  // ChipTurno (portal Lurima)
    expect(screen.getByText('Crítica')).toBeInTheDocument();
    expect(screen.getByText('Clínica San Rafael')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'PED-1' })).toHaveAttribute('href', '/admin/pedidos/1');
    expect(screen.getByRole('link', { name: /Volver a «Por atender»/ }))
      .toHaveAttribute('href', '/admin/incidencias?bandeja=por_atender&prioridad=critica&pagina=2');
  });

  it('sin contexto (aviso o enlace directo): regresa a la lista general', async () => {
    vi.mocked(get).mockResolvedValue(inc() as never);
    montar(admin, '/admin/incidencias/9');
    expect(await screen.findByRole('link', { name: 'Volver a incidencias' })).toHaveAttribute('href', '/admin/incidencias');
  });

  it('el seguimiento distingue mensajes de eventos', async () => {
    vi.mocked(get).mockResolvedValue(inc() as never);
    montar(admin, '/admin/incidencias/9');
    await screen.findByText('Llegó mojado.');
    const items = screen.getAllByRole('listitem');
    expect(items.some((li) => li.textContent?.startsWith('Mensaje:'))).toBe(true);
    expect(items.some((li) => li.textContent?.startsWith('Evento del sistema:'))).toBe(true);
  });

  it('la acción del modal se conserva: guardar comentario y cambio de estado', async () => {
    vi.mocked(get).mockResolvedValue(inc() as never);
    vi.mocked(patch).mockResolvedValue(inc({ estado: 'resuelta' }) as never);
    montar(admin, '/admin/incidencias/9');
    fireEvent.change(await screen.findByLabelText(/Agregar comentario o resolución/), { target: { value: 'Enviamos reposición.' } });
    expect(screen.getByRole('button', { name: /Preparar reposición/ })).toBeInTheDocument();  // activa: se puede reponer
    fireEvent.change(screen.getByLabelText(/Cambiar estado/), { target: { value: 'resuelta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(vi.mocked(patch)).toHaveBeenCalledWith('/admin/incidencias/9',
      { estado: 'resuelta', comentario: 'Enviamos reposición.', adjuntos: [] }));
    // Ya resuelta, la reposición deja de ofrecerse (misma regla que tenía el modal)
    await waitFor(() => expect(screen.queryByRole('button', { name: /Preparar reposición/ })).toBeNull());
  });

  it.each([
    [404, 'No encontramos esta incidencia', false],
    [403, 'No tienes acceso a esta incidencia', false],
    [500, 'No se pudo cargar la incidencia', true],
  ])('error %i: mensaje claro, sin datos técnicos', async (status, titulo, reintentar) => {
    vi.mocked(get).mockRejectedValue(new ApiError(status, 'x', 'detalle técnico interno') as never);
    montar(admin, '/admin/incidencias/9');
    expect(await screen.findByText(titulo)).toBeInTheDocument();
    expect(screen.queryByText(/detalle técnico interno/)).toBeNull();
    expect(!!screen.queryByRole('button', { name: 'Reintentar' })).toBe(reintentar);
    expect(screen.getAllByRole('link', { name: 'Volver a incidencias' })[0]).toHaveAttribute('href', '/admin/incidencias');
  });

  it('enlace antiguo ?abrir=<id> redirige a la página de detalle', async () => {
    vi.mocked(get).mockResolvedValue(inc() as never);
    const router = montar(admin, '/admin/incidencias?abrir=9');
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/incidencias/9'));
    expect(await screen.findByRole('heading', { name: /Incidencia INC-9/ })).toBeInTheDocument();
  });

  it('la lista enlaza al detalle y le pasa la bandeja', async () => {
    vi.mocked(get).mockImplementation((url: string) => Promise.resolve(url.startsWith('/admin/incidencias?')
      ? { items: [inc()], total: 1, pagina: 1, por_pagina: 20, paginas: 1, conteo: { por_turno: { lurima_atender: 1 }, cerradas: 0, todas: 1 } }
      : inc()) as never);
    const router = montar(admin, '/admin/incidencias?bandeja=por_atender&prioridad=critica');
    const [enlace] = await screen.findAllByRole('link', { name: 'Gestionar INC-9' });
    expect(enlace).toHaveAttribute('href', '/admin/incidencias/9');
    fireEvent.click(enlace);
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/incidencias/9'));
    expect(router.state.location.state).toEqual({ bandeja: 'bandeja=por_atender&prioridad=critica' });
  });
});

describe('detalle de incidencia de la sucursal', () => {
  const sucursal = [{ path: '/cuenta/incidencias/:id', element: <IncidenciaSucursal /> }];

  it('encabezado con turno de la sucursal y regreso a su bandeja', async () => {
    vi.mocked(get).mockResolvedValue(inc({ turno: 'sucursal_responder', turno_actor: 'sucursal', prioridad: 'alta' }) as never);
    montar(sucursal, { pathname: '/cuenta/incidencias/9', state: { bandeja: 'bandeja=te_toca' } });
    expect(await screen.findByRole('heading', { name: /Incidencia INC-9/ })).toBeInTheDocument();
    expect(screen.getByText('Te toca responder')).toBeInTheDocument();
    expect(screen.getByText('Alta')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Volver a «Te toca»/ })).toHaveAttribute('href', '/cuenta/incidencias?bandeja=te_toca');
  });

  it('404 (no existe o es de otra sucursal): no revela nada y ofrece volver', async () => {
    vi.mocked(get).mockRejectedValue(new ApiError(404, 'no_encontrado', 'Incidencia no encontrada.') as never);
    montar(sucursal, '/cuenta/incidencias/999');
    expect(await screen.findByText('No encontramos esta incidencia')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Volver a mis incidencias' })[0]).toHaveAttribute('href', '/cuenta/incidencias');
  });
});
