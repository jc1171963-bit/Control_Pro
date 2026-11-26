# Etapa 3B.4 — Conversación, eventos, siguiente paso y acciones por perfil

Copia aislada `Control_Pro_etapa1_turnos`, rama `feature/turnos-incidencias-etapa1` (sin remotos). Sin commits, sin
pushes, sin migraciones. Backend en 5055 y frontend en 5180 con la base visual desechable `cp_etapa2_visual_test`.

## 1. Resumen de cambios

- **Conversación:** los mensajes de personas son tarjetas con autor, lado y fecha. Los eventos automáticos son una línea
  discreta con un ícono según lo que cambió. La forma la decide `clase` (backend, `es_humana`), que no cambió.
- **Confirmación y reapertura de la sucursal:** siguen siendo mensajes humanos, con un tratamiento propio:
  - Confirmación: ícono, etiqueta «Solución confirmada» y fondo verde suave.
  - Reapertura: ícono, etiqueta «Reabrió la incidencia» y fondo ámbar suave.
  - El texto se muestra tal cual.
- **Siguiente paso:** un bloque bajo el encabezado, en los dos portales. Dice quién tiene el siguiente paso y qué se
  espera, a partir del turno del backend, sin repetir el chip.
- **Envío de la reposición:** el formulario de envío (paquetería, guía, «Enviar con esta guía») y «Marcar como
  entregada» solo aparecen con `surtido.operar`. Atención ya no los ve; el almacén los conserva.
- **Recepción desde la incidencia (D-7):** la sucursal registra la recepción de la reposición sin salir de la incidencia,
  con el mismo `RecepcionPaquete` y el mismo endpoint.
- **D-6:** «Preparar otra reposición» se oculta mientras haya una reposición vigente.
- **Pruebas:**
  - tsc OK y build OK.
  - Vitest completa: **273/273** (245 + 28 nuevas).
  - pytest: **290/290** en la suite completa, más la prueba nueva **1/1**.

## 2. Auditoría del comportamiento anterior

| Elemento | Antes de la 3B.4 |
|---|---|
| `HistorialIncidencia` (lo usan el detalle del panel, el de la sucursal y la tarjeta de la solicitud) | Una línea por entrada con el estado en negrita en todas, incluso sin cambio. Los mensajes ya se distinguían un poco desde la 3B.3 (recuadro), los eventos en gris. Confirmación y reapertura se veían como mensajes comunes. La resolución automática al recibir la reposición figuraba con el actor «Sucursal». |
| Siguiente paso | No existía; solo el chip de turno. |
| Envío de la reposición en el panel | Formulario de paquetería y guía y «Marcar como entregada» visibles para cualquiera con `incidencia.gestionar`. Atención los veía y recibía un 403 al usarlos (hallazgo A2 de la auditoría). |
| Permisos en el backend | Preparar y cancelar: `incidencia.gestionar`. Despachar (`/paquetes/:id/despachar`) y eventos (`/paquetes/:id/eventos`): `surtido.operar`. Atención no tiene `surtido.operar`; Personal de inventario (almacén) y Encargado sí tienen los dos. |
| «Preparar reposición» | Visible con la incidencia activa. Con una reposición en curso cambiaba a «Preparar otra reposición» (lo contrario de D-6). |
| Recepción de la reposición | Solo desde la página de la solicitud (`DetalleSolicitud`, modal `RecepcionPaquete`). |
| Pruebas existentes | Vitest: `detalleincidencia`, `incidencias`, `portalflujo`, `recepcion`, `bandejas`, `chipturno`. pytest: `test_turnos`, `test_clase_seguimiento`, `test_recepcion_reposicion`, `test_incidencias_sucursal`, `test_avisos_incidencias`. Ninguna comprobaba que Atención reciba un 403 al despachar. |

## 3. Archivos modificados y nuevos

