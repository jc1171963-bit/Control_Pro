/**
 * Trazabilidad de una solicitud, del envío al cierre, al estilo del rastreo de una paquetería: cada paso muestra
 * cuándo ocurrió, quién lo hizo y cuánto tardó desde el anterior; el paso en curso muestra cuánto lleva esperando.
 * Todo se deriva de datos reales de la solicitud (historial de estados, paquetes, recepciones y entregas con firma).
 * Horizontal desde 768 px; vertical en celular (más espacio para el detalle). Nunca solo color: icono + texto.
 */
import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BadgeCheck, CheckCircle2, ClipboardCheck, Lock, PackageCheck, PackageOpen, PenLine, RotateCcw, Send, ShieldCheck, Truck, XCircle } from 'lucide-react';
import type { Pedido } from '../api/tipos';
import { cls, fechaHora } from '../lib/formato';

type EstadoHito = 'hecha' | 'actual' | 'pendiente' | 'alerta' | 'omitida';
export type Hito = {
  clave: string; titulo: string; icono: LucideIcon; estado: EstadoHito;
  fecha?: string | null; actor?: string | null; detalle?: string | null; duracion?: number | null; espera?: number | null; nota?: string | null;
};

const TERMINALES = ['rechazado', 'cancelado', 'expirado'];

/** Duración legible: «12 min», «3 h 20 min», «2 d 4 h». */
export function duracion(ms: number | null | undefined) {
  if (ms == null || ms < 0) return null;
  const min = Math.round(ms / 60000);
  if (min < 60) return `${Math.max(1, min)} min`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24), hr = h % 24;
  return hr ? `${d} d ${hr} h` : `${d} d`;
}

const maxFecha = (fechas: (string | null | undefined)[]) => fechas.filter(Boolean).sort().slice(-1)[0] ?? null;

