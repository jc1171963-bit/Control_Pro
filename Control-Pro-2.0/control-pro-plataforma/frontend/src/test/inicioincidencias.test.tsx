/** 3B.5: resumen de incidencias del inicio del panel, TarjetaIncidencia y «Qué sigue» de la solicitud. */
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import { get } from '../api/cliente';
import type { ConteoBandejas, Incidencia, Pedido, TurnoIncidencia } from '../api/tipos';
import { InicioAdmin } from '../features/admin/PanelSolicitudes';
import ResumenIncidencias from '../features/admin/ResumenIncidencias';
import TarjetaIncidencia from '../components/TarjetaIncidencia';
import DetalleSolicitud from '../features/cuenta/DetalleSolicitud';

vi.mock('../api/cliente', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), urlPrivada: vi.fn(), abrirPrivado: vi.fn() }));
const permisos = vi.hoisted(() => ({ lista: [] as string[], rol: 'atencion' }));
vi.mock('../app/auth', () => ({
  useAuth: () => ({ puede: (...p: string[]) => p.every((x) => permisos.lista.includes(x)),
    usuario: { rol: { codigo: permisos.rol, nombre: '', alcance_global: true }, sucursales: [], permisos: permisos.lista },
    cliente: { tipo: 'empresa', nombre: 'Ana' } }),
}));

const CONTEO: ConteoBandejas = {
  por_turno: { lurima_atender: 1, lurima_responder: 1, lurima_reposicion: 2, sucursal_responder: 1, sucursal_recibir: 1, sucursal_confirmar: 1 },
  cerradas: 4, todas: 11, por_enviar: 1,
};
const VACIO: ConteoBandejas = { por_turno: {}, cerradas: 4, todas: 4, por_enviar: 0 };
const inc = (id: number, turno: TurnoIncidencia | null, actor: 'lurima' | 'sucursal' | null, extra = {}) => ({
  id, folio: `INC-${id}`, tipo: 'faltante', prioridad: 'alta', estado: 'en_atencion', pedido_id: 8, pedido_folio: 'SOL-8', cliente: 'Clínica Norte',
  descripcion: `Detalle ${id}`, turno, turno_actor: actor, turno_desde: null, ultima_actividad: '2026-11-20T10:00:00Z', seguimiento: [],
  empleado: null, articulo: null, evidencias: [], reposiciones: [], ...extra,
}) as unknown as Incidencia;
const lista = (items: Incidencia[], conteo = CONTEO) => ({ items, total: items.length, pagina: 1, por_pagina: 3, paginas: 1, conteo });
const PANEL = {
  sucursales: { activas: 3, inactivas: 0, con_solicitudes_en_curso: 2 },
  solicitudes: { total: 9, este_mes: 2, por_etapa: { por_revisar: 1, en_correccion: 0, por_autorizar: 0, en_surtido: 2, en_camino: 1, en_entrega: 3, cerradas: 2, rechazadas_canceladas: 0 } },
  unidades: { solicitadas: 20, entregadas: 10 }, paquetes_en_camino: 1,
  entregas: { registradas: 4, pendientes: 1, conformidades_pendientes: 1, valoracion_promedio: null },
  incidencias_abiertas: 5, top_sucursales: [], top_productos: [], serie: [],
};

function montar(elemento: JSX.Element) {
  const router = createMemoryRouter([{ path: '/admin', element: elemento }], { initialEntries: ['/admin'] });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
}
const rutas = () => vi.mocked(get).mock.calls.map(([r]) => String(r));
const indicador = (titulo: string) => screen.getByRole('link', { name: new RegExp(`^${titulo}: `) });

beforeEach(() => {
  vi.mocked(get).mockReset(); permisos.lista = ['incidencia.gestionar', 'pedido.ver']; permisos.rol = 'atencion';
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia;
});

