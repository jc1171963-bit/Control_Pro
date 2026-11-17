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
  const STOCK = [
    { url: '/api/archivos/publicos/stock-POL-001-1.webp', alt: 'Polo · vista 1 (foto ilustrativa)', credito: 'Foto: Ana · Pixabay (https://pixabay.com/1)' },
    { url: '/api/archivos/publicos/stock-POL-001-2.webp', alt: 'Polo · vista 2 (foto ilustrativa)', credito: 'Foto: Luis · Pixabay (https://pixabay.com/2)' },
  ];

  it('abre en la primera foto con su crédito y ofrece las demás vistas, el video y el giro 360°', async () => {
    const frames = Array.from({ length: 8 }, (_, k) => `/api/archivos/publicos/giro-${k}.webp`);
    vi.mocked(get).mockResolvedValue({ ...detalle([{ color: 'Azul', frames }]), imagenes: STOCK,
      video: { url: '/api/archivos/publicos/stock-video-1.mp4', credito: 'Video: Eva · Pixabay (https://pixabay.com/v)' } } as never);
    montar(<Producto />, '/producto/polo-corporativa-pique', '/producto/:slug');
    const primera = await screen.findByRole('button', { name: 'Fotografía 1' }, { timeout: 3000 });
    expect(primera).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Imagen ilustrativa')).toBeInTheDocument();
    expect(screen.getByText('Foto: Ana · Pixabay (https://pixabay.com/1)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fotografía 2' }));
    expect(await screen.findByText('Foto: Luis · Pixabay (https://pixabay.com/2)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Video' }));
    await waitFor(() => expect(document.querySelector('video[src="/api/archivos/publicos/stock-video-1.mp4"]')).not.toBeNull());
    expect(screen.getByText('Video ilustrativo')).toBeInTheDocument();
    const giro = screen.getByRole('button', { name: 'Vista 360°' });
    fireEvent.click(giro);
    await waitFor(() => expect(giro).toHaveAttribute('aria-pressed', 'true'));
  });

  it('las flechas recorren las vistas y el cambio automático se puede pausar', async () => {
    vi.mocked(get).mockResolvedValue({ ...detalle([]), imagenes: STOCK } as never);
    montar(<Producto />, '/producto/polo-corporativa-pique', '/producto/:slug');
    await screen.findByRole('button', { name: 'Fotografía 1' }, { timeout: 3000 });
    fireEvent.click(screen.getByRole('button', { name: 'Vista siguiente' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fotografía 2' })).toHaveAttribute('aria-pressed', 'true'));
    fireEvent.click(screen.getByRole('button', { name: 'Vista siguiente' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fotografía 1' })).toHaveAttribute('aria-pressed', 'true'));
    fireEvent.click(screen.getByRole('button', { name: /Pausar el cambio automático/ }));
    expect(screen.getByRole('button', { name: /Reproducir el cambio automático/ })).toBeInTheDocument();
  });

  it('con una sola foto y sin video ni giro no muestra miniaturas ni controles', async () => {
    vi.mocked(get).mockResolvedValue({ ...detalle([]), imagenes: [STOCK[0]] } as never);
    montar(<Producto />, '/producto/polo-corporativa-pique', '/producto/:slug');
    await screen.findByText('Imagen ilustrativa', undefined, { timeout: 3000 });
    expect(screen.queryByRole('button', { name: 'Vista 360°' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Miniaturas' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Vista siguiente' })).toBeNull();
  });
});
