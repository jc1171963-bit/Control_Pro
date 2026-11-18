import { act, fireEvent, render, screen } from '@testing-library/react';
import { NumeroAnimado } from '../components/movimiento';
import { Cargando } from '../components/ui';
import InterruptorTema from '../components/InterruptorTema';
import { useAplicarTema } from '../app/tema';
import { CelebracionProvider, useCelebrar } from '../components/Celebracion';

describe('cifras animadas', () => {
  it('conservan el formato del texto: moneda, decimales, miles y unidades', () => {
    render(<ul>
      <li><NumeroAnimado valor="$228,860.00" /></li><li><NumeroAnimado valor="11.3 h" /></li>
      <li><NumeroAnimado valor="94.4 %" /></li><li><NumeroAnimado valor="6 / 54" /></li><li><NumeroAnimado valor={1083} /></li>
      <li><NumeroAnimado valor="—" /></li>
    </ul>);
    for (const t of ['$228,860.00', '11.3 h', '94.4 %', '6 / 54', '1,083', '—']) expect(screen.getByText(t)).toBeInTheDocument();
  });
});

describe('esqueletos de carga', () => {
  it('anuncian la carga sin spinner y con la forma pedida', () => {
    const { rerender, container } = render(<Cargando />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
    expect(container.querySelectorAll('.esqueleto').length).toBeGreaterThan(4);
    rerender(<Cargando forma="tabla" texto="Cargando pedidos…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando pedidos…');
    rerender(<Cargando forma="pagina" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('modo oscuro', () => {
  function Panel() { useAplicarTema(); return <InterruptorTema />; }
  afterEach(() => { localStorage.clear(); document.documentElement.classList.remove('oscuro'); });

  it('el interruptor cambia el tema, lo recuerda y solo aplica mientras el panel está montado', () => {
    localStorage.setItem('cp-tema', 'claro');
    const { unmount } = render(<Panel />);
    const sw = screen.getByRole('switch', { name: 'Modo oscuro' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement).toHaveClass('oscuro');
    expect(localStorage.getItem('cp-tema')).toBe('oscuro');
    unmount(); // al salir del panel (p. ej. a la tienda) vuelve el diseño claro
    expect(document.documentElement).not.toHaveClass('oscuro');
    fireEvent.click(render(<Panel />).getByRole('switch'));
    expect(localStorage.getItem('cp-tema')).toBe('claro');
  });
});

describe('celebración', () => {
  it('muestra la palomita con el título, lo anuncia y se cierra sola', () => {
    vi.useFakeTimers();
    function Disparador() { const celebrar = useCelebrar(); return <button onClick={() => celebrar({ titulo: '¡Solicitud SOL-1 enviada!', texto: 'Quedó en revisión.' })}>Enviar</button>; }
    render(<CelebracionProvider><Disparador /></CelebracionProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(screen.getByRole('status')).toHaveTextContent('¡Solicitud SOL-1 enviada!. Quedó en revisión.');
    expect(screen.getAllByText('¡Solicitud SOL-1 enviada!').length).toBeGreaterThan(0);
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    vi.useRealTimers();
  });
});
