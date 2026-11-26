# Etapa 3A · 01 — Auditoría del estado actual del módulo de incidencias

Fecha: 25-nov-2026 · Copia `Control_Pro_etapa1_turnos`, rama `feature/turnos-incidencias-etapa1` (Etapas 1 y 2 sin
commit). **Solo lectura del código:** no se modificó la aplicación.

## 0. Método y entorno

| Fuente | Uso |
|---|---|
| Grafo Graphify **de la copia** (`--code-only`, 3.019 nodos, 11.809 relaciones, salida fuera del repositorio) | Ubicar quién consume `turno_service` y `aviso_incidencia`, y de qué dependen las pantallas |
| Código | Confirmar rutas, componentes, tipos y endpoints |
| Playwright sobre la copia en ejecución | Cuatro perfiles, escritorio 1440×900 y móvil 390×844 |

**Entorno aislado.** Backend de la copia en `127.0.0.1:5055` y Vite en `5180` (`VITE_API_URL`), contra la base desechable
`cp_etapa2_visual_test` del servidor `cp-pruebas` (127.0.0.1:55432). El sistema original seguía corriendo en 5000 y 5173
y **no se tocó**. El proyecto original conserva el mismo `git status` que al inicio.

**Datos de escenario creados** (solo en la base desechable, con la API real, mediante un script de escenario):
INC-0003 a INC-0007, para tener una incidencia en cada turno. Ya existían INC-0001 (por confirmar) e INC-0002 (cerrada),
de la Etapa 2.

| Folio | Pedido | Estado | Turno (backend) |
|---|---|---|---|
| INC-0001 | PED-…02 | resuelta | `sucursal_confirmar` |
| INC-0002 | PED-…01 | cerrada | `cerrada` |
| INC-0003 | PED-…01 | abierta | `lurima_atender` |
| INC-0004 | PED-…01 | en_atencion | `sucursal_responder` |
| INC-0005 | PED-…01 | en_atencion | `lurima_responder` |
| INC-0006 | PED-…03 | en_atencion | `lurima_reposicion` (paquete preparado, sin enviar) |
| INC-0007 | PED-…04 | en_atencion | `sucursal_recibir` (reposición entregada, sin recepción) |

No hay incidencias `interna` en la demo (no hay transferencias ni canal tienda activos).

**Perfiles inspeccionados:** sucursal (`empresa@demo.mx`), atención (`atencion@`, global), almacén (`almacen.qro@`, el
que surtió los 4 pedidos) y consulta (`auditor@`, solo lectura).

Capturas: [capturas/](capturas/) (18, por perfil).

## 1. Hallazgo central

**El backend ya sabe a quién le toca cada incidencia, pero ninguna pantalla lo muestra.** El grafo y el código lo
confirman: `turno_service` lo consumen `serial.py`, `admin_operacion.py`, `cuenta.py`, `reporte_service.py` y
`aviso_incidencia.py`, pero **ningún archivo del frontend**. El tipo `Incidencia` (`frontend/src/api/tipos.ts:107-112`) no
declara `turno`, `turno_actor`, `turno_desde`, `ultima_actividad` ni `reposicion_de`, y nadie usa el filtro `?turno=` ni
los contadores `incidencias_por_turno` / `incidencias_te_esperan`. La interfaz sigue mostrando el **estado técnico**
(«Abierta», «En atención»), que no dice quién debe actuar.

## 2. Hallazgos por perfil

### 2.1 Sucursal

