import type { ContextoCatalogo } from '../tienda/contextoCatalogo';

/** Catálogo dentro del portal: mismas pantallas que la tienda, con el marco, los enlaces y las reglas del portal. */
export const RUTA_CATALOGO_PORTAL = '/cuenta/catalogo';

export const CONTEXTO_CATALOGO_PORTAL: ContextoCatalogo = { rutaCatalogo: RUTA_CATALOGO_PORTAL, rutaProducto: RUTA_CATALOGO_PORTAL, portal: true };
