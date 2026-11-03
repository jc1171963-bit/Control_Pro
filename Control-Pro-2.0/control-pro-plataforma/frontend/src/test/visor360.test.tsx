import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Visor360 from '../components/Visor360';

const frames = Array.from({ length: 24 }, (_, i) => `/api/archivos/publicos/giro-${i}.svg`);

describe('Visor360', () => {
  it('gira con las flechas del teclado y da la vuelta completa', () => {
    render(<Visor360 frames={frames} alt="Bata dama Blanco" />);
    const visor = screen.getByRole('slider', { name: /Vista 360° de Bata dama Blanco/ });
    expect(visor).toHaveAttribute('aria-valuenow', '0');
    fireEvent.keyDown(visor, { key: 'ArrowRight' });
    expect(visor).toHaveAttribute('aria-valuenow', '15');
    fireEvent.keyDown(visor, { key: 'ArrowLeft' });
    fireEvent.keyDown(visor, { key: 'ArrowLeft' });
    expect(visor).toHaveAttribute('aria-valuenow', '345');
    expect(screen.getAllByRole('img', { hidden: true }).filter((im) => im.getAttribute('aria-hidden') === 'false')).toHaveLength(1);
  });
});
