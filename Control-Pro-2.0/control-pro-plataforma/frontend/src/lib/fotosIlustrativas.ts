/**
 * Manifiesto de fotografías ILUSTRATIVAS de stock (Unsplash), solo para desarrollo y demostración.
 * No son fotografías oficiales de los productos: deben sustituirse por fotos autorizadas antes de producción.
 *
 * Se asocian por slug del producto (identificador estable de la API), nunca por posición en una lista.
 * `slug` es el nombre del archivo y el producto del catálogo prototipo; `productos` son los slugs del catálogo
 * actual (backend/seeds/catalogo.py) que muestran esa misma foto. Ver docs/imagenes-catalogo.md.
 * Solo reemplazan las ilustraciones SVG generadas por el seed (`/api/archivos/publicos/{slug}-{n}.svg`):
 * en cuanto un producto tenga una foto real subida (jpg, png, webp), esa foto se muestra y esta se ignora.
 *
 * Licencia Unsplash (https://unsplash.com/license): uso gratuito, comercial y no comercial, sin atribución obligatoria
 * (se registra igualmente). Descargadas el 12-nov-2026 desde images.unsplash.com en WebP 800×800.
 */
export type FotoIlustrativa = { slug: string; productos?: string[]; foto: string; autor: string; fuente: string };

export const FOTOS_ILUSTRATIVAS: FotoIlustrativa[] = [
  { slug: 'bata-clinica-clasica', productos: ['bata-caballero'], foto: 'AZDVF4fEcY4', autor: 'Muhammad Hicham', fuente: 'Médico con bata blanca' },
  { slug: 'bata-de-laboratorio-antifluidos', productos: ['bata-dama'], foto: 'RlIppR1I3E8', autor: 'Sasun Bughdaryan', fuente: 'Doctor con bata blanca y estetoscopio' },
  { slug: 'camisa-de-trabajo-manga-larga', productos: ['camisa-de-mezclilla-construccion-grande'], foto: 'fHRMqbIucBY', autor: 'Fabian Centeno', fuente: 'Hombre con camisa azul abotonada' },
  // Sustituye a U199aciOyEU (mostraba la etiqueta de una marca de terceros).
  { slug: 'polo-corporativa-pique', productos: ['playera-polo-verde', 'blusa-polo-verde'], foto: 'rpiH-Z9ohmk', autor: 'Lena Kudryavtseva', fuente: 'Polos doblados sobre mesa blanca' },
  { slug: 'filipina-quirurgica', productos: ['conjunto-quirurgico-azul-marino-dama'], foto: '_4xStiTXY1o', autor: 'Beatriz Mendez', fuente: 'Mujer con filipina azul' },
  { slug: 'pantalon-quirurgico', productos: ['quirurgico-verde-femenino'], foto: 'O8ekTIhHBRY', autor: 'Lisa Marie Theck', fuente: 'Mujer con uniforme quirúrgico verde' },
  { slug: 'pantalon-de-trabajo-cargo', foto: '5NPdRwt7BsQ', autor: 'Miguel Carraça', fuente: 'Pantalones cargo' },
  { slug: 'chaleco-de-alta-visibilidad', foto: 'rJnbgTluYfc', autor: 'Josh Marty', fuente: 'Trabajadores con chaleco de alta visibilidad' },
  { slug: 'botas-de-seguridad-dielectricas', productos: ['botas-mantenimiento'], foto: 'J34M8K1uqs4', autor: 'Annie Spratt', fuente: 'Zapatos de trabajo negros' },
  { slug: 'gorra-de-trabajo', foto: '2loKxdi6Hmo', autor: 'Yang Deng', fuente: 'Gorra gris sobre superficie blanca' },
  { slug: 'mandil-de-intendencia', foto: 'k7qAyA_sf_8', autor: 'Golden Horn Bridge', fuente: 'Mujer con delantal negro' },
  // Sin producto equivalente en el catálogo actual (color o prenda distintos): pantalón cargo caqui, chaleco de alta
  // visibilidad, gorra y mandil negro solo aplican a su slug prototipo.
  // zapato-clinico-antiderrapante: sin foto libre adecuada (solo calzado deportivo con marca visible); conserva su ilustración.
];

const POR_SLUG = new Map(FOTOS_ILUSTRATIVAS.flatMap((f) => [f.slug, ...(f.productos ?? [])].map((s) => [s, `/assets/products/${f.slug}.webp`] as const)));

/** Ruta de la foto ilustrativa que sustituye a `src`, o null si `src` es una foto real o el producto no tiene foto de stock. */
export function fotoIlustrativa(src: string | null | undefined): string | null {
  const slug = src?.match(/\/archivos\/publicos\/(.+)-\d+\.svg$/)?.[1];
  return (slug && POR_SLUG.get(slug)) || null;
}
