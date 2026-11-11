/** Panel del aprobador: indicadores del flujo de solicitudes de las sucursales (sin montos). */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ClipboardCheck, Inbox, PackageCheck, Star, Store, Truck, Users } from 'lucide-react';
import { ReactNode } from 'react';
import { get } from '../../api/cliente';
import { useAuth } from '../../app/auth';
import { ErrorCaja, Tarjeta } from '../../components/ui';
import { Aparecer, Contador, EsqueletoLista } from '../../components/movimiento';
import { cls, fecha } from '../../lib/formato';
import Dashboard from './Dashboard';
import { Encabezado } from './AdminLayout';

type Panel = {
  sucursales: { activas: number; inactivas: number; con_solicitudes_en_curso: number };
  solicitudes: { total: number; este_mes: number; por_etapa: Record<string, number> };
  unidades: { solicitadas: number; entregadas: number };
  paquetes_en_camino: number;
  entregas: { registradas: number; pendientes: number; conformidades_pendientes: number; valoracion_promedio: number | null };
  incidencias_abiertas: number;
  top_sucursales: { nombre: string; solicitudes: number; unidades: number }[];
  top_productos: { nombre: string; unidades: number }[];
  serie: { dia: string; solicitudes: number }[];
};

const ETAPAS: [string, string, string, string][] = [
  ['por_revisar', 'Por revisar', 'bg-amber-400', 'en_revision'], ['en_correccion', 'En corrección', 'bg-coral-500', 'devuelto'],
  ['en_surtido', 'En surtido', 'bg-sky-500', 'confirmado,en_preparacion'], ['en_camino', 'En camino', 'bg-violet-500', 'parcialmente_enviado,enviado'],
  ['en_entrega', 'En recepción y entrega', 'bg-menta-500', 'parcialmente_entregado,entregado'], ['cerradas', 'Cerradas', 'bg-tinta-400', 'cerrado'],
  ['rechazadas_canceladas', 'Rechazadas o canceladas', 'bg-tinta-200', 'rechazado,cancelado'],
];

function Kpi({ titulo, valor, detalle, icono, orden, enlace, alerta }: { titulo: string; valor: number; detalle?: ReactNode; icono: ReactNode; orden: number; enlace?: string; alerta?: boolean }) {
  const cuerpo = (
    <div className={cls('h-full rounded-2xl bg-white p-4 shadow-suave ring-1 transition', enlace && 'hover:-translate-y-0.5 hover:shadow-lg', alerta && valor > 0 ? 'ring-amber-300' : 'ring-tinta-100')}>
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-tinta-400">
        <span>{titulo}</span><span className={cls('grid h-8 w-8 place-items-center rounded-xl', alerta && valor > 0 ? 'bg-amber-100 text-amber-700' : 'bg-menta-50 text-menta-700')}>{icono}</span>
      </div>
      <p className="mt-2 font-display text-3xl font-extrabold text-tinta-900"><Contador valor={valor} /></p>
      {detalle && <p className="mt-1 text-xs text-tinta-400">{detalle}</p>}
    </div>
  );
  return <Aparecer orden={orden}>{enlace ? <Link to={enlace} className="block h-full">{cuerpo}</Link> : cuerpo}</Aparecer>;
}

