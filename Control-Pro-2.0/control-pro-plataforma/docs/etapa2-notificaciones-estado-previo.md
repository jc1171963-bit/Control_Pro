# Etapa 2 — Notificaciones de incidencias: estado previo (antes de cambiar código)

Copia aislada `Control_Pro_etapa1_turnos`, rama `feature/turnos-incidencias-etapa1` (código de la Etapa 1, sin commit).
Inspección sobre una base desechable `cp_etapa2_visual_test` (servidor `cp-pruebas`, 127.0.0.1:55432), con esquema por
migraciones y `seed-demo`. La actividad se generó con la API real (script de escenario: solicitud entregada, recepción con
faltante, incidencia manual, conversación, resolución, confirmación y reposición completa).
Capturas: [capturas-etapa2-notificaciones/antes/](capturas-etapa2-notificaciones/antes/).

## Cómo funciona

| Aspecto | Hoy |
|---|---|
| Almacenamiento | Tabla `notificacion` (`usuario_id` **o** `cliente_id`, `evento`, `entidad`, `entidad_id`, `mensaje` ≤ 300, `enlace` ≤ 200, `leida`, `creado`) |
| Creación | Directa en la misma transacción: `comun.notificar_cliente` y `comun.notificar_personal` (sin colas). Push genérico encolado al confirmar (`push_service.encolar`) |
| Duplicados | Restricción única `uq_notif_evento (usuario_id, cliente_id, evento, entidad, entidad_id)` + `ON CONFLICT DO NOTHING` |
| Destinatarios del personal | Usuarios activos con un permiso: globales y, si se pasa `sucursal_id`, los de ese almacén. **No excluye al autor** |
| Destinatario sucursal | La cuenta `cliente` dueña del pedido |
| Consulta | `GET /api/cuenta/notificaciones`, `GET /api/admin/notificaciones` (solo las propias; `no_leidas` en la respuesta) |
| Lectura | `POST …/notificaciones/leer` con `ids` (o todas); filtrado por el dueño |
| Interfaz | Página `/cuenta/notificaciones` y `/admin/notificaciones` (`ListaNotificaciones`): lista paginada, «Leída» por aviso, «Marcar todas como leídas», campana con contador en el encabezado y en el menú; clic = marca como leída y navega al `enlace` |
| Contador | Consulta `por_pagina=1` cada 30 s (sucursal) / 45 s (panel) más `enVivo` |
| Relación con incidencias | Solo por `entidad='incidencia'`/`entidad_id`; el `enlace` es texto libre |

## Eventos de incidencias que avisan hoy (datos del escenario)

| Evento | ¿Aviso? | A quién | Enlace |
|---|---|---|---|
| Incidencia automática de recepción (INC-0001) | **No** | — | — |
| Incidencia manual de la sucursal (INC-0002) | Sí: «Nueva incidencia INC-2026-000002: articulo_danado.» | `admin`, `atencion` (solo globales) | `/admin/incidencias` |
| Comentario del personal / cambio de estado | Sí: «Actualización de la incidencia …: en atención. …» | Sucursal | `/cuenta/pedidos/1` |
| Mensaje de la sucursal | **No** | — | — |
| Resolución | Sí: «Actualización …: resuelta. …» (no pide confirmar) | Sucursal | `/cuenta/pedidos/1` |
| Confirmación de la sucursal | **No** | — | — |
| Reposición preparada / despachada / entregada | Sí (3 avisos) | Sucursal | `/cuenta/pedidos/1` |
| Reposición recibida completa (resuelta) | **No** | — | — |

## Defectos observados

1. **Avisos al personal incompletos:** 1 de 2 incidencias avisó; ninguna respuesta, reapertura ni confirmación avisa.
2. **Destinatarios:** el almacén que surtió (QRO) no recibe nada; `admin` recibe todo por ser global; el autor no se excluye.
3. **Destino inútil en el panel** ([05](capturas-etapa2-notificaciones/antes/05-lurima-destino-del-aviso.png)): el aviso
   abre la lista con el filtro «Abiertas»; INC-0002 ya estaba cerrada, así que la lista aparece **vacía**.
4. **Destino lejano en la sucursal** ([02](capturas-etapa2-notificaciones/antes/02-sucursal-destino-del-aviso.png)):
   lleva al inicio de la solicitud; la sección de incidencias está a ~2.500 px.
5. **Textos técnicos:** código crudo (`articulo_danado`), títulos genéricos («Actualización de la incidencia…»), el aviso
   de «resuelta» no dice que hay que confirmar, «Tu solicitud … está entregado».
6. **Ruido:** un cambio de estado sin texto también avisa a la sucursal.
7. La lista no distingue avisos de incidencias de los demás (misma campana); en móvil funciona sin desbordar
   ([03](capturas-etapa2-notificaciones/antes/03-sucursal-movil.png)).

## Diferencias entre portales

Mismo componente (`ListaNotificaciones`) y mismo comportamiento. El panel muestra además el encabezado «Avisos de los
eventos que requieren tu atención» y su contador solo cuenta no leídas (`no_leidas=1`).

## Se conserva

Tabla, restricción única, `notificar_cliente`, consulta y lectura por dueño, página y contadores, clic = leída + navegar,
avisos de paquetes que no son de reposición.

## Cambia

Destinatarios del personal (grupo, responsable, respaldo admin, sin autor), catálogo de eventos de incidencias, textos y
enlaces a la incidencia, y apertura directa de la incidencia en el panel (`/admin/incidencias?abrir=<id>`, que abre el
modal existente: aún no hay página de detalle, que es de la Etapa 3).

## Hallazgo de aislamiento

Durante la inspección estaba corriendo el **sistema original** (Vite 5173 y Flask 5000 desde `Control_Pro`, iniciados a
las 10:19, no por esta tarea). La copia se movió a puertos propios (backend 5055, Vite 5180 con `VITE_API_URL`) y se
comprobó en el registro de la copia que el proxy llega a su backend. Los procesos originales no se tocaron.
Además, sin `DATABASE_URL` la configuración de desarrollo apunta a la base de trabajo: el arranque de la copia exige la
variable y valida que sea la base desechable.
