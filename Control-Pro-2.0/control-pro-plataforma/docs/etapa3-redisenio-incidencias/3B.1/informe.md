# 3B.1 — Base de presentación · Informe

Copia `Control_Pro_etapa1_turnos`, rama `feature/turnos-incidencias-etapa1`, sin commit. Fecha: 25-nov-2026.

## 1. Objetivo

Que el frontend pueda **mostrar** el turno de una incidencia, su antigüedad y si cada entrada del historial es un
mensaje o un evento, **sin calcular nada**: todo sale del backend (`turno_service`). Ninguna pantalla cambia todavía;
el uso en bandejas empieza en la 3B.2.

## 2. Archivos

| Archivo | Cambio |
|---|---|
| `frontend/src/api/tipos.ts` | Tipos `TurnoIncidencia` (8 códigos), `LadoSeguimiento`, `ClaseSeguimiento`; en `Incidencia`: `turno`, `turno_actor`, `turno_desde`, `ultima_actividad`, `reposicion_de`, `seguimiento[].lado`, `seguimiento[].clase` |
| `frontend/src/components/ChipTurno.tsx` (nuevo) | Chip de presentación y `textoTurno()` |
| `frontend/src/lib/formato.ts` | `haceTiempo(fecha, { corto })` |
| `backend/app/api/serial.py` | `seguimiento[].clase` = `"mensaje"` si `turno_service.es_humana(s)`, si no `"evento"` |
| `frontend/src/test/chipturno.test.tsx` (nuevo) | 27 pruebas |
| `backend/tests/test_clase_seguimiento.py` (nuevo) | 2 pruebas de integración |

## 3. Cambios

### Tipos (contrato real del backend)

`serial.incidencia` siempre entrega `turno` (uno de los 8 códigos), `turno_actor` (`lurima`, `sucursal` o `null`),
`turno_desde` y `ultima_actividad` (ISO o `null`) y `reposicion_de` (`{id, folio}` o `null`). Se declararon como
obligatorios con los nulos reales; sin `any`. El único dato de prueba que construye una `Incidencia` usa `as Incidencia`
y no se rompe.

### ChipTurno

- Tabla fija código × portal → texto, tipo y tono (§4 de la propuesta). No decide nada: no recibe más datos que el
  código, el portal y, opcionalmente, la fecha `desde`.
- **Tipos visuales:** `accion` (relleno + ícono de flecha), `seguimiento` (contorno + reloj), `cerrada` (gris +
  palomita), `desconocido` (borde discontinuo + círculo, texto «Sin información de turno»). El significado no depende
  solo del color: cada tipo tiene su ícono y el texto dice qué ocurre.
- **Atributos para pruebas y accesibilidad:** `data-turno`, `data-tipo`; el ícono es `aria-hidden` y el `title` lleva el
  tiempo largo («Te toca responder · hace 3 horas»).
- **Nunca excede su contenedor** (`max-w-full`): en espacios angostos el texto se parte y el tiempo queda junto.
- Nombre visible del actor: «Lurima» (recomendación D-1, aprobada con la propuesta).

| Código | Sucursal | Lurima |
|---|---|---|
| `sucursal_responder` | **Te toca responder** (ámbar) | Esperando a la sucursal |
| `sucursal_recibir` | **Te toca recibir la reposición** (ámbar) | Esperando recepción |
| `sucursal_confirmar` | **Te toca confirmar la solución** (verde) | Esperando confirmación |
| `lurima_atender` | Esperando a Lurima | **Por atender** (coral) |
| `lurima_responder` | Esperando a Lurima | **Respondió la sucursal** (coral) |
| `lurima_reposicion` | Reposición en proceso (contorno azul) | Reposición en curso (contorno azul) |
| `interna` | Seguimiento interno | **Por atender (interna)** (coral) |
| `cerrada` | Cerrada | Cerrada |

Ajuste respecto de la propuesta: para la sucursal, `lurima_reposicion` dice «Reposición en **proceso**» y no «en camino»,
porque el turno también cubre el paquete preparado que todavía no sale (la propuesta decía «en camino»).

### haceTiempo

«hace unos segundos / hace 1 minuto / hace 5 minutos / hace 3 horas / hace 2 días» y la variante corta «ahora / 5 min /
3 h / 2 d». Desde 30 días muestra la fecha. Una fecha nula, vacía o inválida devuelve «—»; una fecha futura cuenta como
«hace unos segundos».

### Clase del seguimiento (backend)

Una línea en el serializador que reutiliza `es_humana` sobre las entradas ya cargadas: sin consultas nuevas y sin una
regla propia. Es un campo nuevo del contrato; no se quitó ni se renombró ninguno.

## 4. Pruebas

| Suite | Resultado |
|---|---|
| Vitest nuevas (`chipturno.test.tsx`) | 27/27: los 8 códigos × 2 portales, «acción» solo en los turnos propios de cada portal, nulo, vacío y desconocido, tiempo en el chip, fecha inválida, `haceTiempo` (nulos, singular, plural, 30 días, fecha futura, corto) |
| Vitest completa (`--maxWorkers=3`) | **222/222** (línea base: 195 + 27 nuevas) |
| `tsc -b --noEmit` | Sin errores |
| Pytest nuevas (`test_clase_seguimiento.py`) | 2/2: creación, cambio de estado sin texto, mensajes de ambos lados, solo un archivo, notas de preparación, envío y recepción de reposición; la clase coincide con `es_humana` entrada por entrada y es igual en ambos portales |
| Pytest de regresión (turnos, avisos, incidencias, reposición + nuevas) | 35/35 |
| Pytest completa (base desechable) | Ver §5 |

