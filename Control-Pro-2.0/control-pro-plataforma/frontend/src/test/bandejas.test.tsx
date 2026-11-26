import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import { get } from '../api/cliente';
import type { ConteoBandejas, Incidencia, TurnoIncidencia } from '../api/tipos';
import {
  BANDEJA_POR_ENVIAR, BANDEJAS_LURIMA, BANDEJAS_SUCURSAL, contarBandeja, filtroBandeja, PestanasBandeja,
} from '../components/BandejasIncidencia';
import PrioridadIncidencia from '../components/PrioridadIncidencia';
import MisIncidencias from '../features/cuenta/Incidencias';
import { Incidencias } from '../features/admin/Posventa';

vi.mock('../api/cliente', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn(), patch: vi.fn(), abrirPrivado: vi.fn() }));
const permisos = vi.hoisted(() => ({ lista: [] as string[], rol: 'atencion' }));
vi.mock('../app/auth', () => ({
  useAuth: () => ({ puede: (...p: string[]) => p.every((x) => permisos.lista.includes(x)),
    usuario: { rol: { codigo: permisos.rol, nombre: '', alcance_global: true }, sucursales: [], permisos: permisos.lista } }),
}));

const ACTIVOS: TurnoIncidencia[] = ['lurima_atender', 'lurima_responder', 'lurima_reposicion', 'sucursal_responder',
  'sucursal_recibir', 'sucursal_confirmar', 'interna'];
const CONTEO: ConteoBandejas = {
  por_turno: { sucursal_responder: 1, sucursal_recibir: 1, sucursal_confirmar: 1, lurima_atender: 1, lurima_responder: 1, lurima_reposicion: 2 },
  cerradas: 1, todas: 8, por_enviar: 1,
};
const inc = (id: number, turno: TurnoIncidencia, prioridad = 'media') => ({
  id, folio: `INC-${id}`, tipo: 'otro', prioridad, estado: 'en_atencion', pedido_id: 1, pedido_folio: 'PED-1', cliente: 'Clínica San Rafael',
  descripcion: 'Algo pasó', turno, turno_actor: turno.startsWith('sucursal') ? 'sucursal' : 'lurima', turno_desde: null, ultima_actividad: null,
  seguimiento: [], reposicion_de: null,
}) as unknown as Incidencia;
const respuesta = (items: Incidencia[]) => ({ items, total: items.length, pagina: 1, por_pagina: 20, paginas: 1, conteo: CONTEO });

function montar(elemento: JSX.Element, ruta: string, url = ruta) {
  const router = createMemoryRouter([{ path: ruta, element: elemento }], { initialEntries: [url] });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}

beforeEach(() => { vi.mocked(get).mockReset(); permisos.lista = ['incidencia.gestionar']; permisos.rol = 'atencion'; });

