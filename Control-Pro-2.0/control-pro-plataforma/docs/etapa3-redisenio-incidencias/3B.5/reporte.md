# Etapa 3B.5: inicio, «Qué sigue» y tarjetas de incidencia

Copia aislada `C:\Users\Daniel\Documents\Control_Pro_etapa1_turnos`, rama `feature/turnos-incidencias-etapa1`.
Validación sobre la base desechable `cp_etapa2_visual_test` (contenedor `cp-pruebas-etapa3`, 127.0.0.1:55432).
Sin commits ni pushes, sin migraciones y **sin cambios de backend**.

## 1. Resumen de cambios

- **Inicio de la sucursal:** nueva sección «Incidencias que te esperan», justo después de las cifras de solicitudes.
  - Muestra el contador de la bandeja «Te toca» y hasta 3 tarjetas, cada una con su chip, su prioridad y qué hay que
    hacer.
  - Enlaza a «Te toca» y, si no hay pendientes, muestra un estado vacío útil.
  - Las incidencias que esperan a Lurima no aparecen.
- **Inicio de Lurima (panel):** nuevo bloque «Incidencias» en el inicio de quien tiene `incidencia.gestionar`.
  - Un indicador por bandeja de trabajo (Por atender, Por enviar, Reposiciones, Esperando a la sucursal), cada uno con
    enlace a su bandeja y un desglose por turno.
  - Las 3 más recientes de la bandeja inicial del perfil.
  - Reemplaza al indicador «Incidencias abiertas», que contaba con otro criterio.
- **`TarjetaIncidencia`:** un solo componente para la presentación resumida de una incidencia. Ahora lo usan:
  - la bandeja de la sucursal y las tarjetas móviles del panel, que tenían dos copias casi idénticas;
  - los dos inicios;
  - las solicitudes de la sucursal y el detalle de pedido del panel.
- **«Qué sigue» de la solicitud:** antes decía «N incidencia(s) abierta(s)». Ahora separa «N incidencias te esperan»
  (con enlace a cada una) de «N en seguimiento con Lurima», usando el `turno_actor` del backend.
- **Sin cálculo nuevo de turnos:** todos los números salen del `conteo` que ya devuelven las listas
  (`turno_service.conteo_bandejas`) y el texto de «qué hacer» sale de la tabla del bloque «Siguiente paso» de la 3B.4.

## 2. Auditoría inicial de los dashboards

| Pantalla | Fuente | Qué mostraba de incidencias | Problema |
|---|---|---|---|
| Inicio de la sucursal (`features/portal/Inicio.tsx`) | `/cuenta/resumen`, `/cuenta/pedidos`, `/cuenta/notificaciones` | Fila «Incidencias abiertas» en «Operación» (estados `abierta` y `en_atencion`) | Mezclaba las que esperan a la sucursal con las que esperan a Lurima; dejaba fuera las `resuelta` por confirmar; no había lista ni acceso directo a «Te toca». |
| Inicio del panel con `reporte.ver` (`Dashboard.tsx`, admin y encargado) | `/admin/reportes/dashboard` | «Incidencias abiertas» en «Alertas» | El mismo criterio por estado; no distinguía de quién es el turno ni enlazaba a una bandeja. |
| Inicio del panel sin `reporte.ver` (`PanelSolicitudes.tsx`, Atención y almacén) | `/admin/reportes/solicitudes` | Indicador «Incidencias abiertas» | Igual que el anterior. |
| Solicitud de la sucursal (`DetalleSolicitud.tsx`) | El pedido con sus `incidencias` | «Qué sigue» con «N abiertas»; tarjeta propia con el historial desplegable | Sin chip de turno ni prioridad; no decía cuáles esperan a la sucursal. |
| Detalle de pedido del panel (`Pedidos.tsx`) | El pedido con sus `incidencias` | Folio, estado, descripción y evidencias | Sin turno, prioridad ni actividad. |

