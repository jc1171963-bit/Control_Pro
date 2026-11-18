/**
 * Tablero ejecutivo del aprobador (datos de /admin/reportes/aprobador). Reglas de visualización:
 * - Un filtro de periodo, en una fila arriba, que aplica a todo el tablero.
 * - Una sola cifra principal (tiempo de aprobación); las demás son cifras secundarias con su comparación.
 * - Una serie por gráfica (sin leyenda: el título la nombra); escala secuencial de un solo tono para el mapa.
 * - Al pasar el cursor o con el teclado se ve el detalle; cada gráfica tiene su tabla accesible.
 * - El texto nunca usa el color de los datos; las comparaciones llevan flecha y texto, no solo color.
 */
import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Clock3, Table2 } from 'lucide-react';
import { get } from '../../api/cliente';
import { Tarjeta } from '../../components/ui';
import { EsqueletoLista } from '../../components/movimiento';
import { cls } from '../../lib/formato';

type Grupo = { sucursales: number; solicitudes: number; anterior: number; unidades: number; por_revisar: number };
export type TableroDatos = {
  periodo: { dias: number; desde: string; hasta: string };
  tiempo_aprobacion: { promedio_h: number | null; mediana_h: number | null; aprobadas: number; anterior_promedio_h: number | null };
  enviadas: { actual: number; anterior: number }; unidades: { actual: number; anterior: number };
  tasa_aprobacion: { actual: number | null; anterior: number | null };
  sucursales_activas: { actual: number; anterior: number; total: number };
  por_revisar: { total: number; mas_antigua_h: number | null };
  semanas: { inicio: string; enviadas: number; aprobadas: number; actual: boolean }[];
  estados: ({ estado: string } & Grupo)[];
  zonas: ({ id: number; nombre: string } & Grupo)[];
  divisiones: ({ id: number; nombre: string } & Grupo)[];
};

