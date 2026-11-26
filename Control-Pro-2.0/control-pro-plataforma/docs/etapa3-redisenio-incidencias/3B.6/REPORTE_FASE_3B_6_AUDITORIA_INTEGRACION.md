# Fase 3B.6: auditoría y preparación para integrar las mejoras de incidencias

Fecha: 25-nov-2026. Solo inspección y validación: no se modificó la línea principal, no hay commits, pushes ni merges, y
no se tocó ninguna base de datos original. Las comprobaciones de integración se hicieron sobre exportaciones de `HEAD`
en una carpeta temporal fuera de ambos proyectos.

## 1. Resumen ejecutivo

- **La línea principal no avanzó** desde que se creó la copia.
  - `main` local, `origin/main` y el `main` remoto (consultado con `git ls-remote`, de solo lectura) están en
    `db2113b`, el mismo commit base de la copia.
  - Ninguna rama local ni remota tiene commits fuera de `main`.
- **Todo el trabajo de la copia está sin confirmar y pertenece al programa de incidencias:**
  - Etapa 1 (turnos);
  - Etapa 2 (avisos);
  - Etapas 3B.1 a 3B.5.

  No hay cambios de otros módulos, de configuración, de dependencias, de modelos ni de migraciones.
- **El original tiene trabajo propio sin confirmar** (F-01, alcance de clientes por sucursal, y documentos). No comparte
  ningún archivo con la copia.
- **Simulación de integración:** `HEAD` del original, más su trabajo local, más los cambios de la copia. Resultados:
  - pytest: **297 passed** (las 291 de la copia más las 6 de `test_alcance_clientes.py` del trabajo local);
  - el parche de la copia aplica limpio sobre `HEAD` (`git apply --check`, código 0).
- **Pruebas de la copia iguales a la referencia:**

  | Validación | Resultado |
  |---|---|
  | Vitest | 295/295 |
  | pytest | 291 passed |
  | TypeScript | sin errores |
  | Build | correcto |

  La revisión funcional sobre la app real no encontró regresiones.
- **Un defecto visual que conviene corregir antes de integrar:** `ListaReposiciones` es ilegible en modo oscuro
  (contraste ≈1:1). Es anterior a estas etapas, pero ahora aparece en la página de detalle.
- **Dictamen: LISTO CON OBSERVACIONES.** No hay conflictos técnicos. Quedan decisiones que requieren tu autorización
  (§10).

## 2. Estado de ambas versiones

| | Línea principal | Copia aislada |
|---|---|---|
| Ruta | `C:\Users\Daniel\Documents\Control_Pro` | `C:\Users\Daniel\Documents\Control_Pro_etapa1_turnos` |
| Rama activa | `main` | `feature/turnos-incidencias-etapa1` |
| HEAD | `db2113b` («Actualización de ultimas observaciones…», 24-nov) | `db2113b` (el mismo) |
| Remoto | `origin` (GitHub); `main` remoto = `db2113b` | sin remotos |
| Commits diferenciales | ninguno | ninguno: todo el trabajo está sin confirmar |
| Cambios sin confirmar | 5 modificados y 15 sin seguimiento (más `.playwright-mcp/` y `recursos/`) | 19 modificados y 136 nuevos (106 son capturas) |
| Otras referencias | worktree externo `…/kilo/worktree-pool/…` en `db2113b` (HEAD separado); 10 ramas locales, todas ya incluidas en `main` | rama `main` local = `db2113b` |
| `core.autocrlf` | `true` (árbol de trabajo en CRLF) | `true`; 9 archivos editados quedaron en LF (Git los normaliza al confirmar) |
| Migraciones | 24 | 24 (sin cambios) |
| Huella `git status --porcelain \| md5sum` | `c7bcc85891211e218c43785c4ecae48c` antes y después de esta auditoría | — |

Trabajo local sin confirmar del original, que debe preservarse:

