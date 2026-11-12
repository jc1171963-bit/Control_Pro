import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import { get, post, put } from '../api/cliente';
import { useAuth } from '../app/auth';
import { CONTEXTO_CATALOGO_PORTAL } from '../features/portal/rutas';
import { ContextoCatalogoCtx } from '../features/tienda/contextoCatalogo';
import Producto from '../features/tienda/Producto';
import { agregarAlBorrador } from '../lib/solicitud';

vi.mock('../api/cliente', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), claveIdempotencia: () => 'clave-fija' }));
vi.mock('../app/auth', () => ({ useAuth: vi.fn() }));
vi.mock('../app/config', () => ({ useConfig: () => ({ cargando: false, canalTienda: false }) }));

const NUEVA = { empleado_id: 1, variante_id: 101, cantidad: 2, excepcion: null };
const EXISTENTE = { empleado_id: 9, variante_id: 500, cantidad: 1, excepcion: null };
const resumen = (id: number, articulos: number, creado: string) => ({ id, folio: `SOL-${id}`, canal: 'corporativo', estado: 'borrador', modalidad: 'envio', metodo_pago: 'credito_corporativo', total: '0.00', creado, cliente: { id: 1, nombre: 'Sucursal' }, articulos, sucursales: [], reserva_expira: null });
const detalleDe = (id: number, partidas = [EXISTENTE]) => ({ id, folio: `SOL-${id}`, estado: 'borrador', notas: `Nota ${id}`,
  detalles: partidas.map((p, i) => ({ id: i + 1, variante_id: p.variante_id, cantidad: p.cantidad, excepcion: p.excepcion, empleado: { id: p.empleado_id } })) });
const DIRECCION = { id: 5, alias: 'Sucursal', predeterminada: true };
const BORRADORES = [resumen(8, 3, '2026-11-10T12:00:00Z'), resumen(7, 1, '2026-11-08T12:00:00Z')]; // del más reciente al más antiguo

type Datos = { borradores?: unknown[]; direcciones?: unknown[] };
function api({ borradores = BORRADORES, direcciones = [DIRECCION] }: Datos = {}) {
  vi.mocked(get).mockImplementation(async (ruta: string) => {
    if (ruta.includes('estado=borrador')) return { items: borradores, total: borradores.length, pagina: 1, por_pagina: 20, paginas: 1 } as never;
    const m = ruta.match(/^\/cuenta\/pedidos\/(\d+)$/); if (m) return detalleDe(Number(m[1])) as never;
    if (ruta.startsWith('/cuenta/direcciones')) return direcciones as never;
    return [] as never;
  });
}
beforeEach(() => { vi.mocked(get).mockReset(); vi.mocked(put).mockReset(); vi.mocked(post).mockReset(); });

describe('agregarAlBorrador (destino del artículo)', () => {
  it('sin destino usa el borrador más reciente, como siempre', async () => {
    api(); vi.mocked(put).mockResolvedValue(detalleDe(8) as never);
    await agregarAlBorrador(NUEVA);
    expect(get).toHaveBeenCalledWith('/cuenta/pedidos?canal=corporativo&estado=borrador&por_pagina=1');
    expect(put).toHaveBeenCalledWith('/cuenta/pedidos-corporativos/8', { partidas: [EXISTENTE, NUEVA], notas: 'Nota 8' });
  });

  it('sin destino y sin borradores crea uno con la dirección predeterminada', async () => {
    api({ borradores: [] }); vi.mocked(post).mockResolvedValue(detalleDe(1) as never);
    await agregarAlBorrador(NUEVA);
    expect(put).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith('/cuenta/pedidos-corporativos', { modalidad: 'envio', direccion_id: 5, partidas: [NUEVA], borrador: true, clave_idempotencia: 'clave-fija' });
  });

  it('con el id de un borrador lo agrega a ese, sin buscar el más reciente', async () => {
    api(); vi.mocked(put).mockResolvedValue(detalleDe(7) as never);
    await agregarAlBorrador(NUEVA, 7);
    expect(get).not.toHaveBeenCalledWith(expect.stringContaining('por_pagina=1'));
    expect(get).toHaveBeenCalledWith('/cuenta/pedidos/7');
    expect(put).toHaveBeenCalledWith('/cuenta/pedidos-corporativos/7', { partidas: [EXISTENTE, NUEVA], notas: 'Nota 7' });
  });

  it("con 'nuevo' crea otro borrador aunque ya existan, sin tocar los demás", async () => {
    api(); vi.mocked(post).mockResolvedValue(detalleDe(9) as never);
    await agregarAlBorrador(NUEVA, 'nuevo');
    expect(put).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith('/cuenta/pedidos-corporativos', expect.objectContaining({ borrador: true, partidas: [NUEVA], direccion_id: 5 }));
  });

  it('sin dirección registrada no crea nada y explica qué hacer', async () => {
    api({ borradores: [], direcciones: [] });
    await expect(agregarAlBorrador(NUEVA, 'nuevo')).rejects.toThrow(/Registra primero la dirección/);
    expect(post).not.toHaveBeenCalled();
  });

  it('acumula la cantidad si el empleado ya tenía esa variante (máximo 50)', async () => {
    api(); vi.mocked(get).mockImplementation(async (ruta: string) => (ruta.match(/^\/cuenta\/pedidos\/\d+$/) ? detalleDe(7, [{ empleado_id: 1, variante_id: 101, cantidad: 49, excepcion: null }]) : { items: BORRADORES }) as never);
    vi.mocked(put).mockResolvedValue(detalleDe(7) as never);
    await agregarAlBorrador(NUEVA, 7);
    expect(vi.mocked(put).mock.calls[0][1]).toEqual({ partidas: [{ empleado_id: 1, variante_id: 101, cantidad: 50, excepcion: null }], notas: 'Nota 7' });
  });
});

