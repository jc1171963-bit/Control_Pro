# Plan — Rediseño del portal empresarial Salud Digna

Fecha: 12 de noviembre de 2026.

Alcance de este documento: fases 0 a 3 (verificación, auditoría, propuesta UX/UI y plan de implementación). **No se modificó código, backend, base de datos, estilos ni rutas, no se crearon commits ni ramas y no se hizo push.** Este documento es el único archivo creado y queda sin confirmar en Git.

Quién lo lee: el responsable del proyecto, que debe autorizar las decisiones de la sección 12 antes de implementar.

## Resumen ejecutivo

1. **LURIMA ya está integrada.** El Pull Request #1 se fusionó en `origin/main` (merge `5e22ff0`, 12-nov 10:33). El árbol es idéntico al de la rama `feature/rediseno-tienda-lurima`. Tu `main` local sigue en `e548863`, 9 commits atrás: hay que actualizarlo antes de crear `feature/rediseno-portal-salud-digna`. No lo hice porque esta etapa es solo de lectura.
2. **El portal ya tiene casi toda la funcionalidad.** Existen empleados, el asistente de solicitudes con borradores, el seguimiento con recepción y firma, notificaciones y datos de cuenta. El trabajo es de **presentación y organización**, no de reglas de negocio.
3. **Problema de fondo, comprobado en pantalla:** tras la integración de LURIMA, el portal se muestra dentro del encabezado y el pie de **Distribuidora Lurima**, con una segunda navegación lateral encima. Hoy el usuario de Salud Digna ve la marca LURIMA. Esto incumple la regla de separación de identidades y se resuelve con un layout propio.
4. **Faltan los recursos oficiales de Salud Digna.** En `recursos/` solo hay el logotipo de LURIMA y un prototipo (imagen de maqueta). No hay logotipo ni manual de marca de Salud Digna. La propuesta usa un espacio de marca sustituible y colores *medidos de la maqueta*, no oficiales.
5. **Hallazgo de un defecto existente:** varios filtros del portal (En surtido, En camino, Por recibir, Rechazadas o canceladas) y 6 de los 8 enlaces de los indicadores del inicio envían estados separados por coma, pero `GET /cuenta/pedidos` compara con igualdad exacta. Con esos filtros la lista sale vacía. El panel administrativo sí acepta comas. Corregirlo exige un cambio de una línea en el backend (sección 12, B-1).
6. **La maqueta choca con las reglas de negocio** en varios puntos (precios, aprobaciones, reportes, selector de sucursal, usuarios individuales). El plan indica qué se adopta, qué se adapta y qué se descarta (sección 9).
7. **Recomendación:** 10 bloques pequeños, que empiezan por el layout y la identidad, sin tocar el backend. Hay 6 decisiones tuyas pendientes antes del Bloque 1.

---

## 1. Estado real del repositorio

| Aspecto | Estado | Evidencia |
|---|---|---|
| Rama actual | `feature/rediseno-tienda-lurima` | `git branch --show-current` |
| HEAD | `2582d72`, sincronizado con `origin/feature/rediseno-tienda-lurima` (0 / 0) | `git rev-list --left-right --count HEAD...@{u}` |
| LURIMA integrada en `main` remoto | **Sí**, por merge `5e22ff0` (autor `d3ny25`, padres `e548863` y `2582d72`) | `git log origin/main` |
| Diferencia entre mi HEAD y `origin/main` | Ninguna (árboles idénticos) | `git diff --stat 2582d72 5e22ff0` sin salida |
| `main` local | `e548863`, **0 por delante y 9 por detrás** de `origin/main` | `git rev-list --left-right --count main...origin/main` |
| Rama del portal | No existe (ni local ni remota) | `git branch -a`, `git ls-remote --heads` |
| Staged | Vacío | `git diff --cached` |
| Modificados ajenos | `frontend/package-lock.json` (solo marcas `peer`), `repomix-output.xml` | `git status` |
| Sin seguimiento | `.claude/`, `CLAUDE.md`, `backend/seeds/generar_imagenes.py`, `recursos/`, `docs/auditoria-final-pre-push-lurima.md` y este plan | `git status` |

Antes del Bloque 1, con tu autorización, la secuencia segura sería:

1. `git switch main` (los archivos ajenos modificados no chocan con el cambio de rama).
2. `git pull --ff-only origin main` (avanza `main` solo si es posible sin merge).
3. `git switch -c feature/rediseno-portal-salud-digna`.
4. Verificar `git status` otra vez: los cambios ajenos deben seguir intactos y fuera de los commits.

Además, `CLAUDE.md` (sin seguimiento) debe ampliarse con una sección 4.2 que autorice por escrito el alcance del portal. Hoy limita el alcance a LURIMA y excluye `features/cuenta`.

## 2. Arquitectura actual

```
main.tsx → QueryClientProvider → AuthProvider → ToastProvider → RouterProvider (router.tsx)

/                  TiendaLayout (LURIMA)  ← ahora también envuelve TODO el portal
├─ pública         inicio, catalogo, producto/:slug, sucursales, acerca, preguntas-frecuentes, contacto
├─ acceso          entrar, registro, recuperar, cuenta/restablecer
└─ RequiereCliente
   ├─ checkout     (solo con CANAL_TIENDA)
   └─ cuenta       CuentaLayout (barra lateral)  ← portal actual
      └─ RequiereCliente empresa: empleados, solicitudes/nueva, solicitudes/:id/editar

/admin             RequiereUsuario → AdminLayout   (fuera de alcance)
```

