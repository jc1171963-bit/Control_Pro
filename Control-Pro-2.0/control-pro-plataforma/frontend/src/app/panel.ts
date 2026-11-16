import { useLocation } from 'react-router-dom';
import type { Usuario } from '../api/tipos';

/**
 * Las pantallas de solicitudes, sucursales y organización se usan en dos marcos: el panel interno de la distribuidora
 * (/admin) y el portal del aprobador corporativo (/aprobador). Sus enlaces internos se arman con esta base.
 */
export const BASE_APROBADOR = '/aprobador';

export function useBasePanel() {
  const { pathname } = useLocation();
  return pathname === BASE_APROBADOR || pathname.startsWith(`${BASE_APROBADOR}/`) ? BASE_APROBADOR : '/admin';
}

/** Los avisos del backend enlazan a /admin/...; para el aprobador se traducen a su portal. */
export function enlacePanel(enlace: string | null | undefined, base: string) {
  if (!enlace) return enlace ?? null;
  return base === BASE_APROBADOR && (enlace === '/admin' || enlace.startsWith('/admin/')) ? BASE_APROBADOR + enlace.slice(6) : enlace;
}

export const esAprobador = (u: Usuario | null | undefined) => u?.rol.codigo === 'aprobador';

/** Enlace de WhatsApp (wa.me) con mensaje prellenado. Números de 10 dígitos se toman como de México (+52). */
export function enlaceWhatsApp(numero: string | null | undefined, texto: string) {
  const digitos = (numero || '').replace(/\D/g, '');
  if (digitos.length < 10) return null;
  const completo = digitos.length === 10 ? `52${digitos}` : digitos;
  return `https://wa.me/${completo}?text=${encodeURIComponent(texto)}`;
}
