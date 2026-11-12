# Auditoría final — Rediseño del portal empresarial Salud Digna

Rama: `feature/rediseno-portal-salud-digna` (desde `main` 5e22ff0). Fecha: 12-nov-2026.
Alcance: solo frontend. Criterios de aceptación: sección 13 de `plan-rediseno-portal-salud-digna.md`.

## 1. Validaciones ejecutadas

| Validación | Resultado |
|---|---|
| `tsc --noEmit` | Sin errores |
| `vitest run` | 15 archivos, **103 pruebas pasan** |
| `vite build` | Correcto |
| CSS del panel y de LURIMA, antes y después (build de `main` frente al de la rama, regla por regla) | Sin diferencias en las reglas en uso. Las 12 reglas que difieren son clases que ya no se usan (la regla desaparece al dejar de usarse); `h-64` sigue existiendo como `lg:h-64` |
| axe-core (WCAG 2.0/2.1 A y AA) en 7 pantallas del portal × 360 y 1280 px | 0 violaciones (una lectura intermedia a 360 px era un fundido a mitad de animación; con la animación terminada, 0) |
| Teclado en `Modal` | El foco entra, no sale con Tab/Mayús+Tab, Escape cierra, el foco vuelve al botón de origen |
| Desbordamiento horizontal en 360, 768, 1024, 1366 y 1920 px (6 pantallas del portal) | 0 px tras corregir un grid del asistente (ver 3). Con la animación de entrada pendiente se mide un falso positivo de 8 px a 360 px; al terminar la animación son 0 |
| Primer Tab del portal | «Saltar al contenido»; `aria-current="page"` en la sección activa; sin marca ni pie de LURIMA |
| Notificación → `/cuenta/pedidos/8` | Abre el detalle |
| Backend, `package.json`, `features/admin/*` | Sin cambios |

Todas las pruebas de navegador usaron datos simulados (`page.route`); no se escribió en ninguna base de datos.

## 2. Criterios de aceptación (sección 13)

| # | Criterio | Estado |
|---|---|---|
| 1 | Sin encabezado, pie ni marca de LURIMA en `/cuenta/*` para empresas | Cumple (verificado) |
| 2 | LURIMA sin regresiones | CSS idéntico; **hallazgo H-1** (preexistente) |
| 3 | Panel sin cambios visuales; `ui.tsx` revisado | CSS idéntico. `ui.tsx` cambió solo en `Modal` (ver 4) |
| 4 | `/cuenta/pedidos/:id` abre desde notificaciones | Cumple |
| 5 | Inicio con indicadores reales y estados de carga/error/vacío | Cumple |
| 6 | Catálogo sin precios; no es un carrito | Cumple |
| 7 | Selección de borrador destino | Cumple (pruebas) |
| 8 | Mismas llamadas `POST`/`PUT /cuenta/pedidos-corporativos` | Cumple (pruebas del asistente) |
| 9 | Lista con filtros, paginación y estados; lo no soportado, documentado | Cumple; B-1 y B-3 documentados |
| 10 | Empleados: lo que el backend permite | Cumple; sin eliminar ni importar |
| 11 | Notificaciones y Mi cuenta con datos actuales | Cumple |
| 12 | Sin desbordamiento horizontal | Portal cumple; **H-1** en el encabezado de LURIMA |
| 13 | Teclado, foco, `aria-current`, saltar, drawer, contraste AA | Cumple; falta prueba manual con lector de pantalla |
| 14 | Typecheck, build y pruebas | Cumple |
| 15 | Sin backend, BD, autenticación ni dependencias | Cumple |
| 16 | Commits pequeños con rutas explícitas | Pendiente de autorización |

## 3. Correcciones hechas durante la auditoría

- `SolicitudCorporativa.tsx`: la cuadrícula de empleados del asistente no era `minmax(0,1fr)` en móvil; un nombre largo ensanchaba la columna y producía 30 px de desborde a 360 px. Se añadió `grid-cols-1`.
- Contraste (bloque 9): botón verde del portal 3,8:1 → 5,1:1; placeholders 2,5:1 → 4,6:1 (solo dentro de `.tema-sd`).

## 4. Revisión de impacto de `ui.tsx` (`Modal`)

`Modal` ahora usa `useAtraparFoco` (foco atrapado, Escape, devolución del foco). Lo usan 16 archivos, incluido el panel. El cambio es solo de teclado y foco; no altera marcado visual ni API. No se probó un modal abierto desde otro modal (no hay ninguno en el código).

## 5. Hallazgos abiertos

| Id | Hallazgo | Dónde | Propuesta |
|---|---|---|---|
| H-1 | El encabezado público de LURIMA necesita 364 px de ancho mínimo: a 360 px (con barra de desplazamiento visible, 345 px útiles) desborda ~19 px y a 360 px sin barra ~4 px. Estaba en `main`; el portal no lo introdujo | `tienda/TiendaLayout.tsx` (encabezado) | Reducir el espaciado o el botón «Entrar» por debajo de 380 px. Requiere autorización (alcance LURIMA ya integrado) |
| H-2 | `tinta-400` sobre el fondo crema de la tienda mide 4,2:1 | Tienda | Oscurecer ese texto en la tienda |
| B-1 | `GET /cuenta/pedidos` no acepta listas de estados | Backend | Aceptar `estado=a,b`; hoy el portal filtra de uno en uno |
| B-2 | El resumen de solicitudes no trae número de empleados ni última actualización | Backend | Agregarlos al resumen |
| B-3 | No hay búsqueda por folio en el servidor | Backend | `?folio=`; hoy se filtra la página cargada |
| B-4 | No hay filtro de catálogo por puesto; el asistente baja todo el catálogo | Backend | `?puesto=` |
| B-9 | No hay filtro de notificaciones no leídas | Backend | `?leida=0` |
| P-1 | Marca Salud Digna como espacio sustituible; sin logotipo ni autorización oficial | Identidad | Entregar recursos oficiales |
| P-2 | `ListaNotificaciones` es compartida con el panel (`Sistema.tsx`): ahí también aparecen la alerta de error y el botón deshabilitado | Panel | Revisión visual |

## 6. Límites de lo verificado

Sin pruebas con datos reales ni con envíos al backend. Sin pruebas en Safari ni con lector de pantalla. axe cubre solo una parte de WCAG.

## 7. Archivos ajenos que no deben entrar en los commits

`frontend/package-lock.json`, `frontend/tsconfig.tsbuildinfo`, `repomix-output.xml`, `backend/seeds/generar_imagenes.py`, `.claude/`, `CLAUDE.md`, `recursos/`.
