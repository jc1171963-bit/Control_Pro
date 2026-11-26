# Etapa 3B.2 — Bandejas operativas, contadores y prioridad

Copia aislada `Control_Pro_etapa1_turnos`, rama `feature/turnos-incidencias-etapa1`. Sin commits ni pushes. Sin migraciones.

## A. Resumen

- Las listas de incidencias de la sucursal (`/cuenta/incidencias`) y del panel (`/admin/incidencias`) se organizan ahora en **bandejas por turno**, en pestañas con contador.
- Cada bandeja es un conjunto fijo de turnos que calcula el backend (`turno_service`). La misma definición arma el filtro `?turno=` y suma el contador desde un nuevo campo `conteo` de la respuesta. Por eso **el número de la pestaña y la lista coinciden siempre**.
- Las bandejas de turno de cada portal son **excluyentes**: una incidencia activa aparece en una sola.
- **Por enviar** (almacén) es un filtro logístico, no un turno: reposiciones con paquete `preparado`.
- La **prioridad** se muestra con texto e ícono, sin forma de chip, y no se confunde con el chip de turno. Se puede filtrar por prioridad y el filtro se combina con la bandeja.
- La bandeja, la prioridad y la página viven en la URL. Al volver del detalle se conserva la bandeja.
- Pruebas: tsc OK; Vitest **234/234** (222 + 12); pytest **290/290** (287 + 3).

## B. Estado previo (auditoría breve)

| Portal | Antes de 3B.2 |
|---|---|
| Sucursal | Lista única paginada, ordenada por turno (Etapa 1). Sin pestañas ni contadores. Prioridad sin mostrar. |
| Panel | Botones por **estado** (`abierta`, `en_atencion`…) en estado local de React (se perdían al recargar). Tabla con columna «Estado» y texto «Respondió la sucursal». Sin contadores ni filtro de prioridad. |
| API | `?turno=` y `?estado=` ya existían (Etapa 1). No había conteos ni `?prioridad=` en `/cuenta/incidencias`. |

## C. Cambios realizados

### Backend (presentación de datos; sin tocar reglas, turnos, permisos ni avisos)

| Archivo | Cambio |
|---|---|
| `services/turno_service.py` | Nueva `conteo_bandejas(consulta)`: `por_turno` (con la `contar()` existente), `cerradas` y `todas`, sobre **la misma consulta** que la lista. No cambia el cálculo de turnos. |
| `api/admin_operacion.py` (`incidencias`) | Después del alcance y la prioridad: `conteo` y `conteo.por_enviar`. Nuevo filtro `?por_enviar=1` (incidencias con paquete de reposición `preparado`). La respuesta suma `conteo`. |
| `api/cuenta.py` (`mis_incidencias`) | Filtro `?prioridad=` y `conteo` (antes de aplicar estado/turno). |
| `api/serial.py` (`incidencia`) | Campo `cliente` (razón social o nombre del cliente de la solicitud), para la columna «Solicitud · sucursal». |

No se crearon endpoints nuevos: el conteo viaja en la respuesta de la lista existente (una sola consulta del navegador por pantalla).

### Frontend

| Archivo | Cambio |
|---|---|
| `components/BandejasIncidencia.tsx` (nuevo) | Definición de bandejas por portal, `filtroBandeja`, `contarBandeja`, `PestanasBandeja` (`role=tablist/tab`, `aria-selected`). |
| `components/PrioridadIncidencia.tsx` (nuevo) | Prioridad con ícono + texto + prefijo «Prioridad» para lectores de pantalla. |
| `features/cuenta/Incidencias.tsx` | Pestañas, tarjetas (folio · tipo, chip de turno, descripción, prioridad, solicitud, última actividad, estado), vacíos por bandeja; regreso del detalle a la misma bandeja. |
| `features/admin/Posventa.tsx` (`Incidencias`) | Pestañas, filtro de prioridad, estado en URL; tabla de 6 columnas en escritorio (≥ lg) y tarjetas en tablet/móvil; el modal muestra la prioridad. |
| `api/tipos.ts` | Tipos `ConteoBandejas` y `Incidencia.cliente`. |

### Pruebas nuevas

