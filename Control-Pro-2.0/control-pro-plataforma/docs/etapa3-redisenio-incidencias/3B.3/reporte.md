# Etapa 3B.3 — Página de detalle de incidencia y navegación desde avisos

Copia aislada `Control_Pro_etapa1_turnos`, rama `feature/turnos-incidencias-etapa1` (sin remotos). Sin commits, sin
pushes, sin migraciones.

## A. Resumen

- El panel tiene ahora una **página de detalle** por incidencia: `/admin/incidencias/:id`. Sustituye al modal de la
  lista, que se retiró después de trasladar todo su contenido y sus acciones sin cambiar su lógica.
- La sucursal conserva su página `/cuenta/incidencias/:id` y gana el mismo encabezado: folio, tipo, estado, chip de
  turno, prioridad, fecha de reporte y última actividad.
- Los avisos nuevos enlazan directo al detalle. Los avisos antiguos con `?abrir=<id>` se **redirigen** a la página.
- El regreso vuelve a la bandeja de origen con sus filtros (bandeja, prioridad y página). Si se llegó desde un aviso o
  por un enlace directo, vuelve a la lista general del perfil.
- Los casos «no existe», «sin acceso» y «error temporal» muestran mensajes distintos, sin detalles técnicos.
- Pruebas: tsc OK; build OK; Vitest **245/245** (234 + 11); pytest **290/290**.

## B. Auditoría inicial

| Elemento | Antes de la 3B.3 |
|---|---|
| Panel | Modal en `Posventa.tsx` con estado, prioridad, descripción, evidencias, «Relacionada con», `Reposicion`, historial y formulario (comentario, adjuntos, cambio de estado → `PATCH /admin/incidencias/:id`). Se abría con «Gestionar» o con `?abrir=<id>`. |
| Sucursal | Página propia `/cuenta/incidencias/:id`, con conversación, confirmar solución y reabrir con motivo. Sin chip de turno, sin prioridad, sin última actividad. Un error mostraba la caja de error genérica. |
| Avisos | `aviso_incidencia.enlace_lurima` → `/admin/incidencias?abrir=<id>` (con un comentario `shortcut` que anticipaba este cambio). La sucursal ya enlazaba a `/cuenta/incidencias/<id>`. |
| Backend | `GET /admin/incidencias/:id` (permiso `incidencia.gestionar` + alcance) y `GET /cuenta/incidencias/:id` (solo las de las solicitudes de la sucursal; 404 también para las ajenas). No hizo falta ningún endpoint nuevo. |
| Detalle del pedido (panel) | Lista las incidencias con un único enlace genérico «Gestionar →» hacia la lista. |

## C. Rutas

| Ruta | Cambio |
|---|---|
| `/admin/incidencias/:id` | **Nueva** (`features/admin/IncidenciaDetalle.tsx`, carga diferida como las demás). |
| `/admin/incidencias?abrir=<id>` | Compatibilidad: redirige con `replace` a `/admin/incidencias/<id>`. La página valida el acceso. |
| `/cuenta/incidencias/:id` | Sin cambio de ruta; se rediseñó el encabezado, el regreso y los errores. |
| Aprobador | Sin cambios. Sus enlaces `/admin/...` se siguen traduciendo con `enlacePanel`. |

## D. Componentes

