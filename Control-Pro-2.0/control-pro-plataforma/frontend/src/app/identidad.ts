/**
 * Identidad del portal empresarial. Es estática a propósito: todavía no hay identidad por empresa en el backend.
 * `logo: null` muestra un espacio de marca sustituible; cuando existan los recursos oficiales de Salud Digna
 * (y la autorización de uso), basta con indicar aquí la ruta del archivo en `public/`.
 */
export const IDENTIDAD_PORTAL = {
  nombre: 'Salud Digna',
  iniciales: 'SD',
  logo: null as string | null,
};
