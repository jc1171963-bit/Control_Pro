import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import { get, post } from '../api/cliente';
import type { Pedido } from '../api/tipos';
import { useAuth } from '../app/auth';
import DetalleSolicitud, { proximoPaso } from '../features/cuenta/DetalleSolicitud';
import Pedidos from '../features/cuenta/Pedidos';

vi.mock('../api/cliente', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock('../app/auth', () => ({ useAuth: vi.fn() }));

const emp = { id: 1, nombre: 'Ana López', puesto: 'Enfermería', numero: 'E1' };
const detalle = { id: 11, nombre: 'Bata', talla: 'M', color: 'Blanco', cantidad: 2, cantidad_cancelada: 0, cantidad_entregada: 0, excepcion: null, empleado: emp, variante_id: 101 };
const base = (estado: string, extra: Partial<Pedido> = {}) => ({
  id: 7, folio: 'SOL-7', estado, creado: '2026-11-10T10:00:00Z', articulos: 2, notas: null, detalles: [detalle], paquetes: [], entregas_individuales: [],
  incidencias: [], historial: [], aprobaciones: [], ...extra,
}) as unknown as Pedido;
const paquete = (estado: string, recepcion: unknown = null) => ({ id: 3, folio: 'PAQ-3', estado, recepcion, sucursal: 'Toluca', creado: '2026-11-11T10:00:00Z', contenido: [], envio: null });
const entrega = (estado: string, conformidad_en: string | null = null) => ({ id: 5, paquete_id: 3, estado, conformidad_en, empleado: emp, detalles: [], registrado_por: null, entregado_en: null, valoracion: null });

describe('qué sigue (derivado de los datos de la solicitud)', () => {
  it('cubre revisión, devolución con su motivo y rechazo', () => {
    expect(proximoPaso(base('borrador')).titulo).toBe('Revisa y envía tu solicitud');
    expect(proximoPaso(base('en_revision')).tono).toBe('espera');
    const devuelta = proximoPaso(base('devuelto', { aprobaciones: [{ decision: 'devuelto', motivo: 'Falta la talla', usuario: 'x', fecha: '' }] } as never));
    expect(devuelta).toMatchObject({ tono: 'alerta', texto: 'Observación del distribuidor: Falta la talla' });
    expect(proximoPaso(base('rechazado')).tono).toBe('fin');
  });

  it('pide recibir, luego entregar y luego la conformidad, en ese orden', () => {
    expect(proximoPaso(base('enviado', { paquetes: [paquete('entregado')] } as never))).toMatchObject({ ir: 'paquetes', titulo: 'Registra la recepción de 1 paquete(s)' });
    const recibido = paquete('entregado', { estado: 'completa' });
    expect(proximoPaso(base('enviado', { paquetes: [recibido], entregas_individuales: [entrega('pendiente')] } as never))).toMatchObject({ ir: 'empleados', titulo: 'Entrega los artículos a 1 empleado(s)' });
    expect(proximoPaso(base('entregado', { paquetes: [recibido], entregas_individuales: [entrega('entregada')] } as never)).titulo).toBe('Registra la conformidad de 1 empleado(s)');
    expect(proximoPaso(base('cerrado', { paquetes: [recibido], entregas_individuales: [entrega('entregada', '2026-11-12')] } as never)).titulo).toBe('Solicitud cerrada');
    // Paquete en camino sin llegar: no hay acción todavía.
    expect(proximoPaso(base('enviado', { paquetes: [paquete('en_transito')] } as never)).tono).toBe('espera');
  });
});

function montar(el: JSX.Element, ruta = '/x', patron = '/x') {
  vi.mocked(useAuth).mockReturnValue({ cliente: { tipo: 'empresa', nombre: 'Ana', razon_social: 'Sucursal Norte' } } as unknown as ReturnType<typeof useAuth>);
  const router = createMemoryRouter([{ path: patron, element: el }, { path: '/cuenta/solicitudes/:id/editar', element: <div>EDITAR</div> }], { initialEntries: [ruta] });
  return { router, ...render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>) };
}

beforeEach(() => {
  vi.mocked(get).mockReset(); vi.mocked(post).mockReset();
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia;
});

describe('detalle de la solicitud', () => {
  it('muestra qué sigue y no envía a revisión hasta confirmar', async () => {
    vi.mocked(post).mockResolvedValue({} as never);
    montar(<DetalleSolicitud p={base('borrador')} />);
    expect(screen.getByRole('heading', { name: 'Revisa y envía tu solicitud' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a revisión' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Enviar la solicitud a revisión' });
    expect(within(dialogo).getByText(/ya no podrás editarla/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar envío' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/cuenta/pedidos-corporativos/7/enviar'));
  });

  it('una devuelta muestra el motivo una sola vez y la acción de corregir', () => {
    montar(<DetalleSolicitud p={base('devuelto', { aprobaciones: [{ decision: 'devuelto', motivo: 'Falta la talla', usuario: 'x', fecha: '' }] } as never)} />);
    expect(screen.getAllByText(/Falta la talla/)).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Corregir y reenviar' })).toHaveAttribute('href', '/cuenta/solicitudes/7/editar');
  });
});

describe('listado de solicitudes', () => {
  const pagina = (items: unknown[]) => ({ items, total: items.length, pagina: 1, por_pagina: 10, paginas: 1 });
  const fila = (id: number, estado: string) => ({ id, folio: `SOL-${id}`, estado, canal: 'corporativo', creado: '2026-11-10T10:00:00Z', articulos: 3 });

  it('toma el estado de la URL, lo actualiza al cambiarlo y ofrece la acción según el estado', async () => {
    vi.mocked(get).mockImplementation(async (r: string) => pagina(r.includes('estado=devuelto') ? [fila(2, 'devuelto')] : [fila(1, 'borrador'), fila(3, 'en_revision')]) as never);
    const { router } = montar(<Pedidos />, '/cuenta/pedidos?estado=devuelto', '/cuenta/pedidos');
    expect(await screen.findByRole('link', { name: 'Corregir: SOL-2' })).toHaveAttribute('href', '/cuenta/pedidos/2');
    expect(vi.mocked(get).mock.calls[0][0]).toContain('estado=devuelto');
    fireEvent.change(screen.getByRole('combobox', { name: 'Estado' }), { target: { value: '' } });
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(await screen.findByRole('link', { name: 'Continuar: SOL-1' })).toHaveAttribute('href', '/cuenta/solicitudes/1/editar');
    expect(screen.getByRole('link', { name: 'Ver detalle: SOL-3' })).toBeInTheDocument();
  });
});

describe('mensajes de error', () => {
  it('traduce solo los fallos de red y conserva los demás mensajes', async () => {
    const { mensajeError } = await import('../lib/formato');
    expect(mensajeError(new TypeError('Failed to fetch'))).toMatch(/No pudimos comunicarnos con el servidor/);
    expect(mensajeError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe("Cannot read properties of undefined (reading 'x')");
    expect(mensajeError(new Error('Servidor no disponible'))).toBe('Servidor no disponible');
  });
});