| Componente | Tipo |
|---|---|
| `components/DetalleIncidencia.tsx` | **Nuevo**, compartido por los dos portales: `EncabezadoIncidencia`, `VolverIncidencias` y `ErrorIncidencia`. |
| `features/admin/IncidenciaDetalle.tsx` | **Nuevo**: la página del panel. `Reposicion` se **movió** aquí desde `Posventa.tsx` sin modificarla. |
| `features/admin/Posventa.tsx` | Las filas y tarjetas pasan a ser enlaces al detalle y le envían la bandeja en el estado de navegación. Se retiraron el modal, su estado y `?abrir=`. |
| `features/cuenta/Incidencias.tsx` (`IncidenciaSucursal`) | Encabezado común, regreso con contexto y estados de error. Confirmar, reabrir y conversar quedan igual. |
| `features/cuenta/DetalleSolicitud.tsx` (`HistorialIncidencia`) | Usa `clase`: los mensajes llevan al autor en negrita y el texto en un recuadro; los eventos van en tono atenuado. Lleva prefijo para lectores de pantalla («Mensaje:» / «Evento del sistema:») y un texto cuando no hay movimientos. |
| `features/admin/Pedidos.tsx` | Cada folio de incidencia enlaza a su detalle (con `incidencia.gestionar`); el enlace general pasa a decir «Ver todas las incidencias →». |
| `app/router.tsx` | Una ruta nueva. |
| Reutilizados sin cambios | `ChipTurno`, `PrioridadIncidencia`, `GaleriaEvidencias`, `AdjuntarEvidencias`, `ListaReposiciones`, `Tarjeta`, `Vacio`, `Cargando`, `Estado`, `ErrorCaja`. |

## E. Información y seguimiento

- **Encabezado:** folio (`h1`), tipo, estado, chip de turno (según el portal), prioridad, fecha de reporte y última
  actividad. Además muestra la solicitud (con enlace) y, en el panel, la sucursal cliente (`cliente`), el origen cuando
  no es una solicitud (transferencia o devolución) y la incidencia de origen si nació de una reposición
  (`reposicion_de`).
- **Panel, columna principal:** descripción, «Relacionada con», evidencias y seguimiento.
- **Panel, columna lateral:** reposición y «Agregar seguimiento». En tablet y móvil todo va en una sola columna.
- **Seguimiento:** el orden cronológico es el del backend. La clasificación mensaje/evento viene de `clase`
  (`es_humana`, sin cambios). La confirmación y la reapertura de la sucursal siguen siendo mensajes humanos porque no
  se tocó la clasificación del backend.
- No se muestra ningún dato que el backend no envíe. En particular, el nombre de la sucursal operativa no viene en la
  respuesta, así que se usa la razón social del cliente.

## F. Acciones (trasladadas del modal)

| Acción | Dónde está ahora | Comprobación |
|---|---|---|
| Comentar o resolver | Detalle del panel, «Agregar seguimiento» | Vitest (llamada `PATCH` con el mismo cuerpo) y Playwright (el comentario aparece como «Mensaje» de Mario Atención). |
| Adjuntar fotos o documentos | Mismo formulario (solo si hay solicitud) | Visual |
| Cambiar estado (`transiciones` del backend) | Mismo formulario | Vitest |
| Preparar reposición / preparar otra | Tarjeta «Reposición» | Vitest (visible con la incidencia activa, oculta tras resolverla: misma regla de antes) |
| Enviar con guía, cancelar, marcar entregada | Tarjeta «Reposición» (`Reposicion` sin cambios) | Visual en INC-6 (campos de paquetería y guía y botón «Enviar con esta guía») |
| Sucursal: enviar mensaje, confirmar solución, reabrir con motivo | Página de la sucursal (sin cambios) | `incidencias.test.tsx` y Playwright (mensaje enviado en INC-4) |

Ninguna acción cambió de endpoint, de cuerpo ni de condición. El backend sigue validando cada operación.

## G. Notificaciones

- `aviso_incidencia.enlace_lurima` → `/admin/incidencias/{id}` (cambio de una línea; las reglas de quién recibe qué no
  cambiaron). `test_avisos_incidencias.py` se actualizó al enlace nuevo, como preveía el plan.
