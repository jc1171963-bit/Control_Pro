/**
 * Pruebas de caracterización del asistente de solicitudes (flujo central del portal). Fijan el comportamiento actual
 * (qué se envía al servidor, reglas de excepción, límites, borradores y correcciones) para poder refactorizar la interfaz
 * sin tocar las reglas de negocio. Los nombres accesibles de talla se aceptan con o sin el prefijo "Talla ".
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import { get, post, put } from '../api/cliente';
import ConstructorSolicitud from '../features/cuenta/SolicitudCorporativa';

vi.mock('../api/cliente', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), claveIdempotencia: () => 'clave-fija' }));

const empleado = (id: number, nombre: string, puesto: string, activo = true) => ({ id, numero: String(id).padStart(3, '0'), nombre, puesto, area: null, activo });
const EMPLEADOS = [empleado(1, 'Ana López', 'Almacén'), empleado(2, 'Eva Ruiz', 'Enfermería'), empleado(3, 'Ivo Baja', 'Almacén', false)];
const producto = (id: number, nombre: string, slug: string) => ({ id, slug, nombre, sku_base: `SKU-${id}`, categoria: { id: 1, nombre: 'Batas', slug: 'batas' }, imagen: null, destacado: false,
  precio_desde: '100.00', precio_base_desde: '100.00', tallas: ['M', 'G'], colores: [['Blanco', '#ffffff']], disponible: 5, en_promocion: false, giro_360: false });
const PRODUCTOS = [producto(10, 'Bata clínica', 'bata-clinica'), producto(11, 'Pantalón cargo', 'pantalon-cargo'), producto(12, 'Chamarra dos colores', 'chamarra')];
const variante = (id: number, talla: string, color: string) => ({ id, sku: `V-${id}`, talla, color, color_hex: '#ffffff', precio_base: '100.00', activo: true, precio: '100.00', descuento: '0.00', precio_final: '100.00', promocion: null, disponible: 5 });
const DETALLES: Record<string, unknown> = {
  'bata-clinica': { ...PRODUCTOS[0], descripcion: '', material: null, cuidados: null, activo: true, imagenes: [], puestos: [], sucursales_deshabilitadas: [], giros: [], variantes: [variante(101, 'M', 'Blanco'), variante(102, 'G', 'Blanco')], disponibilidad_sucursal: [], relacionados: [] },
  'chamarra': { ...PRODUCTOS[2], descripcion: '', material: null, cuidados: null, activo: true, imagenes: [], puestos: [], sucursales_deshabilitadas: [], giros: [], variantes: [variante(121, 'M', 'Azul'), variante(122, 'M', 'Negro')], disponibilidad_sucursal: [], relacionados: [] },
  'pantalon-cargo': { ...PRODUCTOS[1], descripcion: '', material: null, cuidados: null, activo: true, imagenes: [], puestos: [], sucursales_deshabilitadas: [], giros: [], variantes: [variante(111, 'M', 'Azul')], disponibilidad_sucursal: [], relacionados: [] },
};
const PUESTOS = { 'Almacén': [10], 'Enfermería': [11] }; // el pantalón (11) no está autorizado para Almacén
const DIRECCION = { id: 5, alias: 'Sucursal', destinatario: 'Recepción', telefono: '4421112233', calle: 'Av. Central', numero: '1', colonia: 'Centro', ciudad: 'Querétaro', estado: 'Querétaro', cp: '76000', referencias: null, predeterminada: true };
const guardado = (estado: string, id = 9) => ({ id, folio: `SOL-${id}`, estado, canal: 'corporativo', detalles: [], notas: null, direccion_envio: null, aprobaciones: [] });
const previo = (estado: string, aprobaciones: unknown[] = []) => ({ id: 7, folio: 'SOL-7', estado, canal: 'corporativo', notas: 'Nota previa',
  direccion_envio: { alias: 'Sucursal', calle: 'Av. Central', numero: '1', ciudad: 'Querétaro' }, aprobaciones,
  detalles: [{ id: 70, variante_id: 101, cantidad: 2, excepcion: null, nombre: 'Bata clínica', talla: 'M', color: 'Blanco', empleado: { id: 1, nombre: 'Ana López', puesto: 'Almacén' } }] });

type Escenario = { empleados?: unknown[]; direcciones?: unknown[]; pedido?: unknown };
function api({ empleados = EMPLEADOS, direcciones = [DIRECCION], pedido }: Escenario = {}) {
  vi.mocked(get).mockImplementation(async (ruta: string) => {
    if (ruta.startsWith('/cuenta/empleados')) return empleados as never;
    if (ruta.startsWith('/cuenta/puestos-autorizados')) return PUESTOS as never;
    if (ruta.startsWith('/cuenta/direcciones')) return direcciones as never;
    if (ruta.startsWith('/cuenta/pedidos/')) return pedido as never;
    if (ruta.startsWith('/tienda/categorias')) return [{ id: 1, nombre: 'Batas', slug: 'batas' }] as never;
    if (ruta.startsWith('/tienda/productos/')) return DETALLES[ruta.split('/').pop()!] as never;
    if (ruta.startsWith('/tienda/productos')) return { items: PRODUCTOS, total: 3, pagina: 1, por_pagina: 48, paginas: 1, facetas: { tallas: [], colores: [] } } as never;
    return [] as never;
  });
}

function montar(ruta = '/cuenta/solicitudes/nueva') {
  const router = createMemoryRouter([
    { path: '/cuenta/solicitudes/nueva', element: <ConstructorSolicitud /> },
    { path: '/cuenta/solicitudes/:id/editar', element: <ConstructorSolicitud /> },
    { path: '/cuenta/pedidos/:id', element: <div>DETALLE-DE-SOLICITUD</div> },
  ], { initialEntries: [ruta] });
  return { router, ...render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>) };
}

beforeEach(() => {
  vi.mocked(get).mockReset(); vi.mocked(post).mockReset(); vi.mocked(put).mockReset();
  api();
  Element.prototype.animate = vi.fn(() => ({ onfinish: null })) as unknown as typeof Element.prototype.animate; // jsdom no implementa animate (lo usa volarHacia)
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

const boton = (nombre: string | RegExp) => screen.getByRole('button', { name: nombre });
/** Enviar pide confirmación: hasta confirmar no se llama al servidor. */
async function confirmarEnvio() {
  const dialogo = await screen.findByRole('dialog', { name: /a revisión$/ });
  expect(post).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled();
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar envío' }));
}
const esperaPaso0 = () => screen.findByText('¿Para quién es la solicitud?');

