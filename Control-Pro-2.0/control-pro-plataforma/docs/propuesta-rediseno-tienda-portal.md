# Propuesta — Rediseño de la tienda pública LURIMA y del portal empresarial

Fecha de auditoría: 12 de noviembre de 2026.

Tipo de documento: auditoría de solo lectura y propuesta. No se modificó código, estilos, rutas, endpoints, modelos, migraciones ni datos.

Rama inspeccionada: `main` (con cambios locales previos sin confirmar en `frontend/package-lock.json`, `repomix-output.xml` y `backend/seeds/generar_imagenes.py`; no se tocaron).

> **Nota de alcance.** `CLAUDE.md` y `.claude/rules/10-public-sucursales.md` limitan el alcance activo a la consulta pública de sucursales (`Sucursales.tsx`). Esta propuesta abarca la tienda y el portal completos. Para implementarla hay que **ampliar por escrito el alcance autorizado**.

> **Nota sobre la referencia visual.** En la conversación no se adjuntó la imagen del prototipo de Salud Digna, y el repositorio no menciona "Salud Digna" ni "LURIMA". La propuesta del portal se basa en la lista de elementos de la solicitud (navegación lateral, encabezado con sucursal y usuario, bienvenida, indicadores, accesos rápidos y actividad reciente). Hay que compararla con el prototipo antes de aprobar el diseño visual.

---

## 1. Resumen ejecutivo

1. **Casi todo lo que se pide ya existe como funcionalidad.** El sistema ya permite elegir empleados, asignarles artículos con talla y color, cambiar cantidades, revisar, guardar borradores en el servidor, enviar a revisión, corregir lo devuelto, aprobar, rechazar o devolver, y dar seguimiento hasta la firma de entrega y la conformidad. **No se necesita un segundo mecanismo de solicitudes.** El trabajo es reorganizar la interfaz.
2. **La tienda y el portal comparten hoy el mismo marco.** Las pantallas privadas (`/cuenta/*`) se muestran dentro de `TiendaLayout`, con el encabezado y el pie de la tienda, y además una barra lateral (`CuentaLayout`). Por eso, después de entrar, la presentación **no cambia por completo**, y el catálogo del portal (`/catalogo`) saca al usuario de su barra lateral.
3. **Un solo interruptor global decide el modo de toda la plataforma.** `CANAL_TIENDA` (variable de entorno, `false` por defecto) cambia el sitio entero entre "tienda" (precios, carrito, checkout, registro) y "portal" (solo solicitudes, sin precios). Una tienda LURIMA con carrito y un portal empresarial en el mismo despliegue requieren `CANAL_TIENDA=true`, y hay que revisar todos los textos y condiciones que dependen de ese valor.
4. **No hay personalización por empresa.** No existen campos de logotipo, colores ni nombre comercial en `Cliente`, `Zona` ni `Division`. La marca "ControlPro" está escrita en el código (`TiendaLayout.tsx:12-23`). Además, el modelo supone **un solo cliente corporativo**: la jerarquía División → Zona y la regla de productos por puesto (`ProductoPuesto`) son globales, no pertenecen a una empresa. Para una identidad configurable por empresa se necesitan cambios de **backend y base de datos** (sección 11-12).
5. **Los precios del canal corporativo se ocultan a propósito.** El backend sí calcula y devuelve precios, subtotales y totales de las solicitudes. El frontend los oculta en modo portal (`app/config.ts:6`). Mostrar subtotales y total en "Crear solicitud" es una **decisión de negocio** que hay que autorizar, aunque no requiera tocar el backend.
6. **La aprobación la hace el distribuidor, no la empresa.** Solo usuarios internos con el permiso `pedido.aprobar` (rol `aprobador`) resuelven solicitudes, desde `/admin`. No existe un aprobador dentro de la empresa cliente (por ejemplo, un gerente de zona). Si el prototipo supone ese papel, es una funcionalidad nueva de backend y base de datos.
7. **No hay datos para reseñas, banners, preguntas frecuentes, "Acerca de" ni contacto.** No existen modelos ni endpoints. No se pueden mostrar reseñas verificadas, y los textos informativos tendrían que ser contenido estático aprobado por el negocio.

---

## 2. Diagnóstico del sistema actual

### A. Interfaz pública (tienda)

