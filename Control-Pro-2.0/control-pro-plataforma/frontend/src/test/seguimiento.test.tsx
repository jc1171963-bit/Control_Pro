import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FilaSeguimiento, type ItemSeguimiento } from '../features/aprobador/Seguimiento';

const AHORA = new Date('2026-11-18T12:00:00Z').getTime();
const hace = (h: number) => new Date(AHORA - h * 3_600_000).toISOString();
function item(estado: string, historial: [string, number][], extra: Partial<ItemSeguimiento> = {}): ItemSeguimiento {
  return {
    id: 7, folio: 'PED-7', canal: 'corporativo', estado, modalidad: 'envio', metodo_pago: 'credito', total: '0', creado: hace(200),
    cliente: { id: 1, nombre: 'Puebla CAPU' }, articulos: 3, sucursales: [], reserva_expira: null,
    historial: historial.map(([nuevo, h]) => ({ nuevo, fecha: hace(h), anterior: null, motivo: null, actor: 'Sistema' })) as never,
    paquetes: [], entregas_individuales: [], ...extra,
  };
}
const fila = (p: ItemSeguimiento) => render(<MemoryRouter initialEntries={['/aprobador/seguimiento']}><ul><FilaSeguimiento p={p} ahora={AHORA} /></ul></MemoryRouter>);

describe('fila de seguimiento', () => {
  it('nombra el paso por lo que falta y marca la demora con ícono y texto', () => {
    fila(item('en_revision', [['en_revision', 100]]));
    expect(screen.getByText('Por aprobar')).toBeInTheDocument();
    expect(screen.getByText(/Demorada · esperando 4 d 4 h/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Avance: 1 de 9 pasos' })).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/aprobador/pedidos/7');
  });

  it('sin paquetes registrados, una solicitud entregada a la sucursal ya cuenta como recibida', () => {
    fila(item('entregado', [['en_revision', 60], ['aprobado', 50], ['confirmado', 40], ['en_preparacion', 30], ['enviado', 20], ['entregado', 30 / 60]]));
    expect(screen.getByText('Por entregar a empleados')).toBeInTheDocument();
    expect(screen.getByText(/A tiempo · esperando 30 min/)).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: /^Avance/ })).getByText(/Recibida · .*: completado/)).toBeInTheDocument();
  });

  it('las detenidas muestran el motivo y no cuentan espera', () => {
    const p = item('rechazado', [['en_revision', 30], ['rechazado', 26]]);
    (p.historial[1] as { motivo: string | null }).motivo = 'Fuera de presupuesto';
    fila(p);
    expect(screen.getByText('Detenida')).toBeInTheDocument();
    expect(screen.getByText('Fuera de presupuesto')).toBeInTheDocument();
    expect(screen.queryByText(/esperando/)).not.toBeInTheDocument();
  });
});
