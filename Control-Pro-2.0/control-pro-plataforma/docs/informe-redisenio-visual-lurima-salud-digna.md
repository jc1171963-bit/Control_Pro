# Informe — Rediseño visual de Distribuidora LURIMA y del portal Salud Digna

Rama: `feature/rediseno-visual-avanzado` (desde `main` bdf882e). Fecha: 12-nov-2026. Sin commits, push ni merge.
Dirección visual: `propuesta-mejora-visual-lurima-salud-digna.md`. Capturas: `docs/capturas-redisenio-visual/`.

## 1. Resumen

- **LURIMA**: portada editorial con fotografía y cintas, mosaico de categorías con imagen, tarjetas de producto nuevas, encabezado editorial común para catálogo y páginas informativas, ficha de producto con galería fija, acceso integrado a la tienda y pie de página ampliado. H-1 (desborde a 360 px) quedó resuelto.
- **Salud Digna**: logotipo oficial, barra lateral clara con indicador de sección, verde oficial, portada de bienvenida con fotografía, distribución real de solicitudes y lista de pendientes.
- **Fotografías**: 11 de los 12 productos muestran una foto de stock **ilustrativa** en lugar de la silueta SVG del seed, sin tocar la base de datos.

## 2. Logotipo de Salud Digna

| Campo | Valor |
|---|---|
| Fuente | Encabezado del sitio oficial https://www.salud-digna.org/ |
| URL de origen | https://cdn.comunidadsd.org/MX/Salud-Digna/Home/Header/img/LogoSaludDigna.svg |
| Fecha de descarga | 12-nov-2026 |
| Formato | SVG vectorial (16,7 KB), colores #008959 y grises; revisado: sin scripts ni referencias externas |
| Archivo | `frontend/public/assets/brands/salud-digna/logo-salud-digna.svg` |
| Configuración | `frontend/src/app/identidad.ts` (`logo`); con `null` vuelve el espacio sustituible |
| Derechos | Marca registrada de su titular. Descargarla del sitio oficial no concede licencia de uso: **antes de producción hay que obtener la autorización de Salud Digna y, de preferencia, su manual de marca.** |

Es un logotipo de texto pensado para fondo blanco; no se recolorea ni se redibuja. No se usa en LURIMA.

## 3. Fotografías de stock

### 3.1 Inventario de productos (GET `/api/tienda/productos`, solo lectura)

12 productos activos en 6 categorías (Batas, Camisas y polos, Pantalones, Protección, Calzado, Accesorios), sin marca registrada. Todas sus imágenes eran SVG generados por el seed (`/api/archivos/publicos/{slug}-{n}.svg`) con el texto «CONTROL PRO».

### 3.2 Manifiesto

