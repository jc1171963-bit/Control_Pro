/**
 * Inicio del portal de sucursales. Todo sale de los endpoints existentes (/cuenta/resumen, /cuenta/pedidos,
 * /cuenta/notificaciones); no hay cifras inventadas ni importes (la experiencia corporativa no muestra precios).
 */
import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bell, CheckCircle2, ClipboardList, FilePlus2, PackageCheck, Save, Shirt, ShieldAlert, Undo2, Users } from 'lucide-react';
import { get } from '../../api/cliente';
import type { Notificacion, Pagina, PedidoResumen, ResumenSucursal } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { useBorradores } from '../../app/borradores';
import { Boton, Cifra, ErrorCaja, Estado, Tarjeta, Vacio } from '../../components/ui';
import { EsqueletoLista } from '../../components/movimiento';
import { cls, fecha, fechaHora } from '../../lib/formato';
import ContactoZona from './ContactoZona';
import { RUTA_CATALOGO_PORTAL } from './rutas';

const fechaLarga = () => new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
const verde = 'bg-menta-50 text-menta-700';
const ambar = 'bg-amber-100 text-amber-700';

function ConEnlace({ a, children }: { a?: string; children: React.ReactNode }) {
  return a ? <Link to={a} className="block rounded-2xl transition hover:-translate-y-0.5 hover:shadow-lg">{children}</Link> : <>{children}</>;
}

function Acceso({ a, icono, titulo, texto }: { a: string; icono: React.ReactNode; titulo: string; texto: string }) {
  return (
    <Link to={a} className="group flex h-full items-start gap-3 rounded-2xl bg-white p-4 shadow-suave ring-1 ring-tinta-100 transition hover:-translate-y-0.5 hover:ring-menta-400">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-menta-50 text-menta-700 transition group-hover:bg-menta-500 group-hover:text-white" aria-hidden>{icono}</span>
      <span className="min-w-0"><span className="block font-display font-bold text-tinta-900">{titulo}</span><span className="block text-xs text-tinta-500">{texto}</span></span>
    </Link>
  );
}

/** Patrón institucional: cruces sutiles (SVG en CSS), decorativo. */
const CRUCES = "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28'%3E%3Cpath d='M13 9h2v4h4v2h-4v4h-2v-4H9v-2h4z' fill='%23ffffff' fill-opacity='.09'/%3E%3C/svg%3E\")]";

type Tramo = { clave: string; etiqueta: string; valor: number; color: string; a?: string };