- **Sesión:** el token vive en memoria y el refresh en cookie HttpOnly. `useAuth()` entrega `tipo` (`cliente` o `usuario`), `cliente` y `puede()`. Hay un solo tipo de cuenta para el portal: un `Cliente` de tipo `empresa`, que **representa a una sucursal** (con zona y división), no a una persona.
- **Datos:** TanStack Query con `staleTime` de 15 s por defecto. La API se consume con `get/post/put/patch/del` de `api/cliente.ts`.
- **Estilos:** Tailwind con `tinta` (azul oscuro neutro), `menta` (verde azulado de acento), `arena`, `coral`, y desde LURIMA `lurima` y `bienestar`. Los componentes compartidos de `components/ui.tsx` usan colores fijos `tinta`/`menta` y también los usa el panel administrativo.
- **Canal:** `GET /tienda/configuracion` devuelve `canal_tienda`. Apagado (por defecto) el sitio funciona como portal de sucursales: sin precios, carrito, checkout ni registro.

## 3. Inventario de rutas

| Ruta | Pantalla | Marco actual | Acceso | Nota |
|---|---|---|---|---|
| `/entrar`, `/registro`, `/recuperar`, `/cuenta/restablecer` | `Acceso` | LURIMA | Pública | Sin tienda, el registro dice "Alta de sucursales" |
| `/cuenta` | `InicioCuenta` | LURIMA + `CuentaLayout` | Cliente | Persona se redirige a `/cuenta/pedidos` |
| `/cuenta/pedidos` | `Pedidos` ("Mis solicitudes") | igual | Cliente | Filtros por etapa; búsqueda de folio solo en la página cargada |
| `/cuenta/pedidos/:id` | `PedidoDetalle` → `DetalleSolicitud` | igual | Cliente | **URL que usan todas las notificaciones del backend** |
| `/cuenta/solicitudes/nueva` | `ConstructorSolicitud` | igual | Empresa | Asistente de 3 pasos |
| `/cuenta/solicitudes/:id/editar` | `ConstructorSolicitud` | igual | Empresa | Borrador o devuelta |
| `/cuenta/empleados` | `Empleados` | igual | Empresa | |
| `/cuenta/notificaciones` | `Notificaciones` | igual | Cliente | |
| `/cuenta/direcciones` | `Direcciones` | igual | Cliente | Solo lectura para empresa |
| `/cuenta/perfil` | `Perfil` | igual | Cliente | Solo lectura para empresa |
| `/cuenta/favoritos` | `Favoritos` | igual | Cliente | Solo con tienda encendida |
| `/cuenta/corporativo/nuevo`, `/cuenta/corporativo/:id/corregir` | Redirecciones | — | Empresa | Se conservan |
| `/catalogo`, `/producto/:slug` | `Catalogo`, `Producto` | LURIMA | Pública | Sin ruta propia dentro del portal |
| `/admin/*` | Panel interno | `AdminLayout` | Usuario interno | **Fuera de alcance** |

## 4. Inventario de componentes

**Compartidos y delicados** (los usa el panel administrativo; no se modifican sin comprobar el impacto):

| Componente | Ubicación | Uso |
|---|---|---|
| `Boton`, `Campo`, `Entrada`, `Selector`, `Texto`, `Tarjeta`, `Estado`, `Vacio`, `Cargando`, `ErrorCaja`, `Aviso`, `Tabla`, `Paginacion`, `Modal`, `Firma`, `Cifra`, `useAviso` | `components/ui.tsx` | Portal y panel |
| `Aparecer`, `Contador`, `Esqueleto`, `EsqueletoLista`, `LineaProceso`, `Transicion`, `volarHacia`, `Palomita` | `components/movimiento.tsx` | Portal y panel |
| `Marca` | `features/tienda/TiendaLayout.tsx` | **Solo el panel**; no se reemplaza |
| `Visor360` | `components/Visor360.tsx` | Detalle de producto y selección |

**Del portal actual** (`features/cuenta/`):

| Componente | Líneas | Qué hace | Observación |
|---|---|---|---|
| `CuentaLayout` | 52 | Barra lateral de 240 px | Dentro de `TiendaLayout`; el enlace "Catálogo" saca al usuario del portal |
| `InicioCuenta` (en `SolicitudCorporativa.tsx`) | ~70 | Bienvenida, 8 indicadores, zona, borradores | Importa `Contacto` desde `features/admin/Organizacion` (dependencia cruzada) |
| `ConstructorSolicitud` | ~340 | Asistente: Empleados → Artículos → Revisar y enviar | Flujo central; sin pruebas automáticas |
| `SelectorArticulo` | ~50 | Color, talla, cantidad y excepción en modal | Duplica la selección de `Producto.tsx` |
| `Pedidos` | 54 | Lista de solicitudes con filtros y paginación | |
| `PedidoDetalle` / `DetalleSolicitud` | 245 / 440 | Detalle con línea de proceso, paquetes, recepción, entrega con firma, conformidad, incidencias e historial | Completo; solo requiere trabajo visual |
| `Empleados` (`Corporativo.tsx`) | 59 | Tabla y alta o edición en modal | `productoElegible` está exportado y **no lo usa nadie** |
| `ListaNotificaciones` (`Notificaciones.tsx`) | 39 | Lista paginada, "Leída", "Marcar todas" | Ya recibe `base` y `clave`, lo reutiliza el panel |
| `Perfil`, `Direcciones` | 62 / 77 | Datos de la sucursal y dirección, solo lectura | |

