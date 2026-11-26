import { render, screen } from '@testing-library/react';
import ChipTurno, { textoTurno } from '../components/ChipTurno';
import { haceTiempo } from '../lib/formato';

// [código, texto en la sucursal, tipo en la sucursal, texto en Lurima, tipo en Lurima]
const CASOS: [string, string, string, string, string][] = [
  ['sucursal_responder', 'Te toca responder', 'accion', 'Esperando a la sucursal', 'seguimiento'],
  ['sucursal_recibir', 'Te toca recibir la reposición', 'accion', 'Esperando recepción', 'seguimiento'],
  ['sucursal_confirmar', 'Te toca confirmar la solución', 'accion', 'Esperando confirmación', 'seguimiento'],
  ['lurima_atender', 'Esperando a Lurima', 'seguimiento', 'Por atender', 'accion'],
  ['lurima_responder', 'Esperando a Lurima', 'seguimiento', 'Respondió la sucursal', 'accion'],
  ['lurima_reposicion', 'Reposición en proceso', 'seguimiento', 'Reposición en curso', 'seguimiento'],
  ['interna', 'Seguimiento interno', 'seguimiento', 'Por atender (interna)', 'accion'],
  ['cerrada', 'Cerrada', 'cerrada', 'Cerrada', 'cerrada'],
];

describe('ChipTurno', () => {
  it.each(CASOS)('%s: texto y tipo en cada portal', (codigo, enSucursal, tipoSucursal, enLurima, tipoLurima) => {
    const { unmount } = render(<ChipTurno turno={codigo} portal="sucursal" />);
    expect(screen.getByText(enSucursal).closest('[data-tipo]')).toHaveAttribute('data-tipo', tipoSucursal);
    unmount();
    render(<ChipTurno turno={codigo} portal="lurima" />);
    expect(screen.getByText(enLurima).closest('[data-tipo]')).toHaveAttribute('data-tipo', tipoLurima);
    expect(textoTurno(codigo, 'lurima')).toBe(enLurima);
  });

  it('cada portal ve como «acción» exactamente sus propios turnos', () => {
    const accion = (portal: 'sucursal' | 'lurima') => CASOS.filter((c) => c[portal === 'sucursal' ? 2 : 4] === 'accion').map((c) => c[0]);
    expect(accion('sucursal')).toEqual(['sucursal_responder', 'sucursal_recibir', 'sucursal_confirmar']);
    expect(accion('lurima')).toEqual(['lurima_atender', 'lurima_responder', 'interna']);
  });

  it.each([null, undefined, '', 'turno_que_no_existe'])('código %p: alternativa neutral', (codigo) => {
    render(<ChipTurno turno={codigo} portal="lurima" />);
    expect(screen.getByText('Sin información de turno').closest('[data-tipo]')).toHaveAttribute('data-tipo', 'desconocido');
    expect(textoTurno(codigo, 'sucursal')).toBe('Sin información de turno');
  });

  it('muestra el tiempo desde que está vigente, sin depender solo del color', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-25T15:00:00Z'));
    render(<ChipTurno turno="sucursal_responder" portal="sucursal" desde="2026-11-25T12:00:00Z" />);
    const chip = screen.getByText('Te toca responder').closest('[data-tipo]')!;
    expect(chip).toHaveTextContent('· 3 h');
    expect(chip).toHaveAttribute('title', 'Te toca responder · hace 3 horas');
    expect(chip.querySelector('svg')).toHaveAttribute('aria-hidden');  // el ícono acompaña al texto
    vi.useRealTimers();
  });

  it('sin fecha o con fecha inválida no muestra tiempo', () => {
    render(<ChipTurno turno="cerrada" portal="sucursal" desde="no-es-fecha" />);
    expect(screen.getByText('Cerrada').closest('[data-tipo]')).not.toHaveTextContent('·');
  });
});

describe('haceTiempo', () => {
  const ahora = new Date('2026-11-25T15:00:00Z').getTime();
  const hace = (seg: number) => new Date(ahora - seg * 1000).toISOString();

  it.each([[null], [undefined], [''], ['basura']])('%p → «—»', (v) => {
    expect(haceTiempo(v as string | null | undefined, { ahora })).toBe('—');
    expect(haceTiempo(v as string | null | undefined, { ahora, corto: true })).toBe('—');
  });

  it.each([
    [10, 'hace unos segundos', 'ahora'],
    [60, 'hace 1 minuto', '1 min'],
    [5 * 60, 'hace 5 minutos', '5 min'],
    [3600, 'hace 1 hora', '1 h'],
    [3 * 3600, 'hace 3 horas', '3 h'],
    [86400, 'hace 1 día', '1 d'],
    [2 * 86400, 'hace 2 días', '2 d'],
  ])('%i s → %s / %s', (seg, largo, corto) => {
    expect(haceTiempo(hace(seg), { ahora })).toBe(largo);
    expect(haceTiempo(hace(seg), { ahora, corto: true })).toBe(corto);
  });

  it('desde 30 días muestra la fecha y una fecha futura cuenta como reciente', () => {
    expect(haceTiempo(hace(35 * 86400), { ahora })).toMatch(/oct 2026/);
    expect(haceTiempo(new Date(ahora + 120000).toISOString(), { ahora })).toBe('hace unos segundos');
  });
});