/** Distribución real de las solicitudes de la sucursal (datos de /cuenta/resumen). Color y texto: nunca solo color. */
function Distribucion({ s }: { s: ResumenSucursal['solicitudes'] }) {
  const tramos: Tramo[] = [
    { clave: 'b', etiqueta: 'Borrador', valor: s.borradores, color: 'bg-tinta-300', a: '/cuenta/pedidos?estado=borrador' },
    { clave: 'r', etiqueta: 'En revisión', valor: s.en_revision, color: 'bg-sky-500', a: '/cuenta/pedidos?estado=en_revision' },
    { clave: 'c', etiqueta: 'Por corregir', valor: s.por_corregir, color: 'bg-amber-500', a: '/cuenta/pedidos?estado=devuelto' },
    { clave: 'p', etiqueta: 'En proceso', valor: s.en_proceso, color: 'bg-menta-400' },
    { clave: 'e', etiqueta: 'Entregadas', valor: s.entregadas, color: 'bg-menta-800' },
    { clave: 'x', etiqueta: 'Rechazadas', valor: s.rechazadas, color: 'bg-coral-500' },
  ];
  const total = tramos.reduce((a, t) => a + t.valor, 0);
  return (
    <section aria-labelledby="t-distribucion" className="rounded-2xl bg-white p-5 shadow-suave ring-1 ring-tinta-100 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="t-distribucion" className="font-display text-base font-bold text-tinta-900">Distribución de solicitudes</h2>
        <p className="text-sm text-tinta-500"><span className="font-display text-2xl font-extrabold text-tinta-900">{total}</span> en total</p>
      </div>
      {total === 0 ? <p className="mt-4 text-sm text-tinta-500">Aún no hay solicitudes para mostrar.</p> : (
        <>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-tinta-50" aria-hidden>
            {tramos.filter((t) => t.valor > 0).map((t) => <span key={t.clave} className={cls('h-full origin-left animate-crecer border-r-2 border-white last:border-r-0', t.color)} style={{ width: `${(t.valor / total) * 100}%` }} />)}
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            {tramos.map((t) => {
              const contenido = <><span className={cls('h-2.5 w-2.5 shrink-0 rounded-full', t.color)} aria-hidden /><span className="truncate text-tinta-600">{t.etiqueta}</span><span className="ml-auto font-semibold text-tinta-900">{t.valor}</span></>;
              return (
                <li key={t.clave}>
                  {t.a && t.valor > 0 ? <Link to={t.a} className="flex min-h-9 items-center gap-2 rounded-lg px-1 hover:bg-sd-50">{contenido}</Link> : <span className="flex min-h-9 items-center gap-2 px-1">{contenido}</span>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

/** Lo que espera una acción de la sucursal; en ámbar si hay algo pendiente. */
function Pendientes({ r }: { r: ResumenSucursal }) {
  const filas: [string, number, React.ReactNode, string][] = [
    ['Paquetes por recibir', r.paquetes_por_recibir, <PackageCheck className="h-4 w-4" />, '/cuenta/pedidos'],
    ['Entregas pendientes', r.entregas_pendientes, <Users className="h-4 w-4" />, '/cuenta/pedidos'],
    ['Conformidades pendientes', r.conformidades_pendientes, <CheckCircle2 className="h-4 w-4" />, '/cuenta/pedidos'],
    ['Incidencias abiertas', r.incidencias_abiertas, <ShieldAlert className="h-4 w-4" />, '/cuenta/pedidos'],
    ['Empleados activos', r.empleados_activos, <Users className="h-4 w-4" />, '/cuenta/empleados'],
  ];
  return (
    <section aria-labelledby="t-operacion" className="rounded-2xl bg-white p-5 shadow-suave ring-1 ring-tinta-100 sm:p-6">
      <h2 id="t-operacion" className="font-display text-base font-bold text-tinta-900">Operación</h2>
      <p className="text-xs text-tinta-500">Lo que espera una acción de tu sucursal</p>
      {/* B-1: cuando /cuenta/pedidos acepte listas de estados, estos enlaces podrán llevar el filtro correspondiente. */}
      <ul className="mt-3 divide-y divide-tinta-100">
        {filas.map(([t, n, icono, a], i) => {
          const alerta = i < 4 && n > 0;
          return (
            <li key={t}>
              <Link to={a} className="flex min-h-12 items-center gap-3 rounded-lg px-1 hover:bg-sd-50">
                <span className={cls('grid h-8 w-8 shrink-0 place-items-center rounded-lg', alerta ? ambar : verde)} aria-hidden>{icono}</span>
                <span className="flex-1 text-sm font-semibold text-tinta-800">{t}</span>
                <span className={cls('rounded-full px-2.5 py-0.5 font-display text-sm font-extrabold', alerta ? 'bg-amber-100 text-amber-800' : 'text-tinta-900')}>{n}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function InicioEmpresa() {
  const { cliente } = useAuth();
  const resumen = useQuery({ queryKey: ['resumen-sucursal'], queryFn: () => get<ResumenSucursal>('/cuenta/resumen') });
  const borradores = useBorradores();
  const recientes = useQuery({ queryKey: ['solicitudes-recientes'], queryFn: () => get<Pagina<PedidoResumen>>('/cuenta/pedidos?canal=corporativo&por_pagina=5') });
  const avisos = useQuery({ queryKey: ['notif-cliente', 'recientes'], queryFn: () => get<Pagina<Notificacion> & { no_leidas: number }>('/cuenta/notificaciones?por_pagina=5') });
  const r = resumen.data;
  const s = r?.solicitudes;
  const nombre = (cliente?.nombre ?? '').trim().split(/\s+/)[0];

  return (
    <div className="space-y-6">
      <section className="relative grid overflow-hidden rounded-3xl bg-sd-900 text-white shadow-suave lg:grid-cols-[1.5fr_1fr]">
        <div className={cls('absolute inset-0', CRUCES)} aria-hidden />
        <div className="relative p-6 sm:p-8 lg:p-10">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/85 ring-1 ring-white/15">
            <span className="h-1.5 w-1.5 rounded-full bg-menta-300" aria-hidden />Portal empresarial · {fechaLarga()}
          </p>
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Hola, {nombre}</h1>
          <p className="mt-2 max-w-xl text-white/85">{cliente?.razon_social ? `${cliente.razon_social}. ` : ''}Consulta el estado de tus solicitudes y continúa donde te quedaste.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/cuenta/solicitudes/nueva" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-sd-900 shadow-lg transition hover:bg-menta-50"><FilePlus2 className="h-4 w-4" aria-hidden />Crear solicitud</Link>
            <Link to={RUTA_CATALOGO_PORTAL} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-5 text-sm font-semibold ring-1 ring-white/30 transition hover:bg-white/20">Consultar catálogo</Link>
          </div>
        </div>
        <div className="relative hidden min-h-full lg:block" aria-hidden>
          <img src="/assets/escenas/pasillo-clinico.webp" alt="" width={1400} height={900} className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute inset-0 bg-gradient-to-r from-sd-900 via-sd-900/40 to-transparent" />
        </div>
      </section>

      {resumen.isLoading && <EsqueletoLista filas={2} />}
      {resumen.error && <div className="space-y-3"><ErrorCaja error={resumen.error} /><Boton variante="secundario" onClick={() => resumen.refetch()}>Reintentar</Boton></div>}
      {r && s && (
        <>
          <section aria-labelledby="t-indicadores">
            <h2 id="t-indicadores" className="sr-only">Estado de tus solicitudes</h2>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <ConEnlace a="/cuenta/pedidos?estado=borrador"><Cifra etiqueta="Borradores" valor={s.borradores} detalle="Guardadas sin enviar" icono={<Save className="h-4 w-4" aria-hidden />} acento={verde} /></ConEnlace>
              <ConEnlace a="/cuenta/pedidos?estado=en_revision"><Cifra etiqueta="En revisión" valor={s.en_revision} detalle="Con el distribuidor" icono={<ClipboardList className="h-4 w-4" aria-hidden />} acento={verde} /></ConEnlace>
              {/* Sin enlace: "aprobadas" agrupa varios estados y /cuenta/pedidos solo filtra por uno (ver B-1 del plan). */}
              <Cifra etiqueta="Aprobadas" valor={s.en_proceso + s.entregadas} detalle={`${s.en_proceso} en proceso · ${s.entregadas} entregadas`} icono={<CheckCircle2 className="h-4 w-4" aria-hidden />} acento={verde} />
              <Cifra etiqueta="Devueltas o rechazadas" valor={s.por_corregir + s.rechazadas} icono={<Undo2 className="h-4 w-4" aria-hidden />} acento={s.por_corregir > 0 ? ambar : verde}
                detalle={<>{s.por_corregir > 0 ? <Link to="/cuenta/pedidos?estado=devuelto" className="font-semibold text-menta-700 underline">{s.por_corregir} por corregir</Link> : '0 por corregir'} · {s.rechazadas} rechazadas</>} />
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
            <Distribucion s={s} />
            <Pendientes r={r} />
          </div>
        </>
      )}

      <section aria-labelledby="t-accesos">
        <h2 id="t-accesos" className="mb-3 font-display text-base font-bold text-tinta-900">Accesos rápidos</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Acceso a={RUTA_CATALOGO_PORTAL} icono={<Shirt className="h-5 w-5" />} titulo="Consultar catálogo" texto="Uniformes autorizados por puesto" />
          <Acceso a="/cuenta/solicitudes/nueva" icono={<FilePlus2 className="h-5 w-5" />} titulo="Crear solicitud" texto="Por empleado, paso a paso" />
          <Acceso a="/cuenta/pedidos" icono={<ClipboardList className="h-5 w-5" />} titulo="Consultar solicitudes" texto="Estado y seguimiento" />
          <Acceso a="/cuenta/empleados" icono={<Users className="h-5 w-5" />} titulo="Administrar empleados" texto="Altas, puestos y estado" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Tarjeta titulo="Últimas solicitudes" sub="Las cinco más recientes de tu sucursal"
            accion={<Link to="/cuenta/pedidos" className="flex min-h-11 items-center gap-1 text-sm font-semibold text-menta-700 hover:underline">Ver todas <ArrowRight className="h-4 w-4" aria-hidden /></Link>}>
            {recientes.isLoading ? <EsqueletoLista filas={3} /> : recientes.error ? (
              <div className="space-y-3"><ErrorCaja error={recientes.error} /><Boton variante="secundario" onClick={() => recientes.refetch()}>Reintentar</Boton></div>
            ) : !recientes.data?.items.length ? (
              <Vacio titulo="Aún no tienes solicitudes" texto="Cuando crees una solicitud por empleado, aquí verás su avance."
                accion={<Link to="/cuenta/solicitudes/nueva" className="mt-2 font-semibold text-menta-700">Crear solicitud →</Link>} />
            ) : (
              <ul className="divide-y divide-tinta-100">
                {recientes.data.items.map((p) => (
                  <li key={p.id}>
                    <Link to={p.estado === 'borrador' ? `/cuenta/solicitudes/${p.id}/editar` : `/cuenta/pedidos/${p.id}`} className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-lg px-1 py-3 hover:bg-sd-50">
                      <span className="min-w-0"><span className="font-display font-bold text-tinta-900">{p.folio}</span><span className="block text-xs text-tinta-500">{fecha(p.creado)} · {p.articulos} artículo(s)</span></span>
                      <Estado valor={p.estado} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          <Tarjeta titulo="Notificaciones recientes" sub={avisos.data ? `${avisos.data.no_leidas} sin leer` : undefined}
            accion={<Link to="/cuenta/notificaciones" className="flex min-h-11 items-center gap-1 text-sm font-semibold text-menta-700 hover:underline">Ver todas <ArrowRight className="h-4 w-4" aria-hidden /></Link>}>
            {avisos.isLoading ? <EsqueletoLista filas={3} /> : avisos.error ? (
              <div className="space-y-3"><ErrorCaja error={avisos.error} /><Boton variante="secundario" onClick={() => avisos.refetch()}>Reintentar</Boton></div>
            ) : !avisos.data?.items.length ? <Vacio titulo="Sin notificaciones" texto="Aquí aparecerán los cambios de estado de tus solicitudes." /> : (
              <ul className="divide-y divide-tinta-100">
                {avisos.data.items.map((n) => (
                  <li key={n.id} className="flex items-start gap-3 py-3">
                    <span className={cls('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', n.leida ? 'bg-tinta-50 text-tinta-400' : verde)} aria-hidden><Bell className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1 text-sm">
                      {n.enlace ? <Link to={n.enlace} className={cls('hover:underline', !n.leida && 'font-semibold')}>{n.mensaje}</Link> : <span className={cls(!n.leida && 'font-semibold')}>{n.mensaje}</span>}
                      <p className="text-xs text-tinta-500">{fechaHora(n.fecha)}{!n.leida && ' · Sin leer'}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>

        <div className="space-y-6">
          <Tarjeta titulo="Borradores" sub="Solicitudes guardadas que aún no envías">
            {borradores.isLoading ? <EsqueletoLista filas={2} /> : borradores.error ? <ErrorCaja error={borradores.error} /> : !borradores.data?.items.length ? (
              <Vacio titulo="Sin borradores" texto="Al guardar una solicitud sin enviarla, aparecerá aquí para continuarla." />
            ) : (
              <ul className="divide-y divide-tinta-100">
                {borradores.data.items.slice(0, 5).map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div><p className="font-semibold">{b.folio}</p><p className="text-xs text-tinta-500">{b.articulos} artículo(s) · {fechaHora(b.creado)}</p></div>
                    <Link to={`/cuenta/solicitudes/${b.id}/editar`} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-menta-500 px-3 text-xs font-semibold text-white hover:bg-menta-600">Continuar <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          {r?.zona && (
            <Tarjeta titulo={`Tu zona: ${r.zona.nombre}`} sub={r.zona.division ? `División ${r.zona.division.nombre}` : undefined}>
              <div className="space-y-4">
                <ContactoZona rol="Gerente de zona" nombre={r.zona.gerente} correo={r.zona.correo} telefono={r.zona.telefono} />
                {r.zona.division && <ContactoZona rol="Responsable divisional" nombre={r.zona.division.responsable} correo={r.zona.division.correo} telefono={r.zona.division.telefono} />}
              </div>
            </Tarjeta>
          )}
        </div>
      </div>
    </div>
  );
}

/** Las cuentas de persona (tienda encendida) no tienen portal de sucursal: se les lleva a sus pedidos, como antes. */
export default function Inicio() {
  const { cliente } = useAuth();
  if (cliente?.tipo !== 'empresa') return <Navigate to="pedidos" replace />;
  return <InicioEmpresa />;
}
