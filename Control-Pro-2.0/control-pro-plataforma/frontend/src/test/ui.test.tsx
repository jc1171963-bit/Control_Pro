import { render, screen } from '@testing-library/react';
import { Estado } from '../components/ui';

it('muestra el estado con su etiqueta legible', () => {
  render(<Estado valor="listo_para_recoger" />);
  expect(screen.getByText('Listo para recoger')).toBeInTheDocument();
});