- Avisos ya guardados con `?abrir=<id>` (10 en la base visual): la lista del panel los redirige a la página.
- La marca de leído no cambió: se marca solo el aviso pulsado (`Notificaciones.tsx`, sin modificar).
- Comprobado en la aplicación:
  - Aviso nuevo (`/admin/incidencias/4`, generado por el mensaje de la sucursal) → detalle, marcado como leído.
  - Aviso antiguo `?abrir=7` → `/admin/incidencias/7`, marcado como leído; los otros 9 siguen sin leer.
  - Desde un aviso, el regreso dice «Volver a incidencias» y lleva a la lista general.

## H. Autorización

| Perfil | Caso | Resultado |
|---|---|---|
| Atención | Incidencia propia del alcance | 200, detalle completo |
| Atención | `/admin/incidencias/999999` | 404 → «No encontramos esta incidencia» |
| Almacén Toluca y Almacén Puebla | INC-6 (surtida por Querétaro) | 404 del backend; ningún dato de la incidencia en pantalla (captura 13) |
| Sucursal | `/cuenta/incidencias/999999` | 404 → mismo mensaje, que no distingue «no existe» de «es de otra sucursal» |
| 403 / 5xx | Vitest | «No tienes acceso…» / «No se pudo cargar…» con «Reintentar»; nunca el mensaje técnico |

El frontend no decide el acceso: la página siempre consulta el endpoint existente, que aplica permiso y alcance.
`test_avisos_incidencias.py` sigue comprobando que un almacén ajeno no abre la incidencia ni recibe su aviso.

## I. Pruebas

| Prueba | Línea base (fin de 3B.2) | Final 3B.3 |
|---|---|---|
| `tsc -b --noEmit` | OK | **OK** (`tsconfig.tsbuildinfo` restaurado) |
| `vite build` (a una carpeta temporal fuera del repositorio) | — | **OK** (`IncidenciaDetalle` en su propio bloque de 9.9 kB) |
| Lint | No existe un comando de lint en `package.json` | No ejecutado |
| Vitest relevantes (`incidencias`, `portalflujo`, `recepcion`, `bandejas`) | 24/24 | 24/24, sin cambios en esas pruebas |
| Vitest nuevas (`detalleincidencia.test.tsx`) | — | **11/11**: encabezado, regreso con filtros, regreso sin contexto, mensaje/evento, acción `PATCH`, reposición, 404/403/500, `?abrir=` → detalle, la lista enlaza y pasa la bandeja, sucursal (regreso y 404) |
| Vitest completa (`--maxWorkers=3`) | 234/234 | **245/245** |
| pytest relevantes (`test_avisos_incidencias`, `test_bandejas`) | — | **10/10** |
| pytest completa (base desechable) | 290 passed | **290 passed, 0 failed** en 21 min 51 s; mismos 8 avisos de obsolescencia de SQLAlchemy de antes (`colaboracion_service.py`); base temporal `cp_d2e565ffe333_test` eliminada al terminar |

## J. Validación visual (Playwright sobre la copia: 5180 → 5055, base `cp_etapa2_visual_test`)

| # | Captura | Resultado |
|---|---|---|
| 01 | `capturas/01-sucursal-detalle-te-toca-1440.png` | INC-7 desde «Te toca»: «Te toca recibir la reposición», Alta, fechas, solicitud; «Volver a «Te toca»». |
| 02 | `capturas/02-sucursal-detalle-reposicion-1440.png` | INC-6 desde «Reposición en proceso», con su envío de reposición. |
| 03 | `capturas/03-sucursal-detalle-390.png` | Móvil: `scrollWidth` 375 (sin desplazamiento horizontal); a 768, 753. |
| 04 | `capturas/04-sucursal-inexistente-1440.png` | 404 con regreso a «Mis incidencias». |
| 05 | `capturas/05-notificaciones-atencion-1440.png` | Lista de avisos de Atención. |
| 06 | `capturas/06-atencion-detalle-desde-aviso-1440.png` | Desde el aviso nuevo: INC-4, «Respondió la sucursal · ahora», con mensajes (en recuadro) y evento (atenuado). |
| 07 | `capturas/07-atencion-detalle-prioridad-turno-1440.png` | INC-9 desde «Por atender» + Crítica: chip y prioridad visibles y distintos. |
| 08 | `capturas/08-atencion-regreso-bandeja-1440.png` | Regreso: `?bandeja=por_atender&prioridad=critica`, pestaña y filtro conservados. |
| 09 | `capturas/09-atencion-detalle-reposicion-1440.png` | INC-6 con paquete preparado: paquetería, guía y «Enviar con esta guía». |
| 10 | `capturas/10-atencion-detalle-reposicion-390.png` | Móvil: una columna, `scrollWidth` 375. |
| 11 | `capturas/11-atencion-detalle-768.png` | Tablet: `scrollWidth` 753. |
| 12 | `capturas/12-atencion-aviso-antiguo-redirigido-1440.png` | Aviso antiguo `?abrir=7` → `/admin/incidencias/7`. |
| 13 | `capturas/13-almacen-ajeno-sin-acceso-1440.png` | Almacén ajeno: mensaje de no disponible y regreso. |