Fuentes reutilizables encontradas:

- `/cuenta/incidencias` y `/admin/incidencias` ya devuelven, junto con la página, un `conteo` por turno calculado sobre
  **la misma consulta** que la lista (alcance y prioridad). Es lo que usan las pestañas de la 3B.2.
- `/cuenta/resumen` ya trae `incidencias_te_esperan` (`turno_service.resumen`). En la validación coincidió siempre con
  «Te toca»: 2, 3, 1 y 0.
- La propuesta (§8, D-9) preveía añadir contadores por turno a `panel_solicitudes`. **No hizo falta:** el conteo de la
  lista del panel ya los da con el alcance de cada usuario y es exactamente el número que muestra la pestaña.

## 3. Archivos modificados y nuevos

Todos bajo `Control-Pro-2.0/control-pro-plataforma/`.

**Nuevos:**

- `frontend/src/components/TarjetaIncidencia.tsx`
- `frontend/src/features/admin/ResumenIncidencias.tsx`
- `frontend/src/test/inicioincidencias.test.tsx` (15 pruebas)
- `docs/etapa3-redisenio-incidencias/3B.5/` (este informe y `capturas/`)

**Modificados (solo frontend):**

| Archivo | Cambio |
|---|---|
| `components/BandejasIncidencia.tsx` | `bandejasPanel(conEnvio, rol)`: la elección de bandejas del panel y de la bandeja inicial (D-5), antes dentro de `Posventa.tsx`, para usarla igual en el inicio. |
| `components/DetalleIncidencia.tsx` | `pasoSiguiente(turno, portal)` expone la tabla `PASOS` de la 3B.4; `SiguientePaso` la usa sin cambiar su comportamiento. |
| `features/portal/Inicio.tsx` | Sección `IncidenciasTeEsperan`; se quita la fila «Incidencias abiertas» de «Operación». |
| `features/admin/PanelSolicitudes.tsx` | `InicioAdmin` monta `ResumenIncidencias` si hay `incidencia.gestionar`; con él se oculta el KPI «Incidencias abiertas». |
| `features/admin/Dashboard.tsx` | Recibe el resumen y oculta la alerta «Incidencias abiertas» cuando lo muestra. |
| `features/admin/Posventa.tsx` | Usa `bandejasPanel` y `TarjetaIncidencia` en las tarjetas móviles. La tabla de escritorio no cambia. |
| `features/cuenta/Incidencias.tsx` | La bandeja de la sucursal usa `TarjetaIncidencia` (mismo contenido). |
| `features/cuenta/DetalleSolicitud.tsx` | `QueSigue` separa por `turno_actor`; `IncidenciaDeSolicitud` usa `TarjetaIncidencia`. |
| `features/admin/Pedidos.tsx` | Las incidencias del pedido usan `TarjetaIncidencia` con el chip del portal de Lurima. |
| `test/inicio.test.tsx` | El simulador responde a la nueva consulta de incidencias (antes devolvía pedidos para cualquier ruta) y hay 7 pruebas nuevas. Ninguna prueba existente se modificó. |

**Backend:** sin cambios.

## 4. Inicio de la sucursal

- **Una sola consulta:** `GET /cuenta/incidencias?por_pagina=3&turno=sucursal_responder,sucursal_recibir,sucursal_confirmar`.
  - El filtro sale de `filtroBandeja(BANDEJAS_SUCURSAL[0])` y el número de `contarBandeja(...)`: es la misma
    definición, consulta y número que la pestaña «Te toca».
- **Lo que no se muestra:** `lurima_atender`, `lurima_responder`, `lurima_reposicion` e `interna` no forman parte de
  «Te toca», así que no se piden ni se cuentan.
- **Cada tarjeta** (`TarjetaIncidencia` con `paso`) muestra:
  - folio y tipo;
  - chip de turno con antigüedad;
  - descripción en una línea;
  - qué hacer, de la misma tabla que «Siguiente paso»;
  - prioridad, solicitud y última actividad.

  Toda la tarjeta es el enlace a `/cuenta/incidencias/:id`.