| Aspecto | Situación comprobada | Evidencia |
| --- | --- | --- |
| Identidad | Marca "ControlPro" fija con ícono SVG; colores `tinta`, `menta`, `arena` y `coral` como valores hex fijos en Tailwind | `TiendaLayout.tsx:12-23`, `tailwind.config.js` |
| Inicio | Dos variantes: `InicioTienda` (con precios y promociones) e `InicioPortal` (explica el flujo de 7 pasos). Héroe estático, sin carrusel | `Inicio.tsx:115-119` |
| Textos comerciales fijos | "Toluca, Querétaro y Puebla", "Envío sin costo desde $1,500" y "Tres sucursales" están en el código. El monto de envío gratis es configurable en el backend (`ENVIO_GRATIS_DESDE`), así que estos textos pueden quedar desactualizados | `TiendaLayout.tsx:62`, `Inicio.tsx:131,137` |
| Categorías | Lista fija en dos lugares, aunque existe `GET /tienda/categorias` | `TiendaLayout.tsx:32-36`, `Inicio.tsx:16-22` |
| Catálogo | Búsqueda de texto completo, categoría, talla, color, precio (solo en modo tienda), "solo con existencias", orden, paginación de 12, filtros activos como chips, panel móvil | `Catalogo.tsx` |
| Detalle | Galería, vista 360°, color y talla, disponibilidad por sucursal, material, cuidados, puestos y relacionados. En modo portal, "Agregar a mi solicitud" | `Producto.tsx` |
| Carrito y checkout | Completos y probados. Solo existen con `CANAL_TIENDA=true` | `router.tsx:24-29` |
| Sucursales | Lista de tarjetas. **No muestra estado de error ni de lista vacía**, y su texto ("Recoge tu pedido… paga en efectivo") no depende del modo | `Sucursales.tsx:13-28` |
| Acerca de, preguntas frecuentes, contacto | **No existen** | — |
| Navegación | Barra superior, encabezado con búsqueda, barra de categorías en escritorio y menú desplegable en móvil. "Acceso para personal" está en el pie | `TiendaLayout.tsx` |

### B. Portal privado (cuenta empresa / sucursal)

| Aspecto | Situación comprobada | Evidencia |
| --- | --- | --- |
| Marco | Se muestra **dentro de `TiendaLayout`** (encabezado y pie de la tienda), con barra lateral de 240 px en escritorio y fila horizontal desplazable en móvil | `router.tsx:40-58`, `CuentaLayout.tsx:31-50` |
| Quién entra | Cada cuenta `Cliente` de tipo `empresa` es **una sucursal** que pertenece a una zona y esta a una división. No hay usuarios individuales dentro de una sucursal | `models/clientes.py:35-53` |
| Inicio | Bienvenida, 8 indicadores enlazados (`GET /cuenta/resumen`), contactos de zona y división, y borradores | `SolicitudCorporativa.tsx:46-112` |
| Actividad reciente | Solo la lista de borradores. Las notificaciones están en otra página | `Notificaciones.tsx` |
| Crear solicitud | Asistente de 3 pasos: Empleados → Artículos (catálogo propio por empleado, regla por puesto, excepciones) → Revisar y enviar. Borrador guardado en el servidor e idempotencia | `SolicitudCorporativa.tsx:173-463` |
| Agregar desde el catálogo | Desde el detalle de producto se agrega al **borrador más reciente** (o se crea uno nuevo) | `lib/solicitud.ts:34-47` |
| Seguimiento | Lista con filtros por etapa y detalle con línea de proceso, recepción por paquete, entrega con firma y conformidad | `Pedidos.tsx`, `DetalleSolicitud.tsx` |
| Empleados | Tabla, y alta o edición en ventana modal. Los puestos son una lista fija en el frontend | `Corporativo.tsx`, `lib/catalogo.ts` |
| Precios | Se ocultan en todo el flujo corporativo | `DetalleSolicitud.tsx` (no usa `dinero`) |

### C. Problemas identificados

| # | Problema | Evidencia | Gravedad |
| --- | --- | --- | --- |
| P1 | El portal no tiene un marco propio: comparte encabezado y pie con la tienda, y `/catalogo` sale de la barra lateral | `router.tsx:40-58`, `CuentaLayout.tsx:19` | Alta (UX) |
| P2 | El catálogo está duplicado: el asistente tiene su propia rejilla y descarga **todo el catálogo** página por página (`catalogoCompleto`) en lugar de reutilizar `Catalogo` | `lib/solicitud.ts:11-16`, `SolicitudCorporativa.tsx:356-371` | Media |
| P3 | El selector de color, talla y cantidad está duplicado en `SelectorArticulo`, `AgregarASolicitud` y `Producto` | `SolicitudCorporativa.tsx:119-171`, `Producto.tsx:18-75, 155-186` | Media |
| P4 | La lógica de elegibilidad está duplicada (`productoElegible` y `elegible`) y la de acumular partidas también (`sumarPartida` y `agregar`) | `Corporativo.tsx:13-16`, `lib/solicitud.ts:20-32`, `SolicitudCorporativa.tsx:259-269` | Baja |
| P5 | "Agregar al borrador" elige el borrador más reciente sin preguntar. Si hay varios borradores, el usuario no sabe a cuál va el artículo | `lib/solicitud.ts:36-39` | Media |
| P6 | Dos consultas distintas consultan el mismo endpoint de notificaciones (`['notif-cliente','contador']` cada 30 s y `['notif-cliente']` cada 60 s) | `TiendaLayout.tsx:48`, `CuentaLayout.tsx:13` | Baja |
| P7 | `Sucursales.tsx` no muestra estado de error ni de lista vacía. `staleTime` es distinto del de `TiendaLayout` para la misma clave | `Sucursales.tsx:8,13` vs `TiendaLayout.tsx:50` | Media |
| P8 | Textos comerciales fijos en el código (ciudades, monto de envío, "tres sucursales") | sección A | Media |
| P9 | `Modal` no atrapa el foco ni lo devuelve al cerrar. El panel de filtros móvil no se cierra con Escape. El botón del menú móvil no tiene `aria-expanded`. Los filtros de color y talla no tienen `aria-pressed` | `ui.tsx:138-157`, `Catalogo.tsx:121-128`, `TiendaLayout.tsx:68` | Media (accesibilidad) |
| P10 | Hay dos accesos a "Crear solicitud" en el encabezado (botón y enlace en la barra de categorías) | `TiendaLayout.tsx:98-101,109` | Baja |
| P11 | La palabra "sucursal" significa dos cosas: los puntos de venta (`/sucursales`) y la cuenta del cliente ("Portal de sucursal"). En la tienda LURIMA, "Acceso a sucursales" puede confundirse con la lista de ubicaciones | `Sucursales.tsx`, `Acceso.tsx:41` | Media (UX) |
| P12 | En "Carrito", el botón bloqueado es un `Link` con `href="#"` | `Carrito.tsx:78` | Baja |

