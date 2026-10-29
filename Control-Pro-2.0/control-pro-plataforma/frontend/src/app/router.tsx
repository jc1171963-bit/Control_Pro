import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { Cargando } from '../components/ui';
import TiendaLayout from '../features/tienda/TiendaLayout';

function RequiereCliente({ empresa = false }: { empresa?: boolean }) {
  const { tipo, cliente, cargando } = useAuth();
  const loc = useLocation();
  if (cargando) return <Cargando />;
  if (tipo !== 'cliente') return <Navigate to={`/entrar?siguiente=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (empresa && cliente?.tipo !== 'empresa') return <Navigate to="/cuenta" replace />;
  return <Outlet />;
}

function RequiereUsuario() {
  const { tipo, cargando } = useAuth();
  const loc = useLocation();
  if (cargando) return <Cargando />;
  if (tipo !== 'usuario') return <Navigate to={`/admin/entrar?siguiente=${encodeURIComponent(loc.pathname)}`} replace />;
  return <Outlet />;
}

const c = (p: Promise<any>, nombre = 'default') => p.then((m) => ({ Component: m[nombre] }));

export const router = createBrowserRouter([
  {
    path: '/',
    element: <TiendaLayout />,
    children: [
      { index: true, lazy: () => c(import('../features/tienda/Inicio')) },
      { path: 'catalogo', lazy: () => c(import('../features/tienda/Catalogo')) },
      { path: 'producto/:slug', lazy: () => c(import('../features/tienda/Producto')) },
      { path: 'carrito', lazy: () => c(import('../features/tienda/Carrito')) },
      { path: 'sucursales', lazy: () => c(import('../features/tienda/Sucursales')) },
      { path: 'entrar', lazy: () => c(import('../features/cuenta/Acceso'), 'Entrar') },
      { path: 'registro', lazy: () => c(import('../features/cuenta/Acceso'), 'Registro') },
      { path: 'recuperar', lazy: () => c(import('../features/cuenta/Acceso'), 'Recuperar') },
      { path: 'cuenta/restablecer', lazy: () => c(import('../features/cuenta/Acceso'), 'Restablecer') },
      {
        element: <RequiereCliente />,
        children: [
          { path: 'checkout', lazy: () => c(import('../features/tienda/Checkout')) },
          {
            path: 'cuenta',
            lazy: () => c(import('../features/cuenta/CuentaLayout')),
            children: [
              { index: true, element: <Navigate to="pedidos" replace /> },
              { path: 'pedidos', lazy: () => c(import('../features/cuenta/Pedidos')) },
              { path: 'pedidos/:id', lazy: () => c(import('../features/cuenta/PedidoDetalle')) },
              { path: 'direcciones', lazy: () => c(import('../features/cuenta/Direcciones')) },
              { path: 'perfil', lazy: () => c(import('../features/cuenta/Perfil')) },
              { path: 'favoritos', lazy: () => c(import('../features/cuenta/Favoritos')) },
              { path: 'notificaciones', lazy: () => c(import('../features/cuenta/Notificaciones')) },
              {
                element: <RequiereCliente empresa />,
                children: [
                  { path: 'empleados', lazy: () => c(import('../features/cuenta/Corporativo'), 'Empleados') },
                  { path: 'corporativo/nuevo', lazy: () => c(import('../features/cuenta/Corporativo'), 'NuevoPedidoCorporativo') },
                  { path: 'corporativo/:id/corregir', lazy: () => c(import('../features/cuenta/Corporativo'), 'NuevoPedidoCorporativo') },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', lazy: () => c(import('../features/tienda/NoEncontrado')) },
    ],
  },
  { path: '/admin/entrar', lazy: () => c(import('../features/admin/AdminAcceso'), 'AdminEntrar') },
  { path: '/admin/restablecer', lazy: () => c(import('../features/cuenta/Acceso'), 'Restablecer') },
  {
    path: '/admin',
    element: <RequiereUsuario />,
    children: [
      {
        lazy: () => c(import('../features/admin/AdminLayout')),
        children: [
          { index: true, lazy: () => c(import('../features/admin/Dashboard')) },
          { path: 'pedidos', lazy: () => c(import('../features/admin/Pedidos'), 'Pedidos') },
          { path: 'pedidos/:id', lazy: () => c(import('../features/admin/Pedidos'), 'PedidoAdmin') },
          { path: 'surtido', lazy: () => c(import('../features/admin/Surtido'), 'Surtido') },
          { path: 'surtido/:id', lazy: () => c(import('../features/admin/Surtido'), 'SurtidoDetalle') },
          { path: 'inventario', lazy: () => c(import('../features/admin/Inventario'), 'Inventario') },
          { path: 'transferencias', lazy: () => c(import('../features/admin/Inventario'), 'Transferencias') },
          { path: 'catalogo', lazy: () => c(import('../features/admin/Catalogo'), 'CatalogoAdmin') },
          { path: 'catalogo/:id', lazy: () => c(import('../features/admin/Catalogo'), 'ProductoEditor') },
          { path: 'promociones', lazy: () => c(import('../features/admin/Catalogo'), 'Promociones') },
          { path: 'pagos', lazy: () => c(import('../features/admin/Pagos')) },
          { path: 'devoluciones', lazy: () => c(import('../features/admin/Posventa'), 'Devoluciones') },
          { path: 'incidencias', lazy: () => c(import('../features/admin/Posventa'), 'Incidencias') },
          { path: 'clientes', lazy: () => c(import('../features/admin/Sistema'), 'Clientes') },
          { path: 'sucursales', lazy: () => c(import('../features/admin/Sistema'), 'Sucursales') },
          { path: 'usuarios', lazy: () => c(import('../features/admin/Sistema'), 'Usuarios') },
          { path: 'auditoria', lazy: () => c(import('../features/admin/Sistema'), 'Auditoria') },
          { path: 'notificaciones', lazy: () => c(import('../features/admin/Sistema'), 'NotificacionesAdmin') },
          { path: 'reportes', lazy: () => c(import('../features/admin/Reportes')) },
        ],
      },
    ],
  },
]);