| Archivo | Contenido | ¿Coincide con la copia? |
|---|---|---|
| `backend/app/api/admin_sistema.py`, `admin_sucursales.py` | F-01: limitar clientes, pedidos y pagos al alcance por sucursal | No |
| `backend/tests/test_alcance_clientes.py` (nuevo) | Pruebas de F-01 (6) | No |
| `backend/seeds/generar_imagenes.py` (nuevo) | Utilidad de imágenes | No |
| `frontend/package-lock.json` | Cambio de dependencias bloqueadas | No |
| `frontend/tsconfig.tsbuildinfo`, `repomix-output.xml` | Artefactos generados | No (no se integran) |
| `CLAUDE.md`, `.claude/…`, `docs/auditoria-*.md`, `docs/plan-rediseno-ux-incidencias.md`, `docs/especificacion-funcional-incidencias-fase3.md`, `docs/mapa-tecnico-operativo-control-pro.md` | Documentación y reglas locales | No (rutas distintas a `docs/etapa3-redisenio-incidencias/`) |

## 3. Inventario de cambios

Clasificado por el contenido de cada diff, no por el nombre del archivo. Rutas relativas a
`Control-Pro-2.0/control-pro-plataforma/`.

### 3.1 Por bloque funcional

| Bloque | Archivos | Evidencia |
|---|---|---|
| **Etapa 1: turnos** (previa a 3B) | `backend/app/services/turno_service.py` (nuevo), `backend/tests/test_turnos.py` (nuevo), `backend/app/services/reporte_service.py` (+2: `turno_srv.resumen` en el dashboard), `backend/app/api/cuenta.py` (resumen: `incidencias_te_esperan`), `docs/etapa1-turnos-incidencias.md` | `docs/etapa1-turnos-incidencias.md` |
| **Etapa 2: avisos** (previa a 3B) | `backend/app/services/aviso_incidencia.py` (nuevo), `services/comun.py` (`notificar_usuarios`, aviso al crear), `services/devolucion_service.py` (avisos por entrada de seguimiento), `services/logistica_service.py` (avisos de paquetes de reposición), `backend/tests/test_avisos_incidencias.py` (nuevo), `frontend/src/features/cuenta/Notificaciones.tsx`, `docs/etapa2-*.md` | `docs/etapa2-notificaciones-incidencias.md` |
| **3B.1: base de presentación** | `backend/app/api/serial.py` (`turno`, `turno_actor`, `turno_desde`, `ultima_actividad`, `lado`, `clase`, `reposicion_de`, `cliente`), `backend/tests/test_clase_seguimiento.py`, `frontend/src/api/tipos.ts`, `lib/formato.ts` (`haceTiempo`), `components/ChipTurno.tsx`, `test/chipturno.test.tsx` | `3B.1/informe.md` |
| **3B.2: bandejas y contadores** | `backend/app/api/admin_operacion.py` y `cuenta.py` (`conteo`, `?turno=`, `?por_enviar=`, `?prioridad=`), `backend/tests/test_bandejas.py`, `components/BandejasIncidencia.tsx`, `components/PrioridadIncidencia.tsx`, `features/admin/Posventa.tsx`, `features/cuenta/Incidencias.tsx`, `test/bandejas.test.tsx` | `3B.2/reporte.md` |
| **3B.3: detalle y navegación** | `features/admin/IncidenciaDetalle.tsx` (nuevo), `components/DetalleIncidencia.tsx`, `app/router.tsx` (rutas de detalle), `Notificaciones.tsx` y `aviso_incidencia.py` (enlaces), `test/detalleincidencia.test.tsx` | `3B.3/reporte.md` |
| **3B.4: conversación y acciones** | `DetalleSolicitud.tsx` (`HistorialIncidencia`, `RecepcionPaquete` exportado), `IncidenciaDetalle.tsx`, `DetalleIncidencia.tsx` (`SiguientePaso`), `Incidencias.tsx`, `backend/tests/test_permisos_reposicion.py`, `test/conversacionincidencia.test.tsx` | `3B.4/reporte.md` |
| **3B.5: inicios y tarjetas** | `components/TarjetaIncidencia.tsx`, `features/admin/ResumenIncidencias.tsx` (nuevos), `features/portal/Inicio.tsx`, `features/admin/Dashboard.tsx`, `PanelSolicitudes.tsx`, `Pedidos.tsx`, `test/inicio.test.tsx`, `test/inicioincidencias.test.tsx` | `3B.5/reporte.md` |
| **Documentación** | `docs/etapa3-redisenio-incidencias/` (01–03 y los reportes de 3B.1–3B.6) más 106 capturas (≈60 MB) | — |