export default function PanelSolicitudes() {
  const q = useQuery({ queryKey: ['panel-solicitudes'], queryFn: () => get<Panel>('/admin/reportes/solicitudes'), refetchInterval: 60_000 });
  const k = q.data;
  const maxSerie = Math.max(1, ...(k?.serie.map((s) => s.solicitudes) || [1]));
  const totalEtapas = k ? Object.values(k.solicitudes.por_etapa).reduce((a, b) => a + b, 0) : 0;
  return (
    <>
      <Encabezado titulo="Panel de solicitudes" sub="Sucursales, solicitudes y entregas en tiempo real" />
      <ErrorCaja error={q.error} />
      {q.isLoading || !k ? <EsqueletoLista filas={4} /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi orden={0} titulo="Sucursales activas" valor={k.sucursales.activas} icono={<Store className="h-4 w-4" />} enlace="/admin/sucursales-cliente"
              detalle={`${k.sucursales.con_solicitudes_en_curso} con solicitudes en curso · ${k.sucursales.inactivas} inactiva(s)`} />
            <Kpi orden={1} titulo="Total de solicitudes" valor={k.solicitudes.total} icono={<Inbox className="h-4 w-4" />} enlace="/admin/solicitudes?estado="
              detalle={`${k.solicitudes.este_mes} este mes`} />
            <Kpi orden={2} titulo="Por revisar" valor={k.solicitudes.por_etapa.por_revisar} alerta icono={<ClipboardCheck className="h-4 w-4" />} enlace="/admin/solicitudes?estado=en_revision"
              detalle="Esperan aprobación" />
            <Kpi orden={3} titulo="Paquetes en camino" valor={k.paquetes_en_camino} icono={<Truck className="h-4 w-4" />} enlace="/admin/solicitudes?estado=parcialmente_enviado,enviado" />
            <Kpi orden={4} titulo="Prendas solicitadas" valor={k.unidades.solicitadas} icono={<PackageCheck className="h-4 w-4" />}
              detalle={`${k.unidades.entregadas} entregadas en sucursal`} />
            <Kpi orden={5} titulo="Entregas a empleados" valor={k.entregas.registradas} icono={<Users className="h-4 w-4" />}
              detalle={`${k.entregas.pendientes} pendientes · ${k.entregas.conformidades_pendientes} sin conformidad`} />
            <Kpi orden={6} titulo="Satisfacción promedio" valor={k.entregas.valoracion_promedio ? Math.round(k.entregas.valoracion_promedio * 10) / 10 : 0} icono={<Star className="h-4 w-4" />}
              detalle={k.entregas.valoracion_promedio ? `${k.entregas.valoracion_promedio} de 5 estrellas` : 'Sin conformidades aún'} />
            <Kpi orden={7} titulo="Incidencias abiertas" valor={k.incidencias_abiertas} alerta icono={<AlertTriangle className="h-4 w-4" />} enlace="/admin/incidencias" />
          </div>

          <Tarjeta titulo="Solicitudes por etapa" sub="Cada etapa lleva su propio estado: revisión, surtido, envío y entrega">
            <div className="flex h-4 overflow-hidden rounded-full bg-arena-200" aria-hidden>
              {ETAPAS.map(([clave, , color]) => k.solicitudes.por_etapa[clave] > 0 && (
                <div key={clave} className={cls('h-full origin-left animate-crecer', color)} style={{ width: `${(k.solicitudes.por_etapa[clave] / Math.max(1, totalEtapas)) * 100}%` }} />
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {ETAPAS.map(([clave, nombre, color, estados], i) => (
                <Aparecer key={clave} orden={i}>
                  <Link to={`/admin/solicitudes?estado=${estados}`} className="block rounded-xl p-2 transition hover:bg-arena-50">
                    <span className="flex items-center gap-2 text-xs text-tinta-500"><span className={cls('h-2.5 w-2.5 rounded-full', color)} />{nombre}</span>
                    <span className="font-display text-xl font-extrabold"><Contador valor={k.solicitudes.por_etapa[clave]} /></span>
                  </Link>
                </Aparecer>
              ))}
            </div>
          </Tarjeta>

          <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
            <Tarjeta titulo="Solicitudes recibidas" sub="Últimos 30 días">
              <div className="flex h-44 items-end gap-1 border-b border-tinta-100" role="img" aria-label="Solicitudes por día">
                {k.serie.map((s, i) => (
                  <div key={s.dia} className="group relative flex-1">
                    <div className="origin-bottom animate-crecer rounded-t bg-menta-500/80 transition group-hover:bg-menta-600"
                      style={{ height: `${Math.max(s.solicitudes ? 6 : 1, (s.solicitudes / maxSerie) * 160)}px`, animationDelay: `${i * 15}ms`, transform: 'scaleY(1)' }} />
                    <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-tinta-900 px-1.5 py-0.5 text-[10px] text-white group-hover:block">
                      {fecha(s.dia)}: {s.solicitudes}</span>
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-tinta-400"><span>{fecha(k.serie[0]?.dia)}</span><span>Hoy</span></div>
            </Tarjeta>
            <Tarjeta titulo="Sucursales con más solicitudes">
              {!k.top_sucursales.length ? <p className="text-sm text-tinta-400">Aún no hay solicitudes.</p> : (
                <ul className="space-y-3">
                  {k.top_sucursales.map((s, i) => (
                    <Aparecer como="li" orden={i} key={s.nombre}>
                      <div className="flex justify-between text-sm"><span className="font-semibold">{s.nombre}</span><span className="text-tinta-500">{s.solicitudes} solicitud(es) · {s.unidades} prendas</span></div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-arena-200"><div className="h-full origin-left animate-crecer rounded-full bg-tinta-700" style={{ width: `${(s.solicitudes / k.top_sucursales[0].solicitudes) * 100}%` }} /></div>
                    </Aparecer>
                  ))}
                </ul>
              )}
            </Tarjeta>
          </div>

          <Tarjeta titulo="Prendas más solicitadas">
            {!k.top_productos.length ? <p className="text-sm text-tinta-400">Aún no hay solicitudes.</p> : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {k.top_productos.map((p, i) => (
                  <Aparecer key={p.nombre} orden={i}>
                    <div className="flex items-center justify-between rounded-xl p-3 ring-1 ring-arena-200">
                      <span className="text-sm font-semibold">{i + 1}. {p.nombre}</span><span className="font-display text-lg font-extrabold text-menta-700">{p.unidades}</span>
                    </div>
                  </Aparecer>
                ))}
              </div>
            )}
          </Tarjeta>
        </div>
      )}
    </>
  );
}

/** Inicio del panel: quien ve reportes generales entra al tablero completo; el aprobador, al panel de solicitudes. */
export function InicioAdmin() {
  const { puede } = useAuth();
  return puede('reporte.ver') ? <Dashboard /> : <PanelSolicitudes />;
}