/** Calcula los hitos de la solicitud (exportado para pruebas y para otras vistas). */
export function hitosSolicitud(p: Pedido, ahora = Date.now()): Hito[] {
  const primero = (estados: string[]) => p.historial.find((h) => estados.includes(h.nuevo));
  const paquetes = p.paquetes || [];
  const entregas = p.entregas_individuales || [];
  const recibidos = paquetes.filter((x) => x.recepcion);
  const enRuta = paquetes.filter((x) => ['despachado', 'en_transito', 'entregado'].includes(x.estado) || x.envio);
  const entregadas = entregas.filter((e) => e.estado !== 'pendiente');
  const conformes = entregas.filter((e) => e.conformidad_en);
  const devoluciones = p.historial.filter((h) => h.nuevo === 'devuelto');
  const guias = paquetes.filter((x) => x.envio).map((x) => `${x.envio!.paqueteria} ${x.envio!.guia}`);

  const desdeHist = (clave: string, titulo: string, icono: LucideIcon, estados: string[]): Hito => {
    const h = primero(estados);
    return { clave, titulo, icono, estado: h ? 'hecha' : 'pendiente', fecha: h?.fecha, actor: h?.actor };
  };
  const conteo = (clave: string, titulo: string, icono: LucideIcon, total: number, hechos: number, fecha: string | null, unidad: string): Hito => ({
    clave, titulo, icono, estado: total && hechos === total ? 'hecha' : hechos ? 'actual' : 'pendiente',
    fecha: total && hechos === total ? fecha : null, detalle: total ? `${hechos} de ${total} ${unidad}` : null,
  });

  const hitos: Hito[] = [
    { ...desdeHist('enviada', 'Enviada', Send, ['en_revision']), actor: 'Sucursal' },
    { ...desdeHist('aprobada', 'Aprobada', BadgeCheck, ['aprobado']),
      nota: devoluciones.length ? `${devoluciones.length} corrección(es) solicitada(s)` : null },
    desdeHist('autorizada', 'Autorizada', ShieldCheck, ['confirmado']),
    desdeHist('surtido', 'Surtida', PackageOpen, ['en_preparacion']),
    { ...desdeHist('camino', 'En camino', Truck, ['parcialmente_enviado', 'enviado']),
      detalle: paquetes.length ? `${enRuta.length} de ${paquetes.length} paquete(s)` : null, nota: guias.length ? `Guía ${guias.join(' · ')}` : null },
    // Sin paquetes registrados (p. ej. entregas capturadas solo con el cambio de estado), la recepción se toma del historial.
    paquetes.length
      ? conteo('recibida', 'Recibida', PackageCheck, paquetes.length, recibidos.length, maxFecha(recibidos.map((x) => x.recepcion!.fecha)), 'paquete(s)')
      : desdeHist('recibida', 'Recibida', PackageCheck, ['parcialmente_entregado', 'entregado']),
    conteo('entregada', 'Entregada', PenLine, entregas.length, entregadas.length, maxFecha(entregadas.map((e) => e.entregado_en)), 'empleado(s)'),
    conteo('conformidad', 'Conformidad', ClipboardCheck, entregas.length, conformes.length, maxFecha(conformes.map((e) => e.conformidad_en)), 'firmada(s)'),
    desdeHist('cerrada', 'Cerrada', Lock, ['cerrado']),
  ];

  // Un paso posterior cumplido implica los anteriores (p. ej. del envío a «entregado» sin pasar por «en preparación»).
  for (let i = hitos.length - 2; i >= 0; i--) {
    if (hitos[i].estado !== 'hecha' && hitos.slice(i + 1).some((h) => h.estado === 'hecha')) hitos[i].estado = 'hecha';
  }

  // Estados que cortan el recorrido: rechazada, cancelada o vencida (el aviso ocupa el lugar del paso que no ocurrió).
  if (TERMINALES.includes(p.estado)) {
    const h = [...p.historial].reverse().find((x) => x.nuevo === p.estado);
    const i = Math.max(1, hitos.findIndex((x) => x.estado !== 'hecha'));
    const titulos: Record<string, string> = { rechazado: 'Rechazada', cancelado: 'Cancelada', expirado: 'Vencida' };
    hitos[i] = { clave: hitos[i].clave, titulo: titulos[p.estado], icono: XCircle, estado: 'alerta', fecha: h?.fecha, actor: h?.actor, nota: h?.motivo };
    for (let k = i + 1; k < hitos.length; k++) hitos[k] = { ...hitos[k], estado: 'omitida', detalle: null, nota: null };
  } else if (p.estado === 'devuelto') {
    const h = [...p.historial].reverse().find((x) => x.nuevo === 'devuelto');
    hitos[1] = { ...hitos[1], titulo: 'Devuelta', icono: RotateCcw, estado: 'alerta', fecha: h?.fecha, actor: h?.actor, nota: h?.motivo };
  } else if (p.estado !== 'borrador') {
    const i = hitos.findIndex((x) => x.estado !== 'hecha');
    if (i >= 0 && hitos[i].estado === 'pendiente') hitos[i].estado = 'actual';
  }

  // Duración desde el paso anterior con fecha; el paso en curso cuenta cuánto lleva esperando.
  let previa: number | null = null;
  for (const h of hitos) {
    const t = h.fecha ? new Date(h.fecha).getTime() : null;
    if (t != null && previa != null && h.estado !== 'omitida') h.duracion = t - previa;
    if (h.estado === 'actual' && previa != null) h.espera = ahora - previa;
    // Devuelta: lleva esperando la corrección de la sucursal desde que se devolvió.
    if (h.estado === 'alerta' && p.estado === 'devuelto' && t != null) h.espera = ahora - t;
    if (t != null) previa = t;
  }
  return hitos;
}