---

## 3. Mapa de rutas y pantallas actuales

| Ruta | Componente | Marco | Acceso | Condición |
| --- | --- | --- | --- | --- |
| `/` | `Inicio` → `InicioTienda` / `InicioPortal` | Tienda | Pública | Según `CANAL_TIENDA` |
| `/catalogo` | `Catalogo` | Tienda | Pública | — |
| `/producto/:slug` | `Producto` | Tienda | Pública | Con sesión de empresa: "Agregar a mi solicitud" |
| `/carrito` | `Carrito` | Tienda | Pública (pide sesión) | Solo con `CANAL_TIENDA` |
| `/checkout` | `Checkout` | Tienda | Cliente | Solo con `CANAL_TIENDA` |
| `/sucursales` | `Sucursales` | Tienda | Pública | — |
| `/entrar`, `/registro`, `/recuperar`, `/cuenta/restablecer` | `Acceso` | Tienda | Pública | Sin `CANAL_TIENDA`, el registro muestra "Alta de sucursales" |
| `/cuenta` | `InicioCuenta` | Tienda + Cuenta | Cliente | Una persona se redirige a `/cuenta/pedidos` |
| `/cuenta/pedidos`, `/cuenta/pedidos/:id` | `Pedidos`, `PedidoDetalle` → `DetalleSolicitud` | Tienda + Cuenta | Cliente | — |
| `/cuenta/direcciones`, `/perfil`, `/favoritos`, `/notificaciones` | varios | Tienda + Cuenta | Cliente | Favoritos solo con `CANAL_TIENDA` |
| `/cuenta/empleados` | `Empleados` | Tienda + Cuenta | Empresa | — |
| `/cuenta/solicitudes/nueva`, `/cuenta/solicitudes/:id/editar` | `ConstructorSolicitud` | Tienda + Cuenta | Empresa | Editable en `borrador` o `devuelto` |
| `/admin/*` | Panel interno (incluye `Solicitudes`, `PedidoAdmin`, `EditarSolicitud`) | Admin | Usuario interno | **Fuera de alcance** |

---

## 4. Arquitectura funcional actual

### Endpoints que usan las dos experiencias

| Endpoint | Uso | Notas del contrato |
| --- | --- | --- |
| `GET /api/tienda/configuracion` | `{ canal_tienda }` | Única opción pública. No hay identidad visual |
| `GET /api/tienda/inicio` | destacados, novedades, promociones, `promociones_vigentes` | Las promociones tienen nombre, tipo, valor y fin. No tienen imagen |
| `GET /api/tienda/categorias` | categorías con conteo y `padre_id` | — |
| `GET /api/tienda/productos` | paginado (máximo 48) con `facetas` | Las facetas son globales, no dependen del filtro. El filtro de precio usa `precio_base`, no el precio con promoción |
| `GET /api/tienda/productos/:slug` | detalle, variantes con `precio_final` y `disponible`, `disponibilidad_sucursal`, `giros`, `puestos` | Devuelve precios aunque `CANAL_TIENDA` esté apagado |
| `GET /api/tienda/sucursales` | sucursales activas | — |
| `POST /api/auth/cliente/login`, `POST /refresh`, `POST /logout` | sesión | Access token en memoria; refresh token en cookie HttpOnly con CSRF |
| `GET /api/cuenta/resumen` | indicadores de la sucursal y zona | Solo empresa |
| `GET/POST/PUT /api/cuenta/empleados` | empleados | Solo empresa |
| `GET /api/cuenta/puestos-autorizados` | puesto → ids de producto | **Global, no depende de la empresa** |
| `POST /api/cuenta/pedidos-corporativos` | crear (con `borrador: true/false`) | Idempotente por `clave_idempotencia` |
| `PUT /api/cuenta/pedidos-corporativos/:id` | guardar borrador, enviar (`enviar`) o corregir y reenviar si está devuelto | El servidor vuelve a validar empleado, regla por puesto, variante y cantidad |
| `GET /api/cuenta/pedidos[?canal=corporativo&estado=…]`, `GET /api/cuenta/pedidos/:id` | seguimiento | El detalle incluye `subtotal`, `total`, `importe`, `aprobaciones`, `paquetes` y `entregas_individuales` |
| `POST /api/cuenta/paquetes/:id/recepcion`, `POST /api/cuenta/entregas/:id[/conformidad]` | recepción, entrega y conformidad | — |
| `GET /api/cuenta/carrito`, `POST /api/cuenta/checkout`, etc. | compra comercial | Error `409 canal_no_disponible` si `CANAL_TIENDA` está apagado |
| `POST /api/admin/pedidos/:id/decision`, `PUT …/partidas` | aprobar, devolver, rechazar y editar partidas | Permiso `pedido.aprobar` (usuario interno) |

