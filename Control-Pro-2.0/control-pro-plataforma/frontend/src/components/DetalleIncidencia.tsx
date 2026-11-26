/**
 * Piezas comunes de la página de detalle de una incidencia (panel y portal de la sucursal): el encabezado con su
 * situación (turno, prioridad, estado, fechas) y la explicación cuando no se puede mostrar. Solo presentan datos del
 * backend; el turno lo calcula turno_service.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ShieldAlert } from 'lucide-react';
import { ApiError } from '../api/cliente';
import type { Incidencia } from '../api/tipos';
import { fechaHora, haceTiempo, tipoIncidencia } from '../lib/formato';
import ChipTurno, { type PortalTurno } from './ChipTurno';
import PrioridadIncidencia from './PrioridadIncidencia';
import { Boton, Estado, Tarjeta, Vacio } from './ui';

export function VolverIncidencias({ a, texto }: { a: string; texto: string }) {
  return (
    <Link to={a} className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-menta-700 hover:underline">
      <ChevronLeft className="h-4 w-4" aria-hidden />{texto}
    </Link>
  );
}

export function EncabezadoIncidencia({ i, portal, contexto }: { i: Incidencia; portal: PortalTurno; contexto?: ReactNode }) {
  return (
    <Tarjeta>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-x-2 gap-y-1 font-display text-xl font-extrabold tracking-tight text-tinta-900 sm:text-2xl">
              <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden /><span className="break-all">Incidencia {i.folio}</span>
            </h1>
            <p className="text-sm text-tinta-600">{tipoIncidencia(i.tipo)}</p>
          </div>
          <Estado valor={i.estado} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <ChipTurno turno={i.turno} portal={portal} desde={i.turno_desde} />
          <PrioridadIncidencia prioridad={i.prioridad} />
        </div>
        <dl className="grid gap-x-6 gap-y-1 text-xs text-tinta-600 sm:flex sm:flex-wrap">
          <div><dt className="inline">Reportada: </dt><dd className="inline font-semibold text-tinta-800">{fechaHora(i.creado)}</dd></div>
          <div><dt className="inline">Última actividad: </dt><dd className="inline font-semibold text-tinta-800" title={fechaHora(i.ultima_actividad)}>{haceTiempo(i.ultima_actividad)}</dd></div>
          {contexto}
        </dl>
      </div>
    </Tarjeta>
  );
}

/**
 * [responsable, qué se espera] por turno (backend) y portal. Solo traduce el código: no asigna ni calcula nada.
 * Fuente: docs/etapa3-redisenio-incidencias/02_propuesta_redisenio.md §6.
 */
const PASOS: Record<string, Record<PortalTurno, [string | null, string]>> = {
  lurima_atender: {
    lurima: ['Atención (Lurima)', 'revisar la incidencia y atenderla: responder a la sucursal, preparar una reposición o resolverla.'],
    sucursal: ['Lurima', 'revisará tu incidencia y te responderá aquí.'] },
  lurima_responder: {
    lurima: ['Atención (Lurima)', 'la sucursal escribió; hay que responderle en el seguimiento.'],
    sucursal: ['Lurima', 'debe responder a tu último mensaje.'] },
  lurima_reposicion: {
    lurima: ['Lurima', 'continuar con la reposición en curso hasta que llegue a la sucursal.'],
    sucursal: ['Lurima', 'está preparando o enviando tu reposición. Cuando llegue, registrarás su recepción.'] },
  sucursal_responder: {
    lurima: ['La sucursal', 'debe responder al último mensaje de Lurima.'],
    sucursal: ['Tu sucursal', 'responde a Lurima en la conversación.'] },
  sucursal_recibir: {
    lurima: ['La sucursal', 'debe registrar la recepción de la reposición.'],
    sucursal: ['Tu sucursal', 'la reposición ya se entregó; registra su recepción e indica si llegó completa.'] },
  sucursal_confirmar: {
    lurima: ['La sucursal', 'debe confirmar si la solución fue satisfactoria o reabrir la incidencia.'],
    sucursal: ['Tu sucursal', 'confirma si la solución fue satisfactoria o reábrela explicando qué falta.'] },
  interna: {
    lurima: ['Revisión interna', 'incidencia interna, sin una sucursal cliente que responda; la revisa el personal.'],
    sucursal: ['Revisión interna', 'está en revisión interna.'] },
  cerrada: {
    lurima: [null, 'Esta incidencia está cerrada. No hay pasos pendientes.'],
    sucursal: [null, 'Esta incidencia está cerrada. No hay pasos pendientes.'] },
};

/** [responsable, qué se espera] para un turno; desconocido o nulo: mensaje neutral, sin responsable. */
export function pasoSiguiente(turno: string | null | undefined, portal: PortalTurno): [string | null, string] {
  return (turno && PASOS[turno]?.[portal]) || [null, 'No hay información sobre el siguiente paso de esta incidencia.'];
}

/** Qué se espera a continuación. `texto` precisa el paso según lo que el perfil puede hacer. */
export function SiguientePaso({ i, portal, texto, accion }: { i: Incidencia; portal: PortalTurno; texto?: string; accion?: ReactNode }) {
  const [responsable, espera] = pasoSiguiente(i.turno, portal);
  return (
    <section aria-labelledby="siguiente-paso" className="rounded-2xl border-l-4 border-menta-500 bg-white p-4 shadow-sm ring-1 ring-tinta-100">
      <h2 id="siguiente-paso" className="text-xs font-bold uppercase tracking-wide text-tinta-500">Siguiente paso</h2>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-tinta-800">
          {responsable && <><b>{responsable}</b>: </>}{texto ?? espera}
        </p>
        {accion}
      </div>
    </section>
  );
}

/** No existe (404), sin acceso (403) o error temporal; sin detalles técnicos. La sucursal recibe 404 también para las ajenas. */
export function ErrorIncidencia({ error, volver, textoVolver, onReintentar }: {
  error: unknown; volver: string; textoVolver: string; onReintentar: () => void;
}) {
  const status = error instanceof ApiError ? error.status : 0;
  const [titulo, texto] = status === 404
    ? ['No encontramos esta incidencia', 'No existe o no está disponible para tu cuenta.']
    : status === 403
      ? ['No tienes acceso a esta incidencia', 'Está fuera de tu alcance. Si crees que deberías verla, consulta a tu administrador.']
      : ['No se pudo cargar la incidencia', 'Puede ser un problema temporal. Inténtalo de nuevo en unos momentos.'];
  const temporal = status !== 404 && status !== 403;
  return (
    <Tarjeta>
      <div role="alert">
        <Vacio titulo={titulo} texto={texto} accion={
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {temporal && <Boton onClick={onReintentar}>Reintentar</Boton>}
            <Link to={volver} className="inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-semibold text-menta-700 ring-1 ring-tinta-200 hover:bg-white">{textoVolver}</Link>
          </div>
        } />
      </div>
    </Tarjeta>
  );
}