/** Selecciona empleados, entra al catálogo y agrega un artículo desde la ventana de selección. */
async function agregar(producto: string, talla: string, empleados = [/Ana López/]) {
  for (const e of empleados) { const b = screen.queryByRole('button', { name: e, pressed: false }); if (b) fireEvent.click(b); }
  if (screen.queryByText('¿Para quién es la solicitud?')) fireEvent.click(boton('Elegir artículos'));
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(producto) }));
  const dialogo = await screen.findByRole('dialog', { name: producto });
  fireEvent.click(await within(dialogo).findByRole('button', { name: new RegExp(`^(Talla )?${talla}$`) }));
  fireEvent.click(within(dialogo).getByRole('button', { name: /^Agregar \d+ para/ }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

describe('estado inicial', () => {
  it('sin empleados activos pide registrarlos primero', async () => {
    api({ empleados: [empleado(3, 'Ivo Baja', 'Almacén', false)] });
    montar();
    expect(await screen.findByText('Primero registra a tus empleados')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ir a Empleados/ })).toHaveAttribute('href', '/cuenta/empleados');
  });

  it('ofrece solo a los empleados activos y no avanza sin seleccionar a alguien', async () => {
    montar();
    await esperaPaso0();
    expect(screen.getByRole('button', { name: /Ana López/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Eva Ruiz/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ivo Baja/ })).toBeNull();
    expect(boton('Elegir artículos')).toBeDisabled();
    fireEvent.click(boton(/Ana López/));
    expect(boton('Elegir artículos')).toBeEnabled();
  });
});

