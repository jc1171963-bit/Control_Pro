import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import { useAuth } from '../app/auth';
import LayoutPorRol from '../features/portal/LayoutPorRol';

vi.mock('../app/auth', () => ({ useAuth: vi.fn() }));
vi.mock('../features/tienda/TiendaLayout', () => ({ default: () => <div>MARCO-TIENDA</div> }));
vi.mock('../features/portal/PortalLayout', () => ({ default: () => <div>MARCO-PORTAL</div> }));

const empresa = { tipo: 'cliente', cliente: { tipo: 'empresa' }, cargando: false };
const persona = { tipo: 'cliente', cliente: { tipo: 'persona' }, cargando: false };
const visitante = { tipo: null, cliente: null, cargando: false };

function en(ruta: string, sesion: object) {
  vi.mocked(useAuth).mockReturnValue(sesion as ReturnType<typeof useAuth>);
  return render(<MemoryRouter initialEntries={[ruta]}><Routes><Route path="*" element={<LayoutPorRol />}><Route path="*" element={<div>CONTENIDO</div>} /></Route></Routes></MemoryRouter>);
}

beforeEach(() => { vi.mocked(useAuth).mockReset(); });

it('la empresa dentro de /cuenta ve el portal', () => {
  en('/cuenta', empresa);
  expect(screen.getByText('MARCO-PORTAL')).toBeInTheDocument();
  expect(screen.queryByText('MARCO-TIENDA')).toBeNull();
});

it('la empresa en subrutas de /cuenta también ve el portal', () => {
  en('/cuenta/pedidos/12', empresa);
  expect(screen.getByText('MARCO-PORTAL')).toBeInTheDocument();
});

it('la empresa fuera de /cuenta (catálogo público) sigue en la tienda', () => {
  en('/catalogo', empresa);
  expect(screen.getByText('MARCO-TIENDA')).toBeInTheDocument();
});

it('una persona en /cuenta se queda en la tienda', () => {
  en('/cuenta/pedidos', persona);
  expect(screen.getByText('MARCO-TIENDA')).toBeInTheDocument();
});

it('un visitante en /cuenta va a la tienda (el acceso lo redirige)', () => {
  en('/cuenta', visitante);
  expect(screen.getByText('MARCO-TIENDA')).toBeInTheDocument();
});

it('/cuenta/restablecer es público y pertenece al acceso de la tienda', () => {
  en('/cuenta/restablecer', empresa);
  expect(screen.getByText('MARCO-TIENDA')).toBeInTheDocument();
});

it('mientras carga la sesión en /cuenta no muestra ninguna marca', () => {
  en('/cuenta', { tipo: null, cliente: null, cargando: true });
  expect(screen.queryByText('MARCO-TIENDA')).toBeNull();
  expect(screen.queryByText('MARCO-PORTAL')).toBeNull();
  expect(screen.getByText('CONTENIDO')).toBeInTheDocument();
});