describe('resumen de incidencias del panel', () => {
  it('atención: un indicador por bandeja de trabajo, con el conteo de la lista y enlace a su bandeja', async () => {
    vi.mocked(get).mockResolvedValue(lista([inc(1, 'lurima_atender', 'lurima'), inc(2, 'lurima_responder', 'lurima')]) as never);
    montar(<ResumenIncidencias />);
    await screen.findByRole('link', { name: 'Gestionar INC-1' });
    expect(rutas()).toEqual(['/admin/incidencias?por_pagina=3&turno=lurima_atender,lurima_responder,interna']);
    expect(indicador('Por atender')).toHaveAttribute('aria-label', 'Por atender: 2');
    expect(indicador('Por atender')).toHaveAttribute('href', '/admin/incidencias?bandeja=por_atender');
    expect(indicador('Reposiciones')).toHaveAttribute('aria-label', 'Reposiciones: 2');
    expect(indicador('Reposiciones')).toHaveAttribute('href', '/admin/incidencias?bandeja=reposiciones');
    expect(indicador('Esperando a la sucursal')).toHaveAttribute('aria-label', 'Esperando a la sucursal: 3');
    expect(indicador('Esperando a la sucursal')).toHaveAttribute('href', '/admin/incidencias?bandeja=esperando');
    // Desglose leído del conteo (respuesta, recepción, confirmación de la sucursal; respuesta de la sucursal a Lurima)
    expect(screen.getByText('1 respuesta · 1 recepción · 1 confirmación')).toBeInTheDocument();
    expect(screen.getByText('1 sin atender · 1 con respuesta de la sucursal')).toBeInTheDocument();
    // Sin «Por enviar» (no despacha), sin cerradas ni todas
    expect(screen.queryByRole('link', { name: /^Por enviar: / })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Cerradas: / })).not.toBeInTheDocument();
  });

  it('cada incidencia activa cuenta en un solo indicador (sin duplicados)', async () => {
    vi.mocked(get).mockResolvedValue(lista([]) as never);
    montar(<ResumenIncidencias />);
    const enlaces = await screen.findAllByRole('link', { name: /: \d+$/ });
    const suma = enlaces.reduce((t, a) => t + Number(a.getAttribute('aria-label')!.split(': ')[1]), 0);
    expect(suma).toBe(Object.values(CONTEO.por_turno).reduce((t, n) => t + (n ?? 0), 0));
  });

  it('las tarjetas abren el detalle de cada incidencia; el chip dice el turno sin repetirlo en otro texto', async () => {
    vi.mocked(get).mockResolvedValue(lista([inc(2, 'lurima_responder', 'lurima')]) as never);
    montar(<ResumenIncidencias />);
    const tarjeta = await screen.findByRole('link', { name: 'Gestionar INC-2' });
    expect(tarjeta).toHaveAttribute('href', '/admin/incidencias/2');
    expect(within(tarjeta).getByText('Respondió la sucursal')).toBeInTheDocument();
    expect(within(tarjeta).queryByText(/^La sucursal escribió/)).not.toBeInTheDocument();
    expect(within(tarjeta).getByText('Alta')).toBeInTheDocument();
  });

  it('almacén: agrega «Por enviar» y muestra primero lo que debe enviar (su bandeja inicial)', async () => {
    permisos.lista = ['incidencia.gestionar', 'surtido.operar']; permisos.rol = 'inventario';
    vi.mocked(get).mockResolvedValue(lista([inc(6, 'lurima_reposicion', 'lurima')]) as never);
    montar(<ResumenIncidencias />);
    expect(await screen.findByRole('heading', { name: 'Lo más reciente en «Por enviar»' })).toBeInTheDocument();
    expect(rutas()).toEqual(['/admin/incidencias?por_pagina=3&por_enviar=1']);
    expect(indicador('Por enviar')).toHaveAttribute('aria-label', 'Por enviar: 1');
    expect(indicador('Por enviar')).toHaveAttribute('href', '/admin/incidencias?bandeja=por_enviar');
  });

  it('sin pendientes: indicadores en cero y estado vacío de la bandeja inicial', async () => {
    vi.mocked(get).mockResolvedValue(lista([], VACIO) as never);
    montar(<ResumenIncidencias />);
    expect(await screen.findByText('No hay incidencias por atender.')).toBeInTheDocument();
    for (const t of ['Por atender', 'Reposiciones', 'Esperando a la sucursal']) expect(indicador(t)).toHaveAttribute('aria-label', `${t}: 0`);
    expect(indicador('Por atender').className).not.toContain('amber');
  });

  it('inicio del panel: con incidencia.gestionar el resumen reemplaza al indicador «Incidencias abiertas»', async () => {
    vi.mocked(get).mockImplementation(async (r: string) => (r.includes('/admin/incidencias') ? lista([]) : PANEL) as never);
    montar(<InicioAdmin />);
    expect(await screen.findByRole('link', { name: 'Por atender: 2' })).toBeInTheDocument();
    expect(await screen.findByText('Sucursales activas')).toBeInTheDocument();
    expect(screen.queryByText('Incidencias abiertas')).not.toBeInTheDocument();
  });

  it('inicio del panel: sin incidencia.gestionar no consulta incidencias y conserva su indicador', async () => {
    permisos.lista = ['pedido.ver'];
    vi.mocked(get).mockResolvedValue(PANEL as never);
    montar(<InicioAdmin />);
    expect(await screen.findByText('Incidencias abiertas')).toBeInTheDocument();
    expect(rutas().some((r) => r.includes('/admin/incidencias'))).toBe(false);
  });
});

