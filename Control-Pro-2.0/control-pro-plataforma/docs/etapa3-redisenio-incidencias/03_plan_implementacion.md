# Etapa 3A · 03 — Plan de implementación (Etapa 3B)

Base: [02_propuesta_redisenio.md](02_propuesta_redisenio.md). Cada subetapa se revisa en el navegador antes de seguir.
Todas en la copia aislada, con pruebas en la base desechable (`scripts/pytest_desechable.py`) y validación visual con
Playwright sobre la copia (backend 5055, Vite 5180).

## Orden y dependencias

```
3B.1 Base (tipos, ChipTurno, clase de entrada, formato relativo)
  ├─► 3B.2 Bandejas y contadores
  ├─► 3B.3 Página de detalle del panel + navegación desde avisos
  │     └─► 3B.4 Conversación/eventos + Siguiente paso + acciones por perfil
  └─► 3B.5 Inicio, «Qué sigue» y tarjetas de la solicitud
3B.6 Diseño adaptable y accesibilidad (sobre todo lo anterior)
```

## 3B.1 — Base de presentación

- **Objetivo:** que el frontend pueda **mostrar** el turno sin calcular nada.
- **Archivos:**
  - `frontend/src/api/tipos.ts`: declarar `turno`, `turno_actor`, `turno_desde`, `ultima_actividad`, `reposicion_de`, `seguimiento[].lado`, `seguimiento[].clase`.
  - Nuevo `frontend/src/components/ChipTurno.tsx`, con la tabla fija código → texto y color por portal.
  - `lib/formato.ts`: formato relativo («hace 3 h»).
  - Backend `api/serial.py`: campo `clase` con `turno_service.es_humana` (D-4).
- **Dependencias:** D-1, D-4, D-10.
- **Riesgos:** que la tabla del chip se use para decidir comportamientos (solo debe traducir). Si el serializador pierde
  rendimiento, `clase` reutiliza las entradas ya cargadas.
- **Pruebas:**
  - Vitest: `ChipTurno` con los 8 códigos en ambos portales y el formato relativo.
  - Pytest: `clase` coincide con `es_humana` para la creación, las notas automáticas, los mensajes y los adjuntos.
- **Aceptación:** los 8 turnos tienen texto y estilo en ambos portales; ningún componente deduce turnos.

## 3B.2 — Bandejas y contadores

- **Objetivo:** «Te toca» como bandeja inicial en ambos portales; contadores por turno.
- **Archivos:**
  - `features/cuenta/Incidencias.tsx` (pestañas + chip + «hace…»).
  - `features/admin/Posventa.tsx` (`Incidencias`: pestañas, 6 columnas, folio de la solicitud, filtro «Por enviar»; tarjetas en < 1024 px).
  - Backend `reporte_service.panel_solicitudes`: `turno_srv.resumen` (D-9).
- **Dependencias:** 3B.1, D-2, D-5, D-9.
- **Riesgos:** la paginación con `?turno=` (el filtro calcula en Python sobre las candidatas: atajo documentado de la
  Etapa 1). Para el almacén, que «Por enviar» se confunda con un turno: es un filtro por estado de paquete.
- **Pruebas:**
  - Pytest: contadores de `panel_solicitudes` iguales a `?turno=`.
  - Vitest: pestañas y conteos.
  - Visual: los 7 escenarios de la base desechable en 1440 y 390 px.
- **Aceptación:**
  - Con la demo, la sucursal ve en «Te toca» INC-0004, INC-0007 e INC-0001, y atención ve INC-0003 e INC-0005.
  - El contador de cada pestaña coincide con la API.
  - Sin desplazamiento horizontal en 390 px.

## 3B.3 — Página de detalle del panel y navegación

- **Objetivo:** `/admin/incidencias/:id` como destino único; avisos y tarjetas apuntan ahí.
- **Archivos:**
  - `app/router.tsx` (ruta nueva).
  - Nuevo `features/admin/IncidenciaDetalle.tsx` (mueve el contenido del modal y la `Reposicion` existente).
  - `Posventa.tsx`: `?abrir=` redirige a la página (D-11); la fila enlaza al detalle.
  - `features/admin/Pedidos.tsx`: tarjeta con enlace por incidencia.
  - Backend `aviso_incidencia.enlace_lurima` → `/admin/incidencias/{id}`.
