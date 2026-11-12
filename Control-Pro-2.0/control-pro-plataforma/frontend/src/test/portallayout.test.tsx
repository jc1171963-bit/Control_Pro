import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import { get } from '../api/cliente';
import { useAuth } from '../app/auth';
import PortalLayout from '../features/portal/PortalLayout';

vi.mock('../api/cliente', () => ({ get: vi.fn() }));
vi.mock('../app/auth', () => ({ useAuth: vi.fn() }));

const salir = vi.fn().mockResolvedValue(undefined);

function montar(ruta = '/cuenta') {
  vi.mocked(useAuth).mockReturnValue({ cliente: { tipo: 'empresa', nombre: 'Ana Contacto', razon_social: 'Sucursal Norte' }, salir } as unknown as ReturnType<typeof useAuth>);
  // ScrollRestoration (usado por el layout) exige un router de datos, igual que el real.
  const router = createMemoryRouter([
    { path: '/', element: <div>INICIO-TIENDA</div> },
    { path: '/cuenta', element: <PortalLayout />, children: [{ index: true, element: <div>CONTENIDO</div> }, { path: '*', element: <div>OTRA-SECCION</div> }] },
  ], { initialEntries: [ruta] });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>,
  );
}

// Con llaves: devolver el mock haría que vitest lo ejecute como limpieza al terminar cada prueba.
// jsdom no implementa scrollTo (lo usa ScrollRestoration): se simula para no llenar la salida de avisos.
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

let borradores: unknown[] = [];
beforeEach(() => {
  vi.mocked(get).mockReset(); salir.mockClear(); localStorage.clear(); borradores = [];
  vi.mocked(get).mockImplementation(async (ruta: string) => (ruta.includes('estado=borrador') ? { items: borradores, total: borradores.length, pagina: 1, por_pagina: 20, paginas: 1 } : { no_leidas: 3 }) as never);
});

it('muestra la identidad Salud Digna y nunca la de LURIMA', async () => {
  const { container } = montar();
  expect(screen.getAllByText('Salud Digna').length).toBeGreaterThan(0);
  expect(container.textContent).not.toMatch(/lurima/i);
  expect((await screen.findAllByText('Sucursal Norte')).length).toBeGreaterThan(0);
});

it('tiene una sola navegación principal con los accesos del portal', () => {
  montar();
  const nav = screen.getByRole('navigation', { name: 'Principal' });
  for (const nombre of ['Inicio', 'Catálogo', 'Crear solicitud', 'Solicitudes', 'Empleados', 'Notificaciones', 'Mi cuenta']) {
    expect(nav).toHaveTextContent(nombre);
  }
  expect(screen.getAllByRole('navigation')).toHaveLength(1);
});

it('marca la sección activa y ofrece saltar al contenido', () => {
  montar();
  expect(screen.getByRole('link', { name: /^Inicio$/ })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveAttribute('href', '#contenido');
  expect(document.querySelector('main#contenido')).not.toBeNull();
});

it('muestra el contador de notificaciones sin leer con nombre accesible', async () => {
  montar();
  expect(await screen.findByRole('link', { name: 'Notificaciones: 3 sin leer' })).toBeInTheDocument();
});

it('el menú de usuario abre, cierra con Escape y cierra sesión volviendo al inicio', async () => {
  montar();
  const boton = screen.getByRole('button', { name: /Ana Contacto/ });
  expect(boton).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(boton);
  expect(boton).toHaveAttribute('aria-expanded', 'true');
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(boton).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(boton);
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  expect(salir).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('INICIO-TIENDA')).toBeInTheDocument();
});

it('en pantallas pequeñas el menú es un drawer: abre, atrapa el foco, cierra con Escape y devuelve el foco', () => {
  montar();
  const abrir = screen.getByRole('button', { name: 'Abrir menú' });
  expect(abrir).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(abrir);
  const dialogo = screen.getByRole('dialog', { name: 'Menú de navegación' });
  expect(abrir).toHaveAttribute('aria-expanded', 'true');
  expect(dialogo.contains(document.activeElement)).toBe(true);
  const enfocables = [...dialogo.querySelectorAll<HTMLElement>('a[href],button')];
  const primero = enfocables[0], ultimo = enfocables[enfocables.length - 1];
  ultimo.focus();
  fireEvent.keyDown(document, { key: 'Tab' });
  expect(document.activeElement).toBe(primero);
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(ultimo);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(abrir).toHaveAttribute('aria-expanded', 'false');
  expect(document.activeElement).toBe(abrir);
});

it('el drawer se cierra al navegar con uno de sus enlaces', async () => {
  montar();
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }));
  fireEvent.click(screen.getByRole('link', { name: 'Empleados' }));
  expect(await screen.findByText('OTRA-SECCION')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('el botón de contraer alterna el riel y recuerda la elección', () => {
  const { unmount } = montar();
  const alternar = screen.getByRole('button', { name: 'Expandir menú' });
  expect(alternar).toHaveAttribute('aria-expanded', 'false'); // sin matchMedia (pruebas) se parte del riel
  fireEvent.click(alternar);
  expect(screen.getByRole('button', { name: 'Contraer menú' })).toHaveAttribute('aria-expanded', 'true');
  expect(localStorage.getItem('portal-menu')).toBe('expandido');
  unmount();
  montar();
  expect(screen.getByRole('button', { name: 'Contraer menú' })).toBeInTheDocument(); // la elección se conservó
});

it('sin almacenamiento disponible el portal sigue funcionando', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
  montar();
  fireEvent.click(screen.getByRole('button', { name: 'Expandir menú' }));
  expect(screen.getByRole('button', { name: 'Contraer menú' })).toBeInTheDocument();
  vi.restoreAllMocks();
});

it('pide el contador de notificaciones una sola vez aunque aparezca en la campana y en el menú', async () => {
  montar();
  await screen.findByRole('link', { name: 'Notificaciones: 3 sin leer' });
  const llamadas = vi.mocked(get).mock.calls.filter(([ruta]) => String(ruta).includes('/cuenta/notificaciones'));
  expect(llamadas).toHaveLength(1);
});

describe('solicitud en curso', () => {
  const borrador = (id: number, articulos: number) => ({ id, folio: `SOL-${id}`, articulos, estado: 'borrador', canal: 'corporativo' });

  it('con borradores muestra el más reciente y enlaza a su edición', async () => {
    borradores = [borrador(8, 3), borrador(7, 1)];
    montar();
    const enlace = await screen.findByRole('link', { name: /Continuar la solicitud en curso SOL-8: 3 artículo\(s\); hay 1 borrador\(es\) más/ });
    expect(enlace).toHaveAttribute('href', '/cuenta/solicitudes/8/editar');
    expect(within(enlace).getByText('En curso · SOL-8')).toBeInTheDocument();
    expect(enlace).toHaveAttribute('data-destino-solicitud'); // destino de la animación al agregar un artículo
  });

  it('con un solo borrador no habla de otros', async () => {
    borradores = [borrador(5, 2)];
    montar();
    expect(await screen.findByRole('link', { name: 'Continuar la solicitud en curso SOL-5: 2 artículo(s)' })).toBeInTheDocument();
  });

  it('sin borradores no aparece (y nunca muestra importes)', async () => {
    const { container } = montar();
    await screen.findByRole('link', { name: 'Notificaciones: 3 sin leer' });
    expect(screen.queryByRole('link', { name: /solicitud en curso/ })).toBeNull();
    expect(container.textContent).not.toMatch(/\$/);
  });
});
