import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../app/auth';
import TiendaLayout from '../tienda/TiendaLayout';
import PortalLayout from './PortalLayout';

/**
 * Elige el marco según quién navega, sin cambiar ninguna URL (las notificaciones del backend enlazan a /cuenta/pedidos/:id):
 * - cuenta de empresa dentro de /cuenta/*  → portal Salud Digna
 * - cualquier otro caso                    → tienda LURIMA
 * /cuenta/restablecer es público y sigue siendo parte del acceso (LURIMA).
 */
export default function LayoutPorRol() {
  const { tipo, cliente, cargando } = useAuth();
  const { pathname } = useLocation();
  const enPortal = (pathname === '/cuenta' || pathname.startsWith('/cuenta/')) && pathname !== '/cuenta/restablecer';
  if (!enPortal) return <TiendaLayout />;
  // Mientras se resuelve la sesión no se muestra ninguna marca ajena.
  if (cargando) return <div className="min-h-screen bg-sd-bg"><Outlet /></div>;
  return tipo === 'cliente' && cliente?.tipo === 'empresa' ? <PortalLayout /> : <TiendaLayout />;
}