- **Encabezado:** contador (ámbar si hay pendientes) y «Ir a «Te toca»» (`/cuenta/incidencias?bandeja=te_toca`). Si hay
  más de 3, también «Ver las N incidencias que te esperan».
- **Sin pendientes:** «No tienes incidencias pendientes. Aquí aparecerán las que esperen tu respuesta, una recepción o tu
  confirmación.», con enlace a todas.
- **Si falla la consulta:** la sección muestra el error y «Reintentar»; el resto del inicio sigue funcionando.
- **Posición:** después de las cifras de solicitudes y antes de «Distribución» y «Operación», para dar prioridad a lo
  que requiere acción sin desplazar el saludo ni los accesos principales.
- **Fila retirada de «Operación»:** «Incidencias abiertas». Repetía un contador con otro criterio, que en la demo daba 5
  mientras «Te toca» daba 2.
- **Orden:** el de la lista (las más recientes primero). El backend no ordena por prioridad, así que la prioridad se
  muestra en cada tarjeta pero no se reordena (véase §12).

Casos evaluados en la app real:

| Caso | Resultado |
|---|---|
| Responder (INC-9, crítica) | Aparece con «Te toca responder» y «Responde a Lurima en la conversación.» |
| Recibir (INC-6, alta) | «Te toca recibir la reposición» y el paso de recepción. Tras registrarla, el inicio la muestra en «Te toca confirmar la solución». |
| Confirmar (INC-5, media) | «Te toca confirmar la solución». Tras confirmarla, sale del inicio. |
| Ninguna pendiente | Contador 0 y el estado vacío (captura 04). |
| Varias prioridades | Crítica, Alta y Media visibles a la vez (captura 01/02). |

## 5. Inicio de Lurima

- **Dónde:** `InicioAdmin` lo monta en `Dashboard` (perfiles con `reporte.ver`) o en `PanelSolicitudes` (Atención,
  almacén), solo con `incidencia.gestionar`, el mismo permiso que exige `/admin/incidencias`. Sin ese permiso no se
  consulta nada y el indicador anterior sigue como estaba.
- **Una sola consulta:** `GET /admin/incidencias?por_pagina=3&<filtro de la bandeja inicial>`. Su `conteo` da todos
  los indicadores y sus 3 elementos son la vista previa.
- **Indicadores:** las bandejas de trabajo de `bandejasPanel`, es decir, las mismas pestañas que el usuario ve en la
  lista.

  | Indicador | Turnos o filtro | Desglose (solo lectura del conteo) |
  |---|---|---|
  | Por atender (acción) | `lurima_atender`, `lurima_responder`, `interna` | «N sin atender · N con respuesta de la sucursal · N interna(s)» |
  | Por enviar (acción, solo con `surtido.operar`) | filtro logístico `por_enviar` | — |
  | Reposiciones | `lurima_reposicion` | — |
  | Esperando a la sucursal | `sucursal_responder`, `sucursal_recibir`, `sucursal_confirmar` | «N respuesta · N recepción · N confirmación» |

  - Cada indicador enlaza a `/admin/incidencias?bandeja=<clave>`.
  - Los de acción se resaltan en ámbar cuando son mayores que 0.
  - Las bandejas de turno son excluyentes, así que ninguna incidencia cuenta dos veces (hay una prueba que lo verifica).
- **Omitidos a propósito:**
  - «Cerradas» y «Todas»: no son trabajo pendiente y siguen a un clic en la lista.
  - Porcentajes, tiempos de atención e indicadores de desempeño: no hay datos fiables (el turno no registra
    responsables formales) y la etapa lo prohíbe.
