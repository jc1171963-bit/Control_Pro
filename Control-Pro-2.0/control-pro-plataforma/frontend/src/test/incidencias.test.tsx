import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import { get, post } from '../api/cliente';
import type { Incidencia } from '../api/tipos';
import { IncidenciaSucursal } from '../features/cuenta/Incidencias';

vi.mock('../api/cliente', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));

const inc = (estado: string, extra: Partial<Incidencia> = {}) => ({
  id: 4, folio: 'INC-4', tipo: 'seguimiento', prioridad: 'media', estado, pedido_id: 7, pedido_folio: 'SOL-7', paquete_id: null,
  devolucion_id: null, transferencia_id: null, sucursal_id: null, descripcion: 'La talla no corresponde.', resolucion: 'Se envió la talla G',
  responsable_id: null, creado: '2026-11-10T10:00:00Z', actualizado: '2026-11-11T10:00:00Z', evidencias: [], empleado: null, articulo: null,
  cierre_por_sucursal: true,
  seguimiento: [{ fecha: '2026-11-10T10:00:00Z', anterior: null, nuevo: 'abierta', comentario: 'Incidencia registrada', actor: 'Sucursal', responsable: null }],
  ...extra,
}) as Incidencia;

function montar() {
  const router = createMemoryRouter([{ path: '/cuenta/incidencias/:id', element: <IncidenciaSucursal /> }], { initialEntries: ['/cuenta/incidencias/4'] });
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
}

beforeEach(() => { vi.mocked(get).mockReset(); vi.mocked(post).mockReset(); });

describe('incidencia de la sucursal', () => {
  it('resuelta: muestra la resolución, confirma la solución o exige un motivo para reabrir', async () => {
    vi.mocked(get).mockResolvedValue(inc('resuelta') as never);
    vi.mocked(post).mockResolvedValue(inc('cerrada') as never);
    montar();
    expect(await screen.findByText(/Se envió la talla G/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /No quedó resuelta/ }));
    const reabrir = screen.getByRole('button', { name: 'Reabrir' });
    expect(reabrir).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Qué falta por resolver/), { target: { value: 'Sigue sin quedarle' } });
    expect(reabrir).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar solución' }));
    await waitFor(() => expect(vi.mocked(post)).toHaveBeenCalledWith('/cuenta/incidencias/4/confirmar'));
    expect(await screen.findByText(/Incidencia cerrada/)).toBeInTheDocument();
  });

  it('en atención: permite escribir a la comercializadora; cerrada ya no', async () => {
    vi.mocked(get).mockResolvedValue(inc('en_atencion') as never);
    vi.mocked(post).mockResolvedValue(inc('en_atencion') as never);
    montar();
    fireEvent.change(await screen.findByLabelText(/Escribe a la comercializadora/), { target: { value: 'Ya subimos la foto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
    await waitFor(() => expect(vi.mocked(post)).toHaveBeenCalledWith('/cuenta/incidencias/4/mensajes', { texto: 'Ya subimos la foto', adjuntos: [] }));
    expect(screen.queryByRole('button', { name: 'Confirmar solución' })).not.toBeInTheDocument();
  });
});