Fuente: Unsplash, **Licencia Unsplash** (https://unsplash.com/license): uso gratuito comercial y no comercial, sin atribución obligatoria; no permite revender las fotos sin modificar ni crear un servicio de fotos competidor. Todas se verificaron como «Foto gratuita» (no Unsplash+). Descarga: 12-nov-2026 desde `images.unsplash.com`, WebP 800×800 (productos). **Todas son temporales e ilustrativas: deben sustituirse por fotografías autorizadas antes de producción.**

| Slug del producto | Archivo (`public/assets/products/`) | Foto Unsplash | Autor |
|---|---|---|---|
| bata-clinica-clasica | bata-clinica-clasica.webp | https://unsplash.com/photos/AZDVF4fEcY4 | Muhammad Hicham |
| bata-de-laboratorio-antifluidos | bata-de-laboratorio-antifluidos.webp | https://unsplash.com/photos/RlIppR1I3E8 | Sasun Bughdaryan |
| camisa-de-trabajo-manga-larga | camisa-de-trabajo-manga-larga.webp | https://unsplash.com/photos/fHRMqbIucBY | Fabian Centeno |
| polo-corporativa-pique | polo-corporativa-pique.webp | https://unsplash.com/photos/rpiH-Z9ohmk (sustituye a U199aciOyEU, que mostraba la etiqueta de una marca de terceros) | Lena Kudryavtseva |
| filipina-quirurgica | filipina-quirurgica.webp | https://unsplash.com/photos/_4xStiTXY1o | Beatriz Mendez |
| pantalon-quirurgico | pantalon-quirurgico.webp | https://unsplash.com/photos/O8ekTIhHBRY | Lisa Marie Theck |
| pantalon-de-trabajo-cargo | pantalon-de-trabajo-cargo.webp | https://unsplash.com/photos/5NPdRwt7BsQ | Miguel Carraça |
| chaleco-de-alta-visibilidad | chaleco-de-alta-visibilidad.webp | https://unsplash.com/photos/rJnbgTluYfc | Josh Marty |
| botas-de-seguridad-dielectricas | botas-de-seguridad-dielectricas.webp | https://unsplash.com/photos/J34M8K1uqs4 | Annie Spratt |
| gorra-de-trabajo | gorra-de-trabajo.webp | https://unsplash.com/photos/2loKxdi6Hmo | Yang Deng |
| mandil-de-intendencia | mandil-de-intendencia.webp | https://unsplash.com/photos/k7qAyA_sf_8 | Golden Horn Bridge |
| zapato-clinico-antiderrapante | — (conserva su ilustración) | Sin foto libre adecuada: solo había calzado deportivo con marca visible | — |

Escenas (`public/assets/escenas/`):

| Archivo | Uso | Foto Unsplash | Autor |
|---|---|---|---|
| uniformes-clinicos.webp (1200×1200) | Portada y acceso de LURIMA | https://unsplash.com/photos/AZq99Wqunjs | Eros Reyes Cabrera |
| almacen.webp (1400×900) | «Dónde estamos» y «Acerca de» | https://unsplash.com/photos/gjZTDr6E4vQ | Phillip Flores |
| pasillo-clinico.webp (1400×900) | Bienvenida del portal | https://unsplash.com/photos/Pd4lRfKo16U | Luis Melendez |

Peso total de los recursos: 1,3 MB (productos 23–171 KB cada uno).

### 3.3 Integración

- El manifiesto en código es `frontend/src/lib/fotosIlustrativas.ts` (slug → archivo, autor y foto de origen).
- La asociación es **por slug** (identificador estable), nunca por posición.
- `ImagenProducto` (único punto, compartido por tienda, carrito y portal) sustituye solo los SVG del seed. **Cuando un producto tenga una foto real subida (jpg/png/webp), esa se muestra y la de stock se ignora**, sin tocar código.
- Transparencia: «Imagen ilustrativa» sobre la foto principal de la ficha; aviso en el catálogo de la tienda y del portal y en el pie de página.
- Rendimiento: `loading="lazy"`, `decoding="async"` y dimensiones reservadas (`width`/`height`).

Observaciones: la foto de «Camisa de trabajo manga larga» muestra una camisa abierta sobre camiseta; las batas de la escena «uniformes-clinicos» llevan un bordado pequeño de una institución ajena (no legible a tamaño de pantalla). Las dos son aceptables como ilustración temporal, pero conviene reemplazarlas primero.

## 4. Archivos

**Nuevos**
- `frontend/src/lib/fotosIlustrativas.ts`: manifiesto y sustitución.
- `frontend/src/features/tienda/Decoracion.tsx`: `Cintas`, `PUNTOS` y `EncabezadoPagina`.
- `frontend/src/test/fotosilustrativas.test.tsx`: 2 pruebas.
- `frontend/public/assets/brands/salud-digna/logo-salud-digna.svg`, `frontend/public/assets/products/*.webp` (11) y `frontend/public/assets/escenas/*.webp` (3).
- `docs/propuesta-mejora-visual-lurima-salud-digna.md`, este informe y `docs/capturas-redisenio-visual/*.jpg` (13).

**Modificados: LURIMA**
- `tienda/Inicio.tsx`:
  - Portada editorial con cifras reales (categorías y ubicaciones) y mosaico de categorías.
  - «Novedades» ya no repite «Destacados».
  - Proceso en banda oscura y bloque «Dónde estamos» con las ubicaciones de la API.
- `tienda/TiendaLayout.tsx`: franja de color de marca, ajuste a 360 px (H-1), pie ampliado y fondo blanco en las rutas de acceso.
- `tienda/ProductoCard.tsx`: tarjeta nueva y sustitución de foto en `ImagenProducto`.
- `tienda/Catalogo.tsx`: encabezado editorial en la tienda, accesos rápidos de categoría en móvil y aviso de fotografías.
- `tienda/Producto.tsx`: galería fija, «Imagen ilustrativa» y miniaturas solo si hay fotos reales distintas.
- `tienda/Informacion.tsx` y `tienda/Sucursales.tsx`: encabezado editorial; «Acerca de» con fotografía.
- `cuenta/Acceso.tsx`: solo el `Marco` visual (panel fotográfico y formulario). Sin cambios de lógica.

**Modificados: Salud Digna**
- `app/identidad.ts`: logotipo oficial.
- `portal/MarcaPortal.tsx`: muestra el logotipo.
- `portal/PortalLayout.tsx`: barra lateral clara, indicador de sección y logotipo en el encabezado con la barra contraída.
- `portal/Inicio.tsx`: bienvenida con fotografía, distribución de solicitudes, pendientes y accesos rápidos.
- `index.css`: solo `.tema-sd`, verdes a partir del oficial #008959.
- `cuenta/SolicitudCorporativa.tsx` y `cuenta/DetalleSolicitud.tsx`: el tinte oscuro del paso activo y de la acción «Corregir y reenviar» pasa a `sd-900`.

**Compartidos**
- `components/ui.tsx`, en `Paginacion`: el texto «N registro(s)» pasa de `tinta-400` a `tinta-500` (4,26:1 → AA).
  - Impacto revisado: es un solo texto auxiliar; mejora el contraste también en el panel y no cambia el marcado ni la API.
- `test/portallayout.test.tsx`: la marca se verifica por el nombre accesible y la imagen del logotipo, en lugar de texto visible.

**Sin cambios**: modelos, migraciones, base de datos, autenticación, permisos, `CANAL_TIENDA`, `features/admin`, `package.json`, `tailwind.config.js` y `router.tsx`. En la primera ronda tampoco se tocó el backend. En la segunda, con autorización, se agregó el endpoint de contacto y el proveedor SMTP (sección 8).

## 5. Inicio de sesión y redirección

`/entrar` no cambió: tras autenticarse va a `siguiente` o a `/cuenta`. `LayoutPorRol` muestra el portal Salud Digna a las cuentas `empresa` y LURIMA al resto. Se verificó en el código y en pruebas (`layoutporrol.test.tsx`).

**Limitación (documentada, no resuelta):** el backend no informa a qué empresa pertenece una cuenta, así que **toda cuenta de empresa ve la identidad Salud Digna**. Distinguir empresas requiere un dato de backend (por ejemplo, la empresa o la marca en `/auth/refresh`) y queda fuera de alcance.

## 6. Validaciones ejecutadas

| Validación | Resultado |
|---|---|
| `tsc --noEmit` | Sin errores |
| `vitest run` | 16 archivos, **105 pruebas pasan** (103 previas + 2 nuevas; 1 prueba adaptada al logotipo) |
| `vite build` | Correcto |
| Desbordamiento horizontal: 360, 390, 768, 1024, 1366 y 1920 px | **0 px** en 8 rutas de LURIMA (con scroll para cargar imágenes diferidas) y 9 del portal |
| Imágenes rotas | 0 en las mismas rutas |
| axe-core 4.8.4 (WCAG 2.0/2.1 A y AA) | 0 violaciones en 7 rutas de LURIMA y 8 del portal, a 360 y 1366 px, tras corregir `Paginacion` |
| Consola | Solo el 401 esperado de `/auth/refresh` sin sesión y avisos de React Router ya existentes |
| Menú móvil del portal | Diálogo con foco atrapado, logotipo y sucursal visibles |
| Contraste de la paleta nueva | Blanco/#007A4F 5,39:1; #006B45/#E6F4EE 5,81:1; verde oficial solo en gráficos (4,45:1) |

Los datos del portal en navegador fueron **simulados** (`page.route`), con cualquier escritura bloqueada. LURIMA usó el backend local solo con `GET`. No se escribió en ninguna base de datos.

## 7. Riesgos y pendientes

| Id | Pendiente |
|---|---|
| R-1 | Autorización de uso del logotipo de Salud Digna y su manual de marca (colores oficiales completos). |
| R-2 | Sustituir las fotografías de stock por fotos autorizadas de los productos antes de producción. |
| R-3 | «Zapato clínico antiderrapante» conserva su ilustración SVG con el texto «CONTROL PRO» del seed. |
| R-4 | Toda cuenta de empresa ve la marca Salud Digna (sección 5). Requiere backend. |
| R-5 | El botón primario compartido (`Boton`, `tinta-900`) sigue en azul tinta dentro del portal. Cambiarlo afecta al panel; queda para una revisión de `ui.tsx`. |
| R-6 | Falta revisión visual del panel administrativo tras el cambio de `Paginacion`. Es un tono de gris; no se comparó el CSS generado. |
| R-7 | Sin pruebas con datos reales del portal ni envíos, sin Safari y sin lector de pantalla. axe cubre solo una parte de WCAG. |
| — | Siguen abiertos B-1, B-2, B-3, B-4 y B-9 (backend) del informe del portal. |
| — | H-1 resuelto. H-2 mejorado en `Paginacion`; otros textos `tinta-400` sobre crema no se auditaron uno por uno. |

## 8. Segunda ronda: refinamiento de LURIMA (13-nov-2026)

### 8.1 Cambios visuales
- **Encabezado:** se quitó la franja oscura con «Salud y bienestar a tu alcance» y «Nuestras ubicaciones».
  - Es un elemento global, así que el cambio aplica a todas las vistas.
  - La línea de color de marca (azul, verde, coral) se conserva y ahora va dentro del encabezado fijo.
  - «Sucursales» pasó al menú móvil y a la navegación del pie, para que la página siga enlazada.
- **«Así funciona la solicitud de tu sucursal» → «¿Por qué elegir LURIMA?»:** misma banda oscura, cintas y retícula. Solo dice lo que el sistema respalda:
  - Ubicaciones reales, con su número tomado de la API.
  - Disponibilidad por sucursal en cada ficha.
  - Búsqueda por categoría, talla y color.
  - Portal para empresas.
  - Con la tienda en línea encendida muestra los beneficios que ya existían para ese canal.
- **Pie de página:** se eliminó el bloque global «Salud y bienestar a tu alcance» con los botones «Ver catálogo» y «Ubicaciones». El resto del pie no cambia y el margen vuelve a `mt-16`.
- **Foto del polo:** sustituida por una sin marca de terceros.

### 8.2 Formulario de contacto (`/contacto`)
Dos columnas en escritorio (formulario y sucursales de la API) y una en móvil. El formulario incluye:
- Íconos y etiquetas visibles.
- Validación en el cliente con las mismas reglas que el servidor.
- Errores del servidor mostrados en su campo.
- Indicador «Enviando…» y confirmación solo cuando el servidor responde 201.
- Un campo trampa oculto contra robots.

**Backend (autorizado en esta ronda; sin base de datos ni migraciones):**
- `POST /api/tienda/contacto` (`app/api/tienda.py`, `ContactoSchema` en `app/schemas`):
  - Valida los campos y rechaza saltos de línea en asunto y nombre, para evitar la inyección de cabeceras.
  - Rechaza el envío si se llenó el campo trampa.
  - Limita a `CONTACTO_MAX_POR_HORA` envíos (5 por defecto) por IP. Toma el último valor de `X-Forwarded-For`, que agrega el nginx del proyecto.
  - Respuestas:

    | Código | Caso |
    |---|---|
    | 201 | Enviado |
    | 422 | Datos inválidos |
    | 400 | Campo trampa lleno |
    | 429 | Límite de envíos alcanzado |
    | 503 | Correo real o destinatario sin configurar |
    | 502 | Fallo del SMTP |

  - **Nunca confirma un mensaje que no se entregó.**
- `app/integrations/correo`:
  - Nuevo proveedor `smtp`, con `Reply-To` al correo de quien escribe.
  - Nueva función `correo_real_habilitado()`.
  - El modo `consola`, que sigue siendo el predeterminado, no cambia: lo usa la recuperación de contraseña.
- `app/config.py` y `.env.example` tienen las variables nuevas, sin valores reales.

**Configuración necesaria para habilitarlo en producción** (solo en el entorno del backend, nunca en el frontend):
`CORREO_PROVEEDOR=smtp`, `SMTP_HOST`, `SMTP_PUERTO` (587), `SMTP_USUARIO`, `SMTP_CLAVE`, `SMTP_REMITENTE`, `SMTP_TLS=true` y `CONTACTO_DESTINATARIO` (el buzón que recibe los mensajes). Hay que reconstruir la imagen del backend.
Mientras no estén configuradas, el formulario muestra «El formulario de contacto aún no está habilitado…» (verificado en vivo).

### 8.3 Vista giratoria del producto
- El mecanismo original sigue intacto: `components/Visor360.tsx`, alimentado por `giros` de `GET /tienda/productos/:slug`.
- **En la base local ningún producto tiene fotogramas 360°**: los 12 productos de demostración tienen `giros: []`.
- En `backend/uploads/publicos` sí hay fotogramas (24 por producto) para los 50 productos del catálogo de `seeds/catalogo.py` (commit «Carga_Productos»). Ese catálogo no está cargado en esta base y no se escribió en ella.
- La ficha ahora ofrece las dos vistas cuando la API trae fotogramas:
  - Miniatura **360°** con el visor original (giro automático, arrastre, zoom con doble clic).
  - Miniatura **Foto**, que muestra la fotografía (la ilustrativa de stock o la real).
  - Entre una y otra hay un fundido suave.
- Sin fotogramas no se simula ningún giro: solo se muestra la fotografía. Las fotos que resuelven a la misma imagen ilustrativa no se repiten como miniaturas.
- Verificado en el navegador inyectando los fotogramas reales `polo-negra-staff-0-giro-*.svg` en la respuesta, sin tocar la base. También hay pruebas unitarias.

### 8.4 Validaciones
| Validación | Resultado |
|---|---|
| `tsc --noEmit` | Sin errores |
| `vitest run` | 17 archivos, **111 pruebas pasan** (6 nuevas: formulario y galería) |
| `pytest tests/test_contacto.py` | **4 pasan**. Sustituye los fixtures de base de datos: no crea ni modifica ninguna base. El resto de la suite de backend **no se ejecutó**, porque recrea su base de pruebas (DDL) |
| `vite build` | Correcto |
| Endpoint en vivo (instancia temporal en el puerto 5001, ya detenida) | Envío vacío → 422; envío válido sin SMTP → 503 |
| Desbordamiento e imágenes rotas: 8 vistas públicas × 6 anchuras | 0 |
| axe-core en 8 vistas × 360 y 1366 px | 0 violaciones |
| Consola | Solo el 401 esperado de `/auth/refresh` sin sesión y el 503 del formulario sin SMTP |

Capturas de esta ronda: `docs/capturas-redisenio-visual/lurima-v2-*.jpg`. Las «antes» son las `lurima-*.jpg` de la ronda anterior.

### 8.5 Pendientes de esta ronda
- **Contacto:** configurar SMTP y el buzón de destino (sección 8.2). Sin eso el formulario responde «no disponible».
- **Vista 360°:** para verla con datos reales hay que cargar en la base un catálogo con giros, como el de `seeds/catalogo.py` o vistas 360° dadas de alta desde el panel. Requiere autorización: escribe en la base.
- **Límite de envíos:** se guarda en memoria y es por proceso (marcado como `shortcut`): con 4 workers el tope real puede ser de hasta 4×. Si hay abuso, conviene pasarlo a Redis.
- **Foto de la filipina:** la filipina ilustrativa tiene un bordado pequeño en el pecho; conviene reemplazarla junto con las demás fotos de stock.
- **Visor 360°:** su leyenda «Arrastra para girar» se superpone al texto «CONTROL PRO» de las ilustraciones del seed. Es un detalle preexistente del visor y de los SVG.

## 9. Archivos ajenos que no deben entrar en un commit

`frontend/package-lock.json`, `frontend/tsconfig.tsbuildinfo`, `repomix-output.xml`, `backend/seeds/generar_imagenes.py`, `docs/auditoria-final-pre-push-lurima.md`, `recursos/`, la configuración local del asistente de desarrollo y `.playwright-mcp/` (capturas y scripts de prueba locales).