Además, en el portal de la sucursal, desde «Esperando a Lurima» se abrió INC-9 con el regreso «Volver a «Esperando a Lurima»».

Consola: solo el 401 de `/api/auth/refresh` en la pantalla de acceso (ya existía) y los 404 provocados a propósito al
abrir incidencias inexistentes o ajenas.

Datos creados en la base visual desechable durante la validación: un mensaje de la sucursal en INC-4 (que generó el
aviso nuevo) y un comentario de Atención en INC-9.

## K. Seguridad e integridad

- Se trabajó solo en la copia aislada. La huella de `git status` del original
  (`c7bcc85891211e218c43785c4ecae48c`) se comprobó sin cambios.
- Bases usadas: el contenedor desechable `cp-pruebas-etapa3` (127.0.0.1:55432). Se había detenido de forma limpia
  (código 0) a las 16:20, sin intervención de esta sesión. Se volvió a **arrancar** el mismo contenedor (no se recreó)
  y conservaba la base visual.
- Los servidores de la copia (5055/5180) se habían cerrado con la sesión anterior y se volvieron a levantar con la misma
  configuración aislada.
- Sin migraciones; no se tocaron `turno_service`, `es_humana`, permisos, roles, reglas de avisos ni los procesos de
  reposición, recepción, confirmación o cierre. Sin commits ni pushes.

## L. Resultado

| Criterio | Estado |
|---|---|
| Página de detalle dedicada | Cumplido |
| Información principal clara y completa (con los datos disponibles) | Cumplido |
| Seguimiento con mensajes y eventos | Cumplido |
| Adjuntos | Cumplido (mismos componentes) |
| Acciones con el mismo comportamiento | Cumplido (§F) |
| Permisos y alcances | Cumplido (§H) |
| Avisos directos al detalle | Cumplido |
| `?abrir=<id>` redirige | Cumplido |
| Regreso con bandeja y filtros | Cumplido |
| Carga, error y ausencia | Cumplido |
| 1440 / 768 / 390 sin desplazamiento horizontal | Cumplido |
| Sin regresiones | Cumplido: tsc, build, Vitest 245/245, pytest 290/290 |
| Validación sobre la aplicación real | Cumplido |
| Original intacto | Cumplido |

**Desviaciones y pendientes:**

1. El plan decía que el modal se retiraría «después de la revisión». Se retiró en esta etapa porque mantener los dos
   habría duplicado el formulario y la reposición. Todo su contenido está en la página (§F). Si prefieres conservarlo
   durante la revisión, se puede restaurar.
2. Lo que corresponde a la 3B.4 no se tocó: el control de `surtido.operar` para el envío, el «Siguiente paso» y la
   conversación completa.
3. Sigue pendiente la decisión de la 3B.1 sobre la clasificación de la confirmación; en esta etapa no se tocó.

Lista para revisión. No se inició la 3B.4.