### 3.2 Por categoría

| Categoría | Archivos |
|---|---|
| **Propios del módulo de incidencias** | `turno_service.py`, `aviso_incidencia.py`, `ChipTurno.tsx`, `PrioridadIncidencia.tsx`, `BandejasIncidencia.tsx`, `DetalleIncidencia.tsx`, `TarjetaIncidencia.tsx`, `IncidenciaDetalle.tsx`, `ResumenIncidencias.tsx`, `features/cuenta/Incidencias.tsx`, `features/admin/Posventa.tsx` (sección de incidencias), sus pruebas y los documentos |
| **Compartidos con otros módulos (revisar con atención)** | Backend: `serial.py` (serializador común), `comun.py` (notificaciones de todo el sistema), `devolucion_service.py`, `logistica_service.py` (despacho y eventos de todo paquete), `cuenta.py` (resumen del inicio), `reporte_service.py` (dashboard), `admin_operacion.py`. Frontend: `api/tipos.ts`, `app/router.tsx`, `lib/formato.ts`, `features/cuenta/DetalleSolicitud.tsx`, `features/cuenta/Notificaciones.tsx`, `features/admin/Pedidos.tsx` (también lo usa el aprobador), `features/admin/Dashboard.tsx`, `features/admin/PanelSolicitudes.tsx` (también el inicio del aprobador), `features/portal/Inicio.tsx`, `test/inicio.test.tsx` |
| **Infraestructura o configuración** | Ninguno (ni `package.json`, lockfiles, Vite, Tailwind, `index.css`, `config.py`, `.env`, modelos ni migraciones) |
| **Preexistentes en la copia antes de 3B** | Etapa 1 y Etapa 2 (§3.1). La 3B depende de ellas: `turno_service` alimenta turnos y contadores, y `aviso_incidencia` los enlaces de los avisos. |
| **Nuevos** | 136 (30 de código, pruebas o documentos, y 106 capturas) |
| **Eliminados** | Ninguno |
| **Requieren revisión manual** | (1) `logistica_service.py` y `comun.py`: pasan por funciones que usan todos los paquetes y todos los avisos al personal (los paquetes normales conservan su aviso; cambia la estructura del código). Sus pruebas pasan, pero conviene leer el diff. (2) `admin_operacion.py`: el filtro `?estado=` ahora se aplica después del conteo; es compatible y está cubierto por `test_bandejas.py`. (3) `Pedidos.tsx` y `PanelSolicitudes.tsx`: los usa también el perfil aprobador; validado sin `incidencia.gestionar`. (4) Las 106 capturas (≈60 MB): decidir si se versionan. |

**Archivos compartidos con riesgo de conflicto en la integración: ninguno con conflicto textual hoy.** Ninguno de los 49
archivos de la copia está modificado en `main` ni en el trabajo local del original. El riesgo aparecería solo si
alguien cambiara `main` antes de integrar; véase el paso 0 del plan (§8).

## 4. Resultados de pruebas

