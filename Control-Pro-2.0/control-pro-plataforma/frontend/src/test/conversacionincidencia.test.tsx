import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import { get, post } from '../api/cliente';
import type { Incidencia } from '../api/tipos';
import { useAuth } from '../app/auth';
import { SiguientePaso } from '../components/DetalleIncidencia';
import { IncidenciaDetalle } from '../features/admin/IncidenciaDetalle';
import { HistorialIncidencia } from '../features/cuenta/DetalleSolicitud';
import { IncidenciaSucursal } from '../features/cuenta/Incidencias';

vi.mock('../api/cliente', async (original) => ({
  ApiError: (await original<typeof import('../api/cliente')>()).ApiError,
  get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), patch: vi.fn(), abrirPrivado: vi.fn(), urlPrivada: vi.fn(),
}));
vi.mock('../app/auth', () => ({ useAuth: vi.fn() }));

type Seg = Incidencia['seguimiento'][number];
const seg = (x: Partial<Seg>): Seg => ({ fecha: '2026-11-20T10:00:00Z', anterior: 'en_atencion', nuevo: 'en_atencion', comentario: null,
  actor: 'Sistema', responsable: null, lado: 'sistema', clase: 'evento', ...x }) as Seg;
const ana = { id: 1, nombre: 'Ana López', puesto: 'Enfermería' };
const contenido = [{ pedido_detalle_id: 11, sku: 'S11', nombre: 'Bata', talla: 'M', color: null, cantidad: 1, empleado: ana.nombre, empleado_id: ana.id, puesto: ana.puesto }];
const paq = (extra = {}) => ({ id: 30, folio: 'PAQ-R1', estado: 'preparado', peso_kg: null, creado: '2026-11-21T10:00:00Z', sucursal: 'Querétaro',
  contenido, individuales: [{ empleado: ana, piezas: contenido, total_piezas: 1 }], envio: null, recepcion: null,
  reposicion: { incidencia_id: 9, folio: 'INC-9' }, ...extra });
const inc = (extra: Partial<Incidencia> = {}) => ({
  id: 9, folio: 'INC-9', tipo: 'otro', prioridad: 'media', estado: 'en_atencion', pedido_id: 1, pedido_folio: 'PED-1', paquete_id: null,
  devolucion_id: null, transferencia_id: null, sucursal_id: null, descripcion: 'Bata rota.', resolucion: null, responsable_id: null,
  creado: '2026-11-20T10:00:00Z', actualizado: '2026-11-20T10:00:00Z', evidencias: [], empleado: null, articulo: null, cliente: 'Clínica',
  turno: 'lurima_atender', turno_actor: 'lurima', turno_desde: null, ultima_actividad: null, reposicion_de: null, cierre_por_sucursal: true,
  transiciones: ['resuelta'], reposiciones: [], reposicion_sugerida: [], seguimiento: [], ...extra,
}) as Incidencia;

function sesion(permisos: string[]) {
  vi.mocked(useAuth).mockReturnValue({ puede: (p: string) => permisos.includes(p), cliente: { tipo: 'empresa', nombre: 'Ana' },
    usuario: { rol: { codigo: 'x', nombre: '', alcance_global: true }, sucursales: [], permisos } } as unknown as ReturnType<typeof useAuth>);
}
function montar(path: string, element: JSX.Element, url: string) {
  const router = createMemoryRouter([{ path, element }], { initialEntries: [url] });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
}
const panel = (i: Incidencia, permisos: string[]) => {
  sesion(permisos);
  vi.mocked(get).mockResolvedValue(i as never);
  montar('/admin/incidencias/:id', <IncidenciaDetalle />, '/admin/incidencias/9');
};
const ATENCION = ['incidencia.gestionar'];
const ALMACEN = ['incidencia.gestionar', 'surtido.operar'];

beforeEach(() => {
  vi.mocked(get).mockReset(); vi.mocked(post).mockReset();
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia;
});

