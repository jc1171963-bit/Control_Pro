import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, vi } from 'vitest';
import { get } from '../api/cliente';
import { ListaUbicaciones } from '../features/tienda/Ubicaciones';

vi.mock('../api/cliente', () => ({ get: vi.fn() }));

const base = { id: 1, codigo: 'QRO', nombre: 'Sucursal Querétaro', ciudad: 'Querétaro', direccion: 'Av. Central 1', estado: 'Querétaro', cp: '76000',
  telefono: null, correo: null, horario: {}, permite_recoger: true, activo: true };

const montar = (props = {}) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ListaUbicaciones {...props} /></QueryClientProvider>,
);

// Con llaves: devolver el mock haría que vitest lo ejecute como limpieza al terminar cada prueba.
beforeEach(() => { vi.mocked(get).mockReset(); });

it('muestra la sucursal sin teléfono, correo ni horario cuando faltan', async () => {
  vi.mocked(get).mockResolvedValue([base]);
  montar();
  expect(await screen.findByText('Sucursal Querétaro')).toBeInTheDocument();
  expect(screen.getByText(/Av\. Central 1/)).toBeInTheDocument();
  expect(screen.queryByRole('link')).toBeNull();
});

it('enlaza teléfono y correo cuando existen', async () => {
  vi.mocked(get).mockResolvedValue([{ ...base, telefono: '442 215 0000', correo: 'qro@ejemplo.mx', horario: { lunes: '9-18' } }]);
  montar();
  expect(await screen.findByRole('link', { name: '442 215 0000' })).toHaveAttribute('href', 'tel:4422150000');
  expect(screen.getByRole('link', { name: 'qro@ejemplo.mx' })).toHaveAttribute('href', 'mailto:qro@ejemplo.mx');
  expect(screen.getByText(/9-18/)).toBeInTheDocument();
});

it('muestra el estado vacío', async () => {
  vi.mocked(get).mockResolvedValue([]);
  montar();
  expect(await screen.findByText('Aún no hay ubicaciones publicadas')).toBeInTheDocument();
});

it('muestra el error con opción de reintentar', async () => {
  vi.mocked(get).mockRejectedValue(new Error('Sin conexión'));
  montar();
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
  expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
});

it('solo avisa de la falta de mostrador cuando se pide', async () => {
  vi.mocked(get).mockResolvedValue([{ ...base, permite_recoger: false }]);
  const { unmount } = montar();
  await screen.findByText('Sucursal Querétaro');
  expect(screen.queryByText(/sin entregas en mostrador/)).toBeNull();
  unmount();
  montar({ mostrarRecoger: true });
  expect(await screen.findByText(/sin entregas en mostrador/)).toBeInTheDocument();
});