**De la tienda reutilizables en el portal:** `Catalogo`, `Producto` (con `AgregarASolicitud`), `ProductoCard`, `Cantidad` (nuevo, local a `Producto.tsx`), `Ubicaciones`, `Carrusel` (no aplica).

**Utilidades:** `lib/solicitud.ts` (`catalogoCompleto`, `agregarAlBorrador`, `elegible`, `sumarPartida`), `lib/formato.ts` (`ESTADOS`, `etiqueta`, `tono`, `fecha`, `fechaHora`, `mensajeError`), `lib/catalogo.ts` (`PUESTOS`, lista fija).

## 5. Flujo actual de solicitudes

```
Empleados ──► Artículos ──► Revisar y enviar ──► [Enviar a revisión]
(selección)   (por empleado,  (agrupado por       │
              regla por       empleado, dirección, │      Distribuidor (/admin, permiso pedido.aprobar):
              puesto,         notas, excepciones)  ▼      aprobar · devolver · rechazar · editar partidas
              excepción)                       en_revision ──► confirmado ──► … ──► entregado ──► cerrado
                                                     ▲   devuelto ◄─┘ (la sucursal corrige y reenvía)
 Guardar borrador en cualquier momento (POST/PUT /cuenta/pedidos-corporativos)
```

- **Estados** (`lib/formato.ts`): `borrador`, `en_revision`, `devuelto`, `rechazado`, `confirmado`, `en_preparacion`, `parcialmente_enviado`, `enviado`, `parcialmente_entregado`, `entregado`, `cerrado`, `cancelado`, `expirado`, más los de pago que no aplican a solicitudes.
- **Crear:** `POST /cuenta/pedidos-corporativos` con `borrador: true/false` e idempotencia por `clave_idempotencia`. **Editar o enviar:** `PUT /cuenta/pedidos-corporativos/:id` (`enviar`); si está `devuelto`, corrige y reenvía.
- **Validaciones del servidor:** empleado de la sucursal, regla por puesto (excepción justificada de al menos 10 caracteres), variante activa y cantidad máxima de 50.
- **Seguimiento posterior:** recepción por paquete (`POST /cuenta/paquetes/:id/recepcion`), entrega individual con firma (`POST /cuenta/entregas/:id`), conformidad (`…/conformidad`) e incidencias.
- **Agregar desde el detalle de producto** (`lib/solicitud.ts:34-47`): toma el borrador **más reciente** sin preguntar; si no hay borradores crea uno con la dirección predeterminada. Es el hallazgo que pediste evaluar.
- **El asistente baja todo el catálogo** (`catalogoCompleto`, `lib/solicitud.ts:11-16`): una petición por cada 48 productos, y filtra en el cliente.

## 6. Endpoints y servicios disponibles

Todos exigen sesión de cliente (`requiere_cliente`); los marcados *(E)* solo cuentas de empresa (`security/auth.py:101-110`).

| Endpoint | Uso en el portal | Contrato relevante |
|---|---|---|
| `GET /cuenta/resumen` *(E)* | Inicio | `solicitudes{borradores, en_revision, por_corregir, en_proceso, entregadas, rechazadas}`, `paquetes_en_camino`, `paquetes_por_recibir`, `entregas_pendientes`, `conformidades_pendientes`, `incidencias_abiertas`, `empleados_activos`, `zona{…, division{…}}` |
| `GET /cuenta/pedidos?canal=&estado=&pagina=&por_pagina=` | Lista | **Solo** esos filtros; `estado` por igualdad exacta (`cuenta.py:279-286`); `por_pagina` máximo 100; orden por `id` descendente |
| Resumen de cada solicitud | Lista | `id, folio, canal, estado, creado, articulos, sucursales[], reserva_expira, cliente` — **no incluye** número de empleados ni fecha de última actualización (`serial.py:179-185`) |
| `GET /cuenta/pedidos/:id` | Detalle | Agrega `detalles[]` (con empleado), `historial[]`, `aprobaciones[]` (decisión, motivo, usuario, fecha), `paquetes[]`, `entregas_individuales[]`, `incidencias[]`, `notas`, `direccion_envio` |
| `GET/POST/PUT /cuenta/empleados` *(E)* | Empleados | `{id, numero, nombre, puesto, area, activo}`; **no existe DELETE ni importación**; se desactiva con `activo=false` |
| `GET /cuenta/puestos-autorizados` *(E)* | Elegibilidad | `{puesto: [producto_id]}`, global, no depende de la empresa |
| `POST /cuenta/pedidos-corporativos` · `PUT …/:id` · `POST …/:id/enviar` *(E)* | Crear, guardar, enviar, corregir | Ver sección 5 |
| `GET /cuenta/notificaciones?pagina=` | Actividad y bandeja | `{items[{id, evento, mensaje, enlace, leida, fecha}], no_leidas, total, paginas}`; sin filtro de no leídas |
| `POST /cuenta/notificaciones/leer` | Marcar leídas | `{ids?}` |
| `GET /cuenta/direcciones` · `GET /cuenta/perfil` | Cuenta | Solo lectura para empresa; `PATCH /cuenta/perfil`, el cambio de contraseña y las escrituras de direcciones responden 403 `administrado_por_distribuidor` |
| `GET /tienda/productos`, `/productos/:slug`, `/categorias` | Catálogo | Públicos; paginación máxima de 48; facetas globales; devuelven precios aunque el frontend los oculte |
| `GET /tienda/configuracion` | Modo | `{canal_tienda}` |
| `/auth/cliente/login`, `/auth/refresh`, `/auth/logout` | Sesión | Sin cambios |