- `backend/tests/test_bandejas.py` (3 pruebas): contador = total del filtro en ambos portales, con prioridad; nadie se cuenta dos veces; «Por enviar» logístico y con alcance (almacén que surtió vs. almacén ajeno); la paginación no cambia los contadores; turno inválido → 400; campo `cliente`.
- `frontend/src/test/bandejas.test.tsx` (12 pruebas): exclusividad de bandejas, filtro y contador de la misma definición, pestañas accesibles, prioridad sin chip (5 valores), bandeja de la sucursal en URL, panel de atención sin «Por enviar», almacén con «Por enviar» por defecto + prioridad combinada.

## D. Bandejas por perfil

| Perfil | Bandejas (en orden) | Por defecto |
|---|---|---|
| Sucursal | **Te toca** (`sucursal_responder`, `sucursal_recibir`, `sucursal_confirmar`) · Esperando a Lurima (`lurima_atender`, `lurima_responder`, `interna`) · Reposición en proceso (`lurima_reposicion`) · Cerradas · Todas | Te toca |
| Atención Lurima | **Por atender** (`lurima_atender`, `lurima_responder`, `interna`) · Reposiciones (`lurima_reposicion`) · Esperando a la sucursal (`sucursal_*`) · Cerradas · Todas | Por atender |
| Almacén (permiso `surtido.operar`) | Igual que Atención + **Por enviar** (segunda pestaña) | Por enviar si el rol es `inventario` |

La pestaña de la bandeja donde actúa quien mira («Te toca», «Por atender», «Por enviar») resalta su contador en ámbar cuando es mayor que cero.

## E. Contadores: definición y fuente

| Contador | Fuente | Definición |
|---|---|---|
| Bandeja de turnos | `conteo.por_turno` | Suma de los turnos de la bandeja. |
| Cerradas | `conteo.cerradas` | `estado = cerrada` (igual al filtro `?turno=cerrada`). |
| Todas | `conteo.todas` | Total del alcance con los filtros aplicados. |
| Por enviar | `conteo.por_enviar` | Incidencias con paquete de reposición `preparado` (igual a `?por_enviar=1`). |

- El conteo se calcula **después** del alcance del usuario y del filtro de prioridad, y **antes** del filtro de bandeja: todas las pestañas reflejan la misma prioridad elegida.
- Invariante probado: `todas = Σ por_turno + cerradas` (nadie cuenta dos veces).
- «Por enviar» es un subconjunto de «Reposiciones» por diseño (vista logística), no un doble conteo dentro de las bandejas de turno.

## F. Pruebas

| Prueba | Línea base (fin de 3B.1) | Final 3B.2 |
|---|---|---|
| `tsc -b --noEmit` | OK | **OK** (exit 0; `tsconfig.tsbuildinfo` restaurado) |
| Vitest completa (`--maxWorkers=3`) | 222/222 | **234/234** (+12) |
| pytest completa (base desechable `cp_<hex>_test` en `cp-pruebas-etapa3`) | 287 passed | **290 passed, 0 failed** (+3 de `test_bandejas.py`) en 27 min 30 s; 8 avisos de obsolescencia de SQLAlchemy en `colaboracion_service.py`, ya existentes y ajenos a esta etapa; base temporal `cp_3fcc3c06f564_test` eliminada al terminar |

## G. Validación visual (Playwright, copia en 5180 → 5055, base `cp_etapa2_visual_test`)

| # | Captura | Comprobado |
|---|---|---|
| 01 | `capturas/01-sucursal-te-toca-1440.png` | Te toca 3 · Esperando a Lurima 4 · Reposición en proceso 1 · Cerradas 1 · Todas 9 (3+4+1+1 = 9). Te toca = INC-7, INC-4, INC-1. |
| 02 | `capturas/02-sucursal-reposicion-768.png` | `?bandeja=reposicion` → INC-6; sin desplazamiento horizontal. |
| 03 | `capturas/03-sucursal-te-toca-390.png` | Pestañas en varias filas (36 px de alto), sin desplazamiento horizontal. |
| 04 | `capturas/04-atencion-por-atender-1440.png` | Por atender 4 (INC-9 Crítica, INC-8 Baja, INC-5 «Respondió la sucursal», INC-3) · Reposiciones 1 · Esperando a la sucursal 3 · Cerradas 1 · Todas 9. Tabla de 6 columnas con solicitud y cliente. |
| 05 | `capturas/05-atencion-por-atender-390.png` | Tabla oculta, 4 tarjetas visibles; `scrollWidth` 375 ≤ 390. |
| 06 | `capturas/06-atencion-prioridad-alta-768.png` | Todas + Alta: 0 + 1 + 2 + 0 = 3 = filas listadas (INC-7, INC-6, INC-1); prioridad y chip de turno se distinguen. |
| 07 | `capturas/07-atencion-vacia-filtro-768.png` | Por atender + Alta: vacío con texto «Prueba sin el filtro de prioridad». |
| 08 | `capturas/08-almacen-por-enviar-1440.png` | Almacén Querétaro abre en **Por enviar 1** (INC-6, «Reposición en curso», Alta); petición `?pagina=1&por_enviar=1` → 200. |
| 09 | `capturas/09-almacen-por-enviar-390.png` | Sin desplazamiento horizontal (`scrollWidth` 390). |

