# Etapa 3A · 02 — Propuesta de rediseño del módulo de incidencias

Base: [01_auditoria_estado_actual.md](01_auditoria_estado_actual.md). Las decisiones marcadas **[Aprobar]** están reunidas
en §11.

## 1. Principios

1. **La pregunta «¿me toca?» se contesta antes de abrir nada.** Lo primero que se ve es el turno, no el estado técnico.
2. **Una sola fuente de verdad:** el frontend **muestra** el turno que calcula `turno_service`; nunca lo deduce. Solo
   traduce códigos a textos y colores, con una tabla fija.
3. **Cada incidencia tiene su página** y, en ella, la acción que se espera está arriba.
4. **Lo humano destaca y lo automático se atenúa.**
5. **Cambios incrementales:** se reutilizan rutas, endpoints, componentes y validaciones que ya funcionan.

## 2. Bandejas

Las pestañas filtran con `?turno=` (Etapa 1) y sus contadores salen de `incidencias_por_turno`. La bandeja inicial
es **«Te toca»** **[Aprobar D-2]**.

### Sucursal (`/cuenta/incidencias`)

| Pestaña | Turnos (backend) | Por qué |
|---|---|---|
| **Te toca** (inicial) | `sucursal_responder`, `sucursal_recibir`, `sucursal_confirmar` | Lo único que exige acción |
| Esperando a Lurima | `lurima_atender`, `lurima_responder`, `lurima_reposicion` | Seguimiento, sin acción |
| Cerradas | `cerrada` | Consulta |
| Todas | — | Búsqueda o histórico |

### Lurima (`/admin/incidencias`)

| Pestaña | Turnos | Por qué |
|---|---|---|
| **Te toca** (inicial) | `lurima_atender`, `lurima_responder`, `interna` | Acción de atención |
| En reposición | `lurima_reposicion` | Se mueve por el almacén y el envío |
| Esperando a la sucursal | `sucursal_responder`, `sucursal_recibir`, `sucursal_confirmar` | Seguimiento |
| Cerradas · Todas | `cerrada` · — | Consulta |

**Almacén:** misma bandeja, más un filtro **«Por enviar»**: incidencias con un paquete de reposición en estado `preparado`
(dato de `reposiciones[].estado`, no un cálculo de turno), visible solo para quien tiene `surtido.operar`. Es la bandeja
inicial de ese perfil **[Aprobar D-5]**.

**Por qué:** hoy el usuario abre cada incidencia para saber si le toca. Con la pestaña «Te toca» como inicial, la lista
es la tarea del día; el resto queda a un clic.

## 3. Listados

### Panel (escritorio, ≥ 1024 px): tabla de 6 columnas

| Incidencia | Solicitud · cliente | Turno | Prioridad | Última actividad | — |
|---|---|---|---|---|---|
| **INC-…0005** · Otro<br/>Etiqueta con otro nombre… | PED-…0001<br/>Clínica San Rafael | ● Respondió la sucursal | Media | hace 2 h | → |

- La fila entera abre el detalle. La descripción se trunca a una línea; las evidencias pasan al detalle.
- **Folio de la solicitud** (`pedido_folio`, ya en la API) en lugar de «Pedido #4».
- **Prioridad** como texto con ícono, para no confundirla con el color del turno.

### Panel (móvil y tableta, < 1024 px): tarjetas

```
┌───────────────────────────────────────────┐
│ ● Respondió la sucursal          hace 2 h │
│ INC-2026-000005 · Otro                    │
│ PED-2026-000001 · Clínica San Rafael      │
│ “Dice «Sucursal Norte»…”         Media  › │
└───────────────────────────────────────────┘
```

Resuelve el desbordamiento A5: nada queda fuera de la pantalla.

### Sucursal

Se conserva la lista actual (funciona bien en móvil), con el **chip de turno** en lugar del estado y «hace 2 h» en lugar de
la fecha absoluta.

**Por qué:** el turno y la antigüedad son lo que ordena el trabajo; el estado técnico queda en el detalle.

## 4. Indicadores de turno

Un componente `ChipTurno` con una tabla fija de código → texto y color, por portal. Las incidencias que piden acción usan
un chip **relleno**; las de seguimiento, un chip **de contorno**.

| Turno | Sucursal ve | Lurima ve | Estilo |
|---|---|---|---|
| `sucursal_responder` | **Te toca responder** | Esperando a la sucursal | Sucursal: relleno ámbar · Lurima: contorno gris |
| `sucursal_recibir` | **Te toca recibir la reposición** | Esperando recepción | Sucursal: relleno ámbar · Lurima: contorno gris |
| `sucursal_confirmar` | **Te toca confirmar la solución** | Esperando confirmación | Sucursal: relleno verde · Lurima: contorno gris |
| `lurima_atender` | Esperando a Lurima | **Por atender** | Lurima: relleno coral · Sucursal: contorno gris |
| `lurima_responder` | Esperando a Lurima | **Respondió la sucursal** | Lurima: relleno coral · Sucursal: contorno gris |
| `lurima_reposicion` | Reposición en camino | **Reposición en curso** (almacén con preparado: **Por enviar**) | Contorno azul · almacén: relleno azul |
| `interna` | — | **Por atender** (interna) | Relleno coral |
| `cerrada` | Cerrada | Cerrada | Gris sin borde |