**Notificaciones al cliente:** el backend las genera en 14 puntos del código (`notificar_cliente`) y **las 14 enlazan a `/cuenta/pedidos/{id}`**. Esa ruta no puede cambiar.

## 7. Reglas de negocio identificadas (no se alteran)

| Regla | Origen | Consecuencia para el diseño |
|---|---|---|
| Aprobación solo del distribuidor (`pedido.aprobar`, rol `aprobador`, en `/admin`) | `admin_pedidos.py`, `permisos.py` | **No** hay pantalla de "Aprobaciones" en el portal |
| No existe aprobador de empresa | Modelo y permisos | No se crea flujo ni permisos |
| Precios ocultos en el flujo corporativo | `app/config.ts`, `DetalleSolicitud` | El portal no muestra importes |
| Una cuenta = una sucursal | `Cliente(tipo='empresa')` | No hay selector de sucursal ni usuarios individuales |
| Datos, dirección y contraseña de la sucursal los administra el distribuidor | `cuenta.py` (`_administrado_por_distribuidor`) | "Mi cuenta" es de solo lectura |
| Regla por puesto con excepción justificada | `ProductoPuesto`, `PedidoCorporativoSchema` | Se conserva tal cual en la selección |
| Un borrador por solicitud; reserva al aprobar | `pedido_service.py` | Sin cambios |
| `CANAL_TIENDA` global | `config.py` | No se toca |
| Estados y transiciones | `pedido_service.py` | No se crean estados nuevos |

## 8. Hallazgos UX/UI y de calidad

| # | Hallazgo | Evidencia | Gravedad |
|---|---|---|---|
| H1 | El portal hereda el encabezado, el pie y la marca de LURIMA y suma una segunda navegación | Captura con sesión de empresa simulada: encabezado "Distribuidora Lurima" sobre la barra lateral | **Alta** |
| H2 | Con sesión, el menú de LURIMA se parte en dos líneas a 1280 px ("Preguntas frecuentes", "Crear solicitud"); es una regresión visual de LURIMA, pero con el layout propio el portal deja de verla | Misma captura | Media |
| H3 | Filtros con listas separadas por coma devuelven vacío en el portal | `Pedidos.tsx:12-14`, `SolicitudCorporativa.tsx:74-80` contra `cuenta.py:279-286`; el panel sí usa `in_(split)` (`admin_pedidos.py:43`) | **Alta** (defecto existente) |
| H4 | "Filtrar por folio" solo actúa sobre la página cargada | `Pedidos.tsx:29`, no hay búsqueda en el backend | Media |
| H5 | El catálogo del portal está duplicado: el asistente trae todo el catálogo y repite la selección de variantes | `lib/solicitud.ts:11-16`, `SolicitudCorporativa.tsx:119-171` | Media |
| H6 | "Agregar al borrador" usa el más reciente sin preguntar | `lib/solicitud.ts:36-39` | Media |
| H7 | "Catálogo de productos" saca al usuario de la barra lateral al sitio público | `CuentaLayout.tsx:19` | Alta |
| H8 | La navegación móvil es una fila horizontal desplazable, sin encabezado propio ni notificaciones | `CuentaLayout.tsx:38-47` | Media |
| H9 | `Modal` no atrapa el foco; lo usan empleados, direcciones y el asistente | `ui.tsx:138-157` | Media |
| H10 | El inicio muestra 8 indicadores sin jerarquía y una línea de proceso estática (todo "pendiente") | `SolicitudCorporativa.tsx:25-29,65-67` | Baja |
| H11 | Dos consultas distintas piden el contador de notificaciones | `TiendaLayout` y `CuentaLayout` | Baja |
| H12 | Dependencia cruzada del portal hacia el panel: `Contacto` | `SolicitudCorporativa.tsx:20` | Baja |
| H13 | Código muerto: `productoElegible` | `Corporativo.tsx:13-16` | Baja |
| H14 | La lista de puestos es una constante en el frontend que debe coincidir con los datos del backend | `lib/catalogo.ts` | Baja |

## 9. Propuesta visual

### 9.1 Referencia y límites

La maqueta (`recursos/prototipo.png`) muestra el portal con barra lateral verde oscura, bienvenida, indicadores, accesos rápidos, últimos pedidos, catálogo con panel lateral y asistente de 3 pasos. **Es una orientación visual, no un recurso de marca.** No contiene el logotipo oficial como archivo.

**Colores medidos de la maqueta** (mediana por región, no oficiales; hay que validarlos con el manual de marca):

| Rol | Valor medido | Propuesta de token |
|---|---|---|
| Barra lateral | `#014339` (variación `#023D34`) | `sd-900` |
| Ítem activo y acento | `#299B2B` | `sd-500` |
| Acción primaria (botones) | `#089748` / `#13973A` | `sd-600` |
| Wordmark | `#07942B` | `sd-600` |
| Fondo de página | `#F3F7FE` | `sd-bg` |
| Tintes de tarjetas | `#EBF3FD`, `#E4EDFB` | `sd-50`, `sd-100` |
| Aviso (ámbar) | `#FCECD6` | reutiliza `amber` |

**Identidad:** un único archivo `app/identidad.ts` con `{ nombre: 'Salud Digna', logo: null | ruta, … }`. Mientras no exista el logotipo oficial, `MarcaPortal` muestra un espacio claramente sustituible (iniciales sobre un cuadro neutro y el nombre en texto), sin imitar el logotipo. No se implementa identidad dinámica por empresa ni se toca el backend.