### Estados de la solicitud corporativa

`borrador` → `en_revision` → (`devuelto` ↔ corrección) / `rechazado` / `confirmado` → `en_preparacion` → `parcialmente_enviado`/`enviado` → `parcialmente_entregado`/`entregado` → `cerrado`. Se puede pasar a `cancelado` según las reglas del servidor.

### Diferencia entre carrito y solicitud (ya existe en el backend)

| | Carrito comercial | Solicitud empresarial |
| --- | --- | --- |
| Quién | Cliente `persona` o `empresa`, con `CANAL_TIENDA` | Cliente `empresa` |
| Dónde se guarda | `Carrito`/`CarritoItem` | `Pedido` con `canal=corporativo` y estado `borrador` |
| Destinatario | El comprador | Cada partida tiene un `empleado_id` |
| Reglas | Existencias y reserva al confirmar | Regla por puesto con excepción justificada; reserva al aprobar |
| Cierre | Checkout → pago | Envío a revisión → decisión del distribuidor |

---

## 5. Propuesta de diseño público LURIMA

### Principios

- La marca LURIMA es la identidad de la experiencia pública. Control Pro queda como plataforma ("Operado con Control Pro" en el pie, si el negocio lo aprueba).
- Navegación directa sin modales: cada sección es una ruta propia.
- Ningún dato comercial inventado. Lo que no venga de la API será contenido estático aprobado por el negocio, guardado en un solo archivo de contenido.

### Encabezado (`TiendaLayout`, se rediseña)

- **Escritorio:** logotipo LURIMA · Inicio · Catálogo · Acerca de nosotros · Preguntas frecuentes · Contacto · búsqueda · botón "Acceso empresas" (lleva a `/entrar`) · carrito (solo con `CANAL_TIENDA`).
- **Móvil:** logotipo, búsqueda como ícono, carrito y menú. El menú se abre como panel lateral con foco atrapado, `aria-expanded` y cierre con Escape.
- Las categorías salen de `GET /tienda/categorias` (se elimina la lista fija).
- El enlace a ubicaciones físicas se llama "Nuestras tiendas" o "Ubicaciones" (ruta `/sucursales`), y el acceso de clientes empresariales se llama "Acceso empresas". Así se resuelve la ambigüedad P11.

### Inicio (`/`)

1. **Banner o carrusel:** el eslogan "Salud y bienestar a tu alcance", con botones **Entrar** (`/entrar`) y **Ver catálogo** (`/catalogo`). Diapositivas posibles sin tocar el backend: (a) la portada fija de la marca y (b) una por cada `promociones_vigentes` (nombre, descuento y vigencia; enlace a `/catalogo?promocion=1`). Si no hay promociones, se muestra solo la portada. El carrusel no avanza solo si el usuario pidió reducir movimiento, y tiene controles accesibles con pausa.
2. **Artículos destacados:** `destacados` de `/tienda/inicio`.
3. **Promociones:** `promociones`. La sección se oculta si está vacía (ya ocurre así).
4. **Novedades:** `novedades`.
5. **Categorías:** tarjetas desde la API.
6. **Beneficios:** solo afirmaciones que el sistema cumple (reserva al confirmar, disponibilidad por sucursal, seguimiento por paquete). Los montos se toman de la configuración, no del código (ver 11-B3).
7. **Reseñas:** **no se incluyen.** No existe un modelo de reseñas (ver 12-D4).

### Catálogo (`/catalogo`) y detalle (`/producto/:slug`)

El funcionamiento actual se conserva. El diseño se ajusta a LURIMA, se agregan `aria-pressed` y Escape (P9), y se muestra el conteo con un mensaje claro de "sin resultados". El detalle no cambia funcionalmente.

### Secciones informativas (nuevas)

- `/acerca` — Acerca de nosotros.
- `/preguntas-frecuentes` — acordeón con `<details>`/`<summary>` nativos (accesibles sin JavaScript).
- `/contacto` — datos de contacto y las sucursales de `GET /tienda/sucursales`. **No incluye formulario**, porque no hay un endpoint que lo reciba.
- **Pie:** marca, enlaces informativos, ubicaciones (desde la API y adaptables a cualquier número de sucursales), aviso de precios y "Acceso para personal".

El texto de estas secciones debe entregarlo el negocio. Mientras no exista, la ruta muestra solo los datos que vienen de la API.

---

## 6. Propuesta de portal privado empresarial

### Marco nuevo: `PortalLayout`

Después de entrar, `/cuenta/*` deja de mostrarse dentro de `TiendaLayout`.

