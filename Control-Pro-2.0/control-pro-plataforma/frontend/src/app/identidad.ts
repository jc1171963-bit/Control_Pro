/**
 * Identidad del portal empresarial. Es estática a propósito: todavía no hay identidad por empresa en el backend,
 * así que toda cuenta de empresa ve esta marca.
 * Logotipo oficial descargado el 12-nov-2026 del encabezado de https://www.salud-digna.org/
 * (https://cdn.comunidadsd.org/MX/Salud-Digna/Home/Header/img/LogoSaludDigna.svg). Es una marca registrada de su titular:
 * su uso en producción requiere la autorización de Salud Digna. Con `logo: null` vuelve el espacio de marca sustituible.
 */
export const IDENTIDAD_PORTAL = {
  nombre: 'Salud Digna',
  iniciales: 'SD',
  logo: '/assets/brands/salud-digna/logo-salud-digna.svg' as string | null,
};