describe('definición de bandejas', () => {
  it.each([['sucursal', BANDEJAS_SUCURSAL], ['lurima', BANDEJAS_LURIMA]] as const)(
    '%s: cada turno activo está en exactamente una bandeja de turno', (_p, bandejas) => {
      for (const t of ACTIVOS) expect(bandejas.filter((b) => b.turnos?.includes(t))).toHaveLength(1);
    });

  it('filtro y contador salen de la misma definición', () => {
    const [teToca] = BANDEJAS_SUCURSAL;
    expect(filtroBandeja(teToca)).toBe('turno=sucursal_responder,sucursal_recibir,sucursal_confirmar');
    expect(contarBandeja(teToca, CONTEO)).toBe(3);
    expect(contarBandeja(BANDEJAS_LURIMA[0], CONTEO)).toBe(2);
    expect(filtroBandeja(BANDEJA_POR_ENVIAR)).toBe('por_enviar=1');
    expect(contarBandeja(BANDEJA_POR_ENVIAR, CONTEO)).toBe(1);
    const cerradas = BANDEJAS_LURIMA.find((b) => b.cerradas)!, todas = BANDEJAS_LURIMA.find((b) => b.clave === 'todas')!;
    expect([filtroBandeja(cerradas), contarBandeja(cerradas, CONTEO)]).toEqual(['turno=cerrada', 1]);
    expect([filtroBandeja(todas), contarBandeja(todas, CONTEO)]).toEqual(['', 8]);
    expect(contarBandeja(teToca, undefined)).toBeNull();
  });

  it('pestañas: contador visible y selección accesible', () => {
    render(<PestanasBandeja etiqueta="Bandejas" bandejas={BANDEJAS_SUCURSAL} activa="esperando" conteo={CONTEO} onCambio={() => {}} />);
    expect(screen.getByRole('tab', { name: /Te toca\s*3/ })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: /Esperando a Lurima\s*2/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('H-3: el contador de la pestaña seleccionada hereda el color de la pestaña (en modo oscuro la pestaña se invierte)', () => {
    render(<PestanasBandeja etiqueta="Bandejas" bandejas={BANDEJAS_SUCURSAL} activa="esperando" conteo={CONTEO} onCambio={() => {}} />);
    const contador = within(screen.getByRole('tab', { name: /Esperando a Lurima/ })).getByText('2');
    expect(contador).toHaveClass('text-inherit');
    expect(contador).not.toHaveClass('text-white');
  });
});

describe('prioridad', () => {
  it.each([['critica', 'Crítica'], ['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja'], [null, 'Sin prioridad']])(
    '%s: texto + ícono, sin forma de chip', (p, texto) => {
      const { container } = render(<PrioridadIncidencia prioridad={p} />);
      const el = container.querySelector('[data-prioridad]')!;
      expect(el).toHaveTextContent(`Prioridad ${texto}`);
      expect(el.querySelector('svg')).toBeTruthy();
      expect(el.className).not.toMatch(/rounded-full|bg-/);
    });
});

describe('bandeja de la sucursal', () => {
  it('abre en «Te toca» y cambia de bandeja conservándola en la URL', async () => {
    vi.mocked(get).mockResolvedValue(respuesta([inc(4, 'sucursal_responder', 'alta')]) as never);
    const router = montar(<MisIncidencias />, '/cuenta/incidencias');
    expect(await screen.findByText('INC-4 · Otro')).toBeInTheDocument();
    expect(vi.mocked(get).mock.calls[0][0]).toContain('turno=sucursal_responder,sucursal_recibir,sucursal_confirmar');
    expect(screen.getByText('Te toca responder')).toBeInTheDocument();
    expect(screen.getByText('Alta')).toBeInTheDocument();
    vi.mocked(get).mockResolvedValue(respuesta([]) as never);
    fireEvent.click(screen.getByRole('tab', { name: /Reposición en proceso/ }));
    await waitFor(() => expect(vi.mocked(get).mock.lastCall?.[0]).toContain('turno=lurima_reposicion'));
    expect(router.state.location.search).toContain('bandeja=reposicion');
    expect(await screen.findByText('Sin incidencias en «Reposición en proceso»')).toBeInTheDocument();
  });
});

describe('bandeja del panel', () => {
  it('atención: sin «Por enviar»; abre en «Por atender»', async () => {
    vi.mocked(get).mockResolvedValue(respuesta([inc(3, 'lurima_atender')]) as never);
    montar(<Incidencias />, '/admin/incidencias');
    await screen.findAllByText('INC-3');
    expect(vi.mocked(get).mock.calls[0][0]).toContain('turno=lurima_atender,lurima_responder,interna');
    const pestanas = screen.getByRole('tablist');
    expect(within(pestanas).queryByRole('tab', { name: /Por enviar/ })).toBeNull();
    expect(within(pestanas).getByRole('tab', { name: /Por atender\s*2/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('almacén (surtido.operar): abre en «Por enviar»; prioridad se combina con la bandeja', async () => {
    permisos.lista = ['incidencia.gestionar', 'surtido.operar']; permisos.rol = 'inventario';
    vi.mocked(get).mockResolvedValue(respuesta([inc(6, 'lurima_reposicion', 'alta')]) as never);
    const router = montar(<Incidencias />, '/admin/incidencias');
    await screen.findAllByText('INC-6');
    expect(vi.mocked(get).mock.calls[0][0]).toContain('por_enviar=1');
    expect(screen.getByRole('tab', { name: /Por enviar\s*1/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.change(screen.getByLabelText('Filtrar por prioridad'), { target: { value: 'alta' } });
    await waitFor(() => expect(vi.mocked(get).mock.lastCall?.[0]).toMatch(/por_enviar=1&prioridad=alta/));
    expect(router.state.location.search).toContain('prioridad=alta');
  });
});