```
┌───────────────┬──────────────────────────────────────────────────────┐
│ [Logo empresa]│  Sucursal: Querétaro Centro ▾?   🔔 3   Contacto ▾   │ ← encabezado
│               ├──────────────────────────────────────────────────────┤
│ Inicio        │  Hola, Recepción Querétaro                           │
│ Catálogo      │  [Crear solicitud] [Ver catálogo] [Empleados]        │ ← accesos rápidos
│ Crear solicit.│  ┌────┐┌────┐┌────┐┌────┐                             │
│ Mis solicit.  │  │Rev.││Corr││Proc││Rec.│  …                          │ ← indicadores
│ Empleados     │  └────┘└────┘└────┘└────┘                             │
│ Notificaciones│  Actividad reciente          │ Borradores             │
│ Dirección     │  • SOL-0123 devuelta…        │ • SOL-0130 · 6 art.    │
│ Mi sucursal   │  • Paquete PQ-88 en camino   │                        │
│ ───────────── │                              │ Tu zona: contactos     │
│ Cerrar sesión │                                                       │
└───────────────┴──────────────────────────────────────────────────────┘
```

- **Barra lateral:** fija en escritorio (≥1024 px). En tablet se reduce a íconos con etiqueta emergente. En móvil se abre como panel desde un botón de menú. Se usa el mismo arreglo de enlaces que hoy (`CuentaLayout.tsx:16-29`).
- **Encabezado:** nombre de la sucursal (`razon_social`), nombre del contacto (`nombre`), notificaciones con un solo contador compartido (corrige P6) y menú con perfil y cerrar sesión. No hay selector de sucursal: cada sesión es una sola sucursal (ver 12-D3).
- **Identidad:** logotipo y colores de la empresa a través de tokens CSS (sección 9-I). Mientras el backend no los entregue, se usa la identidad configurada en el despliegue.
- **Bienvenida, indicadores y borradores:** se reutiliza `InicioCuenta`, cambiando solo su presentación.
- **Actividad reciente:** las últimas 5 notificaciones de `GET /cuenta/notificaciones?por_pagina=5`. El endpoint ya existe y tiene un `enlace` por evento, así que no requiere backend.
- **Catálogo dentro del portal:** nueva ruta `/cuenta/catalogo` que reutiliza `Catalogo` (y `/cuenta/catalogo/:slug` reutiliza `Producto`) dentro del `PortalLayout`. Las rutas públicas `/catalogo` y `/producto/:slug` se conservan.

---

## 7. Propuesta de catálogo y creación de solicitudes

### A. Catálogo del portal (consultar y seleccionar)

- Es la misma pantalla `Catalogo`, con búsqueda, categorías, tallas, colores, "solo con existencias", orden y paginación del servidor.
- Se agrega el filtro **"Autorizados para el puesto"**, calculado en el cliente con `GET /cuenta/puestos-autorizados`. Funciona sobre la página cargada; un filtro en el servidor necesitaría el cambio 11-B4.
- El detalle muestra fotografías, 360°, características, tallas, colores, disponibilidad y puestos autorizados (ya existe).
- **Selección:** el panel "Agregar a mi solicitud" se convierte en un componente compartido `SelectorVariante` (color, talla, cantidad y empleado, con excepción si aplica). Este componente reemplaza la triple duplicación P3.
- **A qué borrador se agrega (P5):** si hay más de un borrador, el panel muestra un selector con el folio y la fecha ("Agregar a: SOL-0130 · 12 nov"). Si no hay ninguno, crea uno nuevo, como hoy. Se usan los mismos endpoints.
- Un indicador fijo **"Solicitud en curso (n artículos)"** en el encabezado del portal lleva al paso de revisión del borrador. Ocupa el lugar que tiene el carrito en la tienda, con otro nombre y otro ícono, para que no se confunda con una compra.

### B. Crear solicitud (construir y enviar)

Se conserva `ConstructorSolicitud` y su lógica (estado local, `guardar`, borrador, idempotencia y corrección). Solo se reorganiza la presentación:

| Paso pedido | Implementación actual | Ajuste propuesto |
| --- | --- | --- |
| 1. Seleccionar empleados | Paso "Empleados" con búsqueda, "Todos" y "Ninguno" | Solo visual |
| 2. Seleccionar productos | Rejilla propia descargando todo el catálogo | Reutilizar la rejilla de `Catalogo` con paginación del servidor (P2) |
| 3. Asignar a empleado | Empleado activo en el panel lateral; modal `SelectorArticulo` | `SelectorVariante` compartido, en un panel lateral (no modal) para no perder el contexto |
| 4. Variantes y tallas | Color y talla | Igual |
| 5. Cantidades | +/− hasta 50 | Igual, con campo numérico accesible |
| 6. Subtotales | **No se muestran** | **Requiere decisión de negocio (D1).** Si se aprueba: subtotal por línea = `precio_final × cantidad` (el precio ya viene en el detalle del producto), con la leyenda "estimado; el total final lo calcula el sistema" |
| 7. Total general | No se muestra | Igual que el punto 6. Al guardar, se muestra el `total` que devuelve el servidor |
| 8. Revisar | Paso 3 agrupado por empleado, excepciones y dirección | Solo visual |
| 9. Enviar a aprobación | "Enviar a revisión" | Igual |

En móvil, los pasos se muestran como pestañas superiores fijas y un pie fijo con el resumen y el botón principal.

---

## 8. Matriz de funcionalidades

Leyenda: ✅ existe · 🟡 existe y requiere ajuste de frontend · 🔶 requiere decisión de negocio · 🔴 requiere backend o base de datos.

### Flujos solicitados