describe('conversación: mensajes, eventos, confirmación y reapertura', () => {
  const historial = (s: Seg[]) => render(<HistorialIncidencia i={inc({ seguimiento: s })} />);
  const item = (texto: string) => screen.getByText(texto).closest('li') as HTMLElement;

  it('el mensaje lleva su autor y lado; el evento va en una línea discreta del sistema', () => {
    historial([
      seg({ anterior: null, nuevo: 'abierta', comentario: 'Llegó roto.', actor: 'Clínica', lado: 'sucursal', clase: 'evento' }),
      seg({ comentario: 'Mandamos otra.', actor: 'Mario Atención', lado: 'lurima', clase: 'mensaje' }),
      seg({ anterior: 'abierta', nuevo: 'en_atencion', actor: 'Mario Atención', lado: 'lurima' }),
    ]);
    const m = item('Mandamos otra.');
    expect(m.textContent).toMatch(/^Mensaje:/);
    expect(within(m).getByText('Mario Atención')).toBeInTheDocument();
    expect(within(m).getByText('Lurima')).toBeInTheDocument();
    expect(item('Incidencia registrada · Llegó roto.').textContent).toMatch(/^Evento del sistema:/);
    expect(screen.getByText(/Abierta → En atención/).closest('li')?.textContent).toMatch(/^Evento del sistema:/);
  });

  it('la confirmación de la sucursal es un mensaje humano con tratamiento especial', () => {
    historial([seg({ anterior: 'resuelta', nuevo: 'cerrada', comentario: 'Solución confirmada por la sucursal', actor: 'Clínica', lado: 'sucursal', clase: 'mensaje' })]);
    const m = item('Solución confirmada por la sucursal');
    expect(m.textContent).toMatch(/^Mensaje:/);
    expect(within(m).getByText('Solución confirmada')).toBeInTheDocument();
    expect(within(m).getByText('Clínica')).toBeInTheDocument();
  });

  it('la reapertura con motivo sigue siendo mensaje y muestra el texto tal cual', () => {
    historial([seg({ anterior: 'resuelta', nuevo: 'en_atencion', comentario: 'Reabierta por la sucursal: sigue rota la manga.', actor: 'Clínica', lado: 'sucursal', clase: 'mensaje' })]);
    const m = item('Reabierta por la sucursal: sigue rota la manga.');
    expect(m.textContent).toMatch(/^Mensaje:/);
    expect(within(m).getByText('Reabrió la incidencia')).toBeInTheDocument();
  });

  it('un cambio a cerrada hecho por Lurima no se etiqueta como confirmación de la sucursal', () => {
    historial([seg({ anterior: 'resuelta', nuevo: 'cerrada', comentario: 'Cierre administrativo.', actor: 'Mario', lado: 'lurima', clase: 'mensaje' })]);
    expect(screen.queryByText('Solución confirmada')).toBeNull();
  });

  it('la resolución automática por la recepción no se atribuye a la sucursal; el alta sí', () => {
    historial([
      seg({ anterior: null, nuevo: 'abierta', comentario: 'Faltó una bata.', actor: 'Sucursal', lado: 'sucursal' }),
      seg({ anterior: 'en_atencion', nuevo: 'resuelta', comentario: 'La sucursal recibió completa la reposición PAQ-1.', actor: 'Sucursal', lado: 'sucursal' }),
    ]);
    expect(screen.getByText(/En atención → Resuelta/).closest('li')?.textContent).toMatch(/Registro automático/);
    expect(screen.getByText(/En atención → Resuelta/).closest('li')?.textContent).not.toMatch(/· Sucursal ·/);
    expect(screen.getByText(/Faltó una bata/).closest('li')?.textContent).toMatch(/· Sucursal ·/);
  });

  it('no repite el autor cuando coincide con su lado ni el título del evento con su comentario', () => {
    historial([
      seg({ anterior: null, nuevo: 'abierta', comentario: 'Incidencia registrada', actor: 'Sucursal', lado: 'sucursal' }),
      seg({ comentario: 'Hola', actor: 'Sucursal', lado: 'sucursal', clase: 'mensaje' }),
    ]);
    expect(screen.getAllByText('Sucursal')).toHaveLength(1);
    expect(screen.getByText(/Incidencia registrada/).closest('li')?.textContent).not.toMatch(/Incidencia registrada · Incidencia registrada/);
  });
});

describe('Siguiente paso', () => {
  it.each([
    ['lurima_atender', 'lurima', 'Atención (Lurima)', /revisar la incidencia/],
    ['lurima_responder', 'lurima', 'Atención (Lurima)', /responderle/],
    ['sucursal_responder', 'lurima', 'La sucursal', /debe responder/],
    ['sucursal_recibir', 'lurima', 'La sucursal', /registrar la recepción/],
    ['sucursal_confirmar', 'lurima', 'La sucursal', /confirmar si la solución/],
    ['interna', 'lurima', 'Revisión interna', /revisa el personal/],
    ['sucursal_responder', 'sucursal', 'Tu sucursal', /responde a Lurima/],
    ['sucursal_recibir', 'sucursal', 'Tu sucursal', /registra su recepción/],
    ['lurima_reposicion', 'sucursal', 'Lurima', /preparando o enviando/],
  ] as const)('%s en %s: responsable y acción esperada', (turno, portal, responsable, texto) => {
    render(<SiguientePaso i={inc({ turno })} portal={portal} />);
    const b = screen.getByRole('region', { name: 'Siguiente paso' });
    expect(within(b).getByText(responsable)).toBeInTheDocument();
    expect(b.textContent).toMatch(texto);
    expect(b.querySelector('[data-turno]')).toBeNull();  // no repite el chip de turno
  });

  it.each([['cerrada'], ['turno_futuro'], [null]])('%s: sin responsable inventado', (turno) => {
    render(<SiguientePaso i={inc({ turno: turno as never })} portal="lurima" />);
    const b = screen.getByRole('region', { name: 'Siguiente paso' });
    expect(b.querySelector('b')).toBeNull();
    expect(b.textContent).toMatch(turno === 'cerrada' ? /está cerrada/ : /No hay información/);
  });
});