- **Vista previa:** «Lo más reciente en «<bandeja inicial>»» con hasta 3 tarjetas que enlazan al detalle. El botón
  «Volver» del detalle regresa a esa bandeja.
  - La bandeja inicial es la misma que en la lista: «Por atender» para Atención y «Por enviar» para el almacén.
  - Aquí no se repite el texto de siguiente paso: en el panel es igual para todas las «Por atender» y el chip ya lo
    dice.
- **Indicador «Incidencias abiertas» (estado):** se oculta cuando se muestra el resumen.
  - Cuenta por estado (`abierta` y `en_atencion`), mientras que las bandejas cuentan por turno e incluyen las
    `resuelta` por confirmar. Mostrar ambos daría dos números distintos para «lo pendiente».
  - Para perfiles sin `incidencia.gestionar` (por ejemplo finanzas o el aprobador) sigue igual.

## 6. «Qué sigue»

En el proyecto hay dos niveles, cada uno ya existente. Se ampliaron sin crear un tercero:

| Nivel | Componente | Qué hace en la 3B.5 |
|---|---|---|
| Solicitud | `QueSigue` (`DetalleSolicitud.tsx`) | Conserva su paso de la solicitud (`proximoPaso`). Para las incidencias distingue «N incidencias te esperan: INC-…» (acción del usuario, con enlace) de «N en seguimiento con Lurima» (acción de otra área). Las cerradas no se mencionan. |
| Incidencia | `SiguientePaso` (3B.4) | Sin cambios de comportamiento. Su tabla se expone con `pasoSiguiente` para que la tarjeta diga lo mismo. |

- Las cuatro situaciones que pide la etapa se distinguen con datos del backend, sin reglas nuevas:

  | Situación | Señal | Presentación |
  |---|---|---|
  | Acción pendiente del usuario | `turno_actor === portal` | Chip ámbar, verde o coral con «Te toca…» y, en el inicio de la sucursal, qué hacer. |
  | Acción de otra persona o área | `turno_actor` del otro lado | Chip gris («Esperando a…»). |
  | En seguimiento | `lurima_reposicion` | Chip azul. |
  | Cerrada | `cerrada` | Chip gris «Cerrada»; no se cuenta. |

- No se inventan responsables: el texto sale de la tabla de la 3B.4 (Lurima, Tu sucursal…) y no hay asignación a
  personas.
- Sin repetición: el chip dice de quién es el turno; la línea de paso dice qué hacer (solo en el inicio de la sucursal);
  «Qué sigue» solo cuenta y enlaza.

## 7. `TarjetaIncidencia`

Archivo: `components/TarjetaIncidencia.tsx`. Reutiliza `ChipTurno`, `PrioridadIncidencia`, `haceTiempo` y
`tipoIncidencia`.

- **Props:** `i`, `portal`, `a` (ruta del detalle), `state`, `etiqueta` (`aria-label`), `contexto` (datos propios del
  lugar), `paso` y `children`.
- **Dos formas en el mismo componente:**

  | Forma | Cuándo | Comportamiento |
  |---|---|---|
  | **Enlace** | Sin `children` (bandejas e inicios) | Toda la tarjeta es un `<Link>`; la descripción se recorta a una línea. |
  | **Tarjeta** | Con `children`, aunque hoy vengan vacíos (solicitudes, por sus evidencias y reposiciones) | No es un enlace, para no anidar controles; descripción completa y pie «Abrir incidencia». |

  Sin `a` (perfil sin acceso al detalle) no hay enlace.
- **Accesibilidad:** solo es interactivo lo que navega. El nombre accesible incluye el texto visible:
  - «Gestionar INC-…» en las bandejas del panel, como antes;
  - «Abrir incidencia INC-…» en el pie de la tarjeta.

Dónde se usa:

