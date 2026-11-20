/**
 * Actualización en vivo de avisos y mensajes, también cuando la persona ya está dentro de la vista.
 *
 * - Cada 2 s (solo con la pestaña visible) consulta /actividad: un pulso muy ligero con los no leídos y la marca más
 *   reciente de avisos y mensajes.
 * - Si algo cambió, recarga solo lo afectado (contadores, listas de notificaciones, conversaciones abiertas, la solicitud
 *   que se está viendo y los paneles de seguimiento). Si no cambió nada, no recarga nada.
 * - Al volver a la pestaña o cuando llega una notificación push, consulta de inmediato.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { get } from '../api/cliente';

type Actividad = {
  notificaciones: { no_leidas: number; ultima: number | null };
  mensajes: { no_leidos: number; ultimo: string | null; visto?: string | null } | null;
};

/** Consultas que dependen de los avisos: un aviso nuevo casi siempre significa que una solicitud cambió de estado. */
const POR_AVISO = ['notif-admin', 'notif-cliente', 'aprobador-resumen', 'resumen-sucursal', 'seguimiento', 'admin-pedidos',
  'admin-pedido', 'admin-solicitudes', 'pedido', 'mis-pedidos', 'tablero-aprobador', 'permisos-padron'];
const POR_MENSAJE = ['chat-conversaciones', 'chat-mensajes', 'chat-no-leidos'];

export const EVENTO_ACTIVIDAD = 'cp-actividad';

export function useActividadEnVivo(activo = true, intervalo = 2000) {
  const qc = useQueryClient();
  const previo = useRef<{ n: string; m: string } | null>(null);
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    let consultando = false;
    const revisar = async () => {
      if (consultando || document.visibilityState !== 'visible') return;
      consultando = true;
      try {
        const a = await get<Actividad>('/actividad');
        if (!vivo) return;
        const ahora = { n: `${a.notificaciones.no_leidas}|${a.notificaciones.ultima}`, m: a.mensajes ? `${a.mensajes.no_leidos}|${a.mensajes.ultimo}|${a.mensajes.visto ?? ''}` : '' };
        const antes = previo.current;
        previo.current = ahora;
        if (!antes) return; // primera lectura: solo toma la referencia
        const recargar = (claves: string[]) => claves.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
        if (antes.n !== ahora.n) recargar(POR_AVISO);
        if (antes.m !== ahora.m) recargar(POR_MENSAJE);
      } catch { /* sin conexión o sesión renovándose: se reintenta en el siguiente pulso */ } finally { consultando = false; }
    };
    revisar();
    const id = window.setInterval(revisar, intervalo);
    const alVolver = () => { if (document.visibilityState === 'visible') revisar(); };
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', revisar);
    window.addEventListener(EVENTO_ACTIVIDAD, revisar);
    return () => {
      vivo = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', revisar);
      window.removeEventListener(EVENTO_ACTIVIDAD, revisar);
    };
  }, [activo, intervalo, qc]);
}