**Tiempo:** «hace 3 h / 2 d» calculado de `turno_desde` (desde cuándo espera) en el chip y de `ultima_actividad` en la
columna. Es solo formato de una fecha que ya entrega la API; requiere un formateador relativo nuevo en `lib/formato.ts`.
Más de 48 h en «Te toca» se resalta **[Aprobar D-10]**.

**Por qué:** el color distingue «me toca» (relleno) de «solo sigo» (contorno) sin leer; el texto dice qué hacer.

## 5. Detalle de incidencia

### 5.1 Una página por incidencia en ambos portales

- **Lurima:** nueva ruta `/admin/incidencias/:id`, con `GET /api/admin/incidencias/<id>` (ya valida el alcance). El
  modal deja de ser el mecanismo principal **[Aprobar D-3]**.
- **Sucursal:** se reorganiza la página actual `/cuenta/incidencias/:id`.

### 5.2 Estructura (escritorio)

```
← Incidencias (vuelve con los filtros)                         INC-2026-000007
┌─────────────────────────────────────────────────────────────────────────────┐
│ Diferencia en recepción · Alta · En atención         ● Te toca recibir · 2 h│
│ Creada 25 nov 12:32 · PED-2026-000004 → · Clínica San Rafael                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ SIGUIENTE PASO  La reposición PAQ-…0007 llegó. Registra su recepción.       │
│                 [ Registrar recepción ]                                      │
└─────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────┬──────────────────────────────┐
│ Conversación                                  │ Contexto                     │
│  ┌ Sucursal · 12:32 ───────────────────────┐ │  Artículo: Bata dama M        │
│  │ Bata dama (M) para Rosario: faltante…    │ │  Empleado: Rosario Ramírez    │
│  └──────────────────────────────────────────┘ │  Solicitud: PED-…0004 →       │
│   · Reposición PAQ-…0007 preparada · 12:32   │  Reposición                   │
│   · Enviada con Estafeta, guía REP-AUD-01    │   PAQ-…0007 · Entregado       │
│   · Entregada en la sucursal                 │   Estafeta · REP-AUD-01       │
│                                               │  Relacionadas                 │
│ [Escribe a Lurima…]              [📎] [Enviar]│   (si aplica)                 │
└──────────────────────────────────────────────┴──────────────────────────────┘
```

- **Encabezado (fijo):** folio, tipo, prioridad, estado (texto secundario), chip de turno con antigüedad, fecha de
  creación, solicitud y cliente.
- **Siguiente paso:** una franja con la acción esperada, según el turno y el perfil (§6). Si no le toca a quien mira,
  explica a quién y desde cuándo («Esperando a la sucursal desde hace 5 h»).
- **Columna principal:** conversación con eventos intercalados (§5.3) y el campo de respuesta al final.
- **Columna de contexto (secundaria):** artículo, empleado, solicitud (enlace), paquete y guía, reposiciones (estado,
  paquetería, guía) e incidencias relacionadas: `reposicion_de` y las de la misma partida, que el pedido ya entrega.
  No se inventa ningún dato.

### 5.3 Conversación frente a eventos

| Entrada | Presentación |
|---|---|
| Mensaje humano | Bloque con autor destacado (sucursal a un lado, Lurima al otro o con otro fondo), hora y adjuntos |
| Evento automático (creación, cambio de estado sin texto, notas de reposición) | Línea centrada, gris y con ícono, sin autor tipo mensaje: «· Reposición PAQ-…0007 enviada con Estafeta, guía REP-AUD-01 · 12:32» |
| Resolución | Bloque distinguido «Resolución»; si viene de la recepción de una reposición: «Se resolvió al recibir la reposición PAQ-…» (no «la sucursal») |

Para clasificar sin duplicar la lógica, el serializador agrega a cada entrada de `seguimiento` un campo `clase`
(`mensaje` | `evento`) calculado con la función **existente** `turno_service.es_humana`. Es un campo derivado, sin
migración y sin reglas nuevas **[Aprobar D-4]**. El frontend no usa expresiones regulares sobre el texto.

**Por qué:** hoy las notas automáticas parecen mensajes de una persona y la resolución automática se atribuye a la
sucursal (S4). Separarlas evita esa confusión y deja la conversación legible.

### 5.4 Móvil

Una columna: encabezado compacto → Siguiente paso (con su botón) → conversación → contexto plegable («Detalles de la
solicitud y la reposición»). El campo de respuesta queda al final; en la sucursal se conserva «Tomar foto».

## 6. Siguiente paso y acciones por perfil

