# Informe — Refinamiento del portal privado Salud Digna

Rama: `feature/rediseno-visual-avanzado` (sin commits, push ni merge). Fecha: 13-nov-2026. Alcance: solo frontend del portal.
Sigue a `informe-redisenio-visual-lurima-salud-digna.md`, que cubre la identidad, el layout y el inicio del portal.

## 1. Diagnóstico inicial

**Estado al empezar:** el portal ya tenía identidad propia (logotipo oficial, barra lateral clara, verde institucional), un inicio con datos reales, un asistente de tres pasos (empleados → artículos → revisar y enviar), un listado con tabla y tarjetas, y un detalle con trazabilidad completa:
- revisión, surtido y envío por paquete;
- recepción, entrega con firma, conformidad e incidencias;
- historial de la solicitud.

Rutas, servicios y permisos revisados:

| Pantalla | Ruta | Endpoints (sin cambios) |
|---|---|---|
| Inicio | `/cuenta` | `GET /cuenta/resumen`, `/cuenta/pedidos`, `/cuenta/notificaciones` |
| Catálogo | `/cuenta/catalogo[/:slug]` | `GET /tienda/productos`, `/cuenta/puestos-autorizados`, `/cuenta/empleados` |
| Crear o corregir | `/cuenta/solicitudes/nueva`, `/:id/editar` | `POST`/`PUT /cuenta/pedidos-corporativos` |
| Solicitudes | `/cuenta/pedidos` | `GET /cuenta/pedidos?canal=corporativo&estado=` (un estado a la vez) |
| Detalle | `/cuenta/pedidos/:id` | `GET /cuenta/pedidos/:id`; `POST …/enviar`, `/cuenta/paquetes/:id/recepcion`, `/cuenta/entregas/:id[/conformidad]`, `/cuenta/pedidos/:id/incidencias`, `…/cancelar` |
| Empleados, Notificaciones, Mi cuenta | `/cuenta/empleados`, `/notificaciones`, `/perfil` | Existentes |

Permisos: el portal se muestra a cuentas `empresa` (`LayoutPorRol`). Las acciones dependen del estado de la solicitud y las valida el servidor. Una solicitud enviada solo la cancela el distribuidor.

## 2. Problemas de usabilidad encontrados

| # | Problema | Evidencia |
|---|---|---|
| U-1 | El detalle no dice qué sigue: hay que interpretar la línea de proceso para saber si toca recibir, entregar o esperar | `DetalleSolicitud.tsx` |
| U-2 | «Enviar a revisión» se ejecuta con un clic, en el asistente y en el detalle, aunque la solicitud deja de ser editable | `SolicitudCorporativa.tsx`, `DetalleSolicitud.tsx` |
| U-3 | Salir del asistente con artículos sin guardar los pierde sin aviso (menú, enlaces, cierre de pestaña) | `SolicitudCorporativa.tsx` |
| U-4 | El filtro de estado y la página del listado no se conservan al abrir una solicitud y regresar | `Pedidos.tsx` (estado local) |
| U-5 | Si la sucursal no tiene dirección, el asistente manda a `/cuenta/direcciones`, que para empresas redirige a Mi cuenta (solo lectura): callejón sin salida | `SolicitudCorporativa.tsx` |
| U-6 | Los fallos de red se muestran como «Failed to fetch» | `lib/formato.ts` |
| U-7 | El botón primario compartido sale en el azul tinta del panel, ajeno a la identidad del portal | `components/ui.tsx` |
| U-8 | A 360 px las líneas de proceso se desplazan en horizontal sin poder enfocarse con teclado (axe: `scrollable-region-focusable`) | `DetalleSolicitud.tsx` |
| U-9 | La observación del distribuidor se repetía y el listado no indicaba qué hacer con cada solicitud | `DetalleSolicitud.tsx`, `TablaSolicitudes.tsx` |
| U-10 | La animación «volar al destino» pedía el SVG del seed en lugar de la foto que muestra la tarjeta | `components/movimiento.tsx` |

## 3. Mejoras visuales implementadas

- **Qué sigue** en el detalle:
  - Un panel con tono según la situación: acción (verde), espera, alerta (ámbar) y cerrada.
  - Lleva el título del siguiente paso, una explicación y un botón que desplaza a Paquetes o a Empleados.
  - Señala las incidencias abiertas.
  - Se calcula solo con los datos de la solicitud (`proximoPaso`): estado, paquetes sin recepción, entregas pendientes de firma y conformidades pendientes. No inventa eventos ni fechas.
- **Pasos del asistente con progreso real:** «N seleccionado(s)», «N artículo(s)», «N excepción(es)», con `aria-current="step"`.
- **Listado:**
  - Columna **Acción** según el estado: Continuar (borrador), Corregir (devuelta) o Ver detalle.
  - Botón **Nueva solicitud**, búsqueda con ícono y «Limpiar filtros».
  - Encabezados con más contraste.
- **Botón primario del portal** en verde institucional `sd-900` (11:1 con blanco), solo dentro de `.tema-sd`.
- **Observación de devolución o rechazo:** se muestra una sola vez, en «Qué sigue».

## 4. Mejoras funcionales implementadas

- **Confirmación de envío** (`portal/ConfirmarEnvio.tsx`):
  - Resume empleados, artículos y excepciones.
  - Explica que la solicitud deja de ser editable y que enviar no es aprobar.
  - Si el envío falla, muestra el error en el mismo diálogo para reintentar.
  - Se usa en el asistente (envío y reenvío) y en el detalle. Las llamadas a la API son las mismas.
