import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import { post } from '../api/cliente';
import type { Pedido } from '../api/tipos';
import { useAuth } from '../app/auth';
import DetalleSolicitud from '../features/cuenta/DetalleSolicitud';

vi.mock('../api/cliente', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), urlPrivada: vi.fn() }));
vi.mock('../app/auth', () => ({ useAuth: vi.fn() }));

const ana = { id: 1, nombre: 'Ana López', puesto: 'Enfermería' };
const pieza = (id: number, nombre: string, cantidad: number) =>
  ({ pedido_detalle_id: id, sku: `S${id}`, nombre, talla: 'M', color: null, cantidad, empleado: ana.nombre, empleado_id: ana.id, puesto: ana.puesto });
const contenido = [pieza(11, 'Bata', 2), pieza(12, 'Blusa', 1)];
const paquete = (extra = {}) => ({ id: 3, folio: 'PAQ-3', estado: 'entregado', recepcion: null, sucursal: 'Toluca', creado: '2026-11-11T10:00:00Z',
  contenido, individuales: [{ empleado: ana, piezas: contenido, total_piezas: 3 }], envio: null, reposicion: null, ...extra });
const pedido = (paquetes: unknown[]) => ({
  id: 7, folio: 'SOL-7', estado: 'enviado', creado: '2026-11-10T10:00:00Z', articulos: 3, notas: null,
  detalles: [{ id: 11, nombre: 'Bata', talla: 'M', color: 'Blanco', cantidad: 2, cantidad_cancelada: 0, cantidad_entregada: 2, excepcion: null, empleado: ana, variante_id: 1 },
    { id: 12, nombre: 'Blusa', talla: 'M', color: 'Blanco', cantidad: 1, cantidad_cancelada: 0, cantidad_entregada: 1, excepcion: null, empleado: ana, variante_id: 2 }],
  paquetes, entregas_individuales: [], incidencias: [], historial: [], aprobaciones: [],
}) as unknown as Pedido;

function montar(p: Pedido) {
  vi.mocked(useAuth).mockReturnValue({ cliente: { tipo: 'empresa', nombre: 'Ana' } } as unknown as ReturnType<typeof useAuth>);
  const router = createMemoryRouter([{ path: '/x', element: <DetalleSolicitud p={p} /> }], { initialEntries: ['/x'] });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
}

beforeEach(() => {
  vi.mocked(post).mockReset();
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia;
});

describe('recepción del paquete por persona', () => {
  it('sin problemas se registra completa con todo lo esperado', async () => {
    vi.mocked(post).mockResolvedValue({} as never);
    montar(pedido([paquete()]));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar recepción' }));
    const d = await screen.findByRole('dialog', { name: /Recepción del paquete PAQ-3/ });
    fireEvent.click(within(d).getByRole('button', { name: 'Confirmar recepción completa' }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(vi.mocked(post).mock.calls[0][1]).toMatchObject({ completa: true, evidencias: [],
      partidas: [{ pedido_detalle_id: 11, recibida: 2 }, { pedido_detalle_id: 12, recibida: 1 }] });
  });

  it('un artículo con problema pide cuántas sirven y avisa de la reposición con guía', async () => {
    vi.mocked(post).mockResolvedValue({} as never);
    montar(pedido([paquete()]));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar recepción' }));
    const d = await screen.findByRole('dialog', { name: /Recepción del paquete PAQ-3/ });
    const bata = within(d).getByRole('radiogroup', { name: '¿Cómo llegó Bata?' });
    fireEvent.click(within(bata).getByRole('radio', { name: 'Con problema' }));
    fireEvent.change(within(d).getByLabelText('Piezas de Bata en buen estado'), { target: { value: '1' } });
    fireEvent.change(within(d).getByLabelText('Nota sobre Bata'), { target: { value: 'Manga rota' } });
    expect(within(d).getByText(/envío de reposición con su propia guía/)).toBeInTheDocument();
    expect(within(d).getByText('Fotos del problema')).toBeInTheDocument();
    fireEvent.click(within(d).getByRole('button', { name: 'Registrar recepción con incidencia' }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(vi.mocked(post).mock.calls[0][1]).toMatchObject({ completa: false, partidas: [
      { pedido_detalle_id: 11, recibida: 1, problema: 'danado', nota: 'Manga rota', evidencias: [] },
      { pedido_detalle_id: 12, recibida: 1 }] });
  });

  it('un paquete de reposición se distingue con el folio de su incidencia', () => {
    montar(pedido([paquete({ id: 4, folio: 'PAQ-4', reposicion: { incidencia_id: 9, folio: 'INC-9' }, recepcion: { estado: 'completa', diferencias: null, fecha: '2026-11-12T10:00:00Z', detalles: [] } })]));
    expect(screen.getByText('Reposición de la incidencia INC-9')).toBeInTheDocument();
  });
});