| Archivo | Cambio |
|---|---|
| `frontend/src/components/DetalleIncidencia.tsx` | **Nuevo componente `SiguientePaso`**, con su tabla de textos por turno y portal. |
| `frontend/src/features/cuenta/DetalleSolicitud.tsx` | Se reescribió `HistorialIncidencia` (mensajes, eventos, confirmación y reapertura). `RecepcionPaquete` ahora se exporta y, al terminar, también recarga las incidencias. |
| `frontend/src/features/cuenta/Incidencias.tsx` (`IncidenciaSucursal`) | Agrega «Siguiente paso» y la recepción desde la incidencia (consulta la solicitud solo cuando el turno es `sucursal_recibir`). |
| `frontend/src/features/admin/IncidenciaDetalle.tsx` | Agrega «Siguiente paso». `Reposicion` recibe `envia` (`surtido.operar`) para el envío y aplica D-6. |
| `frontend/src/test/conversacionincidencia.test.tsx` | **Nuevo**, con 28 pruebas. |
| `backend/tests/test_permisos_reposicion.py` | **Nuevo**, con 1 prueba. Solo prueba: no hay cambios de código en el backend. |

No se modificaron el backend (salvo la prueba nueva), `turno_service`, `es_humana`, la serialización, los permisos, los
roles, los avisos ni los procesos de reposición, recepción o cierre.

## 4. Conversación y eventos

- El orden es el del backend (`turno_service.ordenar`).
- **Mensaje** (`clase = 'mensaje'`): tarjeta con ícono, autor en negrita, lado (Sucursal o Lurima) y fecha. Si hubo un
  cambio de estado, aparece pequeño («En atención → Resuelta»). Debajo van el texto (respetando saltos de línea), los
  adjuntos y el responsable. El lado no se repite cuando el autor ya es «Sucursal».
- **Evento** (`clase = 'evento'`): una línea gris con ícono:
  - Alta: `FilePlus2`.
  - Resolución o cierre: `CheckCircle2`.
  - Otro cambio de estado: `ArrowRightCircle`.
  - Nota sin cambio: `Info`.
  - El texto es «cambio de estado · comentario · autor · fecha». Si el comentario repite el título («Incidencia
    registrada»), se muestra una sola vez.
- **Atribución de las notas automáticas:** un evento del lado de la sucursal que no es su alta solo puede ser una nota
  automática, por ejemplo la resolución al recibir completa la reposición. Se muestra como «Registro automático» y no
  como «Sucursal». Así se cumple la aceptación «la resolución automática no se atribuye a la sucursal». No se leen
  textos con expresiones regulares.
- Los lectores de pantalla oyen «Mensaje:» o «Evento del sistema:» al inicio de cada entrada.
- En modo oscuro se lee bien (captura 19), porque se usan los tokens `tinta`, `menta` y `bg-white` que el tema invierte.

## 5. Confirmación y reapertura

Decisión vigente: la confirmación sigue siendo un mensaje humano. No se tocaron `es_humana`, la clasificación, el turno
ni las reglas de reapertura.

| Caso | Cómo se reconoce (estructura, no texto) | Presentación |
|---|---|---|
| Solución confirmada | `clase = mensaje`, `lado = sucursal`, `resuelta → cerrada` | Ícono de confirmación, etiqueta «Solución confirmada», autor, fecha y el texto original («Solución confirmada por la sucursal») |
| Reapertura con motivo | `clase = mensaje`, `lado = sucursal`, `resuelta →` un estado activo | Ícono de reapertura, etiqueta «Reabrió la incidencia», autor, fecha y el texto original («Reabierta por la sucursal: <motivo>») |
| Lurima pasa una incidencia de resuelta a cerrada | `lado = lurima` | No se etiqueta como confirmación (prueba dedicada) |

## 6. Siguiente paso

Es un bloque informativo bajo el encabezado. Muestra «**Responsable**: qué se espera». No asigna nada, no cambia el turno
y no repite el chip.

| Turno | Panel (Lurima) | Sucursal |
|---|---|---|
| `lurima_atender` | **Atención (Lurima)**: revisar la incidencia y atenderla: responder, preparar una reposición o resolverla | **Lurima**: revisará tu incidencia y te responderá aquí |
| `lurima_responder` | **Atención (Lurima)**: la sucursal escribió; hay que responderle | **Lurima**: debe responder a tu último mensaje |
| `lurima_reposicion` | **Lurima**: con `surtido.operar`, «enviar la reposición con su paquetería y guía, o marcarla como entregada»; sin él, «el almacén que surte envía la reposición con su guía; aquí ves su avance» | **Lurima**: está preparando o enviando tu reposición |
| `sucursal_responder` | **La sucursal**: debe responder al último mensaje de Lurima | **Tu sucursal**: responde a Lurima en la conversación |
| `sucursal_recibir` | **La sucursal**: debe registrar la recepción de la reposición | **Tu sucursal**: registra su recepción, con el botón **Registrar recepción de PAQ-…** |
| `sucursal_confirmar` | **La sucursal**: debe confirmar la solución o reabrir | **Tu sucursal**: confirma o reábrela (el bloque de confirmar y reabrir sigue en su lugar) |
| `interna` | **Revisión interna**: sin una sucursal cliente que responda; la revisa el personal | Revisión interna |
| `cerrada` | Sin responsable: «Esta incidencia está cerrada. No hay pasos pendientes.» | Igual |
| Desconocido o nulo | Sin responsable: «No hay información sobre el siguiente paso de esta incidencia.» | Igual |

