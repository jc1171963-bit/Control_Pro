import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Modal } from '../components/ui';

function Prueba({ onCerrar = () => {} }: { onCerrar?: () => void }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button onClick={() => setAbierto(true)}>Abrir</button>
      <Modal abierto={abierto} titulo="Nuevo empleado" onCerrar={() => { onCerrar(); setAbierto(false); }}>
        <input aria-label="Nombre" /><button>Guardar</button>
      </Modal>
      <button>Fuera</button>
    </>
  );
}

describe('Modal accesible', () => {
  it('mueve el foco al diálogo, lo mantiene dentro con Tab y Mayús+Tab, y lo devuelve al cerrar', () => {
    render(<Prueba />);
    const abrir = screen.getByText('Abrir');
    abrir.focus();
    fireEvent.click(abrir);
    const dlg = screen.getByRole('dialog', { name: 'Nuevo empleado' });
    expect(dlg).toHaveAttribute('aria-modal', 'true');
    expect(dlg.contains(document.activeElement)).toBe(true);
    // El último elemento del diálogo envuelve al primero; el primero, al último; nunca llega a «Fuera».
    screen.getByText('Guardar').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByLabelText('Cerrar')).toBe(document.activeElement);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(screen.getByText('Guardar')).toBe(document.activeElement);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(abrir);
  });

  it('Escape cierra una sola vez', () => {
    const cerrar = vi.fn();
    render(<Prueba onCerrar={cerrar} />);
    fireEvent.click(screen.getByText('Abrir'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(cerrar).toHaveBeenCalledTimes(1);
  });
});