describe('TarjetaIncidencia', () => {
  it('en una lista toda la tarjeta es el enlace al detalle; chip, prioridad y actividad', () => {
    montar(<TarjetaIncidencia i={inc(3, 'sucursal_responder', 'sucursal')} portal="sucursal" a="/cuenta/incidencias/3" contexto={<span>Solicitud SOL-8</span>} />);
    const enlace = screen.getByRole('link');
    expect(enlace).toHaveAttribute('href', '/cuenta/incidencias/3');
    expect(within(enlace).getByText('Te toca responder')).toBeInTheDocument();
    expect(within(enlace).getByText('Alta')).toBeInTheDocument();
    expect(within(enlace).getByText('Solicitud SOL-8')).toBeInTheDocument();
    expect(within(enlace).getByText(/^Última actividad hace/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('el chip se adapta al portal y el siguiente paso solo aparece si le toca a quien mira', () => {
    const i = inc(4, 'lurima_atender', 'lurima');
    montar(<><TarjetaIncidencia i={i} portal="sucursal" a="/s" paso /><TarjetaIncidencia i={i} portal="lurima" a="/l" paso /></>);
    const [suc, lur] = screen.getAllByRole('link');
    expect(within(suc).getByText('Esperando a Lurima')).toBeInTheDocument();
    expect(within(suc).queryByText(/revisar|revisará/i)).not.toBeInTheDocument();
    expect(within(lur).getByText('Por atender')).toBeInTheDocument();
    expect(within(lur).getByText(/^Revisar la incidencia y atenderla/)).toBeInTheDocument();
  });

  it('con contenido propio (solicitud) no es un enlace: el detalle se abre desde su pie', () => {
    montar(<TarjetaIncidencia i={inc(5, 'cerrada', null)} portal="sucursal" a="/cuenta/incidencias/5"><button type="button">Ver evidencia</button></TarjetaIncidencia>);
    expect(screen.getByRole('button', { name: 'Ver evidencia' }).closest('a')).toBeNull();
    expect(screen.getByRole('link', { name: 'Abrir incidencia INC-5' })).toHaveAttribute('href', '/cuenta/incidencias/5');
    expect(screen.getByText('Cerrada')).toBeInTheDocument();
  });

  it('con contenido propio que hoy viene vacío conserva la misma forma (tarjeta con pie)', () => {
    montar(<TarjetaIncidencia i={inc(5, 'lurima_atender', 'lurima')} portal="lurima" a="/admin/incidencias/5">{false}</TarjetaIncidencia>);
    expect(screen.getByRole('link', { name: 'Abrir incidencia INC-5' })).toHaveTextContent('Abrir incidencia');
  });

  it('sin ruta de detalle (perfil sin acceso) no ofrece enlace', () => {
    montar(<TarjetaIncidencia i={inc(5, 'lurima_atender', 'lurima')} portal="lurima"><span>Evidencia</span></TarjetaIncidencia>);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('«Qué sigue» e incidencias en la solicitud de la sucursal', () => {
  const solicitud = (incidencias: Incidencia[]) => ({
    id: 8, folio: 'SOL-8', estado: 'enviado', creado: '2026-11-10T10:00:00Z', articulos: 1, notas: null, detalles: [], paquetes: [],
    entregas_individuales: [], incidencias, historial: [], aprobaciones: [],
  }) as unknown as Pedido;

  it('separa lo que espera a la sucursal (con enlace) de lo que sigue con Lurima; las cerradas no cuentan', () => {
    montar(<DetalleSolicitud p={solicitud([inc(6, 'sucursal_recibir', 'sucursal'), inc(7, 'lurima_atender', 'lurima'), inc(9, 'cerrada', null)])} />);
    const sigue = screen.getByText('Qué sigue').closest('section')!;
    expect(within(sigue).getByText(/1 incidencia te espera/)).toBeInTheDocument();
    expect(within(sigue).getByRole('link', { name: 'INC-6' })).toHaveAttribute('href', '/cuenta/incidencias/6');
    expect(within(sigue).getByText('1 incidencia en seguimiento con Lurima.')).toBeInTheDocument();
  });

  it('sin incidencias activas no agrega avisos de incidencias', () => {
    montar(<DetalleSolicitud p={solicitud([inc(9, 'cerrada', null)])} />);
    const sigue = screen.getByText('Qué sigue').closest('section')!;
    expect(within(sigue).queryByText(/incidencia/)).not.toBeInTheDocument();
  });

  it('cada incidencia usa la tarjeta común con chip de la sucursal y enlace a su detalle', () => {
    montar(<DetalleSolicitud p={solicitud([inc(6, 'sucursal_recibir', 'sucursal'), inc(7, 'lurima_atender', 'lurima')])} />);
    expect(screen.getByRole('link', { name: 'Abrir incidencia INC-6' })).toHaveAttribute('href', '/cuenta/incidencias/6');
    expect(screen.getByRole('link', { name: 'Abrir incidencia INC-7' })).toHaveAttribute('href', '/cuenta/incidencias/7');
    expect(screen.getAllByText('Te toca recibir la reposición').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Esperando a Lurima').length).toBeGreaterThan(0);
  });
});