La única acción dentro del bloque es «Registrar recepción», y solo se muestra cuando la sucursal puede ejecutarla (§8).

## 7. Acciones por perfil y permisos

| Acción | Permiso que exige el backend | Atención (sin `surtido.operar`) | Almacén (con `surtido.operar`) | Sucursal |
|---|---|---|---|---|
| Comentar, adjuntar, cambiar estado | `incidencia.gestionar` | Sí | Sí | — |
| Preparar reposición o preparar otra (D-6) | `incidencia.gestionar` | Sí | Sí | — |
| Cancelar una reposición preparada | `incidencia.gestionar` | Sí (con la nota «el almacén la enviará con su paquetería y guía») | Sí | — |
| Paquetería, guía y «Enviar con esta guía» | `surtido.operar` | **Oculto (todo el formulario)** | Sí | — |
| «Marcar como entregada» | `surtido.operar` | **Oculto** | Sí | — |
| Enviar mensaje, confirmar, reabrir | cliente de la sucursal | — | — | Sí (sin cambios) |
| Registrar la recepción desde la incidencia | cliente de empresa (el mismo endpoint de siempre) | — | — | Sí, con turno `sucursal_recibir` y un paquete entregado sin recepción |

**Interpretación:** el requisito dice «preparar o enviar». Se ocultó todo lo que exige `surtido.operar` (el envío y la
entrega). Preparar y cancelar se mantienen para Atención porque el backend los autoriza con `incidencia.gestionar` y la
propuesta (§6) los asigna a Atención. Quitárselos le restaría una acción que hoy le corresponde. Si prefieres ocultar
también «Preparar», es un cambio de una línea.

**El backend sigue rechazando:**

- pytest `test_permisos_reposicion.py`: Atención prepara (201), pero recibe 403 al despachar y al marcar como
  entregada. El almacén puede hacer las dos cosas (200).
- En la aplicación real, con la sesión de Atención: `POST /admin/paquetes/PAQ-2026-000005/despachar` → 403 y
  `/eventos` → 403. El paquete siguió «preparado».

## 8. Recepción desde la incidencia (D-7)

Es viable sin cambios de backend ni de reglas:

- Si el turno del backend es `sucursal_recibir`, la página carga la solicitud con la misma consulta que usa su página
  (`GET /cuenta/pedidos/:id`, clave `['pedido', id]`). Busca el paquete de reposición de esta incidencia que esté
  entregado y sin recepción.
- Con ese paquete, «Siguiente paso» ofrece **Registrar recepción de PAQ-…**, que abre el mismo `RecepcionPaquete`
  (exportado, sin cambios en su formulario ni en sus validaciones) y llama al mismo
  `POST /cuenta/paquetes/:id/recepcion`.
- Al terminar se recargan la solicitud, el resumen y también la incidencia y la lista. El nuevo turno lo decide el
  backend.
- Sin ese turno, o si el paquete ya tiene recepción, no se consulta la solicitud ni se muestra el botón (pruebas
  dedicadas).
- Comprobado en la aplicación: INC-7, recepción completa desde la incidencia → «Te toca confirmar la solución». Después
  se reabrió con motivo. INC-6 queda con su reposición entregada y sin recibir para que puedas probarlo.

## 9. D-6 — Preparar otra reposición

D-6 (02_propuesta_redisenio.md): «Ocultar "Preparar otra reposición" si hay una vigente (solo presentación; el backend no
cambia)». La duda sobre si una reposición entregada pero sin recibir cuenta como vigente se resolvió contigo antes de
implementar: **sí cuenta**.