describe('nueva solicitud', () => {
  it('envía a revisión exactamente lo seleccionado, con la dirección y la clave de idempotencia', async () => {
    vi.mocked(post).mockResolvedValue(guardado('en_revision'));
    const { router } = montar();
    await esperaPaso0();
    await agregar('Bata clínica', 'M');
    fireEvent.click(boton(/Revisar solicitud \(1\)/));
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar a revisión' }));
    await confirmarEnvio();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith('/cuenta/pedidos-corporativos', {
      modalidad: 'envio', direccion_id: 5, partidas: [{ empleado_id: 1, variante_id: 101, cantidad: 1, excepcion: null }], notas: null, borrador: false, clave_idempotencia: 'clave-fija' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/cuenta/pedidos/9'));
    expect(router.state.location.search).toBe('?nuevo=1');
  });

  it('guarda un borrador y pasa a editarlo', async () => {
    vi.mocked(post).mockResolvedValue(guardado('borrador'));
    const { router } = montar();
    await esperaPaso0();
    await agregar('Bata clínica', 'G');
    fireEvent.click(boton(/Revisar solicitud \(1\)/));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Guardar borrador' }))[0]);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith('/cuenta/pedidos-corporativos', expect.objectContaining({ borrador: true, partidas: [{ empleado_id: 1, variante_id: 102, cantidad: 1, excepcion: null }] }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/cuenta/solicitudes/9/editar'));
  });

  it('acumula la cantidad cuando se agrega la misma variante al mismo empleado', async () => {
    vi.mocked(post).mockResolvedValue(guardado('en_revision'));
    montar();
    await esperaPaso0();
    await agregar('Bata clínica', 'M');
    await agregar('Bata clínica', 'M');
    fireEvent.click(boton(/Revisar solicitud \(2\)/));
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar a revisión' }));
    await confirmarEnvio();
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(vi.mocked(post).mock.calls[0][1]).toEqual(expect.objectContaining({ partidas: [{ empleado_id: 1, variante_id: 101, cantidad: 2, excepcion: null }] }));
  });

  it('asigna artículos distintos a empleados distintos', async () => {
    vi.mocked(post).mockResolvedValue(guardado('en_revision'));
    montar();
    await esperaPaso0();
    await agregar('Bata clínica', 'M', [/Ana López/, /Eva Ruiz/]);
    fireEvent.click(await screen.findByRole('button', { name: /Eva Ruiz/ })); // cambia el empleado activo
    fireEvent.click(screen.getByRole('checkbox', { name: /Solo autorizados/ })); // la bata no está autorizada para Enfermería
    await agregar('Bata clínica', 'G', []);
    fireEvent.click(boton(/Revisar solicitud \(2\)/));
    fireEvent.click(await screen.findByRole('button', { name: /Enviar a revisión|Enviar/ }));
    // Eva necesita justificar la excepción antes de poder enviar
    const justificacion = await screen.findByPlaceholderText(/Justificación/);
    fireEvent.change(justificacion, { target: { value: 'Cobertura de turno nocturno' } });
    fireEvent.click(boton('Enviar a revisión'));
    await confirmarEnvio();
    await waitFor(() => expect(post).toHaveBeenCalled());
    const partidas = (vi.mocked(post).mock.calls[0][1] as { partidas: unknown[] }).partidas;
    expect(partidas).toEqual(expect.arrayContaining([
      { empleado_id: 1, variante_id: 101, cantidad: 1, excepcion: null },
      { empleado_id: 2, variante_id: 102, cantidad: 1, excepcion: 'Cobertura de turno nocturno' },
    ]));
    expect(partidas).toHaveLength(2);
  });

  it('respeta los límites de cantidad: entre 1 y 50', async () => {
    vi.mocked(post).mockResolvedValue(guardado('en_revision'));
    montar();
    await esperaPaso0();
    await agregar('Bata clínica', 'M');
    fireEvent.click(boton(/Revisar solicitud \(1\)/));
    const menos = await screen.findByRole('button', { name: 'Menos' });
    for (let i = 0; i < 4; i++) fireEvent.click(menos); // no baja de 1
    for (let i = 0; i < 60; i++) fireEvent.click(screen.getByRole('button', { name: 'Más' })); // no pasa de 50
    fireEvent.click(boton('Enviar a revisión'));
    await confirmarEnvio();
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect((vi.mocked(post).mock.calls[0][1] as { partidas: { cantidad: number }[] }).partidas[0].cantidad).toBe(50);
  });

  it('quitar un artículo lo saca de la solicitud', async () => {
    montar();
    await esperaPaso0();
    await agregar('Bata clínica', 'M');
    fireEvent.click(boton(/Revisar solicitud \(1\)/));
    fireEvent.click(await screen.findByRole('button', { name: 'Quitar Bata clínica' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Quitar Bata clínica' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Enviar a revisión' })).toBeDisabled();
  });
});