| # | Flujo | Estado | Comentario |
| --- | --- | --- | --- |
| 1 | Visitante → inicio → catálogo → detalle | ✅ 🟡 | Funciona; falta la identidad LURIMA |
| 2 | Visitante → acceso → autenticación → portal | ✅ 🟡 | Funciona; falta el marco propio del portal |
| 3 | Empresa → catálogo → selección | ✅ 🟡 | Funciona; falta resolver la ambigüedad del borrador y la duplicación |
| 4 | Empresa → empleados → asignación | ✅ | Funciona |
| 5 | Empresa → revisión → envío | ✅ 🔶 | Funciona; los subtotales y el total dependen de la decisión D1 |
| 6 | Empresa → seguimiento | ✅ | Funciona, con trazabilidad completa |
| 7 | Aprobador → revisión → resolución | ✅ (admin) 🔴 | Existe para el distribuidor en `/admin` (fuera de alcance). Un aprobador dentro de la empresa no existe |

### Funcionalidades de la propuesta

| Funcionalidad | Estado |
| --- | --- |
| Identidad LURIMA (logotipo, colores, tipografía) | 🟡 (se necesitan los recursos de marca) |
| Carrusel con promociones vigentes | 🟡 |
| Carrusel con imágenes administrables | 🔴 |
| Categorías desde la API en encabezado e inicio | 🟡 |
| Acerca de, preguntas frecuentes, contacto (estáticos) | 🟡 (se necesita el contenido) |
| Formulario de contacto | 🔴 |
| Reseñas verificadas | 🔴 |
| `PortalLayout` con barra lateral | 🟡 |
| Actividad reciente (notificaciones) | 🟡 |
| Catálogo dentro del portal | 🟡 |
| Elegir a qué borrador agregar | 🟡 |
| Subtotales y total en la solicitud | 🔶 |
| Identidad por empresa (logotipo y colores) | 🔴 |
| Varias empresas cliente con su propia jerarquía y reglas | 🔴 |
| Aprobador dentro de la empresa | 🔴 |
| Usuarios individuales dentro de una sucursal | 🔴 |

---

## 9. Archivos que habría que modificar

| Archivo | Cambio | Riesgo |
| --- | --- | --- |
| `frontend/src/app/router.tsx` | Separar `/cuenta/*` en `PortalLayout`; agregar `/cuenta/catalogo`, `/acerca`, `/preguntas-frecuentes` y `/contacto` | Medio: conservar las redirecciones existentes (`corporativo/*`) |
| `frontend/src/features/tienda/TiendaLayout.tsx` | Identidad LURIMA, navegación nueva, categorías desde la API, accesibilidad del menú | Medio: exporta `Marca` y `useCarrito`, que usan otros módulos |
| `frontend/src/features/tienda/Inicio.tsx` | Banner o carrusel, secciones nuevas y sin textos fijos | Bajo |
| `frontend/src/features/tienda/Catalogo.tsx` | Accesibilidad, ruta base configurable (pública o portal) y filtro por puesto | Medio |
| `frontend/src/features/tienda/Producto.tsx` | Usar `SelectorVariante` y elegir el borrador | Medio |
| `frontend/src/features/tienda/ProductoCard.tsx` | Enlace según el contexto (pública o portal) | Bajo |
| `frontend/src/features/tienda/Sucursales.tsx` | Estados de error y lista vacía, texto según el modo y `staleTime` igual al del layout | Bajo |
| `frontend/src/features/tienda/Carrito.tsx` | Botón bloqueado como `<button disabled>` | Bajo |
| `frontend/src/features/cuenta/CuentaLayout.tsx` | Se reemplaza por `PortalLayout` o pasa a ser su contenido | Medio |
| `frontend/src/features/cuenta/SolicitudCorporativa.tsx` | Presentación, reutilizar la rejilla y `SelectorVariante`, y subtotales si se aprueba D1 | **Alto**: es el flujo central; cubrir antes con pruebas |
| `frontend/src/features/cuenta/Corporativo.tsx` | Eliminar `productoElegible` y usar `elegible` (comprobar que no tenga otros usuarios) | Bajo |
| `frontend/src/features/cuenta/Acceso.tsx` | Textos de "Acceso empresas" e identidad | Bajo |
| `frontend/src/lib/solicitud.ts` | `agregarAlBorrador(nueva, borradorId?)` | Medio |
| `frontend/src/components/ui.tsx` | Foco atrapado y devuelto en `Modal` | Medio: lo usa también `/admin` |
| `frontend/tailwind.config.js` e `index.css` | Tokens de marca con variables CSS (`--marca-*`) | **Alto**: afecta a toda la aplicación, incluido `/admin` |

**No se modifica:** `features/admin/*` (incluido `Sistema.tsx`), el backend ni las migraciones.

---

## 10. Componentes nuevos sugeridos