| Validación | Referencia | Copia (3B.6) | Simulación de integración |
|---|---|---|---|
| Vitest | 295/295 | **295/295** (35 archivos) | No aplica: el trabajo local del original no toca el frontend fuente |
| pytest | 291 | **291 passed** (24 min 58 s; base `cp_d6e6f38ec4b1_test`, eliminada al terminar) | **297 passed** (24 min 33 s; base `cp_aeebed830b54_test`, eliminada al terminar) |
| TypeScript (`tsc -b --noEmit`) | sin errores | **sin errores** | — |
| Build (`vite build`) | correcto | **correcto** (21,7 s). Aviso de chunk por `colaboracion/Mensajes.tsx`, importado de forma estática y dinámica; las mismas importaciones están en `HEAD`, así que es previo. | — |
| `git apply --check` sobre `HEAD` | — | — | **código 0**, tanto en modo estricto como ignorando espacios |

Las 8 advertencias de pytest son las de SQLAlchemy ya existentes. El conteo de 297 confirma que la integración no
interfiere con las pruebas del trabajo local F-01.

Verificación funcional sobre la app real (copia, 5180 → 5055, base `cp_etapa2_visual_test`). **Sin modificar datos:**
solo lecturas y dos POST que el backend rechaza con 403.

| Verificación | Resultado |
|---|---|
| Rutas de la sucursal (`/cuenta`, `/cuenta/incidencias`, `/cuenta/incidencias/7`, `/cuenta/pedidos/1`, `/cuenta/notificaciones`) | Cargan con su encabezado; sin error de aplicación |
| Rutas del panel (`/admin`, `/admin/incidencias`, `/admin/incidencias/9`, `/admin/pedidos/1`, `/admin/notificaciones`) | Cargan con su `h1`; sin error |
| Contadores del panel (pestaña frente a total de la lista filtrada) | Por atender 5/5 · Reposiciones 0/0 · Esperando 0/0 · Cerradas 4/4 · Todas 9/9 |
| Contadores de la sucursal | Te toca 0/0 · Esperando 5/5 · Reposición 0/0 · Cerradas 4/4 · Todas 9/9; `incidencias_te_esperan` = 0 |
| Filtros conservados | Panel: `?bandeja=todas&prioridad=alta` → detalle → «Volver» lleva a la misma URL. Sucursal: `?bandeja=esperando&pagina=1`, igual. |
| Avisos que abren el detalle correcto | Sucursal: 6/6. Panel: 5/5 con enlace nuevo y un clic real llevó a `/admin/incidencias/6`. Los 10 avisos anteriores a la 3B.3 (`?abrir=N`) redirigen al detalle (probado `?abrir=7` → `/admin/incidencias/7`, D-11). |
| Mensajes frente a eventos | INC-9 (panel): 2 mensajes y 1 evento. INC-5 (sucursal): 4 mensajes y 1 evento, con «Solución confirmada». |
| Siguiente paso según el turno | INC-9 (`lurima_responder`): «Atención (Lurima): la sucursal escribió…». INC-5 (cerrada): «Esta incidencia está cerrada…». |
| Permisos visuales iguales a los del backend | Atención: `POST /admin/paquetes/:id/despachar` y `/eventos` → 403. La interfaz no le muestra esas acciones (3B.4). |
| Recepción y reposiciones | Reglas cubiertas por pytest (`test_recepcion_reposicion`, `test_permisos_reposicion`): pasan. D-6 y recepción desde la incidencia, validados en la 3B.4 y la 3B.5. |
| Paneles | Indicadores iguales al `conteo` de la API (3B.5); sin cambios desde entonces |
| Consola | Sin errores de página. Solo los previos: 401 de `/api/auth/refresh` al iniciar sesión y 403 de `/api/admin/conversaciones` (W3). |

Datos de prueba: esta auditoría no los modificó. El estado actual de la base visual es el que documenta la 3B.5 (§12):
INC-5 e INC-6 cerradas, INC-9 esperando a Lurima.

## 5. Conflictos y riesgos identificados