// Paleta de visualización validada con scripts/validate_palette.js contra el fondo de las tarjetas (#f3f9f9):
// serie azul (contraste ≥ 3:1) y escala ordinal de un solo tono, de claro a oscuro, con el extremo claro ≥ 2:1.
const SERIE = '#2a78d6', SERIE_SUAVE = '#6da7ec';
const ESCALA = ['#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
const TEXTO_SOBRE = ['#0b0b0b', '#ffffff', '#ffffff', '#ffffff', '#ffffff'];
const PERIODOS: [number, string][] = [[7, '7 días'], [30, '30 días'], [90, '90 días'], [180, '6 meses']];

const fmtNum = new Intl.NumberFormat('es-MX');
const fmtFechaCorta = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
export const horasLegibles = (h: number | null | undefined) => {
  if (h == null) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${(Math.round(h * 10) / 10).toLocaleString('es-MX')} h`;
  return `${(Math.round((h / 24) * 10) / 10).toLocaleString('es-MX')} d`;
};

/** Cambio contra el periodo anterior: flecha + texto; `bueno` dice si subir es bueno (true), malo (false) o neutro (null). */
function Delta({ actual, anterior, bueno, sufijo = '' }: { actual: number | null; anterior: number | null; bueno: boolean | null; sufijo?: string }) {
  if (actual == null || anterior == null) return <span className="text-xs text-tinta-500">Sin periodo anterior para comparar</span>;
  if (anterior === 0) return <span className="text-xs text-tinta-500">{actual ? 'Sin actividad en el periodo anterior' : 'Igual que el periodo anterior'}</span>;
  const cambio = ((actual - anterior) / anterior) * 100;
  const igual = Math.abs(cambio) < 0.5;
  const sube = cambio > 0;
  const tono = igual || bueno === null ? 'text-tinta-600' : sube === bueno ? 'text-[#006300]' : 'text-[#b42318]';
  const Icono = igual ? ArrowRight : sube ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cls('inline-flex flex-wrap items-center gap-x-1 text-xs font-semibold', tono)}>
      <span className="inline-flex items-center gap-1 whitespace-nowrap"><Icono className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {igual ? 'Sin cambio' : `${sube ? '+' : '−'}${Math.abs(Math.round(cambio))} %`}{sufijo}</span>
      <span className="whitespace-nowrap font-normal text-tinta-500">vs periodo anterior</span>
    </span>
  );
}

function Cifra({ etiqueta, valor, delta, detalle }: { etiqueta: string; valor: string; delta?: React.ReactNode; detalle?: React.ReactNode }) {
  return (
    <div className="vidrio rounded-2xl bg-white p-4">
      <p className="text-xs font-semibold text-tinta-600">{etiqueta}</p>
      <p className="mt-1 font-display text-[28px] font-extrabold leading-none text-tinta-900">{valor}</p>
      {delta && <div className="mt-2">{delta}</div>}
      {detalle && <p className="mt-1 text-[11px] text-tinta-500">{detalle}</p>}
    </div>
  );
}

/** Ventana flotante compartida por las gráficas (sigue al puntero; con teclado se ancla al elemento). */
type Info = { x: number; y: number; titulo: string; filas: [string, string][] } | null;
function Flotante({ info }: { info: Info }) {
  if (!info) return null;
  return (
    <div role="tooltip" className="pointer-events-none fixed z-50 min-w-[170px] -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-xl bg-white px-3 py-2 text-xs shadow-[0_12px_32px_rgba(15,34,56,.18)] ring-1 ring-tinta-100"
      style={{ left: info.x, top: info.y }}>
      <p className="mb-1 font-semibold text-tinta-500">{info.titulo}</p>
      {info.filas.map(([k, v]) => <p key={k} className="flex justify-between gap-4"><span className="text-tinta-500">{k}</span><span className="font-bold text-tinta-900">{v}</span></p>)}
    </div>
  );
}
const anclar = (e: React.FocusEvent<HTMLElement> | React.PointerEvent<HTMLElement>) => {
  if ('clientX' in e && e.clientX) return { x: e.clientX, y: e.clientY };
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top };
};

function BotonTabla({ abierta, onClick }: { abierta: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={abierta}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-tinta-600 ring-1 ring-tinta-200 hover:bg-white">
      <Table2 className="h-3.5 w-3.5" aria-hidden />{abierta ? 'Ver gráfica' : 'Ver tabla'}</button>
  );
}

/** Columnas de 12 semanas: semana actual en el tono pleno, las anteriores en el tono suave. */
function RitmoSemanal({ semanas }: { semanas: TableroDatos['semanas'] }) {
  const [info, setInfo] = useState<Info>(null);
  const [tabla, setTabla] = useState(false);
  const max = Math.max(1, ...semanas.map((s) => s.enviadas));
  const paso = max <= 5 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : Math.ceil(max / 5 / 10) * 10;
  const tope = Math.ceil(max / paso) * paso;
  const marcas = Array.from({ length: tope / paso + 1 }, (_, i) => i * paso);
  const etiqueta = (s: TableroDatos['semanas'][0]) => (s.actual ? 'Esta semana' : `Sem. ${fmtFechaCorta.format(new Date(`${s.inicio}T12:00:00`))}`);
  return (
    <Tarjeta titulo="Solicitudes enviadas por semana" sub="Últimas 12 semanas; la semana en curso aparece resaltada" accion={<BotonTabla abierta={tabla} onClick={() => setTabla(!tabla)} />}>
      {tabla ? (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-tinta-500"><th className="py-1.5 font-semibold">Semana</th><th className="py-1.5 text-right font-semibold">Enviadas</th><th className="py-1.5 text-right font-semibold">Aprobadas</th></tr></thead>
          <tbody className="divide-y divide-tinta-100 tabular-nums">{semanas.map((s) => <tr key={s.inicio}><td className="py-1.5">{etiqueta(s)}</td><td className="py-1.5 text-right">{s.enviadas}</td><td className="py-1.5 text-right">{s.aprobadas}</td></tr>)}</tbody>
        </table>
      ) : (
        <div className="relative pl-8">
          <div className="relative h-52">
            {marcas.map((m) => (
              <div key={m} className="absolute inset-x-0 flex items-center" style={{ bottom: `${(m / tope) * 100}%` }} aria-hidden>
                <span className="absolute -left-8 w-6 -translate-y-1/2 text-right text-[10px] tabular-nums text-[#898781]">{m}</span>
                <span className={cls('h-px w-full', m === 0 ? 'bg-[#c3c2b7]' : 'bg-[#e1e0d9]')} />
              </div>
            ))}
            <ol className="absolute inset-0 flex items-end justify-between gap-[2px]">
              {semanas.map((s) => {
                const alto = (s.enviadas / tope) * 100;
                const datos = { titulo: etiqueta(s), filas: [['Enviadas', fmtNum.format(s.enviadas)], ['Aprobadas', fmtNum.format(s.aprobadas)]] as [string, string][] };
                return (
                  <li key={s.inicio} className="group relative flex h-full flex-1 items-end justify-center">
                    <button type="button" className="absolute inset-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2a78d6]"
                      aria-label={`${datos.titulo}: ${s.enviadas} enviadas, ${s.aprobadas} aprobadas`}
                      onPointerMove={(e) => setInfo({ ...anclar(e), ...datos })} onPointerLeave={() => setInfo(null)}
                      onFocus={(e) => setInfo({ ...anclar(e), ...datos })} onBlur={() => setInfo(null)} />
                    <span className="pointer-events-none w-full max-w-[24px] origin-bottom animate-crecer rounded-t-[4px] transition group-hover:brightness-110"
                      style={{ height: `${Math.max(alto, s.enviadas ? 2 : 0)}%`, background: s.actual ? SERIE : SERIE_SUAVE, transform: 'scaleY(1)' }} />
                    {s.actual && s.enviadas > 0 && <span className="pointer-events-none absolute text-[11px] font-bold text-tinta-900" style={{ bottom: `calc(${alto}% + 4px)` }}>{s.enviadas}</span>}
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-[#898781]" aria-hidden>
            <span>{etiqueta(semanas[0])}</span><span>{etiqueta(semanas[Math.floor(semanas.length / 2)])}</span><span className="font-semibold text-tinta-700">Esta semana</span>
          </div>
          <Flotante info={info} />
        </div>
      )}
    </Tarjeta>
  );
}

// Mapa en mosaico: cada estado es un cuadro en su posición geográfica aproximada (columna, fila).
const MOSAICO: Record<string, [string, number, number]> = {
  'Baja California': ['BC', 0, 0], Sonora: ['SON', 1, 0], Chihuahua: ['CHH', 2, 0], Coahuila: ['COA', 3, 0], 'Nuevo León': ['NL', 4, 0],
  'Baja California Sur': ['BCS', 0, 1], Sinaloa: ['SIN', 1, 1], Durango: ['DGO', 2, 1], Zacatecas: ['ZAC', 3, 1], 'San Luis Potosí': ['SLP', 4, 1], Tamaulipas: ['TAM', 5, 1],
  Nayarit: ['NAY', 1, 2], Aguascalientes: ['AGS', 2, 2], Guanajuato: ['GTO', 3, 2], Querétaro: ['QRO', 4, 2], Hidalgo: ['HGO', 5, 2], Veracruz: ['VER', 6, 2], Yucatán: ['YUC', 9, 2],
  Jalisco: ['JAL', 1, 3], Michoacán: ['MIC', 2, 3], 'Estado de México': ['MEX', 3, 3], 'Ciudad de México': ['CDMX', 4, 3], Tlaxcala: ['TLX', 5, 3], Puebla: ['PUE', 6, 3], Tabasco: ['TAB', 7, 3], Campeche: ['CAM', 8, 3], 'Quintana Roo': ['QROO', 9, 3],
  Colima: ['COL', 1, 4], Guerrero: ['GRO', 3, 4], Morelos: ['MOR', 4, 4], Oaxaca: ['OAX', 6, 4], Chiapas: ['CHIS', 7, 4],
  Guatemala: ['GT', 7, 6], 'San Salvador': ['SV', 8, 6], Managua: ['NI', 9, 6],
};

function MapaEstados({ estados }: { estados: TableroDatos['estados'] }) {
  const [info, setInfo] = useState<Info>(null);
  const [tabla, setTabla] = useState(false);
  const porNombre = new Map(estados.map((e) => [e.estado, e]));
  const max = Math.max(1, ...estados.map((e) => e.solicitudes));
  const nivel = (n: number) => (n <= 0 ? -1 : Math.min(ESCALA.length - 1, Math.floor((n / max) * ESCALA.length - 1e-9)));
  const limites = ESCALA.map((_, i) => Math.ceil((max * (i + 1)) / ESCALA.length));
  const sinUbicar = estados.filter((e) => !MOSAICO[e.estado]);
  return (
    <Tarjeta titulo="Actividad por estado" sub="Solicitudes enviadas en el periodo; el número rojo indica solicitudes por revisar"
      accion={<BotonTabla abierta={tabla} onClick={() => setTabla(!tabla)} />}>
      {tabla ? (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-tinta-500"><th className="py-1.5 font-semibold">Estado</th><th className="py-1.5 text-right font-semibold">Sucursales</th>
            <th className="py-1.5 text-right font-semibold">Solicitudes</th><th className="py-1.5 text-right font-semibold">Por revisar</th></tr></thead>
          <tbody className="divide-y divide-tinta-100 tabular-nums">
            {[...estados].sort((a, b) => b.solicitudes - a.solicitudes).map((e) => (
              <tr key={e.estado}><td className="py-1.5">{e.estado}</td><td className="py-1.5 text-right">{e.sucursales}</td><td className="py-1.5 text-right">{e.solicitudes}</td><td className="py-1.5 text-right">{e.por_revisar}</td></tr>))}
          </tbody>
        </table>
      ) : (
        <>
          <div className="relative mx-auto grid max-w-[620px] gap-1.5" style={{ gridTemplateColumns: 'repeat(10, minmax(0, 1fr))' }}>
            {Object.entries(MOSAICO).map(([nombre, [abrev, col, fila]]) => {
              const e = porNombre.get(nombre);
              const n = e?.solicitudes ?? 0;
              const k = nivel(n);
              const datos = { titulo: nombre, filas: [['Solicitudes', fmtNum.format(n)], ['Sucursales', fmtNum.format(e?.sucursales ?? 0)], ['Por revisar', fmtNum.format(e?.por_revisar ?? 0)], ['Prendas', fmtNum.format(e?.unidades ?? 0)]] as [string, string][] };
              return (
                <button key={nombre} type="button" style={{ gridColumn: col + 1, gridRow: fila + 1, background: !e ? 'transparent' : k < 0 ? '#f1f3f5' : ESCALA[k], color: k < 0 ? '#5f7799' : TEXTO_SOBRE[k] }}
                  className={cls('relative grid aspect-square place-items-center rounded-[6px] text-[10px] font-bold transition hover:scale-[1.06] hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2a78d6] sm:text-xs',
                    !e && 'border border-dashed border-tinta-200 text-tinta-300')}
                  aria-label={`${nombre}: ${n} solicitudes, ${e?.sucursales ?? 0} sucursales, ${e?.por_revisar ?? 0} por revisar`}
                  onPointerMove={(ev) => setInfo({ ...anclar(ev), ...datos })} onPointerLeave={() => setInfo(null)}
                  onFocus={(ev) => setInfo({ ...anclar(ev), ...datos })} onBlur={() => setInfo(null)}>
                  {abrev}
                  {!!e?.por_revisar && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#d03b3b] px-1 text-[9px] text-white ring-2 ring-white" aria-hidden>{e.por_revisar}</span>}
                </button>
              );
            })}
            <span className="pointer-events-none text-[10px] font-semibold text-tinta-500" style={{ gridColumn: '7 / span 4', gridRow: 6, alignSelf: 'end' }}>Centroamérica</span>
          </div>
          {sinUbicar.length > 0 && <p className="mt-2 text-center text-[11px] text-tinta-500">Sin ubicar en el mapa: {sinUbicar.map((e) => `${e.estado} (${e.solicitudes})`).join(', ')}</p>}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-[11px] text-tinta-600" aria-hidden>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] bg-[#f1f3f5] ring-1 ring-tinta-200" />Sin solicitudes</span>
            <span className="flex items-center gap-1">
              {ESCALA.map((c) => <span key={c} className="h-3 w-6 rounded-[3px]" style={{ background: c }} />)}
            </span>
            <span>1 a {fmtNum.format(limites[limites.length - 1])} solicitudes</span>
            <span className="flex items-center gap-1.5"><span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#d03b3b] px-1 text-[9px] font-bold text-white">n</span>Por revisar</span>
          </div>
          <Flotante info={info} />
        </>
      )}
    </Tarjeta>
  );
}

function Ranking({ zonas, divisiones }: { zonas: TableroDatos['zonas']; divisiones: TableroDatos['divisiones'] }) {
  const [vista, setVista] = useState<'zonas' | 'divisiones'>('zonas');
  const [todas, setTodas] = useState(false);
  const lista = vista === 'zonas' ? zonas : divisiones;
  const visibles = todas ? lista : lista.slice(0, 8);
  const max = Math.max(1, ...lista.map((x) => x.solicitudes));
  return (
    <Tarjeta titulo="Ranking por actividad" sub="Solicitudes enviadas en el periodo y su cambio contra el periodo anterior"
      accion={(
        <div className="flex gap-1 rounded-full bg-tinta-50 p-1" role="group" aria-label="Agrupar por">
          {(['zonas', 'divisiones'] as const).map((v) => (
            <button key={v} type="button" onClick={() => { setVista(v); setTodas(false); }} aria-pressed={vista === v}
              className={cls('min-h-8 rounded-full px-3 text-xs font-semibold capitalize transition', vista === v ? 'bg-white text-tinta-900 shadow-sm' : 'text-tinta-500 hover:text-tinta-800')}>{v}</button>
          ))}
        </div>
      )}>
      {!lista.length ? <p className="py-6 text-center text-sm text-tinta-500">Sin datos en el periodo.</p> : (
        <ol className="space-y-2.5">
          {visibles.map((x, i) => {
            const cambio = x.solicitudes - x.anterior;
            const Icono = cambio > 0 ? ArrowUpRight : cambio < 0 ? ArrowDownRight : ArrowRight;
            return (
              <li key={x.id} className="grid grid-cols-[1.5rem_minmax(0,11rem)_1fr_auto] items-center gap-3 text-sm">
                <span className="text-right text-xs font-bold tabular-nums text-tinta-400">{i + 1}</span>
                <span className="truncate font-semibold text-tinta-800" title={x.nombre}>{x.nombre}</span>
                <span className="flex items-center gap-2">
                  <span className="h-[14px] origin-left animate-crecer rounded-r-[4px]" style={{ width: `${(x.solicitudes / max) * 100}%`, minWidth: x.solicitudes ? 4 : 0, background: SERIE }} aria-hidden />
                  <span className="text-xs font-bold tabular-nums text-tinta-900">{x.solicitudes}</span>
                </span>
                <span className={cls('inline-flex min-w-[64px] items-center justify-end gap-0.5 text-xs font-semibold tabular-nums', cambio > 0 ? 'text-[#006300]' : cambio < 0 ? 'text-[#b42318]' : 'text-tinta-500')}
                  aria-label={`${cambio > 0 ? 'Subió' : cambio < 0 ? 'Bajó' : 'Sin cambio'} ${Math.abs(cambio)} contra el periodo anterior`}>
                  <Icono className="h-3.5 w-3.5" aria-hidden />{cambio > 0 ? `+${cambio}` : cambio < 0 ? `−${-cambio}` : '0'}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {lista.length > 8 && (
        <button type="button" onClick={() => setTodas(!todas)} className="mt-3 text-xs font-semibold text-menta-700 hover:underline">
          {todas ? 'Ver menos' : `Ver las ${lista.length} ${vista}`}</button>
      )}
    </Tarjeta>
  );
}

export default function Tablero() {
  const [dias, setDias] = useState(30);
  const q = useQuery({ queryKey: ['tablero-aprobador', dias], queryFn: () => get<TableroDatos>(`/admin/reportes/aprobador?dias=${dias}`),
    placeholderData: keepPreviousData, refetchInterval: 120_000 });
  const t = q.data;
  const recargando = q.isFetching && q.isPlaceholderData;
  const rango = useMemo(() => (t ? `${fmtFechaCorta.format(new Date(t.periodo.desde))} – ${fmtFechaCorta.format(new Date(t.periodo.hasta))}` : ''), [t]);
  return (
    <section aria-labelledby="t-tablero" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="t-tablero" className="flex items-center gap-3 font-display text-base font-bold"><span className="h-5 w-1.5 rounded-full bg-[#0e7490]" aria-hidden />Tablero ejecutivo
          {rango && <span className="text-xs font-normal text-tinta-500">{rango}</span>}</h2>
        <div className="flex gap-1 rounded-full border border-white/80 bg-white/60 p-1 backdrop-blur-md" role="group" aria-label="Periodo">
          {PERIODOS.map(([d, n]) => (
            <button key={d} type="button" onClick={() => setDias(d)} aria-pressed={dias === d}
              className={cls('min-h-9 rounded-full px-3.5 text-xs font-semibold transition', dias === d ? 'bg-[#0b4f6c] text-white shadow' : 'text-tinta-600 hover:bg-white')}>{n}</button>
          ))}
        </div>
      </div>
      {!t ? <EsqueletoLista filas={4} /> : (
        <div className={cls('space-y-4 transition-opacity', recargando && 'opacity-60')}>
          <div className="grid gap-4 lg:grid-cols-[1.25fr_2fr]">
            {/* Cifra principal: la única de tamaño héroe */}
            <div className="vidrio relative overflow-hidden rounded-2xl bg-white p-5">
              <span className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[#5ec8d822]" aria-hidden />
              <p className="flex items-center gap-1.5 text-xs font-semibold text-tinta-600"><Clock3 className="h-4 w-4 text-[#0e7490]" aria-hidden />Tiempo promedio de aprobación</p>
              <p className="mt-2 font-display text-[54px] font-extrabold leading-none tracking-tight text-tinta-900">{horasLegibles(t.tiempo_aprobacion.promedio_h)}</p>
              <div className="mt-3"><Delta actual={t.tiempo_aprobacion.promedio_h} anterior={t.tiempo_aprobacion.anterior_promedio_h} bueno={false} /></div>
              <p className="mt-2 text-xs text-tinta-500">Desde que la sucursal envía hasta que se aprueba · mediana {horasLegibles(t.tiempo_aprobacion.mediana_h)} · {fmtNum.format(t.tiempo_aprobacion.aprobadas)} aprobada(s)</p>
            </div>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <Cifra etiqueta="Solicitudes enviadas" valor={fmtNum.format(t.enviadas.actual)} delta={<Delta actual={t.enviadas.actual} anterior={t.enviadas.anterior} bueno={null} />}
                detalle={`${fmtNum.format(t.unidades.actual)} prendas`} />
              <Cifra etiqueta="Tasa de aprobación" valor={t.tasa_aprobacion.actual == null ? '—' : `${t.tasa_aprobacion.actual.toLocaleString('es-MX')} %`}
                delta={<Delta actual={t.tasa_aprobacion.actual} anterior={t.tasa_aprobacion.anterior} bueno={null} />} detalle="Aprobadas sobre decididas" />
              <Cifra etiqueta="Sucursales activas" valor={fmtNum.format(t.sucursales_activas.actual)}
                delta={<Delta actual={t.sucursales_activas.actual} anterior={t.sucursales_activas.anterior} bueno={null} />}
                detalle={`de ${fmtNum.format(t.sucursales_activas.total)} sucursales`} />
              <Cifra etiqueta="Por revisar ahora" valor={fmtNum.format(t.por_revisar.total)}
                detalle={t.por_revisar.mas_antigua_h != null ? `La más antigua espera ${horasLegibles(t.por_revisar.mas_antigua_h)}` : 'Nada pendiente'} />
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <RitmoSemanal semanas={t.semanas} />
            <MapaEstados estados={t.estados} />
          </div>
          <Ranking zonas={t.zonas} divisiones={t.divisiones} />
        </div>
      )}
    </section>
  );
}
