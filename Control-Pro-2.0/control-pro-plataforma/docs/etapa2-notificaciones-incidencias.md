# Etapa 2 — Avisos de incidencias

Copia aislada `Control_Pro_etapa1_turnos`, rama `feature/turnos-incidencias-etapa1` (Etapas 1 y 2, sin commit).
Estado previo: [etapa2-notificaciones-estado-previo.md](etapa2-notificaciones-estado-previo.md).
Capturas: [antes](capturas-etapa2-notificaciones/antes/) · [después](capturas-etapa2-notificaciones/despues/).

## Diseño

`backend/app/services/aviso_incidencia.py` concentra el catálogo. Cada función es un **evento**; los
**destinatarios** salen de `destinatarios_lurima` o de la sucursal dueña del pedido; el **turno** se lee de
`turno_service` (solo para redactar la acción, nunca se recalcula), y la **acción** es el enlace a la incidencia.
Reutiliza la tabla `notificacion`, su restricción única y el push genérico existente. Sin migraciones ni colas.

## Catálogo

| Evento | Origen en el código | Destinatario | Condición | Aviso (título) |
|---|---|---|---|---|
| Incidencia nueva (manual o automática) | `comun.registrar_incidencia` → `creada` | Grupo de Lurima sin el autor | Siempre | «Nueva incidencia[ alta/crítica]: {tipo}» + cómo nació (reportada por la sucursal, detectada al registrar la recepción, al surtir, en el envío…, «en la reposición de INC-…») |
| Mensaje de la sucursal (texto o archivos) | `mensaje_sucursal` → `mensaje_de_sucursal` | Responsable o grupo | Siempre | «La sucursal respondió a una incidencia» / «…escribió en una incidencia resuelta» (según el turno) |
| Reapertura | `reabrir` → `reabierta` | Responsable o grupo | Siempre | «La sucursal reabrió una incidencia» |
| Confirmación | `confirmar_solucion` → `confirmada` | Solo el responsable | Si hay responsable | «La sucursal confirmó la solución» |
| Mensaje o archivos de Lurima | `actualizar_incidencia` → `actualizada_por_lurima` | Sucursal | Con texto o archivos | «Lurima respondió a tu incidencia … Te toca responder» / «…te escribió sobre la reposición…» (según el turno) |
| Resolución | idem | Sucursal | Paso a `resuelta` | «Lurima resolvió tu incidencia … Revisa y confirma la solución» |
| Cambio de estado sin texto | idem | — | — | No avisa |
| Asignación de responsable (API existente) | idem → `asignada` | El nuevo responsable | Si no se asignó a sí mismo | «Te asignaron una incidencia» |
| Reposición preparada / cancelada | `preparar_reposicion` / `cancelar_reposicion` | Sucursal | Siempre | «Lurima está preparando la reposición…» / «Se canceló el envío de reposición…» |
| Reposición salió / en camino / llegó / lista para recoger / problema de envío | `despachar`, `registrar_evento`, `listo_para_recoger` (avisos de paquete existentes) | Sucursal | Paquete de reposición | Texto de reposición y **enlace a la incidencia** (los paquetes normales no cambian) |
| Reposición recibida completa | `registrar_recepcion` → `reposicion_recibida` | Responsable o grupo | Siempre | «La sucursal recibió completa la reposición… Falta que confirme la solución» |
| Reposición recibida con diferencias | `registrar_recepcion` → nueva incidencia | Grupo | Siempre | Aviso de creación de la **nueva** incidencia, relacionada con la original (la original no recibe aviso) |

## Destinatarios

- **Sucursal:** la cuenta cliente dueña del pedido de la incidencia; nunca se avisa de su propia acción.
- **Lurima (grupo operativo):** usuarios activos con `incidencia.gestionar`, sin el rol `admin`, que sean globales o
  pertenezcan al almacén de la incidencia (o, si no tiene, a los que surtieron el pedido o al de recolección). Es la
  misma regla con la que la lista decide quién puede ver la incidencia.
- **Responsable:** si la incidencia tiene `responsable_id` (asignable hoy solo por la API) y esa persona está activa y
  puede gestionar incidencias, la conversación (mensaje, reapertura, recepción de reposición) y la confirmación van solo a
  ella. No se creó ninguna pantalla de asignación.
- **Respaldo admin (determinista):** si, sin el autor, el grupo operativo queda vacío, el aviso va a los usuarios activos
  con rol `admin` (sin el autor). Si el grupo tiene alguien, el admin no recibe nada.
- **Autor:** se excluye siempre (`actor_ids()`).

## Duplicados y ruido

Clave de evento única (`inc{id}_creada`, `inc{id}_seg{id_de_la_entrada}`; los avisos de paquete conservan su clave)
+ `uq_notif_evento` + `ON CONFLICT DO NOTHING`. Sin avisos por cambios de estado sin texto ni por notas automáticas.

## Enlaces

- Sucursal: `/cuenta/incidencias/{id}` (portal de empresas); cliente de tienda: `/cuenta/pedidos/{pedido}`.
- Lurima: `/admin/incidencias?abrir={id}` abre el modal existente de esa incidencia aunque no esté en el filtro ni en la
  página. Si no existe o no hay acceso, avisa en la página y no rompe nada. **Provisional** hasta la página de detalle
  de la Etapa 3. Los avisos antiguos conservan sus enlaces, que siguen siendo válidos.

## Interfaz (mínima)

- `ListaNotificaciones`: los avisos «Título\nDetalle» muestran el título destacado y el detalle debajo; los de una línea
  se ven igual que antes.
- `Posventa.tsx` (Incidencias): lee `?abrir=` y abre el modal; al cerrarlo limpia el parámetro.

## Pendientes y decisiones

- **Nombre del actor:** los textos usan «Lurima», como los ejemplos de la autorización. La decisión D-1 sigue abierta.
- La confirmación solo avisa al responsable; como hoy no hay pantalla de asignación, en la práctica no avisa a nadie.
- La creación manual por el personal no avisa a la sucursal (no estaba en el catálogo aprobado).
- El modal muestra el formulario de envío de la reposición a usuarios sin `surtido.operar` (por ejemplo, atención), que
  reciben un 403. Es un comportamiento anterior, fuera del alcance.
- No se agrupan ráfagas de mensajes (un aviso por mensaje).