| # | Riesgo | Probabilidad e impacto | Mitigación |
|---|---|---|---|
| R1 | **Trabajo local sin confirmar en el original** (F-01 y otros). Una operación sobre su árbol de trabajo (cambio de rama, stash, merge) podría mezclarlo o perderlo. | Media / alto | Integrar en un **worktree separado** (§6): el árbol de trabajo del original no se toca. Respaldo previo del trabajo local (§9). |
| R2 | **Etapas 1 y 2 entran con la 3B.** No son opcionales: la 3B depende de `turno_service` y `aviso_incidencia`. | Segura / medio | Requiere tu confirmación explícita de que E1 y E2 están aprobadas para integrarse (§10). |
| R3 | **Funciones de avisos compartidas** (`logistica_service`, `comun`). Los paquetes normales conservan el texto y el enlace de siempre (`aviso_paquete` devuelve el aviso original y `/cuenta/pedidos/:id`); solo los de reposición cambian de texto y llevan a la incidencia. `notificar_personal` se dividió en `notificar_usuarios`, que usan todos los avisos al personal. | Baja / medio | Pruebas `test_avisos_incidencias` y las existentes de logística y notificaciones pasan. Leer el diff antes de integrar. |
| R4 | Que `main` avance antes de integrar (otro desarrollador). | Baja / medio | Paso 0 del plan: comprobar con `git ls-remote` y, si avanzó, rehacer `git apply --check` y la simulación. |
| R5 | Finales de línea: 9 archivos en LF en la copia y CRLF en el original. | Baja / bajo | Git normaliza al confirmar (`autocrlf=true`); revisar `git diff --stat` en el worktree antes de confirmar. Un diff de archivo completo indicaría un problema. |
| R6 | **Bases de datos:** que alguien ejecute pruebas o la app de la integración contra la base de trabajo. | Baja / crítico | No hay migraciones ni modelos nuevos. pytest solo con `scripts/pytest_desechable.py` (crea y borra `cp_<hex>_test` y rechaza otras bases). No ejecutar `flask db upgrade` ni seeds. |
| R7 | Tamaño del repositorio si se versionan las 106 capturas (≈60 MB). | Segura / bajo | Decidir si se incluyen o se archivan fuera (§10). |
| R8 | Worktree externo de otra herramienta (`kilo`) apuntando a `db2113b`. | Baja / bajo | No se toca. La integración usa otra ruta y otra rama. |
| R9 | Perfil aprobador: `Pedidos.tsx` y `PanelSolicitudes.tsx` cambiaron. | Baja / bajo | Sin `incidencia.gestionar` conserva su indicador y no consulta incidencias (prueba `inicio del panel: sin incidencia.gestionar`). Las tarjetas del pedido no ofrecen enlace sin permiso. |

## 6. Estrategia de integración recomendada

| Alternativa | Ventajas | Riesgos y conflictos |
|---|---|---|
| **A. Commits por bloque en la copia + merge en una rama de integración** (recomendada) | Base idéntica a `main`, así que el merge es directo, sin conflictos. Conserva el historial por etapa (E1, E2, 3B.x, docs), lo que facilita revisar y revertir por bloque. Se revisa en un PR. | Requiere hacer commits en la copia (autorización). Hay que traer la rama de la copia al repositorio original (`git fetch` desde la ruta local), lo que añade objetos a su `.git`, sin tocar ramas ni árbol de trabajo. |
| B. Cherry-pick selectivo | Permite elegir bloques. | Hoy no hay commits que elegir; tras la alternativa A sería equivalente. No hace falta porque no hay nada que excluir. |
| C. Parche + paquete de archivos (`git apply`) | Probado: aplica limpio. No toca el `.git` de la copia. | Un solo bloque sin historial por etapa. Los archivos nuevos van aparte (tar) y los binarios (capturas) también. Más trabajo manual. Es la alternativa de respaldo si no quieres commits en la copia. |
| D. Combinación manual por archivo | — | Innecesaria: no hay archivos en conflicto. Introduciría riesgo de error humano. |

**Recomendación: alternativa A, en un worktree separado.**

- La integración ocurre en `C:\Users\Daniel\Documents\Control_Pro_integracion_3b` (nuevo), creado desde `main` con una
  rama nueva.
- El árbol de trabajo del original, con su trabajo local F-01, no se toca en ningún momento.
- La entrada a `main` se hace por PR, revisable y reversible.