### 9.2 Qué se adopta de la maqueta y qué no

| Elemento de la maqueta | Decisión | Motivo |
|---|---|---|
| Barra lateral verde con ítems | Adoptar | Navegación empresarial independiente |
| Bienvenida con foto del edificio | Adaptar: bienvenida sin foto | No hay recurso |
| Indicadores (total, pendientes, aprobados, rechazados) | Adaptar a los datos reales | Ver 9.4 |
| Accesos rápidos | Adoptar (4) | |
| Últimos pedidos | Adoptar con el nombre real de la solicitud | `GET /cuenta/pedidos` |
| "Pedido PED-000248" | Usar "Solicitud" + el folio del backend | Término del sistema |
| Selector "Sucursal: Matriz CDMX" | Mostrar la sucursal como texto, sin selector | Una cuenta = una sucursal |
| Usuario "Juan Pérez" | Mostrar el contacto responsable (`cliente.nombre`) | No hay usuarios individuales |
| Catálogo con precios y botón "Agregar" | Adaptar: **sin precios** | Decisión de negocio vigente |
| Filtro "Todos los proveedores" | Descartar | No existe el concepto |
| Panel "Mi Pedido" | Adaptar: "Solicitud en curso" (borrador por empleado, sin importes) | Debe distinguirse de un carrito |
| Asistente de 3 pasos | Adoptar: coincide con `PASOS` actual | |
| "Aprobaciones" y pantalla Aprobar/Rechazar | **Descartar** | Aprueba el distribuidor |
| "Reportes" | Descartar | No hay endpoint para el cliente |
| "Configuración" | Descartar (queda "Mi cuenta") | No hay preferencias con soporte real |

### 9.3 Principios de estilo

Interfaz limpia con jerarquía clara, tarjetas discretas (borde fino, sombra mínima), tablas modernas, estados con el mismo mapa de `ESTADOS`, sin degradados decorativos, sin fotografías, sin animaciones de relleno y con `prefers-reduced-motion` respetado (ya existe la regla global en `index.css`).

### 9.4 Inicio empresarial (con datos reales)

```
┌ Bienvenido, {contacto} · {sucursal} ───────────────────────── [Crear solicitud] ┐
├ Indicadores ────────────────────────────────────────────────────────────────────┤
│ Borradores │ En revisión │ Aprobadas │ Devueltas o rechazadas                     │
├ Operación ──────────────────────────────────────────────────────────────────────┤
│ Paquetes por recibir · Entregas pendientes · Conformidades · Incidencias · Empleados│
├ Actividad reciente ───────────────────────────┬ Accesos rápidos ────────────────┤
│ Últimas 5 solicitudes (folio, fecha, estado)  │ Catálogo · Crear solicitud ·     │
│ Últimas 5 notificaciones (con enlace)         │ Mis solicitudes · Empleados      │
├ Tu zona (gerente y responsable divisional) ─────────────────────────────────────┤
```

| Indicador | Cálculo con `/cuenta/resumen` | Nota |
|---|---|---|
| Borradores | `solicitudes.borradores` | Sin enviar |
| En revisión | `solicitudes.en_revision` | |
| Aprobadas | `en_proceso + entregadas` | **Derivado**: la solicitud aprobada pasó a `confirmado` o posterior; no cuenta las canceladas después |
| Devueltas o rechazadas | `por_corregir + rechazadas` | |

"Pendientes" de la solicitud original se redefine como **Borradores** para evitar ambigüedad. Se reutiliza `Cifra` (ya existe en `ui.tsx`). Los enlaces de cada indicador solo usan filtros de un estado hasta resolver B-1.

## 10. Arquitectura del nuevo portal

### 10.1 Selección de layout (sin cambiar URLs)

Las URLs `/cuenta/*` **no cambian** (las usan los enlaces de las notificaciones). El elemento raíz del router pasa de `TiendaLayout` a un selector mínimo:

```
LayoutPorRol  →  cliente de empresa y ruta /cuenta/*  →  PortalLayout   (identidad Salud Digna)
              →  cualquier otro caso                   →  TiendaLayout   (identidad LURIMA, sin cambios)
```

Ambos renderizan `<Outlet />`, así que ningún hijo cambia de lugar. `/entrar`, `/registro` y `/recuperar` siguen en LURIMA (la maqueta también muestra el acceso con la marca de la distribuidora): el cambio de identidad ocurre al iniciar sesión. Al cerrar sesión se regresa a `/`. Las cuentas de persona (tienda encendida) siguen con `CuentaLayout` dentro de LURIMA.

### 10.2 Layout

```
┌ PortalEncabezado ─────────────────────────────────────────────────────────┐
│ [☰]  Salud Digna · {sucursal}            🔔 n    {contacto} ▾ (Mi cuenta,   │
│                                                           Cerrar sesión)    │
├ PortalNavegación ──┬ <main id="contenido"> ───────────────────────────────┤
│ Inicio             │   (Outlet)                                           │
│ Catálogo           │                                                      │
│ Crear solicitud    │                                                      │
│ Solicitudes        │                                                      │
│ Empleados          │                                                      │
│ Notificaciones     │                                                      │
│ Mi cuenta          │                                                      │
└────────────────────┴──────────────────────────────────────────────────────┘
```

