import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import { get, post } from '../api/cliente';
import { useAuth } from '../app/auth';
import Perfil from '../features/cuenta/Perfil';
import Direcciones from '../features/cuenta/Direcciones';
import Notificaciones from '../features/cuenta/Notificaciones';

vi.mock('../api/cliente', () => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock('../app/auth', () => ({ useAuth: vi.fn() }));

const DIR = { id: 1, alias: 'Almacén', destinatario: 'Ana', telefono: '555', calle: 'Reforma', numero: '10', colonia: 'Centro', ciudad: 'CDMX', estado: 'CDMX', cp: '06000', referencias: 'Portón azul', predeterminada: true };
const RESUMEN = { zona: { nombre: 'Zona Centro', gerente: 'Gina Gómez', correo: 'g@x.mx', telefono: '555 111', vacante: false, division: null } };
const noti = (id: number, leida: boolean) => ({ id, evento: 'x', mensaje: `Aviso ${id}`, enlace: `/cuenta/pedidos/${id}`, leida, fecha: '2026-11-11T10:00:00Z' });
const pag = (items: unknown[], no_leidas: number) => ({ items, total: items.length, pagina: 1, por_pagina: 20, paginas: 1, no_leidas });

function montar(el: JSX.Element, tipo: 'empresa' | 'persona' = 'empresa', ruta = '/x') {
  vi.mocked(useAuth).mockReturnValue({ cliente: { tipo, nombre: 'Ana Contacto', razon_social: 'Sucursal Norte', correo: 'a@x.mx', telefono: '555 000' }, actualizarCuenta: vi.fn() } as unknown as ReturnType<typeof useAuth>);
  const router = createMemoryRouter([{ path: '/x', element: el }, { path: '/cuenta/perfil', element: <div>PERFIL-DESTINO</div> }], { initialEntries: [ruta] });
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
}

beforeEach(() => {
  vi.mocked(get).mockReset(); vi.mocked(post).mockReset().mockResolvedValue({} as never);
  vi.mocked(get).mockImplementation(async (r: string) => (r.includes('/direcciones') ? [DIR] : r.includes('/resumen') ? RESUMEN : pag([], 0)) as never);
});

describe('Mi cuenta de la sucursal', () => {
  it('reúne datos, dirección de entrega y contactos de zona, sin formularios', async () => {
    montar(<Perfil />);
    expect(await screen.findByText('Sucursal Norte')).toBeInTheDocument();
    expect(await screen.findByText('Almacén')).toBeInTheDocument();
    expect(screen.getByText(/Reforma 10, Centro/)).toBeInTheDocument();
    expect(await screen.findByText('Gina Gómez')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('sin dirección lo dice; con error de la API lo muestra', async () => {
    vi.mocked(get).mockImplementation(async (r: string) => { if (r.includes('/direcciones')) return [] as never; return RESUMEN as never; });
    const { unmount } = montar(<Perfil />);
    expect(await screen.findByText(/Aún no tienes una dirección/)).toBeInTheDocument();
    unmount();
    vi.mocked(get).mockImplementation(async (r: string) => { if (r.includes('/direcciones')) throw new Error('Falla de red'); return RESUMEN as never; });
    montar(<Perfil />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Falla de red');
  });

  it('las personas conservan su perfil editable', async () => {
    montar(<Perfil />, 'persona');
    expect(await screen.findByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
  });

  it('/cuenta/direcciones lleva a Mi cuenta en empresas y se conserva para personas', async () => {
    const { unmount } = montar(<Direcciones />, 'empresa');
    expect(await screen.findByText('PERFIL-DESTINO')).toBeInTheDocument();
    unmount();
    montar(<Direcciones />, 'persona');
    expect(await screen.findByText('Direcciones de entrega')).toBeInTheDocument();
  });
});

describe('notificaciones', () => {
  it('marca una como leída con su enlace y deshabilita «todas» cuando no hay sin leer', async () => {
    vi.mocked(get).mockResolvedValue(pag([noti(1, false), noti(2, true)], 1) as never);
    const { unmount } = montar(<Notificaciones />);
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar como leída: Aviso 1' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/cuenta/notificaciones/leer', { ids: [1] }));
    expect(screen.getByRole('link', { name: 'Aviso 1' })).toHaveAttribute('href', '/cuenta/pedidos/1');
    expect(screen.getByRole('button', { name: 'Marcar todas como leídas' })).toBeEnabled();
    unmount();
    vi.mocked(get).mockResolvedValue(pag([noti(2, true)], 0) as never);
    montar(<Notificaciones />);
    await screen.findByText('Aviso 2');
    expect(screen.getByRole('button', { name: 'Marcar todas como leídas' })).toBeDisabled();
  });

  it('error al cargar muestra la alerta, vacío muestra «Sin notificaciones»', async () => {
    vi.mocked(get).mockRejectedValue(new Error('Sin servicio'));
    const { unmount } = montar(<Notificaciones />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin servicio');
    unmount();
    vi.mocked(get).mockResolvedValue(pag([], 0) as never);
    montar(<Notificaciones />);
    expect(await screen.findByText('Sin notificaciones')).toBeInTheDocument();
  });
});
