import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, vi } from 'vitest';
import { post } from '../api/cliente';
import type { Negociacion, PartidaPropuesta, Pedido } from '../api/tipos';
import { useAuth } from '../app/auth';
import PanelNegociacion from '../features/admin/Negociacion';

vi.mock('../api/cliente', () => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));
vi.mock('../app/auth', () => ({ useAuth: vi.fn() }));

const partida = (precio: string, cantidad: number): PartidaPropuesta => ({
  pedido_detalle_id: 11, empleado_id: 1, empleado: 'Ana López', variante_id: 101, sku: 'BAT-1', nombre: 'Bata', talla: 'M', color: 'Blanco',
  cantidad, precio_unitario: precio, descuento_unitario: '0.00', importe: String(Number(precio) * cantidad), precio_catalogo: '250.00', excepcion: null,
});
const negociacion = (extra: Partial<Negociacion> = {}): Negociacion => ({
  version_condiciones: 1, propuestas: [], acuerdos: [], pago_resuelto: null, acuerdo_vigente_id: null,
  pendiente: {
    id: 3, numero: 1, estado: 'pendiente', creado: '2026-11-20T10:00:00Z', creado_por: 'Admin', aceptada_por: null, aceptada_en: null, motivo_descarte: null,
    versiones: [{ id: 21, numero: 1, nota: 'Precio acordado por volumen', creado: '2026-11-20T10:00:00Z', total: '4400.00', creado_por: 'Admin' }],
    version_actual: { id: 21, numero: 1, partidas: [partida('220.00', 20)] },
    comparacion: { filas: [{ cambio: 'modificada', antes: partida('250.00', 20), despues: partida('220.00', 20) }],
      antes: { subtotal: '5000.00', descuento: '0.00', total: '5000.00' }, despues: { subtotal: '4400.00', descuento: '0.00', total: '4400.00' },
      diferencia: { subtotal: '-600.00', descuento: '0.00', total: '-600.00' } },
  },
  ...extra,
});
const pedido = (n: Negociacion) => ({ id: 7, folio: 'SOL-7', estado: 'aprobado', canal: 'corporativo', detalles: [], negociacion: n }) as unknown as Pedido;

function montar(p: Pedido, permisos: string[]) {
  vi.mocked(useAuth).mockReturnValue({ puede: (...ps: string[]) => ps.every((x) => permisos.includes(x)) } as unknown as ReturnType<typeof useAuth>);
  return render(<QueryClientProvider client={new QueryClient()}><PanelNegociacion p={p} /></QueryClientProvider>);
}

beforeEach(() => vi.mocked(post).mockReset());

describe('negociación de la solicitud', () => {
  it('el Gerente de compras ve la comparación y acepta la última versión; no puede proponer ni registrar el pago', async () => {
    vi.mocked(post).mockResolvedValue(pedido(negociacion({ pendiente: null })) as never);
    montar(pedido(negociacion()), ['pedido.aceptar_propuesta']);
    expect(screen.getByText('Precio acordado por volumen')).toBeInTheDocument();
    expect(screen.getAllByText('Modificada').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Modificar|Registrar acuerdo|Marcar pago resuelto/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar propuesta' }));
    const botones = screen.getAllByRole('button', { name: 'Aceptar propuesta' });
    fireEvent.click(botones[botones.length - 1]);
    await waitFor(() => expect(vi.mocked(post)).toHaveBeenCalledWith('/admin/pedidos/7/propuestas/aceptar', { version_id: 21, aceptar_excepciones: false }));
  });

  it('la comercializadora no resuelve el pago mientras haya una propuesta pendiente', () => {
    const acuerdo = { id: 5, version: 1, forma: 'Transferencia', condiciones: 'A 15 días', fecha_pago: '2026-12-01', observaciones: null, creado: '2026-11-20T10:00:00Z', registrado_por: 'Admin' };
    montar(pedido(negociacion({ acuerdos: [acuerdo], acuerdo_vigente_id: 5 })), ['pedido.negociar']);
    expect(screen.getByText('Pago sin resolver')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marcar pago resuelto' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Aceptar propuesta' })).not.toBeInTheDocument();
  });
});