| Ancho | Navegación | Encabezado |
|---|---|---|
| < 1024 px | Panel lateral (drawer) con foco atrapado, Escape y cierre al navegar | Botón de menú, marca, campana, menú de usuario |
| 1024–1365 px | **Riel de íconos** (72 px) con etiquetas; botón para expandir | Completo |
| ≥ 1366 px | Expandida (256 px); botón para contraer | Completo |

El estado contraído se recuerda con `localStorage` (con `try/catch`; solo comodidad). Incluye enlace "Saltar al contenido", `aria-current="page"`, foco visible y áreas táctiles de 44 px. "Catálogo" y "Crear solicitud" quedan como ítems separados (consultar y construir), sin duplicar accesos. Las "Direcciones" y "Datos de la sucursal" se unifican en **Mi cuenta**.

### 10.3 Navegación y rutas nuevas

| Ítem | Ruta | Componente | Cambio |
|---|---|---|---|
| Inicio | `/cuenta` | `InicioCuenta` | Rediseño del dashboard |
| Catálogo | `/cuenta/catalogo`, `/cuenta/catalogo/:slug` | `Catalogo`, `Producto` | **Rutas nuevas** que montan los mismos componentes en el portal |
| Crear solicitud | `/cuenta/solicitudes/nueva` | `ConstructorSolicitud` | Presentación y catálogo reutilizado |
| Solicitudes | `/cuenta/pedidos`, `/cuenta/pedidos/:id` | `Pedidos`, `DetalleSolicitud` | Tabla y filtros |
| Empleados | `/cuenta/empleados` | `Empleados` | Tabla con búsqueda |
| Notificaciones | `/cuenta/notificaciones` | `ListaNotificaciones` | Solo estilo |
| Mi cuenta | `/cuenta/perfil` | `Perfil` + dirección | Unificada, solo lectura |

`/cuenta/direcciones` se conserva (redirige o se mantiene para no romper enlaces). Los componentes de catálogo reciben su base de rutas por un pequeño contexto (`RutasCatalogo`) que el portal fija en `/cuenta/catalogo`; así `ProductoCard`, `Producto` y `Catalogo` enlazan dentro del portal sin duplicarse.

### 10.4 Catálogo y creación de solicitudes

- **Catálogo (consultar):** el mismo `Catalogo` con filtros y paginación del servidor, sin precios en el contexto del portal. Filtro "Autorizados para el puesto" con `puestos-autorizados` (sobre la página cargada). Detalle con galería, 360°, variantes y disponibilidad.
- **Selección:** un único `SelectorVariante` (color, talla, cantidad, empleado y excepción) reemplaza la copia de `SelectorArticulo` y el panel de `Producto.tsx`. `Cantidad` pasa de `Producto.tsx` a `components/`.
- **Borrador destino (H6):** si hay más de un borrador, se muestra un selector con folio y fecha; con uno solo se agrega a ese; sin ninguno se crea. Reutiliza `agregarAlBorrador` con un parámetro opcional `borradorId`. **No cambia el backend.**
- **"Solicitud en curso":** indicador en el encabezado del portal con el borrador activo (artículos por empleado, sin importes) que enlaza a la revisión. No es un carrito.
- **Asistente:** conserva sus 3 pasos, su guardado y su lógica. El paso 2 reutiliza el catálogo (con paginación del servidor) en lugar de bajar todo (`catalogoCompleto`). En móvil, pasos como pestañas y pie fijo con la acción principal.

### 10.5 Solicitudes, empleados, notificaciones y cuenta

| Sección | Qué muestra con los endpoints actuales | Pendiente (requiere backend) |
|---|---|---|
| **Solicitudes** | Folio, fecha de creación, artículos, estado, sucursal que surte, enlace al detalle; filtros de un estado; paginación; estados de carga, error y vacío | Número de empleados y última actualización (B-2); búsqueda por folio (B-3); filtros agrupados (B-1) |
| **Detalle** | Todo lo existente: línea de proceso, artículos por empleado, paquetes, recepción, entrega con firma, conformidad, incidencias, historial, observación del distribuidor | — |
| **Empleados** | Tabla con número, nombre, puesto, área y estado; búsqueda y filtros en cliente (la lista no está paginada); alta, edición y activar o desactivar | Eliminar e importar **no existen**; se documentan como pendientes |
| **Notificaciones** | Lista paginada con tipo, fecha, estado de lectura y enlace; un solo contador compartido | Filtro de no leídas (B-9, opcional) |
| **Mi cuenta** | Sucursal, contacto, correo, teléfono, dirección de entrega y contactos de zona y división, todo de solo lectura | Preferencias: **no existen**; no se inventan |

### 10.6 Estilos y componentes compartidos (decisión necesaria)

Los componentes compartidos (`Boton`, `Estado`, `Campo`…) usan colores fijos `tinta` y `menta`. Para dar la apariencia Salud Digna sin dañar el panel hay dos caminos:

| Opción | Cómo | Riesgo | Cuándo |
|---|---|---|---|
| **1 (recomendada)** | Agregar la paleta `sd` y volver `menta` una variable CSS con **el mismo valor actual** por defecto; `PortalLayout` la redefine solo dentro del portal. Las acciones primarias del portal usan `variante="menta"` | Cambia la definición de `menta` en `tailwind.config.js` (hoy prohibido por `CLAUDE.md`); exige comparar el panel antes y después y que no haya diferencia | Con autorización explícita |
| **2 (sin tocar configuración global)** | Solo agregar `sd`; el portal usa `sd` en su layout y componentes nuevos y conserva el acento `menta` actual en los componentes compartidos | El verde azulado de los compartidos no coincide del todo con el verde de la maqueta | Si no se autoriza la Opción 1 |

