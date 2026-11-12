import { createContext, useContext } from 'react';

/**
 * Dónde se está mostrando el catálogo. Por defecto es la tienda pública (LURIMA); el portal de sucursales lo cambia para que
 * `Catalogo`, `Producto` y `ProductoCard` enlacen dentro del portal y no muestren precios (la experiencia corporativa los oculta).
 */
export type ContextoCatalogo = { rutaCatalogo: string; rutaProducto: string; portal: boolean };

export const ContextoCatalogoCtx = createContext<ContextoCatalogo>({ rutaCatalogo: '/catalogo', rutaProducto: '/producto', portal: false });
export const useContextoCatalogo = () => useContext(ContextoCatalogoCtx);