## 7. Correcciones visuales pendientes

Diagnóstico con medición real en el navegador (capturas en [capturas/](capturas/)). **No se corrigió nada.**

| # | Hallazgo | Diagnóstico | Clasificación | Propuesta |
|---|---|---|---|---|
| V1 | **`ListaReposiciones` en modo oscuro** | Fondo `bg-sky-50/70` → `rgba(240,249,255,0.7)` (casi blanco) con texto `rgb(226,236,250)`: contraste ≈1:1, ilegible (`oscuro-reposiciones.png`). `index.css` solo oscurece `.bg-sky-50` y `.bg-sky-100`, no la variante `/70` ni `ring-sky-200`. El componente (`components/Reposiciones.tsx`) **no cambió en la copia**: el defecto ya existe en `main`, pero ahora se ve en la página de detalle. | **Defecto que debe corregirse antes de integrar** | Dos líneas aditivas en `index.css`, dentro de `html.oscuro`: añadir `.bg-sky-50\/70` a la regla de `.bg-sky-50` y `.ring-sky-200` a la regla de anillos. Solo afecta al modo oscuro; el claro queda idéntico (comprobar comparando el CSS generado). `index.css` es compartido, así que es un cambio solo aditivo. |
| V2 | Indicador ámbar del panel en modo oscuro (anotado en la 3B.5) | **No es un defecto.** En estado estable el fondo es `rgba(245,158,11,0.14)` con número ámbar claro y texto legible (`oscuro-indicadores.png`). La observación de la 3B.5 vino de una captura tomada durante la transición de 150 ms de la tarjeta. | **Comportamiento correcto; no modificar** | — |
| V3 | Consistencia de chips, prioridades y estados | Las listas, inicios y solicitudes usan `ChipTurno`, `PrioridadIncidencia` y `TarjetaIncidencia` únicos (3B.5). La sucursal ve además «Estado: …» en texto y el panel no (su tabla no tiene esa columna). Es una diferencia de contexto deliberada, no una incoherencia. | **Intencional** | — |
| V4 | **Acción principal en móvil** (390×844) | En el detalle del panel, «Siguiente paso» se ve sin desplazarse (y = 403 px), pero el formulario de respuesta empieza en y = 1353 px y «Preparar reposición» en y = 1049 px (`movil-admin-inc9.png`). Es el criterio de aceptación de la 3B.6 del plan original y no se cumple. Los botones miden 32–44 px de alto (≥ 24 px, WCAG 2.5.8 AA). | **Mejora menor que puede posponerse.** No impide operar, pero era criterio de la 3B.6. | Usar el espacio `accion` que ya tiene `SiguientePaso` para un enlace «Responder» o «Preparar reposición» que desplace al formulario (ancla). Sin componentes nuevos. |
| V5 | Espaciado y jerarquía | Paneles, bandejas y detalle mantienen la jerarquía (Siguiente paso arriba, acento ámbar solo en lo accionable, cerradas atenuadas). En el portal de la sucursal, las páginas de lista, solicitud y avisos no usan `h1` para su título principal (estructura previa a estas etapas). | **Mejora menor que puede posponerse** (accesibilidad general, fuera del alcance de incidencias) | Unificar el nivel de encabezado en una revisión de accesibilidad del portal. |
| V6 | Menú lateral del panel tenue en modo oscuro | Previo, ajeno a incidencias. | **Posponer** (fuera de alcance) | — |

## 8. Plan de implementación

Cada paso con su verificación. Ninguno se ejecuta sin tu autorización expresa.

**Paso 0: comprobaciones previas (solo lectura)**

1. `git ls-remote origin refs/heads/main` debe dar `db2113b`. Si cambió, rehacer la simulación (§4) antes de seguir.
2. Huella del original: `git status --porcelain | md5sum` debe dar `c7bcc85891211e218c43785c4ecae48c`.

**Paso 1: respaldos.** Véase §9.

