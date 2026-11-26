# Etapa 1 — Turno de atención de las incidencias (backend)

Rama: `feature/turnos-incidencias-etapa1` (copia aislada, desde `db2113b`). Fuente de las reglas:
`especificacion-funcional-incidencias-fase3.md` (§4–§6, §12), con las correcciones de la autorización de la etapa:
orden por fecha real e independencia de las incidencias nacidas en una reposición.

## Qué se agregó

`backend/app/services/turno_service.py` es la **única** implementación del turno. No persiste nada: es una lectura
derivada del estado, del seguimiento y de los paquetes de reposición de la incidencia.

| Función | Uso |
|---|---|
| `calcular(estado, corporativa, seguimiento, reposiciones, creado)` | Núcleo puro (sin base de datos) |
| `turno_incidencia(inc)` / `turnos(incs)` | Una o varias incidencias; `turnos` usa 2 consultas en total |
| `contar(consulta)` / `resumen(consulta, actor)` | Contadores por turno y «te esperan» |
| `codigos(param)` / `filtrar(consulta, codigos)` | Filtro `?turno=` en las listas |
| `lado(s)`, `ordenar(seg)`, `es_humana(s)` | Autor, orden cronológico y clasificación de entradas |

Resultado (`Turno`): `codigo`, `actor` (`lurima`, `sucursal` o `None`), `desde` y `ultima_actividad`.

## Regla (precedencia)

1. `cerrada` → `cerrada`.
2. Sin pedido corporativo (tienda, transferencia, devolución) → `interna`.
3. `resuelta` → `sucursal_confirmar` (aunque la sucursal escriba después).
4. Paquete de reposición **de esta incidencia** entregado sin recepción → `sucursal_recibir`.
5. Paquete de reposición en `preparado`, `despachado`, `en_transito`, `incidencia` o `listo_para_recoger` → `lurima_reposicion`.
6. Sin mensajes humanos → `lurima_atender`.
7. Un evento de Lurima posterior al último mensaje humano (cambio de estado o nota automática) → `lurima_atender`.
8. Último mensaje humano de Lurima → `sucursal_responder` (incluye los mensajes ambiguos: criterio provisional de la Fase 3 §6).
9. Último mensaje humano de la sucursal → `lurima_responder`.

**Mensaje humano:** no es la creación (`estado_anterior` nulo), no es del sistema (sin usuario ni cliente), tiene texto
o adjuntos y no es una nota automática. **Notas automáticas:** los cuatro textos fijos de
`logistica_service._nota_incidencia`, reconocidos por patrón completo. `test_notas_reales_se_reconocen` falla si esos
textos cambian. **Cambio solo de responsable:** no cambia el turno ni cuenta como actividad.

**Orden cronológico:** por `creado` y, a igual fecha (varias entradas de una misma transacción comparten `now()`),
por `id`. Una entrada sin fecha se considera la más reciente. El serializador entrega el seguimiento con el mismo orden.

**Última actividad:** la fecha más reciente del seguimiento, salvo los cambios solo de responsable; si no hay
seguimiento, `incidencia.creado`. Nunca `incidencia.actualizado`, que no cambia con los mensajes.

**`desde`:** fecha de la entrada que fijó el turno (el último mensaje, el evento posterior, la entrada `→ resuelta`,
`→ cerrada` o la creación). Para las reposiciones, la última actividad.

## Integraciones

| Consumidor | Cambio |
|---|---|
| `serial.incidencia` (todas las respuestas con incidencias: listas, detalles y la solicitud en ambos portales) | Nuevos `turno`, `turno_actor`, `turno_desde`, `ultima_actividad` y `reposicion_de`; `seguimiento[].lado`; seguimiento en orden cronológico; `respondio_sucursal` = `turno == "lurima_responder"` |
| `GET /api/admin/incidencias`, `GET /api/cuenta/incidencias` | Filtro opcional `?turno=a,b` (400 si el código no existe); mismo orden y paginación |
| `GET /api/cuenta/resumen` | Nuevos `incidencias_por_turno` e `incidencias_te_esperan` (turnos de la sucursal) |
| `GET /api/admin/reportes/dashboard` | Nuevos `incidencias_por_turno` e `incidencias_te_esperan` (turnos de Lurima), con el mismo alcance que `incidencias_abiertas` |

`incidencias_abiertas` se conserva sin cambios: cuenta por estado y la interfaz actual lo muestra con esa etiqueta.

## Cambio de comportamiento

`respondio_sucursal` antes era verdadera si la última entrada tenía `cliente_id`, lo que incluía la creación hecha
por la sucursal (manual o automática). Ahora solo es verdadera cuando hay una respuesta real de la sucursal por atender.
La etiqueta «Respondió la sucursal» del panel deja de aparecer en incidencias recién creadas (era el defecto N-05).

## Pendiente de decisión

- `listo_para_recoger` en una reposición se trata como «en curso» (Lurima); la especificación no lo define.
- Si la sucursal escribe mientras una reposición está en curso, el turno sigue siendo `lurima_reposicion` (la
  precedencia de la especificación pone la reposición antes que el seguimiento).
- El conteo de Lurima incluye `lurima_reposicion` aunque el paquete ya vaya en tránsito (la especificación sugería
  contarlo solo si está `preparado`); se entrega el desglose `incidencias_por_turno` para que la interfaz decida.
- El filtro `?turno=` calcula en Python sobre las candidatas (atajo documentado en el código).