| Contexto | Portal | Forma | `contexto` | `paso` |
|---|---|---|---|---|
| Inicio de la sucursal | sucursal | enlace | Solicitud | sí |
| Inicio de Lurima | lurima | enlace | Solicitud · sucursal | no |
| Bandeja de la sucursal | sucursal | enlace | Solicitud · Estado | no |
| Bandeja del panel (< 1024 px) | lurima | enlace | Referencia · sucursal | no |
| Solicitud de la sucursal | sucursal | tarjeta | Persona · Estado (+ evidencias y reposiciones) | no |
| Detalle de pedido del panel | lurima | tarjeta | Persona · Estado (+ evidencias) | no |

Las dos listas que antes tenían su propio marcado (bandeja de la sucursal y tarjetas móviles del panel) ahora usan el
componente. Las pruebas existentes de esas listas pasan sin modificarse.

## 8. Integración con solicitudes

- **Solicitud de la sucursal:** las incidencias usan la tarjeta común (forma «tarjeta»). Conservan:
  - persona y artículo;
  - evidencias;
  - envíos de reposición (`ListaReposiciones`);
  - el enlace a `/cuenta/incidencias/:id`.

  Ganan chip de turno, prioridad y última actividad.
- **Decisión: se retiró el historial desplegable de cada tarjeta de la solicitud.**
  - Desde la 3B.3 y la 3B.4 la conversación completa vive en la página de la incidencia, a un clic.
  - Mantenerlo duplicaba información y convertía toda la cabecera en un botón.
  - Igual que el texto anterior «Abrir conversación / Confirmar o reabrir», ahora el chip dice qué toca y el pie abre el
    detalle.
- **Detalle de pedido del panel:** la misma tarjeta con el portal de Lurima. El enlace solo aparece con
  `incidencia.gestionar`, igual que antes.
- **Sin cambios** en las reglas de solicitudes, autorizaciones, reposición ni recepción: solo cambia la presentación.

## 9. Fuentes de datos y endpoints

| Pantalla | Petición | Nueva | Notas |
|---|---|---|---|
| Inicio de la sucursal | `GET /cuenta/incidencias?por_pagina=3&turno=…` | sí (1 consulta) | Endpoint existente, alcance de la sucursal y `conteo` de la 3B.2. |
| Inicio del panel | `GET /admin/incidencias?por_pagina=3&<bandeja inicial>` | sí (1 consulta) | Endpoint existente, `incidencia.gestionar` y alcance por sucursal. |
| Solicitud (ambos portales) | La del pedido | no | Lee `turno` y `turno_actor` de las incidencias que ya trae. |

- **Caché:** las claves `['mis-incidencias', 'inicio']` y `['admin-incidencias', 'inicio', …]` comparten prefijo con
  las listas. Las invalidaciones existentes (recepción, mensajes, cambios) también refrescan los inicios; se comprobó
  con la recepción de INC-6.
- **Coste:** cada inicio pide 3 elementos, no la lista completa. El conteo usa el cálculo de turnos existente sobre las
  candidatas, con el mismo atajo documentado de la Etapa 1.
- **Sin endpoints nuevos ni cambios de backend.** D-9 quedó cubierto por el conteo de la lista.

## 10. Pruebas

### Pruebas nuevas

- **Vitest, `inicio.test.tsx` (+7):**
  - pide solo «Te toca» y muestra responder, recibir y confirmar con su prioridad y qué hacer;
  - el contador no suma las de Lurima;
  - la tarjeta abre el detalle;
  - el enlace lleva a `?bandeja=te_toca`;
  - con más de 3 ofrece ver todas con el total;
  - el estado vacío aparece aunque haya incidencias esperando a Lurima;
  - un error se puede reintentar sin romper el inicio;
  - «Operación» ya no repite el contador.
