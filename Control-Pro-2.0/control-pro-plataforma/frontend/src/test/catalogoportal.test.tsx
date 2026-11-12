import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import { get } from '../api/cliente';
import { useAuth } from '../app/auth';
import Catalogo from '../features/tienda/Catalogo';
import Producto from '../features/tienda/Producto';
import { ContextoCatalogoCtx } from '../features/tienda/contextoCatalogo';
import { CONTEXTO_CATALOGO_PORTAL } from '../features/portal/rutas';

vi.mock('../api/cliente', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock('../app/auth', () => ({ useAuth: vi.fn() }));
vi.mock('../app/config', () => ({ useConfig: () => ({ cargando: false, canalTienda: true }) })); // la tienda está ENCENDIDA

const producto = (id: number, nombre: string, slug: string) => ({ id, slug, nombre, sku_base: `SKU-${id}`, categoria: { id: 1, nombre: 'Batas', slug: 'batas' }, imagen: null, destacado: false,
  precio_desde: '100.00', precio_base_desde: '100.00', tallas: ['M'], colores: [['Azul', '#0000ff']], disponible: 5, en_promocion: false, giro_360: false });
const TODOS = [producto(1, 'Bata uno', 'bata-uno'), producto(2, 'Bata dos', 'bata-dos'), producto(3, 'Bata tres', 'bata-tres'), producto(4, 'Bata cuatro', 'bata-cuatro'), producto(5, 'Bata cinco', 'bata-cinco')];
const FACETAS = { tallas: ['M'], colores: [{ nombre: 'Azul', hex: '#0000ff' }] };
const EMPLEADOS = [{ id: 1, numero: '1', nombre: 'Ana', puesto: 'Almacén', area: null, activo: true }, { id: 2, numero: '2', nombre: 'Eva', puesto: 'Enfermería', area: null, activo: true },
  { id: 3, numero: '3', nombre: 'Ivo', puesto: 'Baja', area: null, activo: false }];
const PUESTOS = { 'Almacén': [1, 4], 'Enfermería': [2, 5] };

const DETALLE = { ...producto(1, 'Bata uno', 'bata-uno'), descripcion: 'Bata de prueba', material: null, cuidados: null, activo: true, imagenes: [], puestos: ['Almacén'], sucursales_deshabilitadas: [], giros: [],
  variantes: [{ id: 11, sku: 'X-M', talla: 'M', color: 'Azul', color_hex: '#0000ff', precio_base: '100.00', activo: true, precio: '100.00', descuento: '0.00', precio_final: '100.00', promocion: null, disponible: 5 }],
  disponibilidad_sucursal: [], relacionados: [producto(9, 'Otra bata', 'otra-bata')] };

function api() {
  vi.mocked(get).mockImplementation(async (ruta: string) => {
    if (ruta.includes('/tienda/categorias')) return [{ id: 1, nombre: 'Batas', slug: 'batas', padre_id: null, productos: 5 }] as never;
    if (ruta.includes('/cuenta/empleados')) return EMPLEADOS as never;
    if (ruta.includes('/cuenta/puestos-autorizados')) return PUESTOS as never;
    if (ruta.includes('/tienda/productos/')) return DETALLE as never;
    if (ruta.includes('/tienda/productos')) {
      const q = new URLSearchParams(ruta.split('?')[1]);
      if (q.get('por_pagina') === '48') { // el catálogo completo, en dos páginas de la API
        const pag = Number(q.get('pagina') || 1);
        return { items: pag === 1 ? TODOS.slice(0, 3) : TODOS.slice(3), total: 5, pagina: pag, por_pagina: 48, paginas: 2, facetas: FACETAS } as never;
      }
      return { items: TODOS, total: 5, pagina: 1, por_pagina: 12, paginas: 1, facetas: FACETAS } as never;
    }
    return [] as never;
  });
}

function montar(componente: JSX.Element, ruta: string, contexto?: typeof CONTEXTO_CATALOGO_PORTAL) {
  const router = createMemoryRouter([{ path: '/catalogo', element: componente }, { path: '/producto/:slug', element: componente }, { path: '/cuenta/catalogo', element: componente }, { path: '/cuenta/catalogo/:slug', element: componente }], { initialEntries: [ruta] });
  const arbol = <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>;
  return { router, ...render(contexto ? <ContextoCatalogoCtx.Provider value={contexto}>{arbol}</ContextoCatalogoCtx.Provider> : arbol) };
}

beforeEach(() => { vi.mocked(get).mockReset(); api(); vi.mocked(useAuth).mockReset();
  vi.mocked(useAuth).mockReturnValue({ tipo: 'cliente', cliente: { tipo: 'empresa', nombre: 'Ana Contacto' } } as unknown as ReturnType<typeof useAuth>); });

const nombres = async () => (await screen.findAllByRole('heading', { level: 3 })).map((h) => h.textContent);

describe('catálogo en la tienda pública (contexto por defecto)', () => {
  it('conserva precios, filtro de precio y enlaces a /producto', async () => {
    montar(<Catalogo />, '/catalogo');
    expect(await screen.findByText('Bata uno')).toBeInTheDocument();
    expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Precio mínimo').length).toBeGreaterThan(0);
    expect(screen.queryByRole('search')).toBeNull();
    expect(screen.queryByLabelText('Puesto')).toBeNull();
    expect(screen.getByRole('link', { name: /Bata uno/ })).toHaveAttribute('href', '/producto/bata-uno');
  });

  it('ignora el parámetro puesto: no aplica filtro ni muestra la etiqueta', async () => {
    montar(<Catalogo />, '/catalogo?puesto=Almac%C3%A9n');
    expect(await nombres()).toHaveLength(5);
    expect(screen.queryByText(/Autorizados para/)).toBeNull();
  });
});

describe('catálogo dentro del portal', () => {
  it('no muestra precios ni filtros de precio aunque la tienda esté encendida, y enlaza dentro del portal', async () => {
    const { container } = montar(<Catalogo />, '/cuenta/catalogo', CONTEXTO_CATALOGO_PORTAL);
    expect(await screen.findByText('Bata uno')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\$|Menor precio|Precio \(MXN\)/);
    expect(screen.queryByLabelText('Precio mínimo')).toBeNull();
    expect(screen.getByRole('link', { name: /Bata uno/ })).toHaveAttribute('href', '/cuenta/catalogo/bata-uno');
  });

  it('tiene su propio buscador y lo aplica a la consulta', async () => {
    const { router } = montar(<Catalogo />, '/cuenta/catalogo', CONTEXTO_CATALOGO_PORTAL);
    await screen.findByText('Bata uno');
    const buscador = within(screen.getByRole('search'));
    fireEvent.change(buscador.getByLabelText('Buscar productos'), { target: { value: 'bata' } });
    fireEvent.click(buscador.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(router.state.location.search).toBe('?q=bata'));
    await waitFor(() => expect(vi.mocked(get).mock.calls.some(([r]) => String(r).includes('q=bata'))).toBe(true));
  });

  it('ofrece solo los puestos de los empleados activos', async () => {
    montar(<Catalogo />, '/cuenta/catalogo', CONTEXTO_CATALOGO_PORTAL);
    await screen.findByText('Bata uno');
    const opciones = await waitFor(() => { const o = within(screen.getAllByLabelText('Puesto')[0]).getAllByRole('option').map((x) => x.textContent); expect(o).toContain('Almacén'); return o; });
    expect(opciones).toEqual(['Todos los productos', 'Almacén', 'Enfermería']);
  });

  it('filtra por puesto con totales exactos, incluso con productos en distintas páginas de la API', async () => {
    montar(<Catalogo />, '/cuenta/catalogo?puesto=Almac%C3%A9n', CONTEXTO_CATALOGO_PORTAL);
    // El puesto Almacén autoriza los productos 1 (página 1 de la API) y 4 (página 2): ambos deben aparecer.
    await waitFor(async () => expect(await nombres()).toEqual(['Bata uno', 'Bata cuatro']));
    expect(screen.getByText('2 producto(s)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar filtro: Autorizados para: Almacén' })).toBeInTheDocument();
  });

  it('al quitar el filtro de puesto vuelve a mostrar todo el catálogo', async () => {
    montar(<Catalogo />, '/cuenta/catalogo?puesto=Enfermer%C3%ADa', CONTEXTO_CATALOGO_PORTAL);
    await waitFor(async () => expect(await nombres()).toEqual(['Bata dos', 'Bata cinco']));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtro: Autorizados para: Enfermería' }));
    await waitFor(async () => expect(await nombres()).toHaveLength(5));
  });

  it('un puesto sin productos autorizados muestra el estado vacío con opción de limpiar', async () => {
    vi.mocked(get).mockImplementation(async (ruta: string) => (ruta.includes('puestos-autorizados') ? ({ 'Almacén': [] } as never) : (ruta.includes('/cuenta/empleados') ? EMPLEADOS : ruta.includes('categorias') ? [] : { items: TODOS, total: 5, pagina: 1, por_pagina: 48, paginas: 1, facetas: FACETAS }) as never));
    montar(<Catalogo />, '/cuenta/catalogo?puesto=Almac%C3%A9n', CONTEXTO_CATALOGO_PORTAL);
    expect(await screen.findByText('No encontramos productos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeInTheDocument();
  });
});

describe('ficha de producto', () => {
  it('en la tienda pública (tienda encendida) conserva carrito, precio e IVA', async () => {
    montar(<Producto />, '/producto/bata-uno');
    expect(await screen.findByRole('heading', { level: 1, name: 'Bata uno' })).toBeInTheDocument();
    expect(screen.getByText('IVA incluido')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Elige una talla|Agregar al carrito/ })).toBeInTheDocument();
    expect(screen.queryByText('Agregar a mi solicitud')).toBeNull();
    expect(screen.getByRole('link', { name: 'Catálogo' })).toHaveAttribute('href', '/catalogo');
  });

  it('en el portal es una solicitud, no una compra: sin precio, sin carrito, sin favoritos y con rutas del portal', async () => {
    const { container } = montar(<Producto />, '/cuenta/catalogo/bata-uno', CONTEXTO_CATALOGO_PORTAL);
    expect(await screen.findByRole('heading', { level: 1, name: 'Bata uno' })).toBeInTheDocument();
    expect(await screen.findByText('Agregar a mi solicitud')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\$|IVA incluido/);
    expect(screen.queryByRole('button', { name: /Agregar al carrito/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /favoritos/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Catálogo' })).toHaveAttribute('href', '/cuenta/catalogo');
    expect(screen.getByRole('link', { name: 'Batas' })).toHaveAttribute('href', '/cuenta/catalogo?categoria=batas');
    expect(screen.getByRole('link', { name: /Otra bata/ })).toHaveAttribute('href', '/cuenta/catalogo/otra-bata');
    expect(vi.mocked(get).mock.calls.some(([r]) => String(r).includes('/cuenta/favoritos'))).toBe(false);
  });
});
