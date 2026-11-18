import { render, screen } from '@testing-library/react';
import type { Pedido } from '../api/tipos';
import LineaTiempoSolicitud, { duracion, hitosSolicitud } from '../components/LineaTiempoSolicitud';

const H = (nuevo: string, fecha: string, actor = 'Sistema', motivo: string | null = null) => ({ nuevo, fecha, actor, motivo, anterior: null });
const pedido = (estado: string, historial: ReturnType<typeof H>[], extra: Partial<Pedido> = {}) =>
  ({ id: 1, folio: 'SOL-1', estado, historial, paquetes: [], entregas_individuales: [], ...extra }) as unknown as Pedido;
const AHORA = new Date('2026-11-20T12:00:00Z').getTime();

describe('línea de tiempo de la solicitud', () => {
  it('formatea duraciones de forma legible', () => {
    expect(duracion(5 * 60000)).toBe('5 min');
    expect(duracion((3 * 60 + 20) * 60000)).toBe('3 h 20 min');
    expect(duracion((2 * 24 + 4) * 3600000)).toBe('2 d 4 h');
    expect(duracion(null)).toBeNull();
  });

  it('en revisión: el envío está hecho y la aprobación en curso con su tiempo de espera', () => {
    const h = hitosSolicitud(pedido('en_revision', [H('en_revision', '2026-11-20T09:00:00Z', 'Cliente')]), AHORA);
    expect(h[0]).toMatchObject({ clave: 'enviada', estado: 'hecha', actor: 'Sucursal' });
    expect(h[1]).toMatchObject({ clave: 'aprobada', estado: 'actual' });
    expect(duracion(h[1].espera)).toBe('3 h');
    expect(h.slice(2).every((x) => x.estado === 'pendiente')).toBe(true);
  });

  it('recorrido completo: todos los pasos hechos, con duración entre ellos y pasos implícitos completados', () => {
    const h = hitosSolicitud(pedido('cerrado', [
      H('en_revision', '2026-11-01T08:00:00Z'), H('aprobado', '2026-11-01T10:30:00Z', 'Aprobador'),
      H('confirmado', '2026-11-02T10:30:00Z', 'Distribuidora'), H('enviado', '2026-11-03T10:30:00Z'), H('cerrado', '2026-11-06T10:30:00Z'),
    ]), AHORA);
    expect(h.every((x) => x.estado === 'hecha')).toBe(true);
    expect(duracion(h[1].duracion)).toBe('2 h 30 min');
    expect(h[1].actor).toBe('Aprobador');
    expect(h[3]).toMatchObject({ clave: 'surtido', estado: 'hecha', fecha: undefined }); // implícito: no hubo «en preparación»
  });

  it('devuelta: el paso de aprobación pide corrección y cuenta la espera desde la devolución', () => {
    const h = hitosSolicitud(pedido('devuelto', [H('en_revision', '2026-11-20T06:00:00Z'), H('devuelto', '2026-11-20T10:00:00Z', 'Aprobador', 'Falta la talla')]), AHORA);
    expect(h[1]).toMatchObject({ titulo: 'Devuelta', estado: 'alerta', nota: 'Falta la talla' });
    expect(duracion(h[1].espera)).toBe('2 h');
  });

  it('rechazada: el recorrido se corta y los pasos siguientes no aplican', () => {
    const h = hitosSolicitud(pedido('rechazado', [H('en_revision', '2026-11-20T06:00:00Z'), H('rechazado', '2026-11-20T08:00:00Z', 'Aprobador', 'Fuera de dotación')]), AHORA);
    expect(h[1]).toMatchObject({ titulo: 'Rechazada', estado: 'alerta', nota: 'Fuera de dotación' });
    expect(h.slice(2).every((x) => x.estado === 'omitida')).toBe(true);
  });

  it('muestra el paso actual, el avance y los nombres de cada paso', () => {
    render(<LineaTiempoSolicitud ahora={AHORA} p={pedido('aprobado', [H('en_revision', '2026-11-20T06:00:00Z'), H('aprobado', '2026-11-20T08:00:00Z', 'Aprobador')])} />);
    expect(screen.getAllByText('Autorizada').length).toBeGreaterThan(0);
    expect(screen.getByText('2 de 9')).toBeInTheDocument();
    expect(screen.getAllByText(/En curso · 4 h/).length).toBeGreaterThan(0);
  });
});