const ESTILO: Record<EstadoHito, { punto: string; texto: string }> = {
  hecha: { punto: 'bg-menta-500 text-white shadow-[0_6px_16px_rgb(var(--menta-500)/.35)]', texto: 'text-tinta-900' },
  actual: { punto: 'bg-white text-menta-700 ring-[3px] ring-menta-500 animate-latido', texto: 'text-tinta-900' },
  alerta: { punto: 'bg-coral-500 text-white shadow-[0_6px_16px_rgba(228,87,46,.35)]', texto: 'text-coral-700' },
  pendiente: { punto: 'bg-white text-tinta-300 ring-1 ring-tinta-200', texto: 'text-tinta-400' },
  omitida: { punto: 'bg-tinta-50 text-tinta-200 ring-1 ring-tinta-100', texto: 'text-tinta-300' },
};
const ESTADO_TEXTO: Record<EstadoHito, string> = { hecha: 'completado', actual: 'en curso', alerta: 'requiere atención', pendiente: 'pendiente', omitida: 'no aplica' };

function Detalle({ h, centrado }: { h: Hito; centrado?: boolean }) {
  const ms = h.duracion != null ? duracion(h.duracion) : null;
  return (
    <div className={cls('min-w-0', centrado && 'text-center')}>
      <p className={cls('text-sm font-bold leading-tight', ESTILO[h.estado].texto)}>{h.titulo}</p>
      {h.fecha && <p className="mt-0.5 text-[11px] text-tinta-500">{fechaHora(h.fecha)}</p>}
      {h.actor && h.estado !== 'pendiente' && <p className="text-[11px] text-tinta-500">{h.actor}</p>}
      {h.detalle && <p className="text-[11px] font-semibold text-tinta-600">{h.detalle}</p>}
      {ms && <p className={cls('mt-1 inline-flex rounded-full bg-tinta-50 px-2 py-0.5 text-[10px] font-semibold text-tinta-600', centrado && 'mx-auto')}>+{ms}</p>}
      {h.espera != null && h.estado !== 'hecha' && (
        <p className={cls('mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold', h.estado === 'alerta' ? 'bg-coral-50 text-coral-700' : 'bg-menta-50 text-menta-700')}>
          {h.estado === 'alerta' ? 'Esperando corrección' : 'En curso'} · {duracion(h.espera)}</p>
      )}
      {h.nota && <p className="mt-1 line-clamp-2 text-[11px] text-tinta-500" title={h.nota}>{h.nota}</p>}
    </div>
  );
}

