import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import { get } from '../api/cliente';
import { useAuth } from '../app/auth';
import Inicio from '../features/portal/Inicio';

vi.mock('../api/cliente', () => ({ get: vi.fn() }));
vi.mock('../app/auth', () => ({ useAuth: vi.fn() }));

const pedido = (id: number, folio: string, estado: string) => ({ id, folio, canal: 'corporativo', estado, modalidad: 'envio', metodo_pago: 'credito_corporativo',
  total: '350.00', creado: '2026-11-10T12:00:00Z', cliente: { id: 1, nombre: 'Sucursal Norte' }, articulos: 3, sucursales: [], reserva_expira: null });
const pagina = <T,>(items: T[]) => ({ items, total: items.length, pagina: 1, por_pagina: 5, paginas: 1 });

const RESUMEN = {
  solicitudes: { borradores: 1, en_revision: 2, por_corregir: 1, en_proceso: 3, entregadas: 5, rechazadas: 1 },
  paquetes_en_camino: 1, paquetes_por_recibir: 2, entregas_pendientes: 0, conformidades_pendientes: 0, incidencias_abiertas: 0, empleados_activos: 8,
  zona: { nombre: 'Zona Centro', gerente: null, correo: null, telefono: null, vacante: true,
    division: { nombre: 'División Norte', responsable: 'Luis Pérez', correo: 'luis@ejemplo.mx', telefono: '555 123 4567' } },
};
const AVISOS = { ...pagina([{ id: 1, evento: 'pedido_en_revision', mensaje: 'Tu solicitud SOL-8 está en revisión.', enlace: '/cuenta/pedidos/8', leida: false, fecha: '2026-11-11T10:00:00Z' }]), no_leidas: 1 };

type Datos = { resumen?: unknown; recientes?: unknown; borradores?: unknown; avisos?: unknown };
function datos(d: Datos = {}) {
  const v = { resumen: RESUMEN, recientes: pagina([pedido(7, 'SOL-7', 'borrador'), pedido(8, 'SOL-8', 'en_revision')]), borradores: pagina([pedido(7, 'SOL-7', 'borrador')]), avisos: AVISOS, ...d };
  vi.mocked(get).mockImplementation(async (ruta: string) => {
    if (ruta.includes('/cuenta/resumen')) { if (v.resumen instanceof Error) throw v.resumen; return v.resumen as never; }
    if (ruta.includes('/notificaciones')) return v.avisos as never;
    if (ruta.includes('estado=borrador')) return v.borradores as never;
    return v.recientes as never;
  });
}

function montar(tipo: 'empresa' | 'persona' = 'empresa') {
  vi.mocked(useAuth).mockReturnValue({ cliente: { tipo, nombre: 'Ana Contacto', razon_social: tipo === 'empresa' ? 'Sucursal Norte' : null } } as unknown as ReturnType<typeof useAuth>);
  const router = createMemoryRouter([
    { path: '/cuenta', children: [{ index: true, element: <Inicio /> }, { path: 'pedidos', element: <div>LISTA-DE-PEDIDOS</div> }] },
  ], { initialEntries: ['/cuenta'] });
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
}

const indicadores = () => screen.findByRole('region', { name: 'Estado de tus solicitudes' });
const tarjeta = (zona: HTMLElement, titulo: string) => within(zona).getByText(titulo).closest('.rounded-2xl') as HTMLElement;
const valor = (zona: HTMLElement, titulo: string) => tarjeta(zona, titulo).querySelector('.font-display')!.textContent;

beforeEach(() => { vi.mocked(get).mockReset(); });

it('saluda por el primer nombre del contacto y nombra la sucursal', async () => {
  datos(); montar();
  expect(await screen.findByRole('heading', { level: 1, name: 'Hola, Ana' })).toBeInTheDocument();
  expect(screen.getByText(/Sucursal Norte\./)).toBeInTheDocument();
});