No se recomienda reemplazar `tinta` (se usa también para el texto) ni duplicar `ui.tsx`.

### 10.7 Componentes

**Nuevos:** `PortalLayout`, `PortalNavegacion`, `PortalEncabezado`, `MarcaPortal`, `MenuUsuario`, `LayoutPorRol`, `ActividadReciente`, `AccesosRapidos`, `TablaSolicitudes` (tabla ≥ 768 px, tarjetas en móvil), `FiltrosSolicitudes`, `SelectorBorrador`, `IndicadorSolicitudEnCurso`, `SelectorVariante`, `RutasCatalogo`, `useContadorNotificaciones`, `Drawer` (con foco atrapado) y `app/identidad.ts`.

**Reutilizados:** `ConstructorSolicitud`, `DetalleSolicitud`, `PedidoDetalle`, `Empleados`, `ListaNotificaciones`, `Perfil`, `Direcciones`, `Catalogo`, `Producto`, `ProductoCard`, `Cifra`, `Estado`, `Tarjeta`, `Boton`, `Campo`, `Tabla`, `Paginacion`, `Vacio`, `ErrorCaja`, `Esqueleto`, `LineaProceso`, `lib/solicitud.ts` y `lib/formato.ts`.

---

## 11. Plan de implementación por bloques

Cada bloque termina con typecheck, pruebas y build, una revisión en 360, 768, 1024, 1366 y 1920 px, y tu autorización para continuar. Sin dependencias nuevas.

| Bloque | Contenido | Archivos principales | Reutiliza | Riesgos | Pruebas |
|---|---|---|---|---|---|
| **0. Preparación** | Decisiones D-1 a D-6; actualizar `main`; crear la rama; ampliar `CLAUDE.md` (4.2) | `CLAUDE.md` (local) | — | `main` desactualizado | — |
| **1. Identidad y `PortalLayout`** | `identidad.ts`, `MarcaPortal`, tokens `sd`, `LayoutPorRol`, esqueleto de layout con navegación y encabezado básicos | `app/router.tsx`, `app/identidad.ts`, `features/portal/*`, `tailwind.config.js` | `useAuth`, `Outlet` | Rutas, redirecciones, tokens (Opción 1) | `LayoutPorRol` elige bien por rol y ruta; el panel y LURIMA no cambian |
| **2. Navegación y responsive** | Barra lateral con riel y drawer, menú de usuario, campana con contador único, saltar al contenido | `features/portal/*`, `components/Drawer.tsx` | `Transicion` | Foco y teclado | Teclado, Escape, `aria-current`, anchos |
| **3. Dashboard** | Bienvenida, indicadores, operación, actividad, accesos rápidos, zona | `InicioCuenta` (se mueve a `features/portal/Inicio.tsx`), `Cifra` | `Cifra`, `Contacto` (se copia el tipo, no se importa del panel) | Cálculo de "Aprobadas" | Mapeo de indicadores con datos de prueba |
| **4. Catálogo empresarial** | `RutasCatalogo`, `/cuenta/catalogo*`, sin precios, filtro por puesto | `router.tsx`, `Catalogo.tsx`, `Producto.tsx`, `ProductoCard.tsx` | Los tres componentes | Regresión en LURIMA | Enlaces según contexto; precios ocultos en el portal |
| **5. Creación de solicitudes** | `SelectorVariante`, `SelectorBorrador`, solicitud en curso, paso 2 con catálogo reutilizado | `SolicitudCorporativa.tsx`, `lib/solicitud.ts`, `Producto.tsx` | `ConstructorSolicitud` | **Flujo central y sin pruebas** | **Pruebas del asistente primero**; borrador destino; excepciones |
| **6. Solicitudes y seguimiento** | `TablaSolicitudes`, filtros, estados, detalle con nuevo estilo | `Pedidos.tsx`, `PedidoDetalle.tsx`, `DetalleSolicitud.tsx` | `Tabla`, `Paginacion`, `Estado` | H3 sin B-1; modales | Estados de carga, error y vacío; filtros de un estado |
| **7. Empleados** | Tabla con búsqueda y filtros, activar y desactivar | `Corporativo.tsx` | `Empleados` | Lista fija de puestos | Alta, edición y estados |
| **8. Notificaciones y Mi cuenta** | Notificaciones y cuenta unificada de solo lectura | `Notificaciones.tsx`, `Perfil.tsx`, `Direcciones.tsx` | `ListaNotificaciones` | Enlaces a `/cuenta/pedidos/:id` | Contador único; solo lectura |
| **9. Accesibilidad y pruebas** | Foco atrapado en `Drawer` y `Modal` (con verificación del panel), contraste, pruebas de componentes | `ui.tsx` (con revisión de impacto), `test/*` | — | `ui.tsx` es compartido | Navegación por teclado; contraste AA |
| **10. Auditoría final** | Typecheck, pruebas, build, rutas, regresión de LURIMA y del panel, informe | `docs/` | — | — | Ver sección 13 |

## 12. Riesgos, dependencias y decisiones

### Decisiones tuyas antes del Bloque 1

