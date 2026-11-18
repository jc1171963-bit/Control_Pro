import { act, fireEvent, render, screen } from '@testing-library/react';
import { AvisosDispositivo, OpcionesAppMenu } from '../components/AppDispositivo';
import { ToastProvider } from '../components/ui';

const conAvisos = (ui: React.ReactNode) => render(<ToastProvider>{ui}</ToastProvider>);

test('sin soporte de push ni instalación disponible no muestra nada', () => {
  conAvisos(<><OpcionesAppMenu claseOpcion="x" /><AvisosDispositivo /></>);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Avisos en este dispositivo' })).not.toBeInTheDocument();
});

test('cuando el navegador ofrece instalarla aparece "Instalar app" y lanza el diálogo nativo', async () => {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const evento = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt, userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  });
  conAvisos(<OpcionesAppMenu claseOpcion="opcion" />);
  act(() => { window.dispatchEvent(evento); });
  expect(evento.defaultPrevented).toBe(true); // se guarda para ofrecerla en el momento oportuno
  fireEvent.click(await screen.findByRole('button', { name: 'Instalar app' }));
  await screen.findByText('La app LURIMA quedó instalada en este dispositivo.');
  expect(prompt).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: 'Instalar app' })).not.toBeInTheDocument();
});
