# API REST de Control Pro

Todas las respuestas son JSON. Errores: `{"error": {"codigo", "mensaje", "detalles"}}`.

- 401 sin sesión o token vencido · 403 sin permiso · 404 no existe **o pertenece a otra sucursal** · 409 conflicto de estado, existencias o duplicado · 422 datos inválidos · 423 cuenta bloqueada.
- Rutas `/api/admin/*`: token de personal interno con el permiso indicado en el código (`@requiere_usuario`). Rutas `/api/cuenta/*`: token de cliente.
- Operaciones que crean dinero o inventario (checkout, pagos, entradas, ajustes) exigen `clave_idempotencia` para que un reintento no duplique.

## Administración: sucursales, usuarios, clientes, auditoría y reportes

| Método | Ruta |
| --- | --- |
| `GET` | `/api/admin/auditoria` |
| `GET` | `/api/admin/clientes` |
| `GET` | `/api/admin/clientes/<int:cliente_id>` |
| `GET` | `/api/admin/notificaciones` |
| `POST` | `/api/admin/notificaciones/leer` |
| `GET` | `/api/admin/pedidos/<int:pedido_id>/pdf` |
| `GET` | `/api/admin/reportes/dashboard` |
| `GET` | `/api/admin/reportes/existencias-bajas` |
| `GET` | `/api/admin/reportes/exportar/<reporte>` |
| `GET` | `/api/admin/reportes/sucursales` |
| `GET` | `/api/admin/roles` |
| `GET` | `/api/admin/sucursales` |
| `POST` | `/api/admin/sucursales` |
| `PUT` | `/api/admin/sucursales/<int:sucursal_id>` |
| `GET` | `/api/admin/usuarios` |
| `POST` | `/api/admin/usuarios` |
| `PUT` | `/api/admin/usuarios/<int:usuario_id>` |
| `POST` | `/api/admin/usuarios/<int:usuario_id>/desbloquear` |

## Administración: catálogo y promociones

| Método | Ruta |
| --- | --- |
| `GET` | `/api/admin/categorias` |
| `POST` | `/api/admin/categorias` |
| `PUT` | `/api/admin/categorias/<int:cid>` |
| `GET` | `/api/admin/productos` |
| `POST` | `/api/admin/productos` |
| `GET` | `/api/admin/productos/<int:pid>` |
| `PUT` | `/api/admin/productos/<int:pid>` |
| `GET` | `/api/admin/promociones` |
| `POST` | `/api/admin/promociones` |
| `PUT` | `/api/admin/promociones/<int:prid>` |

## Administración: pagos, devoluciones e incidencias

| Método | Ruta |
| --- | --- |
| `GET` | `/api/admin/devoluciones` |
| `GET` | `/api/admin/devoluciones/<int:did>` |
| `POST` | `/api/admin/devoluciones/<int:did>/autorizar` |
| `POST` | `/api/admin/devoluciones/<int:did>/cerrar` |
| `POST` | `/api/admin/devoluciones/<int:did>/inspeccionar` |
| `POST` | `/api/admin/devoluciones/<int:did>/rechazar` |
| `POST` | `/api/admin/devoluciones/<int:did>/recibir` |
| `GET` | `/api/admin/incidencias` |
| `POST` | `/api/admin/incidencias` |
| `PATCH` | `/api/admin/incidencias/<int:iid>` |
| `GET` | `/api/admin/pagos` |
| `POST` | `/api/admin/pagos/<int:pid>/rechazar` |
| `POST` | `/api/admin/pagos/<int:pid>/validar` |
| `POST` | `/api/admin/pedidos/<int:pedido_id>/efectivo` |
| `GET` | `/api/admin/reembolsos` |
| `POST` | `/api/admin/reembolsos/<int:rid>/realizar` |

## Administración: inventario y transferencias

| Método | Ruta |
| --- | --- |
| `GET` | `/api/admin/inventario` |
| `POST` | `/api/admin/inventario/ajustes` |
| `POST` | `/api/admin/inventario/entradas` |
| `PUT` | `/api/admin/inventario/minimo` |
| `GET` | `/api/admin/inventario/movimientos` |
| `GET` | `/api/admin/transferencias` |
| `POST` | `/api/admin/transferencias` |
| `POST` | `/api/admin/transferencias/<int:tid>/autorizar` |
| `POST` | `/api/admin/transferencias/<int:tid>/cancelar` |
| `POST` | `/api/admin/transferencias/<int:tid>/enviar` |
| `POST` | `/api/admin/transferencias/<int:tid>/recibir` |

## Administración: pedidos y surtido

