/**
 * Seguimiento de todas las solicitudes de las sucursales en un solo lugar: cada una con su trazabilidad compacta (los
 * mismos 9 pasos del detalle), el paso en que va y cuánto lleva esperando. Por omisión muestra las activas, primero la
 * que lleva más tiempo sin avanzar, para atender lo que se está quedando atrás.
 *
 * Los pasos se calculan con `hitosSolicitud` (la misma lógica del detalle) a partir de /admin/seguimiento, que devuelve
 * en una sola respuesta el resumen y la trazabilidad de cada solicitud de la página.
 */
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, BadgeCheck, Columns3, List, Ban, CheckCircle2, ChevronRight, Clock3, Inbox, Layers, Lock, PackageOpen, PenLine, RotateCcw, Search,
  Timer, Truck } from 'lucide-react';
import { get } from '../../api/cliente';
import type { Pagina, Pedido, PedidoResumen } from '../../api/tipos';
import { useBasePanel } from '../../app/panel';
import { Estado, Paginacion, Vacio } from '../../components/ui';
import { EsqueletoLista, NumeroAnimado } from '../../components/movimiento';
import { duracion, hitosSolicitud, type Hito } from '../../components/LineaTiempoSolicitud';
import { cls, fechaHora } from '../../lib/formato';
import SelloCNR from '../../components/SelloCNR';

export type ItemSeguimiento = PedidoResumen & Pick<Pedido, 'historial' | 'paquetes' | 'entregas_individuales'>;
type Respuesta = Pagina<ItemSeguimiento> & { conteo: Record<string, number>; etapa: string };

export const ETAPAS: [string, string, LucideIcon][] = [
  ['activas', 'Activas', Layers], ['por_aprobar', 'Por aprobar', Inbox], ['devueltas', 'En corrección', RotateCcw],
  ['por_autorizar', 'Por autorizar', BadgeCheck], ['en_surtido', 'En surtido', PackageOpen], ['en_camino', 'En camino', Truck],
  ['en_entrega', 'En recepción y entrega', PenLine], ['cerradas', 'Cerradas', Lock], ['detenidas', 'Rechazadas o canceladas', Ban],
  ['todas', 'Todas', Layers],
];

const HORA = 3_600_000;
/** En esta vista el paso en curso se nombra por lo que falta («Por aprobar»), no por el paso que aún no ocurre («Aprobada»). */
const PENDIENTE: Record<string, string> = {
  enviada: 'Por enviar', aprobada: 'Por aprobar', autorizada: 'Por autorizar (cobro)', surtido: 'En surtido', camino: 'Por despachar',
  recibida: 'Por recibir en sucursal', entregada: 'Por entregar a empleados', conformidad: 'Por firmar conformidad', cerrada: 'Por cerrar',
};
/** Urgencia según cuánto lleva el paso actual sin avanzar (siempre con ícono y texto, nunca solo color). */
function urgencia(espera: number | null | undefined) {
  if (espera == null) return null;
  if (espera >= 72 * HORA) return { texto: 'Demorada', icono: AlertTriangle, clase: 'bg-coral-50 text-coral-700 ring-coral-100' };
  if (espera >= 24 * HORA) return { texto: 'Atención', icono: Timer, clase: 'bg-amber-50 text-amber-800 ring-amber-100' };
  return { texto: 'A tiempo', icono: Clock3, clase: 'bg-menta-50 text-menta-700 ring-menta-100' };
}

const PUNTO: Record<Hito['estado'], string> = {
  hecha: 'bg-menta-500 text-white',
  actual: 'bg-white text-menta-700 ring-[2.5px] ring-menta-500 animate-latido',
  alerta: 'bg-coral-500 text-white',
  pendiente: 'bg-white text-tinta-300 ring-1 ring-tinta-200',
  omitida: 'bg-tinta-50 text-tinta-200 ring-1 ring-tinta-100',
};

