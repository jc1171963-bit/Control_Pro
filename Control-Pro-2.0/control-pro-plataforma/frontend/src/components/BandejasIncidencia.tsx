/**
 * Bandejas de incidencias: cada una es un conjunto fijo de turnos (calculados por el backend) o un filtro logístico.
 * La misma definición arma el filtro de la API (?turno=…) y suma su contador desde `conteo`, así que el número de la
 * pestaña y lo que se lista coinciden siempre. Aquí no se calcula ningún turno.
 * Las bandejas de turno de cada portal son excluyentes: una incidencia activa está en una sola.
 */
import type { ConteoBandejas, TurnoIncidencia } from '../api/tipos';
import { cls } from '../lib/formato';

export type Bandeja = {
  clave: string; titulo: string; vacio: string;
  /** Turnos que la forman; sin turnos = «todas»; `cerradas` y `porEnviar` son filtros propios. */
  turnos?: TurnoIncidencia[]; cerradas?: boolean; porEnviar?: boolean;
  /** Le toca actuar a quien mira: la pestaña se destaca cuando tiene incidencias. */
  accion?: boolean;
};

export const BANDEJAS_SUCURSAL: Bandeja[] = [
  { clave: 'te_toca', titulo: 'Te toca', accion: true, turnos: ['sucursal_responder', 'sucursal_recibir', 'sucursal_confirmar'],
    vacio: 'No tienes incidencias pendientes. Aquí aparecerán las que esperen tu respuesta, una recepción o tu confirmación.' },
  { clave: 'esperando', titulo: 'Esperando a Lurima', turnos: ['lurima_atender', 'lurima_responder', 'interna'],
    vacio: 'Ninguna incidencia está esperando a Lurima.' },
  { clave: 'reposicion', titulo: 'Reposición en proceso', turnos: ['lurima_reposicion'],
    vacio: 'No hay reposiciones en proceso.' },
  { clave: 'cerradas', titulo: 'Cerradas', cerradas: true, vacio: 'Todavía no hay incidencias cerradas.' },
  { clave: 'todas', titulo: 'Todas', vacio: 'Si algo falla con una solicitud, repórtalo desde su detalle.' },
];

export const BANDEJAS_LURIMA: Bandeja[] = [
  { clave: 'por_atender', titulo: 'Por atender', accion: true, turnos: ['lurima_atender', 'lurima_responder', 'interna'],
    vacio: 'No hay incidencias por atender.' },
  { clave: 'reposiciones', titulo: 'Reposiciones', turnos: ['lurima_reposicion'], vacio: 'No hay reposiciones en curso.' },
  { clave: 'esperando', titulo: 'Esperando a la sucursal', turnos: ['sucursal_responder', 'sucursal_recibir', 'sucursal_confirmar'],
    vacio: 'Ninguna incidencia está esperando a la sucursal.' },
  { clave: 'cerradas', titulo: 'Cerradas', cerradas: true, vacio: 'No hay incidencias cerradas.' },
  { clave: 'todas', titulo: 'Todas', vacio: 'No hay incidencias registradas.' },
];

/** Filtro logístico del almacén (no es un turno): reposiciones preparadas que todavía no salen. */
export const BANDEJA_POR_ENVIAR: Bandeja = {
  clave: 'por_enviar', titulo: 'Por enviar', accion: true, porEnviar: true,
  vacio: 'No hay reposiciones preparadas pendientes de envío.',
};

/** Bandejas del panel según el perfil: «Por enviar» solo para quien despacha; es la inicial del almacén (D-5). */
export function bandejasPanel(conEnvio: boolean, rol: string | undefined): { bandejas: Bandeja[]; inicial: Bandeja } {
  const bandejas = conEnvio ? [BANDEJAS_LURIMA[0], BANDEJA_POR_ENVIAR, ...BANDEJAS_LURIMA.slice(1)] : BANDEJAS_LURIMA;
  return { bandejas, inicial: conEnvio && rol === 'inventario' ? BANDEJA_POR_ENVIAR : BANDEJAS_LURIMA[0] };
}

/** Parámetros de la API para una bandeja. */
export function filtroBandeja(b: Bandeja): string {
  if (b.porEnviar) return 'por_enviar=1';
  if (b.cerradas) return 'turno=cerrada';
  return b.turnos ? `turno=${b.turnos.join(',')}` : '';
}

/** Contador de una bandeja a partir del conteo de la API (suma de sus turnos; nunca cuenta dos veces). */
export function contarBandeja(b: Bandeja, conteo: ConteoBandejas | undefined): number | null {
  if (!conteo) return null;
  if (b.porEnviar) return conteo.por_enviar ?? null;
  if (b.cerradas) return conteo.cerradas;
  if (!b.turnos) return conteo.todas;
  return b.turnos.reduce((total, t) => total + (conteo.por_turno[t] ?? 0), 0);
}

export function PestanasBandeja({ bandejas, activa, conteo, onCambio, etiqueta }: {
  bandejas: Bandeja[]; activa: string; conteo: ConteoBandejas | undefined; onCambio: (clave: string) => void; etiqueta: string;
}) {
  return (
    <div role="tablist" aria-label={etiqueta} className="-mx-1 flex flex-wrap gap-1.5 px-1">
      {bandejas.map((b) => {
        const n = contarBandeja(b, conteo);
        const sel = b.clave === activa;
        const pendiente = b.accion && !!n;
        return (
          <button key={b.clave} type="button" role="tab" aria-selected={sel} onClick={() => onCambio(b.clave)}
            className={cls('inline-flex min-h-9 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ring-inset transition',
              sel ? 'bg-tinta-900 text-white ring-tinta-900' : 'bg-white/70 text-tinta-700 ring-tinta-200 hover:bg-white')}>
            {b.titulo}
            {n !== null && (
              <span
                className={cls('min-w-[1.5rem] rounded-full px-1.5 text-center text-xs font-bold tabular-nums',
                  sel ? 'bg-white/20 text-inherit' : pendiente ? 'bg-amber-200 text-amber-950' : 'bg-tinta-100 text-tinta-700')}>
                {n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