| Componente | Ubicación sugerida | Propósito |
| --- | --- | --- |
| `PortalLayout` | `features/cuenta/PortalLayout.tsx` | Marco privado: barra lateral, encabezado con sucursal y usuario, y contenido |
| `MarcaEmpresa` | `components/marca.tsx` | Logotipo y nombre a partir de una configuración de identidad (reemplaza `Marca` fija) |
| `useIdentidad` | `app/identidad.ts` | Lee la identidad del despliegue (`VITE_*` o un JSON estático) y, en el futuro, del backend |
| `SelectorVariante` | `components/SelectorVariante.tsx` | Color, talla y cantidad compartidos por `Producto`, `AgregarASolicitud` y el asistente |
| `RejillaProductos` | `features/tienda/RejillaProductos.tsx` | Rejilla, paginación y estados de carga y vacío, extraídos de `Catalogo` |
| `Carrusel` | `components/Carrusel.tsx` | Accesible, con pausa y respeto a la reducción de movimiento. Sin dependencias nuevas |
| `ActividadReciente` | `features/cuenta/ActividadReciente.tsx` | Últimas notificaciones con enlace |
| `IndicadorSolicitud` | `features/cuenta/IndicadorSolicitud.tsx` | "Solicitud en curso (n)" en el encabezado del portal |
| `PaginaInformativa` | `features/tienda/Informacion.tsx` | Acerca de, preguntas frecuentes y contacto desde un archivo de contenido |
| `useNotificacionesContador` | `app/notificaciones.ts` | Un solo contador compartido (P6) |

No hacen falta dependencias nuevas: React, Router, TanStack Query, Tailwind, lucide y zod son suficientes.

---

## 11. Cambios que requerirían backend (sujetos a autorización)

| # | Cambio | Por qué no se resuelve solo en frontend | Alternativa sin backend |
| --- | --- | --- | --- |
| B1 | `GET /tienda/configuracion` con identidad (nombre, logotipo, colores) | La identidad del portal debe venir de los datos de la empresa | Identidad por despliegue en `VITE_*` o un JSON estático |
| B2 | `GET /cuenta/perfil` o `/cuenta/resumen` con la identidad de la empresa de la sucursal | No existe ninguna relación entre la sucursal y la identidad de una empresa | Igual que B1 |
| B3 | Exponer `ENVIO_GRATIS_DESDE` y `COSTO_ENVIO` en `/tienda/configuracion` (hoy solo llegan con el carrito) | El visitante sin sesión no tiene acceso al carrito | Ocultar el monto en la barra superior |
| B4 | Filtro `puesto=` en `GET /tienda/productos` | El filtro por puesto en el servidor permite paginar correctamente | Filtrar la página cargada en el cliente |
| B5 | Facetas que dependan del filtro aplicado y filtro de precio sobre el precio final | Hoy son globales y usan `precio_base` | Ninguna; limitación conocida |
| B6 | Endpoint de mensajes de contacto | Para recibir un formulario | Mostrar teléfono y correo |
| B7 | Endpoints de banners administrables | El contenido lo administraría el negocio | Carrusel con portada y promociones |
| B8 | Aprobación por parte de la empresa | Hoy solo aprueba el distribuidor | — |

---

## 12. Cambios que requerirían base de datos (sujetos a autorización)

| # | Cambio | Motivo |
| --- | --- | --- |
| D1 | (Decisión, **no** es un cambio de base de datos) Mostrar precios al canal corporativo | Los precios ya se guardan y se devuelven; hoy se ocultan por una regla de interfaz |
| D2 | Entidad `EmpresaCliente` (nombre, logotipo, colores) y su relación con `Division`, `Zona` o `Cliente` | Identidad configurable y soporte para varias empresas |
| D3 | Usuarios por sucursal (varias personas por cuenta de sucursal) | El encabezado "sucursal y usuario" del prototipo supone usuarios individuales |
| D4 | Reseñas verificadas (producto, autor, pedido y estado de moderación) | No existe |
| D5 | Banners o contenido administrable | No existe |
| D6 | Regla por puesto y lista de puestos por empresa (`ProductoPuesto` con `empresa_id`; hoy `PUESTOS` está fijo en `lib/catalogo.ts` y en los seeds) | Hoy son globales |
| D7 | Papel de aprobador de empresa y su flujo de estados | B8 |

---

## 13. Plan de implementación por etapas

Cada etapa se hace en una **rama propia** (no en `main`), con commits pequeños, y se valida antes de pasar a la siguiente. Ninguna etapa toca el backend.

| Etapa | Contenido | Archivos principales | Requiere |
| --- | --- | --- | --- |
| 0 | Ampliar el alcance autorizado; decidir D1; recibir los recursos de marca LURIMA, la identidad de la primera empresa y el contenido informativo; confirmar el valor de `CANAL_TIENDA` en producción | — | Negocio |
| 1 | Correcciones sin cambio visual: P6, P7, P9, P12 y P4 | `Sucursales.tsx`, `ui.tsx`, `CuentaLayout.tsx`, `TiendaLayout.tsx`, `Carrito.tsx`, `Corporativo.tsx` | — |
| 2 | Tokens de identidad (variables CSS) sin cambiar los colores actuales. Debe dar una diferencia visual nula | `tailwind.config.js`, `index.css`, `app/identidad.ts` | Revisión visual del admin |
| 3 | Tienda LURIMA: encabezado, pie, inicio con carrusel, categorías desde la API y páginas informativas | `TiendaLayout.tsx`, `Inicio.tsx`, componentes nuevos, `router.tsx` | Etapa 0 (contenido) |
| 4 | `PortalLayout`, rutas `/cuenta/catalogo*`, actividad reciente e indicador de solicitud en curso | `router.tsx`, `PortalLayout.tsx`, `Catalogo.tsx`, `Producto.tsx` | — |
| 5 | Unificación del catálogo y de la selección: `RejillaProductos`, `SelectorVariante` y elección de borrador | `SolicitudCorporativa.tsx`, `Producto.tsx`, `lib/solicitud.ts` | Pruebas de la etapa previa |
| 6 | Subtotales y total en la solicitud (solo si se aprueba D1) | `SolicitudCorporativa.tsx` | D1 |
| 7 | (Futuro) Identidad por empresa, B1-B8 y D2-D7 | backend y frontend | Autorización expresa |