**Paso 2: corrección V1 en la copia** (si la autorizas). Validar Vitest, el build y una captura en modo oscuro.

**Paso 3: commits por bloque en la copia** (rama `feature/turnos-incidencias-etapa1`), en este orden:

1. Etapa 1: turnos.
2. Etapa 2: avisos.
3. 3B.1 y 3B.2: presentación, bandejas y contadores.
4. 3B.3 y 3B.4: detalle, conversación y acciones.
5. 3B.5: inicios y tarjetas.
6. Documentación, con o sin capturas según tu decisión.
7. V1, si se aplicó.

Los archivos compartidos entre bloques (por ejemplo `cuenta.py`, `serial.py`, `DetalleSolicitud.tsx`) se asignan al
bloque de su primer cambio. Si eso no fuera viable, se agrupan 3B.1–3B.5 en un solo commit; el historial por etapa ya
está en los reportes.

**No se integran:**

- `frontend/tsconfig.tsbuildinfo`;
- `.playwright-mcp/`;
- scripts del scratchpad (`entorno.sh`, `pruebas.sh`, `pg_pruebas.txt`);
- `repomix-output.xml`;
- ningún `.env`.

**Paso 4: worktree de integración**, sin tocar el árbol de trabajo del original:

```text
git -C C:\Users\Daniel\Documents\Control_Pro worktree add ..\Control_Pro_integracion_3b -b feature/incidencias-turnos-3b main
git -C ..\Control_Pro_integracion_3b fetch C:\Users\Daniel\Documents\Control_Pro_etapa1_turnos feature/turnos-incidencias-etapa1
git -C ..\Control_Pro_integracion_3b merge --no-ff FETCH_HEAD
```

**Paso 5: verificación en el worktree:**

- `git diff --stat main` coincide con el inventario (49 archivos más los documentos);
- sin cambios en `backend/migrations/`, `backend/app/models/`, `package.json` ni el lockfile;
- sin diffs de archivo completo por los finales de línea.

**Paso 6: pruebas en el worktree** (§8.1).

**Paso 7: push de la rama de integración y PR hacia `main`.** El merge a `main` es una decisión aparte, tuya.

**Paso 8: comprobación final del original:** huella y hash del trabajo local sin cambios (§9).

Archivos:

- **Integración directa:** los 49 archivos de §3.1 más `docs/etapa3-redisenio-incidencias/`. No hay ninguno que
  requiera combinación manual.
- **Combinación manual:** ninguno hoy. Solo sería necesaria si `main` avanzara (paso 0).
- **Conflictos potenciales:** ninguno textual. Semánticos: los de §5 (R3, R9), cubiertos por pruebas.

### 8.1 Pruebas después de integrar

1. `tsc -b --noEmit` y `vite build` en el worktree (con `npm ci` sobre el lockfile de `main`).
2. Vitest completo: esperado 295/295.
3. pytest completo con `scripts/pytest_desechable.py` y `ADMIN_DATABASE_URL` del contenedor desechable: esperado 291.
   Si se integra también F-01, 297.
4. Recorrido visual en 1440, 768 y 390 de los 4 perfiles (sucursal, Atención, almacén y aprobador) contra la base
   visual desechable, nunca contra la de trabajo.
5. Comprobación de avisos: crear una incidencia, responder y despachar una reposición en la base desechable, y abrir
   cada aviso.

### 8.2 Integridad de las bases de datos

- No hay migraciones nuevas ni cambios de modelos: no ejecutar `flask db upgrade`, `alembic`, seeds ni
  `reset_visual.sh` fuera del contenedor desechable.
- El backend del worktree solo se levanta con un entorno que aborte si `DATABASE_URL` no es
  `127.0.0.1:55432/cp_*_test`, igual que `entorno.sh`.
- La restricción `uq_notif_evento` que usa la Etapa 2 ya existe en `main` (`models/operacion.py:311`).

## 9. Respaldo y reversión

