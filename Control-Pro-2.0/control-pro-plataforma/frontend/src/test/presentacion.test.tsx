import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { post, renovar } from '../api/cliente';
import { useAuth } from '../app/auth';
import ModoPresentacion from '../components/ModoPresentacion';

const estado = vi.hoisted(() => ({ renovacion: null as unknown }));
vi.mock('../api/cliente', () => ({
  post: vi.fn(() => Promise.resolve({ ok: true })),
  renovar: vi.fn(() => Promise.resolve(false)),
  get ultimaRenovacion() { return estado.renovacion; },
}));
vi.mock('../app/auth', () => ({ useAuth: vi.fn() }));
vi.mock('../app/router', () => ({ router: { subscribe: vi.fn(() => () => undefined) } }));

const presentacion = { nombre: 'Invitado Demo', correo: 'invitado@ejemplo.mx', empresa: 'LURIMA',
  desde: new Date(Date.now() - 60_000).toISOString(), hasta: new Date(Date.now() + 3_600_000).toISOString(), solo_lectura: true };

/** `cambios` en null: cuenta normal, sin presentación. */
function montar(cambios: Partial<typeof presentacion> | null = {}) {
  const salir = vi.fn(() => Promise.resolve());
  const actualizarCuenta = vi.fn();
  vi.mocked(useAuth).mockReturnValue({
    usuario: { presentacion: cambios === null ? null : { ...presentacion, ...cambios } }, salir, actualizarCuenta,
  } as never);
  render(<ModoPresentacion />);
  return { salir, actualizarCuenta };
}

afterEach(() => {
  document.getElementById('marca-presentacion')?.remove();
  vi.mocked(post).mockClear();
  vi.mocked(renovar).mockReset().mockResolvedValue(false);
  estado.renovacion = null;
});

describe('modo presentación', () => {
  it('pone la marca de agua con la identidad de quien mira y registra la pantalla', () => {
    montar();
    const marca = document.getElementById('marca-presentacion')!;
    expect(marca).toBeTruthy();
    expect(decodeURIComponent(marca.getAttribute('style')!)).toContain('Invitado Demo · invitado@ejemplo.mx');
    expect(document.documentElement).toHaveClass('modo-presentacion');
    expect(screen.getByRole('status')).toHaveTextContent('Sesión de presentación confidencial · solo consulta');
    expect(post).toHaveBeenCalledWith('/presentacion/vista', expect.objectContaining({ ruta: expect.any(String) }));
  });

  it('si quitan la marca de agua, vuelve a aparecer', async () => {
    montar();
    document.getElementById('marca-presentacion')!.remove();
    await waitFor(() => expect(document.getElementById('marca-presentacion')).toBeTruthy());
  });

  it('bloquea copiar y el clic derecho, y lo registra', () => {
    montar();
    const copiar = new Event('copy', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(copiar);
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(menu);
    expect(copiar.defaultPrevented).toBe(true);
    expect(menu.defaultPrevented).toBe(true);
    expect(post).toHaveBeenCalledWith('/presentacion/evento', expect.objectContaining({ tipo: 'copiar' }));
  });

  it('avisa al momento cuando sale de la ventana y cuánto tardó en volver', () => {
    montar();
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('blur')); // blur y pestaña oculta llegan juntos: un solo aviso
    window.dispatchEvent(new Event('focus'));
    const salidas = vi.mocked(post).mock.calls.filter(([ruta, cuerpo]) => ruta === '/presentacion/evento' && (cuerpo as { tipo: string }).tipo === 'fuera_de_ventana');
    expect(salidas.map(([, cuerpo]) => (cuerpo as { detalle: string }).detalle)).toEqual(['Salió de la ventana', expect.stringMatching(/^Volvió tras \d+ s$/)]);
  });

  it('bloquea imprimir con Ctrl+P', () => {
    montar();
    const e = new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('al llegar la hora de fin pregunta al servidor: si el horario se extendió, sigue sin cerrar', async () => {
    const nuevoFin = new Date(Date.now() + 3_600_000).toISOString();
    vi.mocked(renovar).mockImplementation(async () => {
      estado.renovacion = { tipo: 'usuario', cuenta: { presentacion: { ...presentacion, hasta: nuevoFin } } };
      return true;
    });
    const { salir, actualizarCuenta } = montar({ hasta: new Date(Date.now() - 1000).toISOString() });
    await waitFor(() => expect(actualizarCuenta).toHaveBeenCalledWith(
      expect.objectContaining({ presentacion: expect.objectContaining({ hasta: nuevoFin }) })), { timeout: 4000 });
    expect(salir).not.toHaveBeenCalled();
  });

  it('al llegar la hora de fin, si el servidor ya no lo deja seguir, cierra la sesión', async () => {
    const { salir, actualizarCuenta } = montar({ hasta: new Date(Date.now() - 1000).toISOString() });
    await waitFor(() => expect(salir).toHaveBeenCalled(), { timeout: 4000 });
    expect(renovar).toHaveBeenCalled();
    expect(actualizarCuenta).not.toHaveBeenCalled();
  });

  it('una cuenta normal no tiene marca de agua ni bloqueos', () => {
    montar(null);
    expect(document.getElementById('marca-presentacion')).toBeNull();
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(false);
  });
});