| # | Pantalla | Observación | Evidencia |
|---|---|---|---|
| S1 | Inicio | «Incidencias abiertas: 5». A la sucursal solo le tocan 3 (INC-0004 responder, INC-0007 recibir, INC-0001 confirmar), y la de confirmar ni siquiera entra en «abiertas» | [sucursal/01](capturas/sucursal/01-inicio-contadores.png) |
| S2 | Mis incidencias | Cuatro incidencias con turnos distintos (responder, recibir, esperar a Lurima ×2) muestran el mismo «En atención» ámbar; «Por confirmar» se ve como un «Resuelta» verde. Filtros por estado; sin búsqueda; filtro inicial «Todas» | [sucursal/02](capturas/sucursal/02-lista-todas.png) |
| S3 | Detalle INC-0007 (recibir) | La reposición dice «Entregado», pero **la página no ofrece la acción de recibir**: solo un campo para escribir. La recepción vive en la página de la solicitud | [sucursal/03](capturas/sucursal/03-detalle-pendiente-recibir.png) |
| S4 | Detalle (historial) | Las notas automáticas («Se preparó la reposición…», «Reposición … enviada…») aparecen como mensajes firmados por «Control Pro». La resolución automática por reposición aparece como «En atención → Resuelta · **Sucursal**» | [sucursal/04](capturas/sucursal/04-detalle-por-confirmar.png) |
| S5 | Detalle INC-0001 (confirmar) | El bloque «Confirmar solución / reabrir» es claro (fortaleza). El texto dice «La comercializadora la marcó como resuelta», aunque la resolvió la recepción de la reposición | idem |
| S6 | Solicitud | «Qué sigue» dice «3 incidencia(s) abierta(s): revisa su avance», sin decir que una espera a la sucursal. La sección Incidencias está a 1.812 px de la parte superior (página de 2.704 px) | [sucursal/05](capturas/sucursal/05-solicitud-seccion-incidencias.png) |
| S7 | Notificaciones | 41 sin leer, mezclando paquetes, solicitudes e incidencias. Los avisos de la Etapa 2 sí llevan a la incidencia (fortaleza) | [sucursal/06](capturas/sucursal/06-notificaciones.png) |
| S8 | Móvil | Lista y detalle legibles y sin desbordamiento horizontal; «Tomar foto» disponible (fortaleza). Mismo problema de etiquetas | [sucursal/07](capturas/sucursal/07-movil-lista.png), [08](capturas/sucursal/08-movil-detalle-te-toca-responder.png) |

### 2.2 Atención (Lurima)

| # | Pantalla | Observación | Evidencia |
|---|---|---|---|
| A1 | Lista (filtro «Abiertas») | 5 filas; solo INC-0003 e INC-0005 requieren a atención (e INC-0006 al almacén). INC-0004 e INC-0007 esperan a la sucursal y se ven igual. «Respondió la sucursal» ya sale del turno (correcto desde la Etapa 1), pero es la única pista. Columna «Pedido #4» en lugar del folio; sin sucursal ni antigüedad | [atencion/01](capturas/atencion/01-lista-abiertas.png) |
| A2 | Modal (reposición preparada) | Aparece «Enviar con esta guía» aunque atención no tiene `surtido.operar` (el backend responde 403). También «Preparar otra reposición» con una en curso. El modal mide 1.073 px de contenido en 721 px visibles | [atencion/02](capturas/atencion/02-modal-reposicion-sin-permiso.png) |
| A3 | Detalle del pedido | Tarjeta de incidencias sin enlace por incidencia; un solo «Gestionar →» a la lista general | [atencion/03](capturas/atencion/03-pedido-tarjeta-incidencias.png) |
| A4 | Inicio del panel | «Incidencias abiertas 5» (a Lurima le tocan 3). Este panel usa `panel_solicitudes`, que **no** recibió los contadores por turno de la Etapa 1 (solo se agregaron a `/admin/reportes/dashboard`, al que atención no tiene acceso) | [atencion/04](capturas/atencion/04-panel-inicio.png) |
| A5 | Móvil (lista) | La tabla mide 946 px en un contenedor de 343 px: el estado y «Gestionar» quedan fuera de la pantalla y obligan a desplazarse en horizontal | [atencion/05](capturas/atencion/05-movil-lista.png) |
| A6 | Móvil (modal) | Usable, pero con 933 px de contenido en 715 visibles; la acción principal queda al fondo | [atencion/06](capturas/atencion/06-movil-modal.png) |

### 2.3 Almacén

| # | Pantalla | Observación | Evidencia |
|---|---|---|---|
| W1 | Lista | Ve las 5 incidencias de los pedidos que surtió (alcance correcto). Su única tarea real (enviar INC-0006) no se distingue | [almacen/01](capturas/almacen/01-lista.png) |
| W2 | Modal | Formulario de envío disponible (tiene `surtido.operar`) junto con conversación y cambio de estado. El turno `lurima_reposicion` no distingue «atención» de «almacén» | [almacen/02](capturas/almacen/02-modal-reposicion-por-enviar.png) |
| W3 | Todas las páginas | Error de consola 403 de `/api/admin/conversaciones` (el chat con el aprobador, sin permiso). Anterior a esta etapa y ajeno a incidencias | consola |

### 2.4 Consulta (auditor)

| # | Pantalla | Observación | Evidencia |
|---|---|---|---|
| C1 | `/admin/incidencias` por URL | El menú no muestra «Incidencias» (correcto), pero la página carga y muestra «Sin registros. No hay información con los filtros actuales.»: un 403 presentado como lista vacía | [consulta/01](capturas/consulta/01-incidencias-sin-permiso.png) |
| C2 | Detalle del pedido | Ve las incidencias en solo lectura (estado y descripción), sin historial, turno ni enlaces | [consulta/02](capturas/consulta/02-pedido-incidencias-solo-lectura.png) |