describe('acciones de reposición por perfil (surtido.operar) y D-6', () => {
  it('Atención sin surtido.operar: no ve el formulario de envío ni «Marcar como entregada»', async () => {
    panel(inc({ turno: 'lurima_reposicion', reposiciones: [paq(), paq({ id: 31, folio: 'PAQ-R2', estado: 'despachado' })] as never }), ATENCION);
    await screen.findByText(/Reposición PAQ-R1/);
    expect(screen.queryByLabelText(/Paquetería de/)).toBeNull();
    expect(screen.queryByLabelText(/Guía de/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Enviar con esta guía/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Marcar como entregada/ })).toBeNull();
    expect(screen.getByText(/el almacén la enviará/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();  // cancelar: incidencia.gestionar (backend)
    expect(screen.getByRole('region', { name: 'Siguiente paso' }).textContent).toMatch(/el almacén que surte/);
  });

  it('con surtido.operar conserva enviar con guía, cancelar y marcar entregada', async () => {
    panel(inc({ turno: 'lurima_reposicion', reposiciones: [paq(), paq({ id: 31, folio: 'PAQ-R2', estado: 'despachado' })] as never }), ALMACEN);
    expect(await screen.findByLabelText('Paquetería de PAQ-R1')).toBeInTheDocument();
    expect(screen.getByLabelText('Guía de PAQ-R1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar con esta guía/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Marcar como entregada/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Siguiente paso' }).textContent).toMatch(/enviar la reposición con su paquetería/);
  });

  it.each([
    ['sin reposiciones', [], 'lurima_atender', 'Preparar reposición'],
    ['una en curso', [paq({ estado: 'despachado' })], 'lurima_reposicion', null],
    ['entregada sin recepción', [paq({ estado: 'entregado' })], 'sucursal_recibir', null],
    ['la anterior cancelada', [paq({ estado: 'cancelado' })], 'lurima_atender', 'Preparar otra reposición'],
    ['la anterior recibida incompleta', [paq({ estado: 'entregado' })], 'lurima_atender', 'Preparar otra reposición'],
  ])('D-6, %s', async (_, reposiciones, turno, boton) => {
    panel(inc({ turno: turno as never, reposiciones: reposiciones as never }), ALMACEN);
    await screen.findByRole('heading', { name: /Incidencia INC-9/ });
    const preparar = screen.queryByRole('button', { name: /Preparar (otra )?reposición/ });
    if (boton) expect(preparar).toHaveTextContent(boton);
    else {
      expect(preparar).toBeNull();
      expect(screen.getByText(/Hay una reposición vigente/)).toBeInTheDocument();
    }
  });
});

describe('recepción de la reposición desde la incidencia (D-7)', () => {
  const pedido = (paquetes: unknown[]) => ({ id: 1, folio: 'PED-1', estado: 'enviado', paquetes, detalles: [], incidencias: [], historial: [] });
  const sucursal = (i: Incidencia, paquetes: unknown[]) => {
    sesion([]);
    vi.mocked(get).mockImplementation((url: string) => Promise.resolve(url.startsWith('/cuenta/pedidos/') ? pedido(paquetes) : i) as never);
    montar('/cuenta/incidencias/:id', <IncidenciaSucursal />, '/cuenta/incidencias/9');
  };

  it('con la reposición entregada, se registra la recepción sin salir de la incidencia', async () => {
    vi.mocked(post).mockResolvedValue({} as never);
    sucursal(inc({ turno: 'sucursal_recibir', turno_actor: 'sucursal', reposiciones: [paq({ estado: 'entregado' })] as never }), [paq({ estado: 'entregado' })]);
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar recepción de PAQ-R1' }));
    const d = await screen.findByRole('dialog', { name: /Recepción del paquete PAQ-R1/ });
    const llamadas = vi.mocked(get).mock.calls.filter(([u]) => u === '/cuenta/incidencias/9').length;
    fireEvent.click(within(d).getByRole('button', { name: 'Confirmar recepción completa' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/cuenta/paquetes/30/recepcion', expect.objectContaining({ completa: true })));
    // la incidencia se recarga (su turno y estado los decide el backend)
    await waitFor(() => expect(vi.mocked(get).mock.calls.filter(([u]) => u === '/cuenta/incidencias/9').length).toBeGreaterThan(llamadas));
  });

  it('si el paquete ya tiene recepción o el turno no es de recibir, no ofrece la acción', async () => {
    sucursal(inc({ turno: 'sucursal_recibir', turno_actor: 'sucursal' }), [paq({ estado: 'entregado', recepcion: { estado: 'parcial', diferencias: 'x', fecha: '2026-11-22T10:00:00Z', detalles: [] } })]);
    await screen.findByRole('region', { name: 'Siguiente paso' });
    await waitFor(() => expect(get).toHaveBeenCalledWith('/cuenta/pedidos/1'));
    expect(screen.queryByRole('button', { name: /Registrar recepción/ })).toBeNull();
  });

  it('sin turno de recepción no consulta la solicitud', async () => {
    sucursal(inc({ turno: 'sucursal_responder', turno_actor: 'sucursal' }), []);
    await screen.findByRole('region', { name: 'Siguiente paso' });
    expect(get).not.toHaveBeenCalledWith('/cuenta/pedidos/1');
  });
});