| Situación | Botón |
|---|---|
| Sin reposiciones, incidencia activa | «Preparar reposición» |
| Reposición en curso (preparada, despachada, en tránsito, con incidencia o lista para recoger) | Oculto, con la nota «Hay una reposición vigente…» |
| Entregada sin recepción (turno `sucursal_recibir`, leído del backend) | Oculto, con la misma nota |
| La anterior cancelada | «Preparar otra reposición» |
| La anterior recibida incompleta (la incidencia sigue activa) | «Preparar otra reposición» (captura 12) |
| Incidencia resuelta o cerrada | Oculto (como antes) |

El backend no cambió: sigue permitiendo preparar mientras la incidencia esté abierta o en atención.

## 10. Pruebas

| Prueba | Línea base (3B.3) | Final 3B.4 |
|---|---|---|
| `tsc -b --noEmit` | OK | **OK** (`tsconfig.tsbuildinfo` restaurado) |
| `vite build` (a una carpeta temporal fuera del repositorio) | OK | **OK** |
| Vitest relevantes (`detalleincidencia`, `incidencias`, `portalflujo`, `recepcion`, `bandejas`) | 35/35 | 35/35, sin cambios en esas pruebas |
| Vitest nuevas (`conversacionincidencia.test.tsx`) | — | **28/28** |
| Vitest completa | 245/245 | **273/273** (245 + 28) |
| pytest nuevas y relacionadas (`test_permisos_reposicion`, `test_recepcion_reposicion`, `test_clase_seguimiento`, `test_incidencias_sucursal`) | — | **8/8** |
| pytest completa (base desechable) | 290 passed | **290 passed, 0 failed** en 24 min 46 s, con los mismos 8 avisos de obsolescencia de SQLAlchemy (`colaboracion_service.py`). La base temporal `cp_bc7dcbf40af8_test` se eliminó. La prueba nueva `test_permisos_reposicion.py` se creó después de que empezara esta corrida y pasó en la corrida aparte (fila anterior). Total: **291 de 291**. |

Las 28 pruebas nuevas de Vitest cubren:

- Mensaje frente a evento.
- La confirmación como mensaje con su etiqueta.
- La reapertura como mensaje, con el texto intacto.
- Un cierre de Lurima que no se etiqueta como confirmación.
- La resolución automática que no se atribuye a la sucursal, mientras el alta sí.
- Que no se duplique ni el autor ni el título.
- «Siguiente paso» en 9 combinaciones de turno y portal, sin chip.
- Turnos `cerrada`, desconocido y nulo, sin responsable.
- Atención sin `surtido.operar`, que no ve el formulario de envío ni «Marcar como entregada».
- El almacén, que conserva las acciones.
- D-6 en 5 situaciones.
- La recepción desde la incidencia (llama al endpoint y recarga la incidencia), y que no se ofrezca si el paquete ya
  tiene recepción o si el turno es otro.

**Comprobación de que las pruebas detectan fallos:** al quitar a propósito el control de `surtido.operar` y la regla de
`sucursal_recibir` en D-6, fallaron exactamente las 2 pruebas correspondientes. El archivo se restauró y se volvió a
comprobar.

## 11. Validación visual (Playwright sobre la copia)

