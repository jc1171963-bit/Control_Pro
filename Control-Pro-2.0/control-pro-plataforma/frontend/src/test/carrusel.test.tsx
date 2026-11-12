import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import Carrusel from '../components/Carrusel';

const uno = [{ id: 'a', contenido: 'Uno' }, { id: 'b', contenido: 'Dos' }];

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('con una sola diapositiva no muestra controles', () => {
  render(<Carrusel etiqueta="Prueba" diapositivas={[uno[0]]} />);
  expect(screen.queryByLabelText('Diapositiva siguiente')).toBeNull();
});

it('navega con los botones y da la vuelta', () => {
  render(<Carrusel etiqueta="Prueba" diapositivas={uno} />);
  expect(screen.getByText('Uno')).toBeVisible();
  expect(screen.getByText('Dos')).not.toBeVisible();
  fireEvent.click(screen.getByLabelText('Diapositiva siguiente'));
  expect(screen.getByText('Dos')).toBeVisible();
  fireEvent.click(screen.getByLabelText('Diapositiva siguiente'));
  expect(screen.getByText('Uno')).toBeVisible();
});

it('avanza solo y se detiene al pausar', () => {
  vi.useFakeTimers();
  render(<Carrusel etiqueta="Prueba" diapositivas={uno} intervalo={1000} />);
  act(() => { vi.advanceTimersByTime(1000); });
  expect(screen.getByText('Dos')).toBeVisible();
  fireEvent.click(screen.getByLabelText('Pausar el avance automático'));
  act(() => { vi.advanceTimersByTime(5000); });
  expect(screen.getByText('Dos')).toBeVisible();
  expect(screen.getByLabelText('Reanudar el avance automático')).toBeInTheDocument();
});

it('con movimiento reducido nace pausado y no avanza solo', () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  render(<Carrusel etiqueta="Prueba" diapositivas={uno} intervalo={1000} />);
  act(() => { vi.advanceTimersByTime(5000); });
  expect(screen.getByText('Uno')).toBeVisible();
});