- **Vitest, `inicioincidencias.test.tsx` (15):**
  - Resumen del panel:
    - indicadores, enlaces y desglose para Atención;
    - sin duplicados (la suma de indicadores es igual a la suma de turnos activos);
    - las tarjetas abren el detalle y no repiten el texto del chip;
    - el almacén ve «Por enviar» como bandeja inicial;
    - sin pendientes;
    - `InicioAdmin` con permiso (reemplaza el KPI) y sin permiso (no consulta incidencias).
  - `TarjetaIncidencia`:
    - forma enlace;
    - el chip por portal y el paso solo cuando el turno es de quien mira;
    - forma tarjeta;
    - forma tarjeta con contenido vacío;
    - sin acceso al detalle.
  - `QueSigue`:
    - separa «te espera» y «con Lurima»;
    - ignora las cerradas;
    - las tarjetas de la solicitud enlazan al detalle.
- **Mutación:** rompí a propósito tres reglas: el filtro «Te toca», la condición `turno_actor` del paso y el criterio
  de `QueSigue`. Las pruebas fallaron (4 fallos) y después restauré los archivos idénticos.

### Resultados

| Verificación | Línea base 3B.4 | 3B.5 |
|---|---|---|
| `tsc -b --noEmit` | OK | OK |
| `vite build` | OK | OK (20 s, sin advertencias) |
| Vitest | 273/273 | **295/295** (35 archivos; +22 nuevas) |
| pytest (base desechable) | 291 | **291 passed** en una sola corrida (24 min 45 s); 8 advertencias de SQLAlchemy ya existentes |

Las pruebas existentes de bandejas, detalle, conversación, recepción, flujo del portal e inicio pasan sin modificarse.
La única adaptación fue el simulador de `inicio.test.tsx`, que antes respondía con pedidos a cualquier ruta y ahora
responde a la nueva consulta de incidencias.

## 11. Evidencias de Playwright

Capturas en [capturas/](capturas/), sobre la app real de la copia (5180 → 5055) con la base visual:

| Captura | Qué muestra |
|---|---|
| `01-sucursal-inicio-pendientes-{1440,768,390}` | Inicio de la sucursal con 3 pendientes: responder (crítica), recibir (alta) y confirmar (media). |
| `02-sucursal-seccion-{1440,768,390}` | Detalle de la sección «Incidencias que te esperan». |
| `03-lurima-inicio-{1440,768,390}` | Atención: Por atender 4 (2 sin atender · 2 con respuesta), Reposiciones 0, Esperando a la sucursal 3 (1 · 1 · 1). |
| `04-sucursal-inicio-sin-pendientes-{1440,768,390}` | Estado vacío real, tras responder INC-9, confirmar INC-5 y recibir y confirmar INC-6. |
| `05-solicitud-que-sigue-{1440,768,390}` | PED-2026-000001: «2 incidencias te esperan: INC-5, INC-9» y «3 en seguimiento con Lurima». |
| `06-solicitud-tarjetas-{1440,768,390}` | Tarjetas de incidencias en la solicitud de la sucursal. |
| `07-almacen-qro-{1440,390}` | Almacén Querétaro: 4 indicadores con «Por enviar» y vista previa de «Por enviar». |
| `08-almacen-pue-sin-pendientes-{1440,390}` | Almacén Puebla (sin incidencias en su alcance): todo en 0 y estado vacío. |
| `09-panel-pedido-tarjetas-{1440,768,390}` | Detalle de pedido del panel con las tarjetas y el chip de Lurima. |
| `10-lurima-inicio-oscuro-1440` | Modo oscuro (referencia para la 3B.6). |

Comprobaciones:

- **Conteos:**
  - Inicio de la sucursal, pestaña «Te toca» y `/cuenta/resumen.incidencias_te_esperan`: iguales en cada momento (2, 3,
    1 y 0).
  - Indicadores del panel y `conteo` de `/admin/incidencias`: iguales para Atención, QRO y PUE.
  - «Esperando a la sucursal: 2»: la pestaña mostró 2 y la tabla 2 filas.