/** Trazabilidad compacta: los 9 pasos en una línea; el nombre y la fecha de cada uno al pasar el cursor o enfocar. */
export function PasosCompactos({ hitos }: { hitos: Hito[] }) {
  const hechos = hitos.filter((h) => h.estado === 'hecha').length;
  const ultimo = Math.max(0, hitos.map((h) => h.estado).lastIndexOf('hecha'));
  const avance = hitos.length > 1 ? (ultimo / (hitos.length - 1)) * 100 : 0;
  return (
    <ol className="relative flex items-center justify-between" aria-label={`Avance: ${hechos} de ${hitos.length} pasos`}>
      <span className="absolute left-3 right-3 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-tinta-100" aria-hidden>
        <span className="block h-full origin-left animate-crecer rounded-full bg-menta-500" style={{ width: `${hechos ? avance : 0}%` }} />
      </span>
      {hitos.map((h) => {
        const Icono = h.estado === 'hecha' && h.clave !== 'cerrada' ? CheckCircle2 : h.icono;
        const ayuda = `${h.titulo}${h.fecha ? ` · ${fechaHora(h.fecha)}` : ''}${h.detalle ? ` · ${h.detalle}` : ''}`;
        return (
          <li key={h.clave} className="relative z-10" title={ayuda}>
            <span className={cls('grid h-6 w-6 place-items-center rounded-full transition', PUNTO[h.estado])}><Icono className="h-3.5 w-3.5" aria-hidden /></span>
            <span className="sr-only">{ayuda}: {h.estado === 'hecha' ? 'completado' : h.estado === 'actual' ? 'en curso' : h.estado === 'alerta' ? 'requiere atención' : 'pendiente'}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Una solicitud con su trazabilidad compacta, paso actual, espera y enlace al detalle. */
export function FilaSeguimiento({ p, ahora }: { p: ItemSeguimiento; ahora: number }) {
  const base = useBasePanel();
  const hitos = hitosSolicitud(p as unknown as Pedido, ahora);
  const actual = hitos.find((h) => h.estado === 'actual' || h.estado === 'alerta');
  const cerrada = p.estado === 'cerrado';
  const detenida = ['rechazado', 'cancelado', 'expirado'].includes(p.estado);
  const espera = !cerrada && !detenida ? actual?.espera : null;
  const u = urgencia(espera);
  const hechos = hitos.filter((h) => h.estado === 'hecha').length;
  const inicio = hitos[0].fecha ? new Date(hitos[0].fecha).getTime() : null;
  return (
    <li>
      <Link to={`${base}/pedidos/${p.id}`} className="group grid items-center gap-x-6 gap-y-3 rounded-2xl px-3 py-4 transition hover:bg-white/60 sm:px-4 xl:grid-cols-[minmax(200px,1fr)_minmax(280px,1.6fr)_minmax(200px,1fr)_20px]">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2"><span className="font-display text-[15px] font-bold">{p.folio}</span><Estado valor={p.estado} /></p>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm font-semibold text-tinta-700"><span className="truncate">{p.cliente.nombre}</span>{p.cliente.cnr && <SelloCNR />}</p>
          <p className="text-xs text-tinta-500">{fechaHora(p.creado)} · {p.articulos} artículo(s)</p>
        </div>
        <div className="min-w-0">
          <PasosCompactos hitos={hitos} />
          <p className="mt-2 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-tinta-400" aria-hidden><span>Enviada</span><span>Avance {hechos} de {hitos.length}</span><span>Cerrada</span></p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta-400">{cerrada ? 'Recorrido completo' : detenida ? 'Detenida' : 'Paso actual'}</p>
          <p className={cls('font-display text-[15px] font-bold', actual?.estado === 'alerta' && 'text-coral-700')}>
            {cerrada ? `Cerrada en ${duracion(inicio && hitos[8].fecha ? new Date(hitos[8].fecha).getTime() - inicio : null) ?? '—'}`
              : !actual ? '—' : actual.estado === 'actual' ? (PENDIENTE[actual.clave] ?? actual.titulo) : actual.titulo}</p>
          {u && espera != null && (
            <p className={cls('mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1', u.clase)}>
              <u.icono className="h-3 w-3" aria-hidden />{u.texto} · {p.estado === 'devuelto' ? 'esperando corrección' : 'esperando'} {duracion(espera)}</p>
          )}
          {detenida && actual?.nota && <p className="mt-1 line-clamp-1 text-xs text-tinta-500" title={actual.nota}>{actual.nota}</p>}
        </div>
        <ChevronRight className="hidden h-5 w-5 text-tinta-300 transition group-hover:translate-x-0.5 xl:block" aria-hidden />
      </Link>
    </li>
  );
}

/** Tarjeta compacta para el tablero por etapas. */
function TarjetaSeguimiento({ p, ahora }: { p: ItemSeguimiento; ahora: number }) {
  const base = useBasePanel();
  const hitos = hitosSolicitud(p as unknown as Pedido, ahora);
  const actual = hitos.find((h) => h.estado === 'actual' || h.estado === 'alerta');
  const hechos = hitos.filter((h) => h.estado === 'hecha').length;
  const espera = actual?.espera;
  const u = urgencia(espera);
  return (
    <li>
      <Link to={`${base}/pedidos/${p.id}`} className="group block rounded-2xl bg-white p-3.5 shadow-suave ring-1 ring-tinta-100 transition hover:-translate-y-0.5 hover:ring-menta-500">
        <p className="flex items-center justify-between gap-2"><span className="font-display text-sm font-bold">{p.folio}</span>{p.cliente.cnr && <SelloCNR />}</p>
        <p className="mt-0.5 truncate text-xs font-semibold text-tinta-700">{p.cliente.nombre}</p>
        <div className="mt-2.5 flex items-center gap-2" aria-label={`Avance ${hechos} de ${hitos.length}`}>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-tinta-100"><span className="block h-full rounded-full bg-menta-500" style={{ width: `${(hechos / hitos.length) * 100}%` }} /></span>
          <span className="text-[10px] font-bold tabular-nums text-tinta-500">{hechos}/{hitos.length}</span>
        </div>
        <p className={cls('mt-2 text-xs font-semibold', actual?.estado === 'alerta' ? 'text-coral-700' : 'text-tinta-800')}>
          {!actual ? '—' : actual.estado === 'actual' ? (PENDIENTE[actual.clave] ?? actual.titulo) : actual.titulo}</p>
        {u && espera != null && <p className={cls('mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1', u.clase)}><u.icono className="h-3 w-3" aria-hidden />{u.texto} · {duracion(espera)}</p>}
        <p className="mt-1.5 text-[10px] text-tinta-400">{p.articulos} artículo(s) · enviada {fechaHora(p.creado)}</p>
      </Link>
    </li>
  );
}

const COLUMNAS = ['por_aprobar', 'devueltas', 'por_autorizar', 'en_surtido', 'en_camino', 'en_entrega'];

/** Tablero por etapas (tipo panel): una columna por etapa activa, primero lo que lleva más tiempo esperando. */
function TableroSeguimiento({ q, orden, ahora, onVerEtapa }: { q: string; orden: string; ahora: number; onVerEtapa: (etapa: string) => void }) {
  const columnas = useQueries({
    queries: COLUMNAS.map((etapa) => ({
      queryKey: ['seguimiento', 'tablero', etapa, orden, q],
      queryFn: () => get<Respuesta>(`/admin/seguimiento?etapa=${etapa}&orden=${orden}&por_pagina=8${q ? `&q=${encodeURIComponent(q)}` : ''}`),
      refetchInterval: 60_000, placeholderData: keepPreviousData,
    })),
  });
  return (
    <div className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-3" role="region" aria-label="Tablero por etapas" tabIndex={0}>
      {COLUMNAS.map((etapa, i) => {
        const [, nombre, Icono] = ETAPAS.find(([k]) => k === etapa)!;
        const c = columnas[i] as { data?: Respuesta; isLoading: boolean; isPlaceholderData: boolean };
        return (
          <section key={etapa} aria-label={nombre} className="vidrio flex w-[min(82vw,290px)] shrink-0 snap-start flex-col rounded-2xl bg-white/70 p-3">
            <header className="mb-3 flex items-center justify-between gap-2 px-1">
              <h3 className="flex items-center gap-2 text-sm font-bold"><Icono className="h-4 w-4 text-[#0e7490]" aria-hidden />{nombre}</h3>
              <span className="grid h-6 min-w-6 place-items-center rounded-full bg-tinta-100 px-2 text-xs font-bold tabular-nums text-tinta-700">{c.data?.total ?? '·'}</span>
            </header>
            {c.isLoading ? <EsqueletoLista filas={3} texto={`Cargando ${nombre}…`} /> : !c.data?.items.length ? (
              <p className="rounded-xl border-2 border-dashed border-tinta-100 px-3 py-6 text-center text-xs text-tinta-400">Nada en esta etapa</p>
            ) : (
              <ul className={cls('space-y-2.5', c.isPlaceholderData && 'opacity-60')}>{c.data.items.map((p) => <TarjetaSeguimiento key={p.id} p={p} ahora={ahora} />)}</ul>
            )}
            {!!c.data && c.data.total > c.data.items.length && (
              <button type="button" onClick={() => onVerEtapa(etapa)} className="mt-3 min-h-10 rounded-xl text-xs font-semibold text-menta-700 hover:bg-white/70">Ver las {c.data.total} →</button>
            )}
          </section>
        );
      })}
    </div>
  );
}

export default function Seguimiento() {
  const [params, setParams] = useSearchParams();
  const etapa = params.get('etapa') || 'activas';
  const orden = params.get('orden') || 'espera';
  const pagina = Number(params.get('pagina') || 1);
  const vista = params.get('vista') === 'tablero' ? 'tablero' : 'lista';
  const [texto, setTexto] = useState(params.get('q') || '');
  const q = params.get('q') || '';
  // Siempre parte de los parámetros vigentes (la búsqueda diferida no debe deshacer un cambio de etapa reciente).
  const cambiar = (cambios: Record<string, string | null>) => {
    setParams((previos) => {
      const n = new URLSearchParams(previos);
      for (const [k, v] of Object.entries(cambios)) { if (v) n.set(k, v); else n.delete(k); }
      if (!('pagina' in cambios)) n.delete('pagina');
      return n;
    }, { replace: true });
  };
  // Búsqueda mientras se escribe (con una pausa breve para no consultar en cada tecla)
  useEffect(() => {
    const t = window.setTimeout(() => { if (texto.trim() !== q) cambiar({ q: texto.trim() || null }); }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const consulta = useQuery({
    queryKey: ['seguimiento', etapa, orden, q, pagina],
    queryFn: () => get<Respuesta>(`/admin/seguimiento?etapa=${etapa}&orden=${orden}&pagina=${pagina}&por_pagina=15${q ? `&q=${encodeURIComponent(q)}` : ''}`),
    placeholderData: keepPreviousData, refetchInterval: 60_000, enabled: vista === 'lista',
  });
  const d = consulta.data;
  const ahora = Date.now();
  const nombreEtapa = ETAPAS.find(([k]) => k === etapa)?.[1] ?? 'Activas';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Seguimiento de solicitudes</h1>
          <p className="text-sm text-tinta-500">La trazabilidad de todas las sucursales en un solo lugar: en qué paso va cada solicitud y cuánto lleva esperando.</p>
        </div>
        <div role="radiogroup" aria-label="Vista" className="flex rounded-full border border-white/80 bg-white/60 p-1 backdrop-blur-md">
          {([['lista', 'Lista', List], ['tablero', 'Tablero', Columns3]] as const).map(([v, n, Icono]) => (
            <button key={v} type="button" role="radio" aria-checked={vista === v} onClick={() => cambiar({ vista: v === 'lista' ? null : v })}
              className={cls('flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition', vista === v ? 'bg-[#0b4f6c] text-white shadow' : 'text-tinta-600 hover:bg-white')}>
              <Icono className="h-4 w-4" aria-hidden />{n}</button>
          ))}
        </div>
      </div>

      {vista === 'tablero' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-10 min-w-[240px] flex-1 items-center gap-2 rounded-full border border-white/80 bg-white/70 px-3.5 backdrop-blur-md sm:flex-none">
              <Search className="h-4 w-4 shrink-0 text-tinta-400" aria-hidden />
              <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Folio o sucursal…" aria-label="Buscar por folio o sucursal"
                className="w-full border-0 bg-transparent p-0 text-sm focus:outline-none focus:ring-0" />
            </label>
            <select value={orden} onChange={(e) => cambiar({ orden: e.target.value === 'espera' ? null : e.target.value })} aria-label="Ordenar"
              className="h-10 rounded-full border border-white/80 bg-white/70 pl-3.5 pr-8 text-sm font-semibold text-tinta-700 focus:ring-2 focus:ring-menta-500">
              <option value="espera">Más tiempo esperando</option><option value="reciente">Más recientes</option>
            </select>
          </div>
          <TableroSeguimiento q={q} orden={orden} ahora={ahora} onVerEtapa={(e) => cambiar({ vista: null, etapa: e })} />
        </>
      ) : (<>
      {/* Etapas con su conteo: también funcionan como filtro */}
      <nav aria-label="Etapas" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {ETAPAS.map(([clave, nombre, Icono]) => {
          const activo = etapa === clave;
          const n = d?.conteo?.[clave];
          return (
            <button key={clave} type="button" onClick={() => cambiar({ etapa: clave === 'activas' ? null : clave })} aria-pressed={activo}
              className={cls('flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold backdrop-blur-md transition',
                activo ? 'border-transparent bg-[#0b4f6c] text-white shadow-[0_8px_24px_#0e749033]' : 'border-white/80 bg-white/60 text-tinta-700 hover:bg-white/85')}>
              <Icono className="h-4 w-4" aria-hidden />{nombre}
              <span className={cls('grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold tabular-nums', activo ? 'bg-white/20 text-white' : 'bg-tinta-100 text-tinta-700')}>
                {n == null ? '·' : n}</span>
            </button>
          );
        })}
      </nav>

      <section className="vidrio rounded-2xl bg-white p-3 sm:p-5" aria-labelledby="t-lista">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3 px-1">
          <h2 id="t-lista" className="font-display text-base font-bold">{nombreEtapa}
            {d && <span className="ml-2 text-sm font-semibold text-tinta-500"><NumeroAnimado valor={d.total} /> solicitud(es)</span>}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-10 min-w-[240px] items-center gap-2 rounded-full border border-tinta-100 bg-white/70 px-3.5">
              <Search className="h-4 w-4 shrink-0 text-tinta-400" aria-hidden />
              <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Folio o sucursal…" aria-label="Buscar por folio o sucursal"
                className="w-full border-0 bg-transparent p-0 text-sm focus:outline-none focus:ring-0" />
            </label>
            <select value={orden} onChange={(e) => cambiar({ orden: e.target.value === 'espera' ? null : e.target.value })} aria-label="Ordenar"
              className="h-10 rounded-full border border-tinta-100 bg-white/70 pl-3.5 pr-8 text-sm font-semibold text-tinta-700 focus:ring-2 focus:ring-menta-500">
              <option value="espera">Más tiempo esperando</option><option value="reciente">Más recientes</option>
            </select>
          </div>
        </div>
        <p className="mb-1 hidden grid-cols-[minmax(200px,1fr)_minmax(280px,1.6fr)_minmax(200px,1fr)_20px] gap-x-6 px-4 text-[11px] font-semibold uppercase tracking-wide text-tinta-400 xl:grid" aria-hidden>
          <span>Solicitud</span><span>Trazabilidad</span><span>Situación</span><span /></p>

        {consulta.isLoading ? <EsqueletoLista filas={6} texto="Cargando el seguimiento…" /> : consulta.error ? (
          <p role="alert" className="px-2 py-8 text-center text-sm text-coral-700">No se pudo cargar el seguimiento. Intenta de nuevo en un momento.</p>
        ) : !d?.items.length ? (
          <Vacio titulo={q ? 'Sin coincidencias' : 'Nada en esta etapa'} texto={q ? 'Prueba con otro folio o nombre de sucursal.' : 'Cuando haya solicitudes en esta etapa aparecerán aquí con su trazabilidad.'} />
        ) : (
          <ul className={cls('divide-y divide-tinta-100 transition-opacity', consulta.isPlaceholderData && 'opacity-60')}>
            {d.items.map((p) => <FilaSeguimiento key={p.id} p={p} ahora={ahora} />)}
          </ul>
        )}
        {d && d.paginas > 1 && <div className="px-2"><Paginacion pagina={d.pagina} paginas={d.paginas} total={d.total} onCambio={(n) => cambiar({ pagina: String(n) })} /></div>}
      </section>
      </>)}
    </div>
  );
}