| Turno | Sucursal | Atención | Almacén |
|---|---|---|---|
| `sucursal_responder` | **Responder** (enfoca el campo) | Esperando a la sucursal | — |
| `sucursal_recibir` | **Registrar recepción**: reutiliza `RecepcionPaquete` desde la incidencia **[Aprobar D-7]** | Esperando recepción | — |
| `sucursal_confirmar` | **Confirmar solución / Reabrir** (bloque actual) | Esperando confirmación | — |
| `lurima_atender` / `lurima_responder` | Esperando a Lurima | **Responder** · Resolver… · Preparar reposición | Responder (si gestiona incidencias) |
| `lurima_reposicion` | Reposición en camino (guía visible) | Reposición en curso (sin el formulario de envío) | **Enviar con guía** / Marcar entregada |
| `cerrada` | Solo lectura | Solo lectura | Solo lectura |

**Permisos en la interfaz** (sin tocar el backend, que sigue validando):

- El formulario de envío y «Marcar como entregada» solo se muestran con `puede('surtido.operar')`. Sin ese permiso, la
  reposición se ve en solo lectura con su estado. Así se corrige A2 sin debilitar el 403.
- «Preparar otra reposición» solo cuando no hay una reposición vigente **[Aprobar D-6]**.
- Un 403 se muestra como «No tienes permiso para ver incidencias», no como «Sin registros» (C1).
- Consulta (auditor) y aprobador: se mantiene la consulta desde el pedido. La tarjeta muestra el chip de turno y la fecha;
  dar acceso a la lista sería un cambio de permisos, fuera de alcance **[Aprobar D-8]**.

## 7. Navegación desde notificaciones

- `aviso_incidencia.enlace_lurima` pasa a `/admin/incidencias/{id}` (un cambio de una línea).
- **Compatibilidad:** `/admin/incidencias?abrir={id}` redirige a `/admin/incidencias/{id}` para los avisos ya enviados
  **[Aprobar D-11]**.
- **Sin acceso o inexistente:** la página de detalle muestra «No se encontró la incidencia o no tienes acceso», con
  enlace a la bandeja (hoy el backend ya responde 403/404).
- **Regreso:** «← Incidencias» vuelve a la bandeja con sus filtros, guardados en la URL (`?turno=…&pagina=…`).

## 8. Contadores, inicio y solicitud

- **Inicio de la sucursal:** «Incidencias que te esperan: N» (de `incidencias_te_esperan`, ya en `/api/cuenta/resumen`),
  con enlace a la pestaña «Te toca».
- **Panel de Lurima:** el mismo contador por turno en `panel_solicitudes` (`/api/admin/reportes/solicitudes`), reutilizando
  `turno_service.resumen`. Es un cambio pequeño de backend **[Aprobar D-9]**.
- **Qué sigue (solicitud):** «N incidencias te esperan» usando el `turno` de las incidencias que ya trae el pedido (lectura,
  no cálculo), con enlace a cada una.
- **Tarjetas de incidencias en la solicitud y en `PedidoAdmin`:** una fila por incidencia con folio, tipo, chip y enlace a
  su detalle.

## 9. Diseño adaptable

| Ancho | Bandeja | Detalle |
|---|---|---|
| ≥ 1024 px | Tabla de 6 columnas | Dos columnas (conversación + contexto) |
| 640–1023 px (tableta) | Tarjetas en dos columnas | Una columna; contexto plegable |
| < 640 px (móvil) | Tarjetas en una columna | Una columna; Siguiente paso arriba; contexto plegable |

Objetivos medibles: sin desplazamiento horizontal; la acción principal visible sin desplazarse en 390×844.

## 10. Lo que no cambia

Reglas de turno (Etapa 1), reglas y destinatarios de avisos (Etapa 2, salvo el enlace), permisos del backend, estados,
transiciones, reposición, cierre por la sucursal, modelo de datos. Sin migraciones.

## 11. Decisiones que requieren aprobación

| ID | Decisión | Recomendación |
|---|---|---|
| D-1 | Nombre visible del actor que atiende (abierta desde la Fase 3) | «Lurima» en chips y avisos; «Distribuidora Lurima» en textos largos |
| D-2 | Pestañas de §2 y «Te toca» como bandeja inicial | Aprobar |
| D-3 | Página de detalle en el panel reemplaza al modal (el modal desaparece) | Aprobar; el modal se retira cuando la página esté validada |
| D-4 | Campo `clase` (mensaje/evento) en `seguimiento`, calculado con `es_humana` | Aprobar (backend pequeño, sin migración) |
| D-5 | Filtro «Por enviar» para quien tiene `surtido.operar`, como bandeja inicial del almacén | Aprobar |
| D-6 | Ocultar «Preparar otra reposición» si hay una vigente | Aprobar (solo presentación; el backend no cambia) |
| D-7 | Registrar la recepción de una reposición desde la incidencia, reutilizando `RecepcionPaquete` | Aprobar |
| D-8 | Perfiles de consulta: siguen consultando desde el pedido (sin lista) | Aprobar; dar acceso a la lista sería un cambio de permisos |
| D-9 | Contadores por turno en `panel_solicitudes` | Aprobar (backend pequeño) |
| D-10 | Tiempo relativo y resaltado a partir de 48 h | Aprobar el umbral o proponer otro |
| D-11 | Redirigir los enlaces `?abrir=` antiguos a la nueva página | Aprobar |