- **Enlaces:**
  - tarjeta del inicio → `/cuenta/incidencias/5`;
  - «Ir a «Te toca»» → pestaña «Te toca»;
  - indicador → `?bandeja=esperando`;
  - tarjeta del panel → `/admin/incidencias/8`, con «Volver a «Por atender»»;
  - «Qué sigue» → INC-5;
  - pie de la tarjeta de la solicitud → INC-9;
  - tarjeta del pedido del panel → `/admin/incidencias/5`.
- **Desplazamiento horizontal:** `scrollWidth` igual a `clientWidth` en 1440, 768 y 390 en todas las pantallas
  revisadas. Lo único que sobresale es el fondo decorativo (recortado) y la línea de tiempo con desplazamiento interno.
- **Consola:** solo los errores previos (401 de `/api/auth/refresh` al entrar y 403 de `/api/admin/conversaciones`,
  W3). No hay errores nuevos.
- **Jerarquía:** el bloque de incidencias del panel va primero, con un acento ámbar solo en lo accionable. En la
  sucursal, la sección queda después de las cifras y las cerradas no compiten.

**Ajustes hechos durante la validación:**

1. Con 3 indicadores, la rejilla de 4 columnas dejaba un hueco; ahora usa 3 columnas.
2. «1 nuevas» → «1 sin atender».
3. El texto de paso se quitó de las tarjetas del panel porque repetía el chip.
4. Las incidencias sin evidencias del pedido del panel tomaban otra forma; ahora todas usan la forma «tarjeta».
5. El enlace del pie tenía la etiqueta «Gestionar…» con el texto «Abrir incidencia»; se alineó con la etiqueta
   predeterminada (WCAG 2.5.3).

## 12. Observaciones y pendientes

1. **Datos de la base visual modificados durante la validación**, con los flujos normales de la app:
   - INC-5: resuelta por Atención y confirmada por la sucursal (cerrada).
   - INC-9: la sucursal respondió (ahora `lurima_responder`).
   - INC-6: reposición PAQ-2026-000005 recibida completa y confirmada (cerrada).

   INC-6 ya no sirve para probar a mano la recepción desde la incidencia (estado de la 3B.4). Si la necesitas, se puede
   reconstruir con `reset_visual.sh` y `escenario.py`.
2. **Orden por prioridad (fuera de alcance):** las listas, y por tanto los inicios, ordenan por más recientes. Ordenar
   por prioridad sería un cambio de backend (orden de la consulta) que la etapa no pedía. Se propone para valorarlo
   después.
3. **3B.6, modo oscuro:**
   - el indicador ámbar del panel (`bg-amber-50`) pierde contraste en el desglose;
   - el menú lateral del panel también se ve tenue (ya pasaba antes);
   - se suma a `ListaReposiciones`, ya anotado.
4. **Decisión abierta de la 3B.4 (sin cambios):** ocultar «Preparar reposición» y «Cancelar» a Atención.
5. **D-9:** no se implementó el cambio de backend de la propuesta porque el conteo de la lista lo cubre con el mismo
   alcance. Si en el futuro se quiere el resumen sin pedir 3 elementos, bastaría con `por_pagina=1`.

## 13. Aislamiento e integridad del original

- Trabajo solo en la copia (`Control_Pro_etapa1_turnos`, rama `feature/turnos-incidencias-etapa1`, sin remotos).
- **Backend de la copia:** `entorno.sh` aborta si `DATABASE_URL` no apunta a `127.0.0.1:55432/cp_*_test`. Se usó
  `cp_etapa2_visual_test`.
- **pytest:** con `scripts/pytest_desechable.py`, que crea y borra bases `cp_<hex>_test` en el mismo contenedor.
- **Original:** `git status --porcelain | md5sum` = `c7bcc85891211e218c43785c4ecae48c` (esperada `c7bcc85891211e218c43785c4ecae48c`).
  No se tocó su base ni su configuración. Las capturas pasaron por `.playwright-mcp/` (carpeta sin seguimiento) y se
  movieron a la copia.
- Sin commits, pushes ni migraciones. No se empezó la 3B.6.