it('calcula los indicadores con el resumen real', async () => {
  datos(); montar();
  const z = await indicadores();
  expect(valor(z, 'Borradores')).toBe('1');
  expect(valor(z, 'En revisión')).toBe('2');
  expect(valor(z, 'Aprobadas')).toBe('8'); // en proceso (3) + entregadas (5)
  expect(within(z).getByText('3 en proceso · 5 entregadas')).toBeInTheDocument();
  expect(valor(z, 'Devueltas o rechazadas')).toBe('2'); // por corregir (1) + rechazadas (1)
});

it('solo enlaza con filtros de un estado (el backend no acepta listas)', async () => {
  datos(); montar();
  const z = await indicadores();
  expect(tarjeta(z, 'Borradores').closest('a')).toHaveAttribute('href', '/cuenta/pedidos?estado=borrador');
  expect(tarjeta(z, 'En revisión').closest('a')).toHaveAttribute('href', '/cuenta/pedidos?estado=en_revision');
  expect(tarjeta(z, 'Aprobadas').closest('a')).toBeNull();
  expect(within(z).getByRole('link', { name: '1 por corregir' })).toHaveAttribute('href', '/cuenta/pedidos?estado=devuelto');
  expect(screen.getAllByRole('link').every((a) => !/estado=[a-z_]+,/.test(a.getAttribute('href') ?? ''))).toBe(true);
});

it('no muestra importes ni precios', async () => {
  datos(); const { container } = montar();
  await indicadores(); await screen.findByText('SOL-8');
  expect(container.textContent).not.toMatch(/\$|350/);
});

it('las solicitudes recientes llevan al detalle y los borradores a la edición', async () => {
  datos(); montar();
  await screen.findAllByText('SOL-7');
  for (const enlace of screen.getAllByRole('link', { name: /^SOL-7/ })) expect(enlace).toHaveAttribute('href', '/cuenta/solicitudes/7/editar');
  expect(screen.getByRole('link', { name: /^SOL-8/ })).toHaveAttribute('href', '/cuenta/pedidos/8');
});

it('muestra las notificaciones recientes con su enlace y si están sin leer', async () => {
  datos(); montar();
  expect(await screen.findByRole('link', { name: 'Tu solicitud SOL-8 está en revisión.' })).toHaveAttribute('href', '/cuenta/pedidos/8');
  expect(screen.getByText(/Sin leer/)).toBeInTheDocument();
});

it('muestra los contactos de la zona y marca la vacante', async () => {
  datos(); montar();
  expect(await screen.findByText('Tu zona: Zona Centro')).toBeInTheDocument();
  expect(screen.getByText('Vacante')).toBeInTheDocument();
  expect(screen.getByText('Luis Pérez')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'luis@ejemplo.mx' })).toHaveAttribute('href', 'mailto:luis@ejemplo.mx');
});

it('muestra los estados vacíos sin inventar datos', async () => {
  datos({ recientes: pagina([]), borradores: pagina([]), avisos: { ...pagina([]), no_leidas: 0 } }); montar();
  expect(await screen.findByText('Aún no tienes solicitudes')).toBeInTheDocument();
  expect(screen.getByText('Sin notificaciones')).toBeInTheDocument();
  expect(screen.getByText('Sin borradores')).toBeInTheDocument();
});

it('si falla el resumen muestra el error y permite reintentar', async () => {
  datos({ resumen: new Error('Sin conexión') }); montar();
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
  expect(screen.queryByRole('region', { name: 'Estado de tus solicitudes' })).toBeNull();
  const antes = vi.mocked(get).mock.calls.filter(([r]) => String(r).includes('/cuenta/resumen')).length;
  datos({ resumen: RESUMEN });
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await indicadores()).toBeInTheDocument();
  expect(vi.mocked(get).mock.calls.filter(([r]) => String(r).includes('/cuenta/resumen')).length).toBeGreaterThan(antes);
});

it('una cuenta de persona no tiene este inicio y va a sus pedidos', async () => {
  datos(); montar('persona');
  expect(await screen.findByText('LISTA-DE-PEDIDOS')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
});
