import { fireEvent, render, screen, within } from '@testing-library/react';
import Firma from '../components/Firma';
import { Boton, Modal } from '../components/ui';

function conPantallaTactil(tactil: boolean) {
  window.matchMedia = ((q: string) => ({ matches: tactil && q.includes('pointer: coarse'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
}

describe('firma', () => {
  afterEach(() => { delete (window as { matchMedia?: unknown }).matchMedia; });

  it('en celular abre la firma en pantalla completa y se puede cancelar sin firmar', () => {
    conPantallaTactil(true);
    const onCambio = vi.fn();
    render(<Firma titulo="Firma de Laura" onCambio={onCambio} />);
    fireEvent.click(screen.getByRole('button', { name: /Toca para firmar en pantalla completa/ }));
    const dialogo = screen.getByRole('dialog', { name: 'Firma de Laura' });
    expect(within(dialogo).getByRole('img', { name: 'Área de firma en pantalla completa' })).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Listo' })).toBeDisabled(); // sin trazo no se puede confirmar
    fireEvent.click(within(dialogo).getByRole('button', { name: /Cancelar/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onCambio).not.toHaveBeenCalled();
  });

  it('en escritorio firma en la página', () => {
    conPantallaTactil(false);
    render(<Firma onCambio={() => undefined} />);
    expect(screen.getByRole('img', { name: 'Área de firma' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pantalla completa/ })).not.toBeInTheDocument();
  });
});

describe('modal del sistema', () => {
  it('tiene título accesible, subtítulo, acciones fijas abajo y bloquea el desplazamiento del fondo', () => {
    const cerrar = vi.fn();
    const { rerender } = render(<Modal abierto titulo="Adjuntar documento" sub="Expediente de la solicitud PED-1" onCerrar={cerrar} pie={<Boton>Adjuntar</Boton>}><p>contenido</p></Modal>);
    const d = screen.getByRole('dialog', { name: 'Adjuntar documento' });
    expect(within(d).getByText('Expediente de la solicitud PED-1')).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: 'Adjuntar' }).closest('footer')).not.toBeNull();
    expect(document.documentElement.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(cerrar).toHaveBeenCalled();
    rerender(<Modal abierto={false} titulo="Adjuntar documento" onCerrar={cerrar}><p>contenido</p></Modal>);
    expect(document.documentElement.style.overflow).toBe('');
  });
});
