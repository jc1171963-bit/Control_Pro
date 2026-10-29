# Estado de implementación — Control Pro 2.0

Fecha de verificación: 24 de octubre de 2026.

Entorno de verificación: PostgreSQL 16.15, Python 3.13, Node 22 y Chromium (Playwright).

## Decisiones tomadas por defecto

El plan dejó estas decisiones abiertas. Se resolvieron así y se pueden cambiar en la configuración:

| Decisión | Valor aplicado | Dónde cambiarla |
| --- | --- | --- |
| Canal corporativo | Se conserva junto con la tienda | — |
| Dividir pedidos entre sucursales | Sí, solo en envío a domicilio | `PERMITIR_DIVISION` |
| Recoger en sucursal | Sí, por sucursal | Campo `permite_recoger` |
| Compra como invitado | No; requiere cuenta | — |
| Precios por sucursal | Precio único nacional | Las promociones locales aplican al recoger en esa sucursal |
| Métodos de pago iniciales | Transferencia (con validación) y efectivo en sucursal (solo al recoger) | — |
| Ajustes de inventario | Solo el encargado; el personal de almacén registra entradas | — |
| Plazo de reserva sin pago | 24 h | `RESERVA_HORAS` |
| Envío | $150; sin costo desde $1,500; sin costo para el canal corporativo | `COSTO_ENVIO`, `ENVIO_GRATIS_DESDE` |

## Implementado y probado

| Módulo | Funcionalidad | Cómo se verificó |
| --- | --- | --- |
| Sucursales | Alta y edición; horarios, responsable y zonas por prefijo de CP | pytest + E2E |
| Usuarios y roles | 7 roles y 26 permisos; alcance global o por sucursal; bloqueo, desbloqueo y recuperación | pytest |
| Autenticación | JWT de 15 min; refresh rotativo en cookie HttpOnly + CSRF; logout que revoca ambos tokens | pytest + E2E |
| Catálogo | Productos, variantes de talla y color, imágenes, puestos autorizados y habilitación por sucursal | pytest + E2E |
| Promociones | Porcentaje o monto; vigencia; globales o locales | pytest |
| Tienda | Inicio, búsqueda de texto completo, filtros, orden, ficha, disponibilidad por sucursal y favoritos | pytest + E2E |
| Carrito y checkout | Validación de existencias; checkout en 3 pasos; reserva atómica con bloqueo de filas; idempotencia | pytest (incluye concurrencia) + E2E |
| Asignación de sucursal | Por cercanía de CP; una sola sucursal o división entre el menor número posible | pytest |
| Pedidos | 14 estados con transiciones validadas; historial; cancelación; expiración; cierre conciliado | pytest |
| Canal corporativo | Empleados; pedido por empleado; excepciones por puesto; aprobación, devolución y corrección; crédito | pytest + E2E |
| Inventario | Físico, reservado, comprometido y en tránsito; kardex inmutable; entradas, ajustes y mermas; mínimos y alertas | pytest |
| Transferencias | Solicitud, autorización, envío, tránsito y recepción completa o parcial con incidencia | pytest |
| Surtido y logística | Lista de surtido; faltantes con merma, incidencia y reembolso; paquetes; despacho; eventos; entrega en mostrador | pytest + E2E |
| Recepción y entregas | Recepción corporativa separada de la entrega individual; firma; valoración; entregas parciales | pytest |
| Pagos | Transferencia con comprobante; validación o rechazo; efectivo en caja; cobro de crédito; sin datos de tarjeta | pytest + E2E |
| Reembolsos | Por cancelación, faltante o devolución; nunca mayores a lo pagado; ajuste si el pedido fue a crédito | pytest |
| Devoluciones | Evidencia obligatoria; autorización; recepción en la sucursal asignada; inspección con reingreso o merma | pytest |
| Incidencias | Vinculadas a pedido, paquete, devolución o transferencia; el seguimiento se agrega sin borrar | pytest |
| Notificaciones | Por evento, sin duplicados, para cliente y para personal según permiso y sucursal | pytest |
| Panel e informes | Ventas, pagos y pedidos por separado; comparativa de sucursales; Excel y CSV; PDF de pedido | pytest + E2E |
| Auditoría | Bitácora con actor, IP y valores antes/después; un trigger impide modificarla o borrarla | pytest |

## Pendiente: requiere servicios, credenciales o hardware

| Dependencia | Situación actual | Para completarla |
| --- | --- | --- |
| Pasarela de pago | La interfaz `integrations/pagos` está lista. La tienda muestra la tarjeta como "no disponible". | Contrato con un proveedor y llaves de API; endpoint de webhook con firma verificada |
| API de paquetería | Guía manual; eventos con `origen=interno`; la interfaz `integrations/envios` está lista | Contrato y credenciales; tarea que consulte eventos y los guarde con `origen=transportista` |
| CFDI 4.0 | El PDF del pedido indica que no es comprobante fiscal | Proveedor de certificación (PAC) y certificados de sello digital |
| Correo (SMTP) | Se escribe en el log; en desarrollo el token de recuperación se muestra en pantalla | Servidor SMTP con dominio verificado; `CORREO_PROVEEDOR` |
| Datos bancarios para transferencias | Se configuran con `VITE_DATOS_BANCARIOS`; si faltan, la tienda pide solicitarlos a la sucursal | Capturar la CLABE real de la empresa |
| Almacenamiento de imágenes | Carpeta local `uploads/` | Servicio de objetos en producción |
| Lector Crossmatch Verifier 300 LC | No integrado; la conformidad usa firma dibujada simple | SDK, servicio local de Windows y política de datos biométricos |
| Despliegue | Dockerfiles y compose escritos, sin probar (no había Docker) | Servidor, dominio y certificado TLS |

## Errores del prototipo resueltos

| Error del prototipo | Cómo se resolvió |
| --- | --- |
| IDs duplicados | Claves `BIGSERIAL` y folios derivados del ID |
| Paquetes sin liberar la orden | El surtido exige pedido confirmado y transición validada |
| Botón "Liberar" que regresaba el estado | Las transiciones solo avanzan |
| Pedido de una sola partida | Partidas múltiples por empleado |
| Sucursal del pedido no validada | La sucursal la asigna el sistema |
| Permisos solo visuales | Se validan en el servidor |
| Sin existencias | Inventario real con kardex |
| Sin entregas parciales | Entregas y recepciones parciales |
| Devueltos no editables | Corrección y reenvío |
| Indicadores inconsistentes | Calculados en SQL |