| # | Decisión | Recomendación |
|---|---|---|
| D-1 | Logotipo oficial, manual de marca y **autorización escrita de uso** de la identidad de Salud Digna | Sin ellos, solo el espacio sustituible |
| D-2 | Opción de estilos 1 o 2 (sección 10.6) | Opción 1, con comparación previa y posterior del panel |
| D-3 | Término "Solicitud" (sistema) o "Pedido" (maqueta) | "Solicitud" |
| D-4 | ¿El catálogo del portal oculta precios aunque `CANAL_TIENDA` esté encendido? | Sí: el portal es la experiencia corporativa |
| D-5 | ¿Una cuenta de empresa va al portal Salud Digna también con la tienda encendida? | Sí, con un enlace "Ir a la tienda" |
| D-6 | Ampliar `CLAUDE.md` con la sección 4.2 (portal) | Sí |

### Dependencias de backend (futuras, requieren autorización; no se implementan en esta etapa)

| # | Cambio | Beneficio | Alternativa solo frontend |
|---|---|---|---|
| B-1 | `GET /cuenta/pedidos?estado=` acepta listas (`in_(split(","))`, como en el panel) | Arregla H3 | Mostrar solo filtros de un estado |
| B-2 | Agregar `empleados` y `actualizado` al resumen de solicitud | Columnas del pedido original | Omitirlas |
| B-3 | Parámetro de búsqueda `q` por folio | Buscar en todas las páginas | Filtrar la página cargada |
| B-4 | Filtro `puesto=` en `GET /tienda/productos` | Paginación correcta del catálogo autorizado | Filtrar en el cliente |
| B-5 | Facetas de talla y color dependientes de la categoría | Filtros coherentes | Ninguna |
| B-6 | Eliminar o importar empleados | Gestión completa | Documentar como pendiente |
| B-7 | Identidad por empresa | Portal multiempresa | `identidad.ts` estático |
| B-8 | Aprobador de empresa | Flujo de la maqueta | **Prohibido por ahora** |
| B-9 | Filtro de notificaciones no leídas | Bandeja | Filtrar la página cargada |

### Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Usar la identidad de una empresa real sin recursos ni autorización | D-1; sin logotipo inventado |
| R2 | Los estilos compartidos pueden cambiar el panel | Opción 1 con comparación visual; sin editar `ui.tsx` sin revisión |
| R3 | `ConstructorSolicitud` es el flujo central y no tiene pruebas | Escribir pruebas antes de refactorizar (Bloque 5) |
| R4 | Los enlaces de notificaciones apuntan a `/cuenta/pedidos/:id` | Mantener la URL; prueba específica |
| R5 | Regresión en LURIMA al hacer `Catalogo`, `Producto` y `ProductoCard` sensibles al contexto | Contexto con valor por defecto igual al actual; pruebas |
| R6 | El portal importa `Contacto` del panel | Copiar el tipo y el componente al portal |
| R7 | Cuentas de persona con tienda encendida | Mantienen `CuentaLayout`; prueba de ambos roles |
| R8 | `catalogoCompleto` y el catálogo con facetas globales | Reutilizar el catálogo con paginación del servidor |
| R9 | Sin E2E ni backend en modo tienda para pruebas | Respuestas simuladas en el navegador y validación manual por el responsable |
| R10 | `main` local desactualizado y archivos ajenos en el árbol | Secuencia de la sección 1; commits con rutas explícitas |
| R11 | Textos de la maqueta que contradicen reglas de negocio (precios, aprobaciones) | Tabla 9.2 |
| R12 | `ListaNotificaciones` la usa también el panel (`features/admin/Sistema.tsx`, sección Notificaciones) | En el Bloque 8 no se cambia su comportamiento ni su marcado; el estilo del portal se aplica desde fuera o con propiedades opcionales cuyo valor por defecto sea el actual |

## 13. Criterios de aceptación

1. Al iniciar sesión como empresa, **ninguna ruta `/cuenta/*` muestra el encabezado, el pie ni la marca de LURIMA**, y la marca de Salud Digna aparece en el portal (o el espacio sustituible mientras no haya recursos).
2. LURIMA sigue igual para visitantes y personas: encabezado, catálogo, carrito, acceso y páginas informativas sin regresiones.
3. El panel administrativo (`/admin/*`) no cambia visualmente (comparación antes y después) y `ui.tsx`, `Marca` y `features/admin/*` no se modifican sin revisión.
4. `/cuenta/pedidos/:id` sigue abriendo el detalle desde cualquier notificación.
5. El inicio muestra indicadores calculados con `/cuenta/resumen`, sin cifras inventadas, con estados de carga, error y vacío.
6. El catálogo del portal no muestra precios y permite elegir variantes y empleado; no es un carrito.
7. Con varios borradores, el usuario elige a cuál agrega; el comportamiento del backend no cambia.
8. Crear, guardar, enviar y corregir una solicitud produce las mismas llamadas `POST` y `PUT /cuenta/pedidos-corporativos` que hoy.
9. La lista de solicitudes tiene búsqueda, filtros, paginación y estados de carga, error y vacío; los filtros que el backend no soporta no aparecen o están documentados.
10. Empleados permite lo que el backend permite y documenta lo que no.
11. Notificaciones y Mi cuenta usan los datos actuales; no aparecen opciones sin soporte real.
12. Sin desbordamiento horizontal en 360, 768, 1024, 1366 y 1920 px; navegación móvil funcional.
13. Teclado completo, foco visible, `aria-current`, enlace "Saltar al contenido", drawer con foco atrapado y contraste AA.
14. Typecheck, build y pruebas pasan; hay pruebas nuevas del layout, la selección de borrador y el asistente.
15. No hay cambios en backend, base de datos, autenticación ni dependencias nuevas, y no se ejecutaron operaciones de datos.
16. Cada bloque queda en commits pequeños con rutas explícitas, sin incluir cambios ajenos.