**Respaldos previos**, guardados fuera de ambos proyectos, en una carpeta permanente (por ejemplo
`C:\Users\Daniel\Documents\respaldos_control_pro\2026-11-xx\`, no en `%TEMP%`):

1. **Repositorio original completo:** `git -C Control_Pro bundle create original_todas.bundle --all`. Contiene todas
   las ramas y commits; solo lee.
2. **Trabajo local sin confirmar del original:** archivo `tar` de sus 20 rutas, más `git diff` en un parche y un
   manifiesto SHA-256. Sirve para comprobar después que siguen idénticos.
3. **Copia aislada:** el paquete ya preparado en esta auditoría (véase abajo) y, tras el paso 3, un `git bundle` de la
   rama `feature/turnos-incidencias-etapa1`.

**Paquete de integración ya generado** (temporal; conviene copiarlo a la carpeta de respaldos):
`C:\Users\Daniel\AppData\Local\Temp\claude\57ec23218a51475e\b72a4832-3f3c-45a9-a979-e7a4dea692fc\scratchpad\paquete_integracion_3b\`

| Archivo | Contenido |
|---|---|
| `01_modificados.patch` | Parche de los 19 archivos modificados |
| `01_modificados.txt` | Lista de esos archivos |
| `02_nuevos.tar` | Los 136 archivos nuevos |
| `02_nuevos.txt` | Lista de esos archivos |
| `03_manifiesto_sha256.txt` | Hashes de los 49 archivos de código, pruebas y documentos |

**Cómo comprobar que el original conserva su estado:**

- huella `git status --porcelain | md5sum` = `c7bcc85891211e218c43785c4ecae48c`;
- `sha256sum` del trabajo local igual al del respaldo;
- `git rev-parse main` = `db2113b` hasta el merge del PR.

Como la integración ocurre en un worktree, ninguna de estas cifras debería cambiar.

**Reversión:**

| Momento | Cómo revertir |
|---|---|
| Antes del PR | Eliminar el worktree y la rama de integración (`git worktree remove`, `git branch -D`, con tu autorización). `main` y el trabajo local no se tocaron. |
| Después del merge a `main` | `git revert -m 1 <commit de merge>` en una rama nueva y su PR. Al no haber migraciones, revertir el código es suficiente; no hay datos que deshacer. |
| Por bloque | Como los commits están separados, se puede revertir un bloque (por ejemplo 3B.5) sin tocar E1 y E2. |
| Desastre | Restaurar desde `original_todas.bundle` y el `tar` del trabajo local. |

## 10. Dictamen final

### LISTO CON OBSERVACIONES

No hay conflictos técnicos:

- misma base;
- `main` sin cambios;
- ningún archivo en común con el trabajo local del original;
- parche limpio;
- todas las pruebas pasan, también combinadas con F-01.

Antes de ejecutar la integración necesito tu autorización o decisión en:

1. **Incluir las Etapas 1 y 2** (turnos y avisos). La 3B depende de ellas.
2. **Corregir V1** (`ListaReposiciones` en modo oscuro) antes de integrar. Recomendado: dos selectores aditivos en
   `index.css`.
3. **V4** (acceso directo a la acción principal en móvil): ahora o después de integrar.
4. **Capturas:** versionar las 106 (≈60 MB) o archivarlas fuera del repositorio y dejar solo los reportes.
5. **Commits en la copia y worktree de integración** (alternativa A), o la alternativa C (parche) si prefieres no hacer
   commits en la copia.
6. **Decisión abierta de la 3B.4:** ocultar «Preparar reposición» y «Cancelar» a Atención. Puede quedar para después;
   no bloquea.
7. **Trabajo local F-01 del original:** queda fuera de esta integración y se preserva. Conviene que su responsable lo
   confirme en su propia rama.

Aislamiento: esta auditoría solo leyó el original (`git status`, `log`, `diff`, `archive`, `ls-remote`). Su huella
quedó igual: `c7bcc85891211e218c43785c4ecae48c`. Sin commits, pushes, merges ni migraciones.
