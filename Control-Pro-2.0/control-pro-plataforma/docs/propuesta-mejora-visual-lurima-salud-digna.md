# Propuesta de mejora visual — Distribuidora LURIMA y portal Salud Digna

Rama: `feature/rediseno-visual-avanzado` (desde `main` bdf882e, con LURIMA y el portal ya integrados). Fecha: 12-nov-2026.
Alcance: solo frontend y recursos estáticos. Implementación e informe: `informe-redisenio-visual-lurima-salud-digna.md`.

## 1. Diagnóstico del estado anterior

| Experiencia | Problema | Evidencia |
|---|---|---|
| LURIMA | Las 12 imágenes de producto eran siluetas SVG del seed con el texto «CONTROL PRO»: la tienda parecía un prototipo | `backend/seeds/imagenes.py` (`svg_producto`), tarjetas del catálogo |
| LURIMA | Portada plana: degradado azul y el logotipo en un círculo, sin fotografía ni jerarquía editorial | `tienda/Inicio.tsx` |
| LURIMA | «Novedades» repetía los productos de «Destacados» | `/tienda/inicio` devuelve listas que se traslapan |
| LURIMA | Categorías como botones de texto, sin imagen | `tienda/Inicio.tsx` |
| LURIMA | Acceso con fondo crema y tarjeta genérica, ajeno al resto de la tienda | `cuenta/Acceso.tsx` |
| LURIMA | Encabezado desbordaba 4 px a 360 px (hallazgo H-1) | `TiendaLayout.tsx` |
| Salud Digna | Marca como espacio sustituible («SD» punteado) | `app/identidad.ts` |
| Salud Digna | Barra lateral verde oscuro: el logotipo oficial (texto gris y verde) pierde contraste sobre ella | prueba de render del SVG oficial |
| Salud Digna | Inicio con nueve tarjetas blancas de cifras, sin jerarquía | `portal/Inicio.tsx` |
| Salud Digna | Verde medido de la maqueta (#089748), no el oficial | `.tema-sd` en `index.css` |

## 2. Direcciones evaluadas

**LURIMA**
- *Catálogo visual* (retícula densa de producto): claro, pero sin personalidad.
- *Retail moderno con carrusel*: el carrusel solo tiene una diapositiva con la tienda apagada (sin promociones); decorativo.
- **Elegida: bienestar contemporáneo editorial.** Tipografía Archivo de gran tamaño, azul marino profundo, fotografía en marco de arco y el motivo propio de las **cintas** (curvas SVG en azul, verde y coral que retoman los colores del logotipo). Se mantiene cálida y comercial sin perder la seriedad de un distribuidor de uniformes.

**Salud Digna**
- *Dashboard SaaS genérico* (barra oscura, tarjetas): es lo que había; se confunde con cualquier panel.
- *Healthcare institucional oscuro*: incompatible con el logotipo oficial, pensado para fondo blanco.
- **Elegida: institucional contemporáneo claro.** Barra lateral blanca con el logotipo oficial, indicador de sección en verde oficial, portada de bienvenida verde oscuro con fotografía y un patrón sutil de cruces, cifras con jerarquía y una barra de distribución real de solicitudes.

Las dos experiencias quedan distinguibles a primera vista: LURIMA azul marino, editorial y con cintas; Salud Digna blanca y verde, ordenada y con el logotipo oficial.

## 3. Sistema visual

| | LURIMA | Salud Digna |
|---|---|---|
| Color principal | `lurima-950/900` (azul marino) | blanco + `sd-900` (#014339) |
| Acento | `bienestar` verde, coral en cintas | verde oficial #008959 (gráficos); #007A4F en botones y texto (AA) |
| Motivo | Cintas SVG, retícula de puntos, arco fotográfico | Cruces sutiles, barra de acento verde, logotipo oficial |
| Tipografía | Archivo extra-negrita de gran tamaño | Archivo y Manrope, tamaños sobrios |
| Fotografía | Producto y escenas de uniformes | Escena clínica en la bienvenida |

## 4. Recursos necesarios

- Logotipo oficial de Salud Digna: descargado del sitio oficial (ver el informe).
- Fotografías de stock con licencia libre para 11 de 12 productos y tres escenas.
- Todo lo demás (cintas, patrones, degradados) se hace con SVG y CSS, sin dependencias nuevas.

## 5. Restricciones respetadas

Sin cambios en el backend, la base de datos, los endpoints, la autenticación, los permisos, `CANAL_TIENDA` ni `features/admin`. No se agregan dependencias. Las reglas comerciales (precios solo con tienda encendida, sin precios en el portal, flujo de solicitudes) quedan intactas.