Todas las pruebas de backend corrieron con `scripts/pytest_desechable.py` sobre bases `cp_…_test` del servidor desechable
`cp-pruebas` (127.0.0.1:55432); cada base se eliminó al terminar.

## 5. Resultado de la suite completa de pytest

**287 passed, 0 failed** en 27 min 37 s (línea base antes de la 3B.1: 285; +2 nuevas). Base temporal
`cp_80be804a243e_test`, eliminada al terminar.

**Incidente durante la primera corrida (no relacionado con el código):** a las 13:28:51 el contenedor desechable
`cp-pruebas` fue detenido desde fuera de esta sesión (`docker stop`, seguido del arranque y la detención de un contenedor
ajeno, `loc-mariadb-fase7`). Como se había creado con `--rm`, Docker lo borró con sus bases. La corrida en curso pasó
48 pruebas y después todas dieron error por falta de base, así que se detuvo y no se considera un resultado.

**Con tu autorización** se recreó como `cp-pruebas-etapa3` (mismo puerto local, **sin `--rm`**, para que una detención
externa no borre los datos). La base visual `cp_etapa2_visual_test` se reconstruyó con el script de escenarios
(`visual`, `etapa2`, `auditoria`), con los mismos 7 folios, estados y turnos, y la suite se repitió completa con el
resultado de arriba.

## 6. Capturas (aplicación real de la copia)

El chip todavía no se usa en ninguna pantalla. Para validarlo con los estilos y el tema reales de cada portal, se montó
en vivo una galería temporal dentro de la página: los módulos de la copia se importaron desde el servidor de Vite y los
datos vinieron de la API real. No se modificó ningún archivo y la galería desaparece al recargar.

| Captura | Qué muestra |
|---|---|
| [01-sucursal-galeria-chips.png](capturas/01-sucursal-galeria-chips.png) | Portal de sucursal (tema `.tema-sd`): los 8 códigos + nulo + desconocido, y las 7 incidencias de la base desechable con su turno real de la API y su antigüedad |
| [02-lurima-galeria-chips.png](capturas/02-lurima-galeria-chips.png) | Panel de Lurima (atención): lo mismo en el portal `lurima` |
| [03-sucursal-movil-galeria.png](capturas/03-sucursal-movil-galeria.png) | 390 px: los chips se parten sin salirse de la tarjeta, sin desplazamiento horizontal |

Las capturas 01 y 02 se tomaron antes del ajuste `max-w-full`; en escritorio se ven igual, porque ahí no hace falta
partir el texto.

**Contraste medido** (WCAG, colores calculados en el navegador, fondo compuesto sobre blanco): sucursal 7,56–13,37:1;
Lurima 5,28–13,37:1 (el mínimo es el coral de «Por atender», por encima de AA 4,5:1 para texto pequeño).

**Evidencia de la API** (`GET /api/cuenta/incidencias/1` desde el portal, INC-2026-000001): `turno: sucursal_confirmar`,
`turno_actor: sucursal`, `turno_desde` y `ultima_actividad` presentes; las 4 entradas del historial (creación,
preparación, envío y recepción de la reposición) llegan con `clase: "evento"` y su `lado`.

## 7. Problemas detectados

1. **Chip angosto** (corregido): con `whitespace-nowrap` un chip largo con tiempo se salía de su contenedor a 390 px.
2. **Confirmación de la sucursal clasificada como «mensaje»:** la entrada «Solución confirmada por la sucursal» la escribe
   el código al pulsar «Confirmar», pero `es_humana` la considera mensaje (tiene texto y es de la sucursal). No afecta al
   turno, porque una incidencia confirmada ya está `cerrada`. Hay que decidirlo en la 3B.4 (ver §8). Lo mismo con el
   prefijo «Reabierta por la sucursal: …», que sí contiene el motivo escrito por la persona.
3. Coral de «Por atender» igual al de la prioridad «Alta» en la tabla actual: ya estaba auditado (H-15) y se resuelve en
   la 3B.2, al mostrar la prioridad con ícono y texto.

## 8. Decisiones

- `clase` sale exactamente de `es_humana`, como pide la etapa; no se tocó `turno_service`.
- **Pendiente para la 3B.4 (requiere tu decisión):** ¿la confirmación de la sucursal se muestra como evento? Opciones:
  a) dejarla como mensaje de la sucursal (es una acción suya y se le atribuye correctamente);
  b) agregar su texto fijo a las notas automáticas de `turno_service`. No cambia ningún turno, pero toca la lista de la
  Etapa 1.

  Recomendación: **a)**, y en la 3B.4 presentarla como un mensaje breve con el ícono de confirmación.

## 9. Riesgos pendientes

- La tabla del chip duplica nombres de turnos del backend (es una traducción, no una regla); si el backend agrega un
  código, el chip mostrará «Sin información de turno» hasta actualizar la tabla.
- `haceTiempo` usa el reloj del navegador; un reloj muy desfasado mostraría tiempos inexactos (las fechas futuras se
  tratan como recientes).

## 10. Criterios de aceptación

| Criterio | Estado |
|---|---|
| Tipos con los contratos reales, sin `any` | Cumplido |
| `ChipTurno` con los 8 códigos, ambos portales, alternativa neutral | Cumplido |
| El chip solo presenta (no calcula ni decide) | Cumplido: no recibe más que el código, el portal y la fecha |
| Contraste suficiente | Cumplido (≥ 5,28:1) |
| Formato relativo con nulos e inválidos | Cumplido |
| `clase` con `es_humana`, sin consultas nuevas | Cumplido |
| Vitest, pytest y regresión | Cumplido (ver §4–§5) |
| TypeScript sin errores | Cumplido |
| Capturas de validación | Cumplido |
