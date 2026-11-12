import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, vi } from 'vitest';
import { get, post, put } from '../api/cliente';
import { Empleados } from '../features/cuenta/Corporativo';

vi.mock('../api/cliente', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));

const EMP = [
  { id: 1, numero: '100', nombre: 'Ángela Ruiz', puesto: 'Enfermería', area: 'Urgencias', activo: true },
  { id: 2, numero: '200', nombre: 'Beto Díaz', puesto: 'Staff', area: null, activo: false },
];
function ancho(es: boolean) {
  window.matchMedia = ((q: string) => ({ matches: es, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as never;
}
function montar() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Empleados /></QueryClientProvider>);
}

beforeEach(() => { vi.mocked(get).mockReset(); vi.mocked(put).mockReset().mockResolvedValue({} as never); vi.mocked(post).mockReset(); ancho(true); vi.mocked(get).mockResolvedValue(EMP as never); });

describe('empleados del portal', () => {
  it('lista en tabla con su estado; en móvil, en tarjetas', async () => {
    const { unmount } = montar();
    const tabla = await screen.findByRole('table');
    expect(within(tabla).getByText('Ángela Ruiz')).toBeInTheDocument();
    expect(within(tabla).getByText('Inactivo')).toBeInTheDocument();
    unmount(); ancho(false); montar();
    expect(await screen.findByText('Beto Díaz')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('busca sin distinguir acentos ni mayúsculas, y filtra por estado', async () => {
    montar();
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'angela' } });
    expect(screen.getByText('Ángela Ruiz')).toBeInTheDocument();
    expect(screen.queryByText('Beto Díaz')).toBeNull();
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'ÁNGELA' } });
    expect(screen.getByText('Ángela Ruiz')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'inactivos' } });
    expect(screen.queryByText('Ángela Ruiz')).toBeNull();
    expect(screen.getByText('Beto Díaz')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'zzz' } });
    expect(screen.getByText('Sin coincidencias')).toBeInTheDocument();
  });

  it('desactivar envía el empleado completo con activo invertido', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Desactivar a Ángela Ruiz' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/cuenta/empleados/1', { numero: '100', nombre: 'Ángela Ruiz', puesto: 'Enfermería', area: 'Urgencias', activo: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Activar a Beto Díaz' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/cuenta/empleados/2', expect.objectContaining({ activo: true, area: null })));
  });

  it('sin empleados invita a agregar; con error de la API lo muestra', async () => {
    vi.mocked(get).mockResolvedValue([] as never);
    const { unmount } = montar();
    expect(await screen.findByText('Aún no hay empleados')).toBeInTheDocument();
    unmount();
    vi.mocked(get).mockRejectedValue(new Error('Sin conexión'));
    montar();
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
    expect(screen.queryByText('Aún no hay empleados')).toBeNull();
  });

  it('el alta envía los datos del formulario', async () => {
    vi.mocked(post).mockResolvedValue({} as never);
    montar();
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: /Agregar/ }));
    const dlg = await screen.findByRole('dialog');
    fireEvent.change(within(dlg).getByLabelText('Número de empleado'), { target: { value: '300' } });
    fireEvent.change(within(dlg).getByLabelText('Nombre completo'), { target: { value: 'Carla Soto' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/cuenta/empleados', expect.objectContaining({ numero: '300', nombre: 'Carla Soto', area: null, activo: true })));
  });
});