---

## 14. Pruebas y criterios de aceptación

### Comandos reales del proyecto

```bash
cd frontend && npm run typecheck && npm test && npm run build
cd backend && python -m pytest              # sin cambios de backend; confirma que no hubo regresiones de contrato
node frontend/e2e/flujo-completo.cjs <carpeta>   # E2E existente (requiere backend sembrado y Playwright)
```

### Pruebas nuevas recomendadas (Vitest + Testing Library)

- `Sucursales`: estados de carga, error, lista vacía y campos opcionales nulos (`telefono`, `horario`).
- `SelectorVariante`: sin talla elegida el botón queda deshabilitado; las cantidades se limitan entre 1 y 50; una excepción sin justificación bloquea el envío.
- `agregarAlBorrador`: agrega al borrador indicado; sin borradores crea uno; sin dirección muestra un error claro.
- `ConstructorSolicitud`: cargar un borrador, agregar, quitar, guardar y enviar (con la API simulada). Los subtotales solo aparecen si se aprueba D1.
- `PortalLayout`: un cliente `persona` no ve opciones de empresa y una persona sin sesión se redirige a `/entrar`.
- `Modal`: el foco se atrapa y vuelve al elemento que la abrió al cerrar.

### Criterios de aceptación

1. Sin sesión, el visitante navega Inicio → Catálogo → Detalle, y no se muestra ningún dato comercial que no venga de la API o del archivo de contenido aprobado.
2. Después de entrar como empresa, la interfaz cambia por completo a `PortalLayout` y ninguna ruta del portal muestra el encabezado o el pie de la tienda.
3. Desde el catálogo del portal se puede agregar un artículo a un empleado y a un borrador elegido explícitamente cuando existe más de uno.
4. Crear una solicitud permite varios empleados, varios productos por empleado, variantes, cantidades, revisión y envío. La solicitud resultante tiene el mismo contenido que con la versión actual (mismas llamadas `POST`/`PUT /cuenta/pedidos-corporativos`).
5. Corregir una solicitud devuelta sigue funcionando y muestra la observación del distribuidor.
6. El seguimiento, la recepción, la entrega con firma y la conformidad no cambian de comportamiento.
7. El carrito y el checkout siguen disponibles solo con `CANAL_TIENDA=true`, y nunca se muestran como "solicitud".
8. Todo funciona en 360 px, 768 px y 1280 px sin desplazamiento horizontal de la página; los objetivos táctiles miden 44 px o más.
9. Se puede navegar por teclado de principio a fin, el foco es visible, las ventanas atrapan el foco, los controles de opción tienen `aria-pressed` y el contraste cumple AA con los colores de cada marca.
10. `typecheck`, `test` y `build` pasan, y `pytest` sigue en verde sin cambios de backend.

### Responsividad y accesibilidad (resumen)

| Ancho | Tienda | Portal |
| --- | --- | --- |
| < 640 px | Menú en panel lateral; rejilla de 2 columnas; filtros en panel | Barra lateral en panel; pasos como pestañas; pie fijo con acción principal |
| 640–1023 px | Búsqueda visible; rejilla de 2 a 3 columnas | Barra lateral de íconos con etiquetas emergentes |
| ≥ 1024 px | Navegación completa; filtros laterales | Barra lateral completa; resumen lateral fijo en la revisión |

Estados de interacción obligatorios en todo componente: carga (esqueleto), error (`ErrorCaja` con acción de reintento), vacío (`Vacio` con siguiente paso), deshabilitado con motivo visible, foco y "pasar el cursor" diferenciados, y respeto a `prefers-reduced-motion` (ya existe en `index.css:11-13`).

### Riesgos técnicos y dependencias

- **Tokens de color:** pasar los colores de Tailwind a variables CSS afecta también al panel `/admin`. Por eso la etapa 2 debe producir una diferencia visual nula.
- **`ConstructorSolicitud`** concentra el flujo central y tiene poca cobertura en el frontend. Hay que agregar pruebas antes de reorganizarlo.
- **`CANAL_TIENDA`** es global. Una tienda LURIMA con carrito y un portal sin precios en el mismo despliegue exige revisar cada condición que depende de él.
- **Contenido y marca:** las etapas 3 y 4 dependen de recibir logotipos, colores y textos aprobados.
- **Multiempresa:** cualquier promesa de "identidad por empresa" en la interfaz depende de D2. Hasta entonces, la identidad es por despliegue.
- **Rama:** el trabajo actual está en `main` con cambios ajenos sin confirmar. Antes de implementar hay que crear una rama propia y no incluir esos cambios.