- **Cambios sin guardar:**
  - Navegación interna: se detiene con `useBlocker` y un diálogo con «Seguir editando» o «Salir sin guardar».
  - Cierre o recarga de la pestaña: aviso del navegador con `beforeunload`.
  - Tras guardar o enviar con éxito ya no bloquea.
- **Filtro y página del listado en la URL** (`?estado=&pagina=`): se conservan al regresar y los enlaces del inicio siguen funcionando.
- **Dirección faltante:** el aviso pide al distribuidor registrar la dirección y enlaza a Mi cuenta.
- **Errores de red comprensibles:** solo para los fallos de `fetch` (Chrome, Firefox y Safari). Los errores de programación conservan su mensaje.
- **Teclado en móvil:** las líneas de proceso son regiones enfocables y etiquetadas.
- **Imagen de la animación «volar al destino»:** ahora usa la misma imagen que la tarjeta.
- **Ya existentes y verificados:** los botones se deshabilitan mientras envían (sin dobles envíos), los datos se invalidan y recargan tras cada operación y las confirmaciones de recepción, entrega y conformidad siguen en sus diálogos.

## 5. Componentes modificados y nuevos

**Nuevos**
- `features/portal/ConfirmarEnvio.tsx`
- `test/portalflujo.test.tsx`: 6 pruebas

**Modificados**
- `features/cuenta/DetalleSolicitud.tsx`: «Qué sigue», confirmación y regiones enfocables.
- `features/cuenta/SolicitudCorporativa.tsx`: pasos con progreso, confirmación, cambios sin guardar y aviso de dirección.
- `features/cuenta/Pedidos.tsx`: URL, nueva solicitud y limpiar filtros.
- `features/portal/TablaSolicitudes.tsx`: columna Acción.
- `test/solicitud.test.tsx`: el envío confirma; nueva prueba de cambios sin guardar.
- `test/contactogaleria.test.tsx`: solo margen de espera; era intermitente con la suite completa.

**Compartidos, con impacto revisado**
- `components/ui.tsx`: la clase marcadora `boton-primario` no tiene estilos fuera de `.tema-sd`. Verificado: el botón primario de LURIMA sigue en `rgb(15, 34, 56)`.
- `index.css`: tres reglas dentro de `.tema-sd`.
- `lib/formato.ts`: solo el caso de fallo de red.
- `components/movimiento.tsx`: imagen de la animación.

**Sin cambios:** backend, base de datos, endpoints, permisos, autenticación, flujo de negocio, `features/admin`, `features/tienda` y dependencias.

## 6. Pruebas ejecutadas

| Validación | Resultado |
|---|---|
| `tsc --noEmit` | Sin errores |
| `vitest run` | **18 archivos, 118 pruebas pasan**. Nuevas o ajustadas: confirmación de envío (8 pruebas adaptadas, que siguen verificando las mismas llamadas a la API), cambios sin guardar, `proximoPaso` (casos de revisión, devolución, recepción, entrega, conformidad y cierre), filtro en la URL y acción por estado, mensajes de error |
| `vite build` | Correcto |
| Interacción en navegador | Agregar un artículo → la salida al Inicio se bloquea → «Seguir editando» → revisar → confirmación → envío fallido (escritura bloqueada por la simulación) con el error en el diálogo y sin salir. Repetido: «Salir sin guardar» navega |
| Desbordamiento: 10 vistas del portal × 360, 390, 768, 1024, 1366 y 1920 px | 0 px |
| axe-core 4.8.4 (WCAG 2.0/2.1 A y AA) a 360 y 1366 px | 0 violaciones tras U-8 |
| Consola y peticiones fallidas (recorrido completo del portal y del asistente) | 0 errores, 0 fallidas |
| LURIMA | Botón primario sin cambios; 0 desbordamiento en 4 vistas × 3 anchuras |

Los datos del portal en el navegador fueron **simulados** (`page.route`), con todas las escrituras bloqueadas. No se escribió en ninguna base de datos ni se ejecutó la suite de backend, que recrea su base de pruebas.

Capturas: `docs/capturas-redisenio-visual/portal-v3-*.jpg` (después) frente a `portal-*.jpg` de la primera ronda (antes).

## 7. Limitaciones encontradas

- **Sin datos reales del portal:** no hay sesión de empresa ni solicitudes reales en el entorno local sin escribir en la base. Recepción, entrega con firma y conformidad se verificaron en la interfaz y con pruebas, no contra el servidor.
- **Búsqueda por folio:** solo filtra la página cargada (B-3). El listado no trae empleados por solicitud (B-2) y solo filtra un estado a la vez (B-1).
- **«Qué sigue» en el listado:** solo puede usar el estado, porque el resumen del listado no trae paquetes ni entregas.
- **Cambios sin guardar:** el aviso de cierre de pestaña usa el diálogo genérico del navegador, cuyo texto no se puede personalizar.

## 8. Recomendaciones para una siguiente etapa (no implementadas)

| Propuesta | Requiere |
|---|---|
| Búsqueda por folio en el servidor y filtro por varios estados (B-1, B-3) | Backend |
| Indicador «acción pendiente» por fila del listado (paquetes por recibir y entregas o conformidades pendientes por solicitud) | Backend: agregar esos conteos al resumen del listado |
| Empleados por solicitud en el listado (B-2) | Backend |
| Autoguardado del borrador cada cierto tiempo | Decisión de negocio, porque crearía borradores en el servidor |
| Revisión del portal con lector de pantalla y en Safari | Pruebas manuales |
| Prueba de los flujos de recepción, firma y conformidad contra un entorno de pruebas con datos restaurables | Entorno de pruebas autorizado |
