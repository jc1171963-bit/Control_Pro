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
const PERMISO = { id: 9, estado: 'aprobado', motivo: 'Altas del turno', respuesta: null, solicitado: '2026-11-13T10:00:00Z', resuelto_en: '2026-11-13T10:05:00Z',
  vigente_hasta: '2099-01-01T00:00:00Z', terminado_en: null, resuelto_por: 'Aprobador', sucursal: { id: 1, nombre: 'Norte', correo: 'n@x.mx', zona: null } };
/** La API simulada responde según la ruta: empleados y estado del permiso de padrón (vigente salvo que se indique). */
function responder(empleados: unknown, vigente: unknown = PERMISO) {
  vi.mocked(get).mockImplementation(async (ruta: string) => (ruta.startsWith('/cuenta/permiso-padron')
    ? { vigente, pendiente: null, historial: vigente ? [vigente] : [] } : empleados) as never);
}
function montar() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Empleados /></QueryClientProvider>);
}

beforeEach(() => { vi.mocked(get).mockReset(); vi.mocked(put).mockReset().mockResolvedValue({} as never); vi.mocked(post).mockReset(); ancho(true); responder(EMP); });

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
    responder([]);
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

  it('sin permiso del aprobador el padrón queda bloqueado y se puede solicitar con un motivo', async () => {
    responder(EMP, null);
    vi.mocked(post).mockResolvedValue({} as never);
    montar();
    await screen.findByRole('table');
    expect(await screen.findByText('Tu padrón está bloqueado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Agregar/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Editar a Ángela Ruiz' })).toBeDisabled();
    const pedir = screen.getByRole('button', { name: /Solicitar permiso/ });
    expect(pedir).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Motivo del permiso'), { target: { value: 'Ingresa una enfermera' } });
    fireEvent.click(pedir);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/cuenta/permiso-padron', { motivo: 'Ingresa una enfermera' }));
  });

  it('con permiso vigente muestra hasta cuándo y permite terminar los cambios', async () => {
    vi.mocked(post).mockResolvedValue({} as never);
    montar();
    expect(await screen.findByText(/Puedes modificar tu padrón hasta/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Terminé mis cambios' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/cuenta/permiso-padron/9/cerrar'));
  });
});
