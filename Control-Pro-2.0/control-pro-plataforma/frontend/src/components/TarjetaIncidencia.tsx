/**
 * Resumen de una incidencia para bandejas, inicios y solicitudes. Solo presenta datos del backend: el turno (ChipTurno),
 * la prioridad y la última actividad; el siguiente paso sale de la misma tabla que el detalle (pasoSiguiente).
 * - Sin `children`: toda la tarjeta es el enlace al detalle (listas).
 * - Con `children` (evidencias, reposiciones…; aunque vengan vacíos): la tarjeta no es un enlace, para no anidar controles; el detalle se
 *   abre desde su pie.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Incidencia } from '../api/tipos';
import { cls, fechaHora, haceTiempo, tipoIncidencia } from '../lib/formato';
import ChipTurno, { type PortalTurno } from './ChipTurno';
import PrioridadIncidencia from './PrioridadIncidencia';
import { pasoSiguiente } from './DetalleIncidencia';

export default function TarjetaIncidencia({ i, portal, a, state, etiqueta, contexto, paso = false, children }: {
  i: Incidencia; portal: PortalTurno;
  /** Ruta del detalle; sin ella (perfil sin acceso al detalle) no hay enlace. */
  a?: string; state?: unknown; etiqueta?: string;
  /** Datos propios del lugar donde se muestra (solicitud, sucursal, empleado…), en la línea de datos. */
  contexto?: ReactNode;
  /** Muestra qué hacer cuando el turno es de quien mira (backend: turno_actor). */
  paso?: boolean;
  children?: ReactNode;
}) {
  const enlace = children === undefined && !!a;  // con contenido propio (aunque hoy venga vacío) siempre es tarjeta, no enlace
  const texto = paso && i.turno_actor === portal ? pasoSiguiente(i.turno, portal)[1] : null;
  const cuerpo = (
    <>
      <span className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <span className="min-w-0 text-sm font-semibold text-tinta-900">{i.folio} · {tipoIncidencia(i.tipo)}</span>
        <ChipTurno turno={i.turno} portal={portal} desde={i.turno_desde} />
      </span>
      <span className={cls('mt-1 block text-sm text-tinta-600', enlace && 'truncate')}>{i.descripcion}</span>
      {texto && <span className="mt-1 block text-sm font-medium text-tinta-800">{texto.charAt(0).toUpperCase() + texto.slice(1)}</span>}
      <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tinta-600">
        <PrioridadIncidencia prioridad={i.prioridad} />
        {contexto}
        <span title={fechaHora(i.ultima_actividad)}>Última actividad {haceTiempo(i.ultima_actividad)}</span>
      </span>
    </>
  );
  if (enlace) {
    return <Link to={a!} state={state} aria-label={etiqueta} className="-mx-2 block rounded-xl px-2 py-3.5 hover:bg-tinta-50/60">{cuerpo}</Link>;
  }
  return (
    <div className="rounded-xl p-3 ring-1 ring-tinta-100">
      {cuerpo}
      {children}
      {a && <Link to={a} state={state} aria-label={etiqueta ?? `Abrir incidencia ${i.folio}`}
        className="mt-0.5 inline-flex min-h-9 items-center text-xs font-semibold text-menta-700 hover:underline">Abrir incidencia</Link>}
    </div>
  );
}
