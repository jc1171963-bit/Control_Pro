import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import { ApiError, get, post } from '../api/cliente';
import { useAuth } from '../app/auth';
import FormularioContacto from '../features/tienda/FormularioContacto';
import Producto from '../features/tienda/Producto';

vi.mock('../api/cliente', async (original) => ({ ...(await original<typeof import('../api/cliente')>()), get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock('../app/auth', () => ({ useAuth: vi.fn() }));
vi.mock('../app/config', () => ({ useConfig: () => ({ cargando: false, canalTienda: false }) }));

function montar(el: JSX.Element, ruta = '/x', patron = '/x') {
  vi.mocked(useAuth).mockReturnValue({ tipo: null, cliente: null } as unknown as ReturnType<typeof useAuth>);
  const router = createMemoryRouter([{ path: patron, element: el }], { initialEntries: [ruta] });
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
}

const llenar = (datos: Record<string, string>) => Object.entries(datos).forEach(([k, v]) => fireEvent.change(document.querySelector(`[name="${k}"]`)!, { target: { value: v } }));
const VALIDO = { nombre: 'Ana López', correo: 'ana@ejemplo.mx', asunto: 'Cotización', mensaje: 'Quisiera información de batas.' };

beforeEach(() => { vi.mocked(post).mockReset(); vi.mocked(get).mockReset(); });

describe('formulario de contacto', () => {
  it('valida en el cliente y no envía con datos incompletos', () => {
    montar(<FormularioContacto />);
    llenar({ nombre: 'An', correo: 'no-es-correo' });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
    expect(screen.getByText('Escribe tu nombre completo.')).toBeInTheDocument();
    expect(screen.getByText(/Escribe un correo válido/)).toBeInTheDocument();
    expect(screen.getByText(/Cuéntanos un poco más/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('envía al endpoint y confirma solo con la respuesta del servidor', async () => {
    vi.mocked(post).mockResolvedValue({ mensaje: 'Recibimos tu mensaje.' } as never);
    montar(<FormularioContacto />);
    llenar(VALIDO);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Recibimos tu mensaje.');
    expect(post).toHaveBeenCalledWith('/tienda/contacto', { ...VALIDO, telefono: null, sitio_web: '' });
  });

  it('si el servidor no puede entregar (503) muestra el error y no confirma', async () => {
    vi.mocked(post).mockRejectedValue(new ApiError(503, 'contacto_no_disponible', 'El formulario de contacto aún no está habilitado.'));
    montar(<FormularioContacto />);
    llenar(VALIDO);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('aún no está habilitado');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeInTheDocument();
  });

  it('muestra en su campo los errores de validación del servidor (422)', async () => {
    vi.mocked(post).mockRejectedValue(new ApiError(422, 'datos_invalidos', 'Revisa los datos enviados.', { asunto: ['No puede tener saltos de línea.'] }));
    montar(<FormularioContacto />);
    llenar(VALIDO);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
    expect(await screen.findByText('No puede tener saltos de línea.')).toBeInTheDocument();
  });
});

const variante = { id: 11, sku: 'X-M', talla: 'M', color: 'Azul', color_hex: '#0000ff', precio_base: '1', activo: true, precio: '1', descuento: '0.00', precio_final: '1', promocion: null, disponible: 5 };
const detalle = (giros: unknown[]) => ({ id: 4, slug: 'polo-corporativa-pique', nombre: 'Polo', sku_base: 'POL', categoria: { id: 2, nombre: 'Camisas', slug: 'c' }, imagen: '/api/archivos/publicos/polo-corporativa-pique-0.svg',
  descripcion: 'd', material: null, cuidados: null, puestos: [], giros, giro_360: giros.length > 0, variantes: [variante], disponibilidad_sucursal: [], relacionados: [],
  imagenes: [{ url: '/api/archivos/publicos/polo-corporativa-pique-0.svg', alt: 'Polo color Azul' }, { url: '/api/archivos/publicos/polo-corporativa-pique-1.svg', alt: 'Polo color Verde' }] });

describe('galería del detalle', () => {
  it('con fotogramas 360° y foto de stock abre en la foto y alterna con el giro', async () => {
    const frames = Array.from({ length: 8 }, (_, k) => `/api/archivos/publicos/polo-corporativa-pique-0-giro-0${k}.svg`);
    vi.mocked(get).mockResolvedValue(detalle([{ color: 'Azul', frames }]) as never);
    montar(<Producto />, '/producto/polo-corporativa-pique', '/producto/:slug');
    // Margen de espera: con toda la suite en paralelo, la primera carga de la ficha puede tardar más de 1 s.
    const giro = await screen.findByRole('button', { name: 'Vista 360°' }, { timeout: 3000 });
    // Las dos ilustraciones del seed resuelven a la misma foto ilustrativa: una sola miniatura, activa al abrir.
    const foto = screen.getByRole('button', { name: 'Fotografía' });
    await waitFor(() => expect(foto).toHaveAttribute('aria-pressed', 'true'));
    expect(giro).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Imagen ilustrativa')).toBeInTheDocument();
    expect(document.querySelector('img[src="/assets/products/polo-corporativa-pique.webp"]')).not.toBeNull();
    fireEvent.click(giro);
    await waitFor(() => expect(giro).toHaveAttribute('aria-pressed', 'true'));
  });

  it('con fotogramas 360° y sin foto de stock abre en el giro', async () => {
    const frames = Array.from({ length: 8 }, (_, k) => `/api/archivos/publicos/pantalon-cargo-negro-0-giro-0${k}.svg`);
    vi.mocked(get).mockResolvedValue({ ...detalle([{ color: 'Azul', frames }]), imagenes: [{ url: '/api/archivos/publicos/pantalon-cargo-negro-0.svg', alt: 'Pantalón' }] } as never);
    montar(<Producto />, '/producto/pantalon-cargo-negro', '/producto/:slug');
    const giro = await screen.findByRole('button', { name: 'Vista 360°' }, { timeout: 3000 });
    await waitFor(() => expect(giro).toHaveAttribute('aria-pressed', 'true'));
  });

  it('sin fotogramas no inventa un giro ni repite miniaturas', async () => {
    vi.mocked(get).mockResolvedValue(detalle([]) as never);
    montar(<Producto />, '/producto/polo-corporativa-pique', '/producto/:slug');
    await screen.findByText('Imagen ilustrativa', undefined, { timeout: 3000 });
    expect(screen.queryByRole('button', { name: 'Vista 360°' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Vistas del producto' })).toBeNull();
  });
});
