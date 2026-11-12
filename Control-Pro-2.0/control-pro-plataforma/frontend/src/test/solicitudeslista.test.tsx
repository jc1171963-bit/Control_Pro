import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import { get } from '../api/cliente';
import { useAuth } from '../app/auth';
import Pedidos from '../features/cuenta/Pedidos';

vi.mock('../api/cliente', () => ({ get: vi.fn() }));
vi.mock('../app/auth', () => ({ useAuth: vi.fn() }));

const pedido = (id: number, folio: string, estado: string, canal = 'corporativo') => ({ id, folio, canal, estado, modalidad: 'envio', metodo_pago: 'x',
  total: '350.00', creado: '2026-11-10T12:00:00Z', cliente: { id: 1, nombre: 'S' }, articulos: 3, sucursales: [], reserva_expira: null });
const pagina = <T,>(items: T[]) => ({ items, total: items.length, pagina: 1, por_pagina: 10, paginas: 1 });

function ancho(es: boolean) {
  window.matchMedia = ((q: string) => ({ matches: es, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as never;
}
function montar(tipo: 'empresa' | 'persona' = 'empresa', ruta = '/cuenta/pedidos') {
  vi.mocked(useAuth).mockReturnValue({ cliente: { tipo } } as unknown as ReturnType<typeof useAuth>);
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[ruta]}><Pedidos /></MemoryRouter></QueryClientProvider>);
}
const rutas = () => vi.mocked(get).mock.calls.map((c) => c[0] as string);

beforeEach(() => { vi.mocked(get).mockReset(); ancho(true); });

describe('lista de solicitudes del portal', () => {
  it('en escritorio muestra una tabla con enlaces; el borrador va a su edición', async () => {
    vi.mocked(get).mockResolvedValue(pagina([pedido(1, 'SOL-1', 'borrador'), pedido(2, 'SOL-2', 'en_revision')]) as never);
    montar();
    const tabla = await screen.findByRole('table');
    expect(within(tabla).getByRole('link', { name: 'SOL-1' })).toHaveAttribute('href', '/cuenta/solicitudes/1/editar');
    expect(within(tabla).getByRole('link', { name: 'SOL-2' })).toHaveAttribute('href', '/cuenta/pedidos/2');
    expect(rutas()[0]).toContain('canal=corporativo');
  });

  it('en móvil usa tarjetas, sin tabla', async () => {
    ancho(false);
    vi.mocked(get).mockResolvedValue(pagina([pedido(2, 'SOL-2', 'en_revision')]) as never);
    montar();
    expect(await screen.findByRole('link', { name: /SOL-2/ })).toHaveAttribute('href', '/cuenta/pedidos/2');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('filtra por un solo estado (nunca una lista con comas) y vuelve a la página 1', async () => {
    vi.mocked(get).mockResolvedValue(pagina([pedido(2, 'SOL-2', 'en_revision')]) as never);
    montar();
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'enviado' } });
    await waitFor(() => expect(rutas().some((r) => r.includes('estado=enviado') && r.includes('pagina=1'))).toBe(true));
    expect(rutas().some((r) => r.includes(','))).toBe(false);
  });

  it('respeta ?estado= de la URL', async () => {
    vi.mocked(get).mockResolvedValue(pagina([]) as never);
    montar('empresa', '/cuenta/pedidos?estado=borrador');
    await waitFor(() => expect(rutas()[0]).toContain('estado=borrador'));
    expect(screen.getByLabelText('Estado')).toHaveValue('borrador');
  });

  it('vacío sin filtro invita a crear; vacío con filtro lo dice sin ofrecer crear', async () => {
    vi.mocked(get).mockResolvedValue(pagina([]) as never);
    montar();
    expect(await screen.findByText('Aún no tienes solicitudes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Crear solicitud/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'cerrado' } });
    expect(await screen.findByText('No hay solicitudes en este estado')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Crear solicitud/ })).toBeNull();
  });

  it('el filtro por folio solo actúa sobre la página cargada', async () => {
    vi.mocked(get).mockResolvedValue(pagina([pedido(1, 'SOL-1', 'borrador'), pedido(2, 'SOL-2', 'en_revision')]) as never);
    montar();
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Folio'), { target: { value: 'sol-2' } });
    expect(screen.queryByRole('link', { name: 'SOL-1' })).toBeNull();
    expect(screen.getByRole('link', { name: 'SOL-2' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Folio'), { target: { value: 'zzz' } });
    expect(screen.getByText('No hay coincidencias en esta página')).toBeInTheDocument();
  });

  it('muestra el error de la API', async () => {
    vi.mocked(get).mockRejectedValue(new Error('Servidor caído'));
    montar();
    expect(await screen.findByText(/Servidor caído/)).toBeInTheDocument();
  });

  it('las personas conservan los chips y la lista de siempre', async () => {
    vi.mocked(get).mockResolvedValue(pagina([pedido(5, 'PED-5', 'enviado', 'tienda')]) as never);
    montar('persona');
    expect(await screen.findByText('PED-5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Por pagar' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(rutas()[0]).not.toContain('canal=corporativo');
  });
});
