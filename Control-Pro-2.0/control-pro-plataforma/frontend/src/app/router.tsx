import { createBrowserRouter, Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { useConfig } from './config';
import { useAuth } from './auth';
import { Cargando } from '../components/ui';
import LayoutPorRol from '../features/portal/LayoutPorRol';
import { BASE_APROBADOR, enlacePanel, esAprobador } from './panel';

function RequiereCliente({ empresa = false }: { empresa?: boolean }) {
  const { tipo, cliente, cargando } = useAuth();
  const loc = useLocation();
  if (cargando) return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8"><Cargando forma="pagina" texto="Abriendo tu sesión…" /></div>;
  if (tipo !== 'cliente') return <Navigate to={`/entrar?siguiente=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (empresa && cliente?.tipo !== 'empresa') return <Navigate to="/cuenta" replace />;
  return <Outlet />;
}

function RequiereUsuario() {
  const { tipo, usuario, cargando } = useAuth();
  const loc = useLocation();
  if (cargando) return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8"><Cargando forma="pagina" texto="Abriendo tu sesión…" /></div>;
  if (tipo !== 'usuario') return <Navigate to={`/admin/entrar?siguiente=${encodeURIComponent(loc.pathname)}`} replace />;
  // El aprobador corporativo ya no usa el panel interno: cualquier enlace /admin/... lo lleva a su portal.
  if (esAprobador(usuario)) return <Navigate to={enlacePanel(loc.pathname, BASE_APROBADOR) + loc.search} replace />;
  return <Outlet />;
}

/** Portal del aprobador corporativo (lado Salud Digna). Entra por /entrar, como las sucursales. */
function RequiereAprobador() {
  const { tipo, usuario, cargando } = useAuth();
  const loc = useLocation();
  if (cargando) return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8"><Cargando forma="pagina" texto="Abriendo tu sesión…" /></div>;
  if (tipo === 'usuario' && !esAprobador(usuario)) return <Navigate to="/admin" replace />;
  if (tipo !== 'usuario') return <Navigate to={`/entrar?siguiente=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <Outlet />;
}

/** Carrito y checkout existen solo si la tienda en línea está encendida. */
function SoloTienda() {
  const { canalTienda, cargando } = useConfig();
  if (cargando) return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8"><Cargando forma="pagina" texto="Abriendo tu sesión…" /></div>;
  return canalTienda ? <Outlet /> : <Navigate to="/catalogo" replace />;
}

function RedirigirCorreccion() {
  const { id } = useParams();
  return <Navigate to={`/cuenta/solicitudes/${id}/editar`} replace />;
}

const c = (p: Promise<any>, nombre = 'default') => p.then((m) => ({ Component: m[nombre] }));

export const router = createBrowserRouter([
  {
    path: '/',
    element: <LayoutPorRol />,
    children: [
      { index: true, lazy: () => c(import('../features/tienda/Inicio')) },
      { path: 'catalogo', lazy: () => c(import('../features/tienda/Catalogo')) },
      { path: 'producto/:slug', lazy: () => c(import('../features/tienda/Producto')) },
      { element: <SoloTienda />, children: [{ path: 'carrito', lazy: () => c(import('../features/tienda/Carrito')) }] },
      { path: 'sucursales', lazy: () => c(import('../features/tienda/Sucursales')) },
      { path: 'acerca', lazy: () => c(import('../features/tienda/Informacion'), 'Acerca') },
      { path: 'preguntas-frecuentes', lazy: () => c(import('../features/tienda/Informacion'), 'Preguntas') },
      { path: 'contacto', lazy: () => c(import('../features/tienda/Informacion'), 'Contacto') },
      { path: 'entrar', lazy: () => c(import('../features/cuenta/Acceso'), 'Entrar') },
      { path: 'registro', lazy: () => c(import('../features/cuenta/Acceso'), 'Registro') },
      { path: 'recuperar', lazy: () => c(import('../features/cuenta/Acceso'), 'Recuperar') },
      { path: 'cuenta/restablecer', lazy: () => c(import('../features/cuenta/Acceso'), 'Restablecer') },
      {
        element: <RequiereCliente />,
        children: [
          { element: <SoloTienda />, children: [{ path: 'checkout', lazy: () => c(import('../features/tienda/Checkout')) }] },
          {
            path: 'cuenta',
            lazy: () => c(import('../features/cuenta/CuentaLayout')),
            children: [
              { index: true, lazy: () => c(import('../features/portal/Inicio')) },
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
                  { path: 'mensajes', lazy: () => c(import('../features/colaboracion/Mensajes')) },
                  { path: 'catalogo', lazy: () => c(import('../features/tienda/Catalogo')) },
                  { path: 'catalogo/:slug', lazy: () => c(import('../features/tienda/Producto')) },
                  { path: 'solicitudes/nueva', lazy: () => c(import('../features/cuenta/SolicitudCorporativa')) },
                  { path: 'solicitudes/:id/editar', lazy: () => c(import('../features/cuenta/SolicitudCorporativa')) },
                  { path: 'corporativo/nuevo', element: <Navigate to="/cuenta/solicitudes/nueva" replace /> },
                  { path: 'corporativo/:id/corregir', element: <RedirigirCorreccion /> },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', lazy: () => c(import('../features/tienda/NoEncontrado')) },
    ],
  },
  {
    path: BASE_APROBADOR,
    element: <RequiereAprobador />,
    children: [
      {
        lazy: () => c(import('../features/aprobador/AprobadorLayout')),
        children: [
          { index: true, lazy: () => c(import('../features/aprobador/Inicio')) },
          { path: 'solicitudes', lazy: () => c(import('../features/admin/Pedidos'), 'Solicitudes') },
          { path: 'seguimiento', lazy: () => c(import('../features/aprobador/Seguimiento')) },
          { path: 'perfil', lazy: () => c(import('../features/perfil/Perfil')) },
          { path: 'pedidos/:id', lazy: () => c(import('../features/admin/Pedidos'), 'PedidoAdmin') },
          { path: 'sucursales-cliente', lazy: () => c(import('../features/admin/SucursalesCliente'), 'SucursalesCliente') },
          { path: 'sucursales-cliente/:id', lazy: () => c(import('../features/admin/SucursalesCliente'), 'SucursalCliente') },
          { path: 'organizacion', lazy: () => c(import('../features/admin/Organizacion')) },
          { path: 'permisos', lazy: () => c(import('../features/aprobador/Permisos')) },
          { path: 'mensajes', lazy: () => c(import('../features/colaboracion/Mensajes')) },
          { path: 'notificaciones', lazy: () => c(import('../features/admin/Sistema'), 'NotificacionesAdmin') },
          { path: '*', element: <Navigate to={BASE_APROBADOR} replace /> },
        ],
      },
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
          { index: true, lazy: () => c(import('../features/admin/PanelSolicitudes'), 'InicioAdmin') },
          { path: 'indicadores', lazy: () => c(import('../features/admin/PanelSolicitudes')) },
          { path: 'organizacion', lazy: () => c(import('../features/admin/Organizacion')) },
          { path: 'sucursales-cliente', lazy: () => c(import('../features/admin/SucursalesCliente'), 'SucursalesCliente') },
          { path: 'sucursales-cliente/:id', lazy: () => c(import('../features/admin/SucursalesCliente'), 'SucursalCliente') },
          { path: 'solicitudes', lazy: () => c(import('../features/admin/Pedidos'), 'Solicitudes') },
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
          { path: 'mensajes', lazy: () => c(import('../features/colaboracion/Mensajes')) },
          { path: 'reportes', lazy: () => c(import('../features/admin/Reportes')) },
          { path: 'perfil', lazy: () => c(import('../features/perfil/Perfil')) },
        ],
      },
    ],
  },
]);