- **Dependencias:** 3B.1, D-3, D-11.
- **Riesgos:** perder acciones del modal al moverlas (se verifica con una lista por acción). Cambiar el enlace de los
  avisos afecta a `test_avisos_incidencias.py`, que debe actualizarse.
- **Pruebas:**
  - Pytest de avisos con el enlace nuevo.
  - Visual: clic en un aviso → detalle; `?abrir=` antiguo → detalle; id inexistente o sin alcance → mensaje y regreso.
  - Regreso a la bandeja con sus filtros.
- **Aceptación:** cada acción del modal existe en la página; los avisos nuevos y los antiguos llevan a la incidencia; el
  modal se retira solo después de la revisión.

## 3B.4 — Conversación, eventos, Siguiente paso y acciones

- **Objetivo:** separar mensajes de eventos; la acción esperada arriba; acciones filtradas por permiso.
- **Archivos:**
  - `features/cuenta/DetalleSolicitud.tsx` (`HistorialIncidencia`, compartido) o un componente nuevo `components/ConversacionIncidencia.tsx`.
  - `features/cuenta/Incidencias.tsx` (`IncidenciaSucursal`: Siguiente paso y recepción con `RecepcionPaquete` exportado, D-7).
  - `IncidenciaDetalle.tsx`: `puede('surtido.operar')` para el envío; «Preparar otra» condicionado (D-6).
- **Dependencias:** 3B.1, 3B.3, D-6, D-7.
- **Riesgos:**
  - `HistorialIncidencia` se usa en tres vistas: cambiarlo de una vez y probar ambos temas (`.tema-sd` y panel).
  - La recepción desde la incidencia debe recargar tanto la incidencia como la solicitud.
- **Pruebas:**
  - Vitest: render de mensaje y de evento; el formulario de envío no aparece sin `surtido.operar`.
  - Pytest: sin cambios de reglas (regresión de incidencias y reposición).
  - Visual: INC-0007 (recibir desde la incidencia), INC-0001 (texto de la resolución automática), INC-0006 con atención (sin formulario) y con almacén (con formulario).
- **Aceptación:**
  - Ninguna nota automática se ve como mensaje de una persona.
  - Atención no ve el envío.
  - La sucursal recibe la reposición sin salir de la incidencia.
  - La resolución automática no se atribuye a la sucursal.

## 3B.5 — Inicio, «Qué sigue» y tarjetas de la solicitud

- **Objetivo:** que los resúmenes digan «te esperan», con enlaces.
- **Archivos:**
  - `features/portal/Inicio.tsx` (`incidencias_te_esperan`).
  - `features/admin/Dashboard.tsx` / panel de solicitudes (contador nuevo).
  - `DetalleSolicitud.tsx` (`QueSigue`, `TarjetaIncidencia`).
- **Dependencias:** 3B.1, 3B.2 (pestaña de destino), D-9.
- **Riesgos:** que dos pantallas muestren números distintos. Todos los contadores deben salir de `turno_service`.
- **Pruebas:**
  - Pytest: `resumen` frente a `?turno=` (ya existe en la Etapa 1).
  - Visual: el inicio de la sucursal y el panel coinciden con las bandejas.
- **Aceptación:** con la demo, la sucursal ve «3 te esperan» y el panel de atención «3» (INC-0003, INC-0005 e INC-0006, si se
  cuenta la reposición); cada número lleva a su pestaña.

## 3B.6 — Diseño adaptable, accesibilidad y cierre

- **Objetivo:** pulir en 390, 768 y 1440 px y en ambos temas.
- **Archivos:** las pantallas anteriores (sin componentes nuevos salvo ajustes). Mensaje de 403 en la lista (C1).
- **Dependencias:** todas.
- **Riesgos:** regresiones visuales en componentes compartidos de `ui.tsx` (no se modifican sin revisar su impacto).
- **Pruebas:**
  - Suites completas (pytest en base desechable, Vitest, `tsc -b --noEmit`).
  - Recorrido visual de los 4 perfiles con capturas «después» para comparar con [capturas/](capturas/).
- **Aceptación:**
  - Sin desplazamiento horizontal.
  - La acción principal es visible sin desplazarse en 390×844.
  - El contraste es suficiente en los chips.
  - Navegación con teclado en las pestañas y en el detalle.
  - Sin errores de consola nuevos.

## Fuera de alcance de la 3B

Cambios de permisos o roles, reglas de turno o de avisos, reglas de reposición o cierre, migraciones, asignación formal
de responsables, la tienda y el portal del aprobador (más allá de la tarjeta del pedido).