| Método | Ruta |
| --- | --- |
| `POST` | `/api/admin/paquetes/<int:pid>/despachar` |
| `POST` | `/api/admin/paquetes/<int:pid>/entregar` |
| `POST` | `/api/admin/paquetes/<int:pid>/eventos` |
| `POST` | `/api/admin/paquetes/<int:pid>/listo` |
| `GET` | `/api/admin/pedidos` |
| `GET` | `/api/admin/pedidos/<int:pedido_id>` |
| `POST` | `/api/admin/pedidos/<int:pedido_id>/cancelar` |
| `POST` | `/api/admin/pedidos/<int:pedido_id>/cerrar` |
| `POST` | `/api/admin/pedidos/<int:pedido_id>/decision` |
| `POST` | `/api/admin/pedidos/expirar-reservas` |
| `GET` | `/api/admin/surtido` |
| `GET` | `/api/admin/surtido/<int:aid>` |
| `POST` | `/api/admin/surtido/<int:aid>/iniciar` |
| `POST` | `/api/admin/surtido/<int:aid>/paquetes` |
| `POST` | `/api/admin/surtido/<int:aid>/registrar` |

## Archivos

| Método | Ruta |
| --- | --- |
| `POST` | `/api/archivos/privados` |
| `GET` | `/api/archivos/privados/<nombre>` |
| `POST` | `/api/archivos/publicos` |
| `GET` | `/api/archivos/publicos/<nombre>` |

## Autenticación

| Método | Ruta |
| --- | --- |
| `POST` | `/api/auth/cliente/login` |
| `POST` | `/api/auth/cliente/registro` |
| `POST` | `/api/auth/login` |
| `POST` | `/api/auth/logout` |
| `POST` | `/api/auth/password` |
| `POST` | `/api/auth/recuperar` |
| `POST` | `/api/auth/refresh` |
| `POST` | `/api/auth/restablecer` |
| `GET` | `/api/auth/yo` |

## Cuenta del cliente (token de cliente)

| Método | Ruta |
| --- | --- |
| `GET` | `/api/cuenta/carrito` |
| `POST` | `/api/cuenta/carrito/items` |
| `DELETE` | `/api/cuenta/carrito/items/<int:item_id>` |
| `PATCH` | `/api/cuenta/carrito/items/<int:item_id>` |
| `POST` | `/api/cuenta/checkout` |
| `GET` | `/api/cuenta/devoluciones` |
| `POST` | `/api/cuenta/devoluciones/<int:dev_id>/en-camino` |
| `GET` | `/api/cuenta/direcciones` |
| `POST` | `/api/cuenta/direcciones` |
| `DELETE` | `/api/cuenta/direcciones/<int:direccion_id>` |
| `PUT` | `/api/cuenta/direcciones/<int:direccion_id>` |
| `GET` | `/api/cuenta/empleados` |
| `POST` | `/api/cuenta/empleados` |
| `PUT` | `/api/cuenta/empleados/<int:empleado_id>` |
| `GET` | `/api/cuenta/entregas/<int:entrega_id>` |
| `POST` | `/api/cuenta/entregas/<int:entrega_id>` |
| `GET` | `/api/cuenta/favoritos` |
| `DELETE` | `/api/cuenta/favoritos/<int:producto_id>` |
| `PUT` | `/api/cuenta/favoritos/<int:producto_id>` |
| `GET` | `/api/cuenta/notificaciones` |
| `POST` | `/api/cuenta/notificaciones/leer` |
| `POST` | `/api/cuenta/paquetes/<int:paquete_id>/recepcion` |
| `GET` | `/api/cuenta/pedidos` |
| `POST` | `/api/cuenta/pedidos-corporativos` |
| `PUT` | `/api/cuenta/pedidos-corporativos/<int:pedido_id>` |
| `GET` | `/api/cuenta/pedidos/<int:pedido_id>` |
| `POST` | `/api/cuenta/pedidos/<int:pedido_id>/cancelar` |
| `POST` | `/api/cuenta/pedidos/<int:pedido_id>/devoluciones` |
| `POST` | `/api/cuenta/pedidos/<int:pedido_id>/incidencias` |
| `POST` | `/api/cuenta/pedidos/<int:pedido_id>/pagos` |
| `GET` | `/api/cuenta/perfil` |
| `PATCH` | `/api/cuenta/perfil` |
| `GET` | `/api/cuenta/puestos-autorizados` |

## salud

| Método | Ruta |
| --- | --- |
| `GET` | `/api/salud` |

## Tienda pública

| Método | Ruta |
| --- | --- |
| `GET` | `/api/tienda/categorias` |
| `GET` | `/api/tienda/inicio` |
| `GET` | `/api/tienda/productos` |
| `GET` | `/api/tienda/productos/<slug>` |
| `GET` | `/api/tienda/sucursales` |

`GET /api/salud` verifica la conexión con la base de datos.