describe('"Agregar a mi solicitud" en la ficha del portal', () => {
  const variante = { id: 101, sku: 'V-101', talla: 'M', color: 'Azul', color_hex: '#0000ff', precio_base: '100.00', activo: true, precio: '100.00', descuento: '0.00', precio_final: '100.00', promocion: null, disponible: 5 };
  const DETALLE = { id: 10, slug: 'bata', nombre: 'Bata clínica', sku_base: 'SKU-10', categoria: { id: 1, nombre: 'Batas', slug: 'batas' }, imagen: null, destacado: false, precio_desde: '100.00', precio_base_desde: '100.00',
    tallas: ['M'], colores: [['Azul', '#0000ff']], disponible: 5, en_promocion: false, giro_360: false, descripcion: '', material: null, cuidados: null, activo: true, imagenes: [], puestos: [], sucursales_deshabilitadas: [], giros: [], variantes: [variante], disponibilidad_sucursal: [], relacionados: [] };

  function montar(borradores: unknown[] = BORRADORES, detalle: unknown = DETALLE) {
    api({ borradores });
    const base = vi.mocked(get).getMockImplementation()!;
    vi.mocked(get).mockImplementation(async (ruta: string) => {
      if (ruta.startsWith('/tienda/productos/')) return detalle as never;
      if (ruta.startsWith('/cuenta/empleados')) return [{ id: 1, numero: '001', nombre: 'Ana López', puesto: 'Almacén', area: null, activo: true }] as never;
      if (ruta.startsWith('/cuenta/puestos-autorizados')) return { 'Almacén': [10] } as never;
      return base(ruta) as never;
    });
    const router = createMemoryRouter([{ path: '/cuenta/catalogo/:slug', element: <Producto /> }], { initialEntries: ['/cuenta/catalogo/bata'] });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ContextoCatalogoCtx.Provider value={CONTEXTO_CATALOGO_PORTAL}><RouterProvider router={router} /></ContextoCatalogoCtx.Provider></QueryClientProvider>);
  }
  const elegir = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Talla M' }));
    fireEvent.change(await screen.findByRole('combobox', { name: 'Empleado' }), { target: { value: '1' } });
  };

  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
    vi.mocked(useAuth).mockReturnValue({ tipo: 'cliente', cliente: { tipo: 'empresa', nombre: 'Ana Contacto' } } as unknown as ReturnType<typeof useAuth>);
    Element.prototype.animate = vi.fn(() => ({ onfinish: null })) as unknown as typeof Element.prototype.animate;
  });

  it('muestra los borradores, parte del más reciente y agrega a ese si no se cambia nada', async () => {
    montar(); vi.mocked(put).mockResolvedValue(detalleDe(8) as never);
    await elegir();
    const destino = await screen.findByRole('combobox', { name: 'Agregar a' });
    expect(within(destino).getAllByRole('option').map((o) => o.textContent)).toEqual([expect.stringMatching(/^SOL-8 · 3 artículo\(s\)/), expect.stringMatching(/^SOL-7 · 1 artículo\(s\)/), 'Solicitud nueva']);
    expect(destino).toHaveValue('8');
    fireEvent.click(screen.getByRole('button', { name: /Agregar \(Azul, M\)/ }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(vi.mocked(put).mock.calls[0][0]).toBe('/cuenta/pedidos-corporativos/8');
  });

  it('agrega al borrador elegido, no al más reciente', async () => {
    montar(); vi.mocked(put).mockResolvedValue(detalleDe(7) as never);
    await elegir();
    fireEvent.change(await screen.findByRole('combobox', { name: 'Agregar a' }), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /Agregar \(Azul, M\)/ }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(vi.mocked(put).mock.calls[0][0]).toBe('/cuenta/pedidos-corporativos/7');
    expect(vi.mocked(put).mock.calls[0][1]).toEqual({ partidas: [EXISTENTE, { empleado_id: 1, variante_id: 101, cantidad: 1, excepcion: null }], notas: 'Nota 7' });
  });

  it("con 'Solicitud nueva' crea otro borrador y no modifica los existentes", async () => {
    montar(); vi.mocked(post).mockResolvedValue(detalleDe(9) as never);
    await elegir();
    fireEvent.change(await screen.findByRole('combobox', { name: 'Agregar a' }), { target: { value: 'nuevo' } });
    fireEvent.click(screen.getByRole('button', { name: /Agregar \(Azul, M\)/ }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(put).not.toHaveBeenCalled();
    expect(vi.mocked(post).mock.calls[0][1]).toEqual(expect.objectContaining({ borrador: true, partidas: [{ empleado_id: 1, variante_id: 101, cantidad: 1, excepcion: null }] }));
  });

  it('sin borradores avisa que se creará una solicitud nueva y no ofrece elegir', async () => {
    montar([]);
    await elegir();
    expect(await screen.findByText(/Se creará una solicitud nueva/)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Agregar a' })).toBeNull();
  });

  it('al cambiar de color la talla se reinicia y hay que volver a elegirla', async () => {
    const blanca = { ...variante, id: 102, color: 'Blanco', color_hex: '#ffffff' };
    montar(BORRADORES, { ...DETALLE, variantes: [variante, blanca], colores: [['Azul', '#0000ff'], ['Blanco', '#ffffff']] });
    await elegir(); // Azul + talla M + empleado
    expect(await screen.findByRole('button', { name: /Agregar \(Azul, M\)/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Blanco' }));
    expect(screen.getByRole('button', { name: 'Talla M' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Elige una talla/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Talla M' }));
    expect(screen.getByRole('button', { name: /Agregar \(Blanco, M\)/ })).toBeEnabled();
  });
});