- Regreso del detalle: desde `?bandeja=reposicion` el enlace «Mis incidencias» vuelve a la misma bandeja.
- Consola: solo el 401 de `/api/auth/refresh` en la pantalla de acceso (ya existía).

## H. Incidencias y desviaciones

1. **Contador del menú lateral «Solicitudes» (D-9)**: no se tocó; queda para la 3B.5.
2. **No hay búsqueda** en ninguna de las dos bandejas (no existía). El «filtro combinado» se validó como bandeja + prioridad.
3. **«Por enviar» se superpone con «Reposiciones»** por diseño (vista logística del almacén).
4. **«Esperando a Lurima» incluye `interna`** para que ninguna incidencia activa quede fuera de las bandejas de la sucursal.
5. **Los botones por estado del panel se sustituyeron** por pestañas de turno. El parámetro `?estado=` de la API sigue funcionando; no se eliminó del backend.
6. **Prioridad en `/cuenta/incidencias`**: se agregó el filtro `?prioridad=` (solo lectura) para que la sucursal pueda usar el mismo contrato; la interfaz de la sucursal aún no muestra el selector.
7. **Datos de validación**: se crearon INC-2026-000008 (baja) e INC-2026-000009 (crítica) por atención en la base visual desechable para cubrir todas las prioridades.
8. **Alcance del almacén**: Almacén Querétaro ve las 9 incidencias de la base visual porque surtió esas solicitudes; la regla de alcance no se modificó (la prueba `test_por_enviar_es_logistico_y_respeta_el_alcance` comprueba que un almacén ajeno no ve ni cuenta lo que no le corresponde).
9. **Contraste de la prioridad**: se usan los tonos de texto ya existentes (`coral-700`, `tinta-700`, `tinta-600`); no se midió el contraste numéricamente.
10. **Pendiente de 3B.1**: la clasificación de la confirmación (opción a recomendada) sigue esperando decisión.

## I. Seguridad e integridad

- Trabajo solo en la copia aislada; el proyecto original no se modificó (huella de `git status` sin cambios).
- Bases usadas: contenedor desechable `cp-pruebas-etapa3` (127.0.0.1:55432). Sin conexión con la base original. Sin migraciones.
- Sin cambios en `turno_service` para el cálculo de turnos, en avisos, en permisos/roles ni en los procesos de reposición, recepción, confirmación o cierre. El filtro «Por enviar» solo lee el estado del paquete.
- Sin commits ni pushes.

## J. Resultado frente a los criterios

| Criterio | Resultado |
|---|---|
| Bandejas sucursal / Atención / almacén sin duplicados | Cumplido (prueba de exclusividad + visual) |
| Contadores = filtros, respetan alcance, sin doble conteo, sin endpoint nuevo | Cumplido (`test_bandejas.py`, capturas 01, 04, 06, 08) |
| Tarjetas con folio, turno, prioridad, sucursal y última actividad | Cumplido |
| Prioridad no solo por color y distinta del chip de turno | Cumplido (ícono + texto, sin forma de chip) |
| Filtros en URL y conservados al volver | Cumplido |
| Responsive 1440 / 768 / 390 sin desplazamiento horizontal | Cumplido |
| Pruebas automatizadas | Cumplido: tsc OK, Vitest 234/234, pytest 290/290 |

Fin de la 3B.2. No se inició la 3B.3.