| # | Captura | Qué muestra |
|---|---|---|
| 01 | `capturas/01-sucursal-recibir-desde-incidencia-1440.png` | INC-6 en la sucursal: «Te toca recibir la reposición», con «Registrar recepción de PAQ-2026-000005» en Siguiente paso. |
| 02 | `capturas/02-sucursal-modal-recepcion-1440.png` | El mismo formulario de recepción por persona, abierto desde la incidencia. |
| 03 | `capturas/03-sucursal-tras-recepcion-confirmar-1440.png` | INC-7 después de recibirla desde la incidencia: «Te toca confirmar la solución». (Se tomó antes de dos ajustes de texto: el alta duplicada y el sujeto repetido en Siguiente paso. Ese estado ya no se puede repetir porque la incidencia avanzó.) |
| 04 | `capturas/04-sucursal-reapertura-1440.png` | Reapertura con motivo como mensaje con «Reabrió la incidencia». Resolución automática como «Registro automático». |
| 05 / 06 | `capturas/05-sucursal-confirmacion-1440.png`, `06-…-390.png` | INC-1 confirmada: mensaje con «Solución confirmada»; Siguiente paso «cerrada». |
| 07 | `capturas/07-sucursal-reapertura-768.png` | Tablet. |
| 08 | `capturas/08-sucursal-te-toca-responder-390.png` | Siguiente paso con `sucursal_responder` en móvil. |
| 09 / 10 / 11 | `capturas/09-atencion-sin-surtido-reposicion-1440.png`, `10-…-768.png`, `11-…-390.png` | Atención en INC-6 con la reposición preparada: sin formulario de envío, con la nota y «Cancelar». D-6 oculta «Preparar otra». |
| 12 | `capturas/12-atencion-reabierta-preparar-otra-1440.png` | INC-7 reabierta, en Atención: «Respondió la sucursal»; «Preparar otra reposición» visible porque la anterior ya se recibió. |
| 13 | `capturas/13-atencion-confirmada-cerrada-1440.png` | INC-1 en el panel: la confirmación de la sucursal y Siguiente paso «cerrada». |
| 14 | `capturas/14-almacen-con-surtido-envio-1440.png` | Almacén Querétaro: paquetería, guía, «Enviar con esta guía» y «Cancelar». |
| 15 | `capturas/15-almacen-enviada-marcar-entregada-390.png` | Después de enviarla desde la página: «Marcar como entregada» (móvil). |
| 16 | `capturas/16-almacen-entregada-sin-recepcion-d6-1440.png` | Entregada sin recepción: «Esperando recepción», sin «Preparar otra» (D-6). |
| 17 / 18 | `capturas/17-sucursal-recibir-768.png`, `18-…-390.png` | Recepción desde la incidencia en tablet y móvil. |
| 19 | `capturas/19-sucursal-confirmacion-oscuro-1440.png` | Modo oscuro: Siguiente paso, eventos y confirmación legibles. |

- `scrollWidth` igual al ancho de la ventana en todas las capturas de 1440, 768 y 390: sin desplazamiento horizontal.
- Consola: solo errores que ya existían (el 401 de `/api/auth/refresh` al iniciar sesión y el 403 de
  `/api/admin/conversaciones` del almacén, hallazgo W3) y los 403 provocados a propósito al comprobar el backend.

Cambios hechos en la base visual desechable durante la validación:

- INC-7: recepción completa de PAQ-2026-000007 y reapertura con motivo.
- INC-1: solución confirmada.
- INC-6: PAQ-2026-000005 enviado con la guía REP-3B4-01 y marcado como entregado, pendiente de recibir.

## 12. Observaciones, desviaciones y pendientes

1. **Preparar y cancelar** siguen visibles para Atención (§7, interpretación). Si prefieres ocultarlos sin
   `surtido.operar`, es una línea.
2. **Tarjeta de reposición en modo oscuro:** `ListaReposiciones` (sin cambios en esta etapa) usa `bg-sky-50/70` y su
   texto pierde contraste en modo oscuro (captura 19). Ya ocurría antes. Se propone para la 3B.6 (accesibilidad).
3. En 390 px, el botón «Registrar recepción de PAQ-2026-000005» ocupa dos líneas; no se encima con nada.
4. Desde la 3B.3, el modal de la lista ya no existe (desviación ya informada).
5. Fuera de alcance, sin tocar: inicio y tarjetas (3B.5), auditoría general de diseño adaptable y accesibilidad (3B.6),
   asignación formal y cambios en turnos, avisos, permisos o reposición.
6. Una corrida completa de Vitest, hecha mientras pytest usaba la máquina, tuvo un fallo por lentitud en `solicitud.test.tsx` («respeta los límites de cantidad», 7,5 s), un módulo ajeno a esta etapa. Ese archivo pasó 17/17 dos veces por separado, y la corrida completa sin carga dio 273/273.

## 13. Integridad del proyecto original

- Se trabajó solo en la copia aislada, rama `feature/turnos-incidencias-etapa1`.
- Huella de `git status` del original: `c7bcc85891211e218c43785c4ecae48c`, igual que antes de la etapa.
- Bases usadas: el contenedor desechable `cp-pruebas-etapa3` (127.0.0.1:55432), con la base visual y bases temporales
  `cp_<hex>_test` que se eliminan al terminar cada corrida.
- Sin migraciones, commits ni pushes. No se cambió ninguna configuración de conexión.

Lista para revisión. No se inició la 3B.5 ni la 3B.6.