El aprobador entra por su portal a la misma vista `PedidoAdmin` (`router.tsx:162`) y ve las incidencias igual que C2.

## 3. Problemas transversales

1. **Turno invisible** (§1): la información existe en la API y nadie la presenta.
2. **Estado técnico en lugar de responsabilidad:** «En atención» agrupa cuatro situaciones distintas.
3. **Acción separada de la incidencia:** recibir una reposición exige ir a la solicitud.
4. **Mensajes y eventos mezclados** en `HistorialIncidencia` (`DetalleSolicitud.tsx:340`, compartido por ambos portales):
   las notas automáticas parecen mensajes y la resolución automática se atribuye a la sucursal.
5. **Sin página de detalle en el panel:** el modal es largo, sin URL propia (el `?abrir=` de la Etapa 2 es provisional) y
   la tarjeta del pedido no enlaza a cada incidencia.
6. **Acciones no filtradas por permiso:** el envío de reposición se ofrece a quien no puede hacerlo.
7. **Contadores por estado:** el inicio de la sucursal y el panel cuentan «abiertas», no «te esperan».
8. **Móvil del panel:** la tabla no se adapta.
9. **Errores presentados como vacíos:** un 403 se muestra como «Sin registros».

**Fortalezas que se conservan:** la lista y el detalle de la sucursal en móvil; el bloque «Confirmar / reabrir»; la
captura con cámara; los avisos de la Etapa 2 con enlace directo; el alcance por almacén; las validaciones del backend.

## 4. Escritorio frente a móvil

| | Escritorio | Móvil |
|---|---|---|
| Sucursal: lista | Correcta | Correcta (descripción truncada) |
| Sucursal: detalle | Una columna; la acción de escribir ocupa la mitad inferior | Correcta; el campo de mensaje queda a 534 px |
| Panel: lista | Tabla de 8 columnas con la descripción completa | **Desbordada**: estado y acción fuera de la pantalla |
| Panel: modal | 1.073 px de contenido en 721 visibles | 933 en 715; la acción principal al fondo |

## 5. Componentes, rutas y API relacionados

| Capa | Elemento | Uso actual |
|---|---|---|
| Rutas | `/cuenta/incidencias`, `/cuenta/incidencias/:id` (`router.tsx:134-135`); `/admin/incidencias` (`:200`); no existe `/admin/incidencias/:id` | — |
| Pantallas | `features/cuenta/Incidencias.tsx` (lista y detalle de la sucursal); `features/admin/Posventa.tsx` (`Incidencias` + `Reposicion`, modal); `features/cuenta/DetalleSolicitud.tsx` (`HistorialIncidencia`, `TarjetaIncidencia`, `QueSigue`, `RecepcionPaquete`, `NuevaIncidencia`); `features/admin/Pedidos.tsx` (tarjeta del pedido); `features/admin/Dashboard.tsx`; `features/portal/Inicio.tsx` | Según el grafo, ambos portales dependen de `DetalleSolicitud.tsx` |
| Compartidos | `components/ui.tsx` (`Estado`, `Tabla`, `Modal`, `Tarjeta`…), `components/Reposiciones.tsx`, `components/Archivos.tsx`, `lib/formato.ts` (`fechaHora`; no hay formato relativo tipo «hace 3 h») | — |
| Permisos en el frontend | `useAuth().puede(...)` (`app/auth.tsx:106`) | Ya se usa en el panel; no en `Reposicion` |
| API | `GET /api/admin/incidencias?estado&prioridad&turno`, `GET/PATCH /api/admin/incidencias/<id>`, `POST …/reposicion`, `POST /api/admin/paquetes/<id>/{despachar,eventos,cancelar-reposicion}`; `GET /api/cuenta/incidencias?estado&turno`, `GET /api/cuenta/incidencias/<id>`, `POST …/{mensajes,confirmar,reabrir}`; `GET /api/cuenta/resumen`; `GET /api/admin/reportes/dashboard`; `GET /api/admin/reportes/solicitudes` (`panel_solicitudes`, permiso `pedido.ver`, sin contadores por turno) | — |
| Serializador | `serial.incidencia`: `turno`, `turno_actor`, `turno_desde`, `ultima_actividad`, `reposicion_de`, `seguimiento[].lado`, `reposiciones`, `transiciones`, `cierre_por_sucursal` | El frontend no declara los campos nuevos |
| Lógica central | `services/turno_service.py` (turno, `lado`, `es_humana`, `ordenar`, `contar`, `resumen`, `filtrar`); `services/aviso_incidencia.py` (avisos y enlaces) | — |