describe('selección de color y talla', () => {
  it('al cambiar de color en la ventana de selección la talla se reinicia y hay que volver a elegirla', async () => {
    montar();
    await esperaPaso0();
    fireEvent.click(boton(/Ana López/)); fireEvent.click(boton('Elegir artículos'));
    fireEvent.click(screen.getByRole('checkbox', { name: /Solo autorizados/ })); // la chamarra no está autorizada para Almacén
    fireEvent.click(await screen.findByRole('button', { name: /Chamarra dos colores/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Chamarra dos colores' });
    fireEvent.click(await within(dialogo).findByRole('button', { name: /^(Talla )?M$/ }));
    expect(within(dialogo).getByRole('button', { name: /^Agregar 1 para Ana/ })).toBeEnabled();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Negro' }));
    expect(within(dialogo).getByRole('button', { name: /^(Talla )?M$/ })).toHaveAttribute('aria-pressed', 'false');
    expect(within(dialogo).getByRole('button', { name: 'Elige una talla' })).toBeDisabled();
  });

  it('un producto con un solo color no muestra el selector de color en el asistente', async () => {
    montar();
    await esperaPaso0();
    fireEvent.click(boton(/Ana López/)); fireEvent.click(boton('Elegir artículos'));
    fireEvent.click(await screen.findByRole('button', { name: /Bata clínica/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Bata clínica' });
    await within(dialogo).findByRole('button', { name: /^(Talla )?M$/ });
    expect(within(dialogo).queryByText(/^Color:/)).toBeNull();
  });
});

describe('regla por puesto', () => {
  it('un artículo fuera de la regla exige una justificación de al menos 10 caracteres antes de enviar', async () => {
    vi.mocked(post).mockResolvedValue(guardado('en_revision'));
    montar();
    await esperaPaso0();
    fireEvent.click(boton(/Ana López/)); fireEvent.click(boton('Elegir artículos'));
    expect(screen.queryByRole('button', { name: /Pantalón cargo/ })).toBeNull(); // oculto por "Solo autorizados"
    fireEvent.click(screen.getByRole('checkbox', { name: /Solo autorizados/ }));
    expect(screen.getByRole('button', { name: /Pantalón cargo.*Requiere excepción|Requiere excepción.*Pantalón cargo/ })).toBeInTheDocument();
    await agregar('Pantalón cargo', 'M', []);
    fireEvent.click(boton(/Revisar solicitud \(1\)/));
    expect(await screen.findByText(/fuera de la regla por puesto necesitan justificación/)).toBeInTheDocument();
    const enviar = boton('Enviar a revisión');
    expect(enviar).toBeDisabled();
    const texto = screen.getByPlaceholderText(/Justificación/);
    fireEvent.change(texto, { target: { value: 'corta' } });
    expect(enviar).toBeDisabled();
    fireEvent.change(texto, { target: { value: 'Uso en zona fría' } });
    expect(enviar).toBeEnabled();
    fireEvent.click(enviar);
    await confirmarEnvio();
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(vi.mocked(post).mock.calls[0][1]).toEqual(expect.objectContaining({ partidas: [{ empleado_id: 1, variante_id: 111, cantidad: 1, excepcion: 'Uso en zona fría' }] }));
  });
});

describe('borradores y correcciones', () => {
  it('carga un borrador existente y lo envía actualizando la solicitud (PUT)', async () => {
    api({ pedido: previo('borrador') });
    vi.mocked(put).mockResolvedValue(guardado('en_revision', 7));
    const { router } = montar('/cuenta/solicitudes/7/editar');
    expect(await screen.findByText('Borrador SOL-7')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Revisar solicitud \(2\)/ })); // entra directo al paso de artículos
    expect(await screen.findByDisplayValue('Nota previa')).toBeInTheDocument();
    expect(screen.getByText(/Sucursal · Av\. Central 1, Querétaro/)).toBeInTheDocument();
    fireEvent.click(boton('Enviar a revisión'));
    await confirmarEnvio();
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put).toHaveBeenCalledWith('/cuenta/pedidos-corporativos/7', { partidas: [{ empleado_id: 1, variante_id: 101, cantidad: 2, excepcion: null }], notas: 'Nota previa', enviar: true });
    expect(post).not.toHaveBeenCalled();
    await waitFor(() => expect(router.state.location.pathname).toBe('/cuenta/pedidos/7'));
  });

  it('una solicitud devuelta muestra la observación y solo permite reenviarla', async () => {
    api({ pedido: previo('devuelto', [{ decision: 'devuelto', motivo: 'Falta justificar la talla', usuario: 'Aprobador', fecha: '2026-11-10T10:00:00Z' }]) });
    vi.mocked(put).mockResolvedValue(guardado('en_revision', 7));
    montar('/cuenta/solicitudes/7/editar');
    expect(await screen.findByText('Corregir solicitud SOL-7')).toBeInTheDocument();
    expect(screen.getByText(/Observación del distribuidor: Falta justificar la talla/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Revisar solicitud/ }));
    expect(screen.queryAllByRole('button', { name: 'Guardar borrador' })).toHaveLength(0);
    fireEvent.click(await screen.findByRole('button', { name: 'Reenviar a revisión' }));
    expect(await screen.findByRole('dialog', { name: 'Reenviar la solicitud a revisión' })).toBeInTheDocument();
    await confirmarEnvio();
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(vi.mocked(put).mock.calls[0]).toEqual(['/cuenta/pedidos-corporativos/7', expect.objectContaining({ enviar: true })]);
  });

  it('una solicitud que ya no es editable redirige a su detalle', async () => {
    api({ pedido: previo('en_revision') });
    const { router } = montar('/cuenta/solicitudes/7/editar');
    await waitFor(() => expect(router.state.location.pathname).toBe('/cuenta/pedidos/7'));
    expect(await screen.findByText('DETALLE-DE-SOLICITUD')).toBeInTheDocument();
  });
});

describe('cambios sin guardar', () => {
  it('pregunta antes de salir del asistente con artículos sin guardar', async () => {
    const { router } = montar();
    await esperaPaso0();
    await act(async () => { await router.navigate('/cuenta/pedidos/1'); }); // sin cambios: sale sin preguntar
    expect(router.state.location.pathname).toBe('/cuenta/pedidos/1');
    await act(async () => { await router.navigate('/cuenta/solicitudes/nueva'); });
    await esperaPaso0();
    await agregar('Bata clínica', 'M');
    await act(async () => { await router.navigate('/cuenta/pedidos/1'); });
    const aviso = await screen.findByRole('dialog', { name: 'Tienes cambios sin guardar' });
    expect(router.state.location.pathname).toBe('/cuenta/solicitudes/nueva');
    fireEvent.click(within(aviso).getByRole('button', { name: 'Seguir editando' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.location.pathname).toBe('/cuenta/solicitudes/nueva');
    await act(async () => { await router.navigate('/cuenta/pedidos/1'); });
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Tienes cambios sin guardar' })).getByRole('button', { name: 'Salir sin guardar' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/cuenta/pedidos/1'));
  });
});

describe('condiciones de envío', () => {
  it('sin dirección registrada no deja enviar y explica cómo resolverlo', async () => {
    api({ direcciones: [] });
    montar();
    await esperaPaso0();
    await agregar('Bata clínica', 'M');
    fireEvent.click(boton(/Revisar solicitud \(1\)/));
    expect(await screen.findByText(/aún no tiene una dirección de entrega registrada/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mi cuenta' })).toHaveAttribute('href', '/cuenta/perfil');
    expect(boton('Enviar a revisión')).toBeDisabled();
  });

  it('si el servidor rechaza el envío muestra el error y se queda en la solicitud', async () => {
    vi.mocked(post).mockRejectedValue(new Error('Servidor no disponible'));
    const { router } = montar();
    await esperaPaso0();
    await agregar('Bata clínica', 'M');
    fireEvent.click(boton(/Revisar solicitud \(1\)/));
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar a revisión' }));
    await confirmarEnvio();
    expect(await screen.findByRole('alert')).toHaveTextContent('Servidor no disponible');
    expect(router.state.location.pathname).toBe('/cuenta/solicitudes/nueva');
  });
});