export default function LineaTiempoSolicitud({ p, ahora }: { p: Pedido; ahora?: number }) {
  const hitos = hitosSolicitud(p, ahora);
  const hechos = hitos.filter((h) => h.estado === 'hecha').length;
  const inicio = hitos[0].fecha ? new Date(hitos[0].fecha).getTime() : null;
  const ultimo = [...hitos].reverse().find((h) => h.fecha && h.estado !== 'omitida');
  const cerrada = ['cerrado', ...TERMINALES].includes(p.estado);
  const total = inicio && ultimo?.fecha ? (cerrada ? new Date(ultimo.fecha).getTime() : (ahora ?? Date.now())) - inicio : null;
  const actual = hitos.find((h) => h.estado === 'actual' || h.estado === 'alerta');
  const progreso = Math.round((hechos / hitos.length) * 100);
  // Celular: los pasos ya completados se agrupan en una línea desplegable; a la vista queda el último completado,
  // el paso en curso y lo que sigue (antes la lista vertical ocupaba casi dos pantallas).
  const [todo, setTodo] = useState(false);
  const iActual = hitos.findIndex((h) => h.estado === 'actual' || h.estado === 'alerta');
  const corte = iActual > 0 ? iActual - 1 : iActual < 0 ? Math.max(0, hitos.length - 1) : 0;
  const plegados = !todo && corte > 1 ? hitos.slice(0, corte) : [];
  const enLista = plegados.length ? hitos.slice(corte) : hitos;

  return (
    <section aria-label="Trazabilidad de la solicitud">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-tinta-500">{cerrada ? 'Recorrido completo' : 'Paso actual'}</p>
          <p className="font-display text-lg font-bold text-tinta-900">
            {cerrada ? (p.estado === 'cerrado' ? 'Solicitud cerrada' : actual?.titulo) : actual ? actual.titulo : 'Sin enviar'}</p>
        </div>
        <div className="flex gap-6 text-right">
          {total != null && <div><p className="text-xs text-tinta-500">{cerrada ? 'Tiempo total' : 'Tiempo transcurrido'}</p><p className="font-display text-lg font-bold">{duracion(total)}</p></div>}
          <div><p className="text-xs text-tinta-500">Avance</p><p className="font-display text-lg font-bold">{hechos} de {hitos.length}</p></div>
        </div>
      </div>

      {/* Horizontal (≥768 px): pasos sobre una vía que se llena hasta el avance. */}
      <div className="hidden overflow-x-auto pb-2 md:block" tabIndex={0} role="region" aria-label="Pasos de la solicitud">
        <ol className="relative grid min-w-[880px]" style={{ gridTemplateColumns: `repeat(${hitos.length}, minmax(0, 1fr))` }}>
          <span className="absolute left-[5.5%] right-[5.5%] top-[22px] h-1 rounded-full bg-tinta-100" aria-hidden>
            <span className="block h-full origin-left animate-crecer rounded-full bg-gradient-to-r from-menta-400 to-menta-600" style={{ width: `${Math.min(100, (Math.max(0, hechos - 0.5) / (hitos.length - 1)) * 100)}%` }} />
          </span>
          {hitos.map((h) => {
            const Icono = h.estado === 'hecha' && h.clave !== 'cerrada' ? CheckCircle2 : h.icono;
            return (
              <li key={h.clave} className="relative flex flex-col items-center gap-2 px-1" aria-current={h.estado === 'actual' ? 'step' : undefined}>
                <span className={cls('relative z-10 grid h-11 w-11 place-items-center rounded-full transition', ESTILO[h.estado].punto)}>
                  <Icono className="h-5 w-5" aria-hidden /><span className="sr-only">{ESTADO_TEXTO[h.estado]}</span>
                </span>
                <Detalle h={h} centrado />
              </li>
            );
          })}
        </ol>
      </div>

      {/* Vertical (celular) */}
      <ol className="relative space-y-4 md:hidden">
        <span className="absolute bottom-3 left-[19px] top-3 w-0.5 rounded-full bg-tinta-100" aria-hidden />
        {plegados.length > 0 && (
          <li className="relative flex items-center gap-3">
            <span className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-menta-500 text-white"><CheckCircle2 className="h-[18px] w-[18px]" aria-hidden /></span>
            <button type="button" onClick={() => setTodo(true)} aria-expanded={false}
              className="min-h-10 text-left text-sm font-semibold text-tinta-800">
              {plegados.length} pasos completados <span className="block text-xs font-semibold text-menta-700">Ver recorrido completo</span>
            </button>
          </li>
        )}
        {enLista.map((h) => {
          const Icono = h.estado === 'hecha' && h.clave !== 'cerrada' ? CheckCircle2 : h.icono;
          return (
            <li key={h.clave} className="relative flex gap-3" aria-current={h.estado === 'actual' ? 'step' : undefined}>
              <span className={cls('relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full', ESTILO[h.estado].punto)}>
                <Icono className="h-[18px] w-[18px]" aria-hidden /><span className="sr-only">{ESTADO_TEXTO[h.estado]}</span>
              </span>
              <div className="pt-1.5"><Detalle h={h} /></div>
            </li>
          );
        })}
        {todo && corte > 1 && (
          <li className="relative pl-[52px]">
            <button type="button" onClick={() => setTodo(false)} aria-expanded className="min-h-9 text-xs font-semibold text-menta-700">Ocultar pasos completados</button>
          </li>
        )}
      </ol>
      <p className="sr-only">Avance {progreso} %.</p>
    </section>
  );
}
