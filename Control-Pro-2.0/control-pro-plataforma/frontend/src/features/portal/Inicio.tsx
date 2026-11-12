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

const verde = 'bg-menta-50 text-menta-700';
const ambar = 'bg-amber-100 text-amber-700';

function ConEnlace({ a, children }: { a?: string; children: React.ReactNode }) {
  return a ? <Link to={a} className="block rounded-2xl transition hover:-translate-y-0.5 hover:shadow-lg">{children}</Link> : <>{children}</>;
}

function Acceso({ a, icono, titulo }: { a: string; icono: React.ReactNode; titulo: string }) {
  return (
    <Link to={a} className="flex min-h-14 items-center gap-3 rounded-xl bg-white p-3 text-sm font-semibold text-tinta-800 shadow-suave ring-1 ring-tinta-100 transition hover:ring-menta-400">
      <span className={cls('grid h-9 w-9 shrink-0 place-items-center rounded-lg', verde)} aria-hidden>{icono}</span>{titulo}
    </Link>
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
      <section className="rounded-2xl bg-sd-900 p-6 text-white sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-white/70">Portal de sucursal</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl">Hola, {nombre}</h1>
        <p className="mt-1 max-w-2xl text-sm text-white/80">{cliente?.razon_social ? `${cliente.razon_social}. ` : ''}Consulta el estado de tus solicitudes y continúa donde te quedaste.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to="/cuenta/solicitudes/nueva" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-menta-500 px-5 text-sm font-bold text-white transition hover:bg-menta-600"><FilePlus2 className="h-4 w-4" aria-hidden />Crear solicitud</Link>
          <Link to={RUTA_CATALOGO_PORTAL} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white/10 px-5 text-sm font-semibold ring-1 ring-white/30 transition hover:bg-white/20">Consultar catálogo</Link>
        </div>
      </section>

      {resumen.isLoading && <EsqueletoLista filas={2} />}
      {resumen.error && <div className="space-y-3"><ErrorCaja error={resumen.error} /><Boton variante="secundario" onClick={() => resumen.refetch()}>Reintentar</Boton></div>}
      {r && s && (
        <>
          <section aria-labelledby="t-indicadores">
            <h2 id="t-indicadores" className="sr-only">Estado de tus solicitudes</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ConEnlace a="/cuenta/pedidos?estado=borrador"><Cifra etiqueta="Borradores" valor={s.borradores} detalle="Guardadas sin enviar" icono={<Save className="h-4 w-4" aria-hidden />} acento={verde} /></ConEnlace>
              <ConEnlace a="/cuenta/pedidos?estado=en_revision"><Cifra etiqueta="En revisión" valor={s.en_revision} detalle="Con el distribuidor" icono={<ClipboardList className="h-4 w-4" aria-hidden />} acento={verde} /></ConEnlace>
              {/* Sin enlace: "aprobadas" agrupa varios estados y /cuenta/pedidos solo filtra por uno (ver B-1 del plan). */}
              <Cifra etiqueta="Aprobadas" valor={s.en_proceso + s.entregadas} detalle={`${s.en_proceso} en proceso · ${s.entregadas} entregadas`} icono={<CheckCircle2 className="h-4 w-4" aria-hidden />} acento={verde} />
              <Cifra etiqueta="Devueltas o rechazadas" valor={s.por_corregir + s.rechazadas} icono={<Undo2 className="h-4 w-4" aria-hidden />} acento={s.por_corregir > 0 ? ambar : verde}
                detalle={<>{s.por_corregir > 0 ? <Link to="/cuenta/pedidos?estado=devuelto" className="font-semibold text-menta-700 underline">{s.por_corregir} por corregir</Link> : '0 por corregir'} · {s.rechazadas} rechazadas</>} />
            </div>
          </section>

          <section aria-labelledby="t-operacion">
            <h2 id="t-operacion" className="mb-2 font-display text-base font-bold text-tinta-900">Operación</h2>
            {/* B-1: cuando /cuenta/pedidos acepte listas de estados, estos enlaces podrán llevar el filtro correspondiente. */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <ConEnlace a="/cuenta/pedidos"><Cifra etiqueta="Paquetes por recibir" valor={r.paquetes_por_recibir} icono={<PackageCheck className="h-4 w-4" aria-hidden />} acento={r.paquetes_por_recibir > 0 ? ambar : verde} /></ConEnlace>
              <ConEnlace a="/cuenta/pedidos"><Cifra etiqueta="Entregas pendientes" valor={r.entregas_pendientes} icono={<Users className="h-4 w-4" aria-hidden />} acento={r.entregas_pendientes > 0 ? ambar : verde} /></ConEnlace>
              <ConEnlace a="/cuenta/pedidos"><Cifra etiqueta="Conformidades pendientes" valor={r.conformidades_pendientes} icono={<CheckCircle2 className="h-4 w-4" aria-hidden />} acento={r.conformidades_pendientes > 0 ? ambar : verde} /></ConEnlace>
              <ConEnlace a="/cuenta/pedidos"><Cifra etiqueta="Incidencias abiertas" valor={r.incidencias_abiertas} icono={<ShieldAlert className="h-4 w-4" aria-hidden />} acento={r.incidencias_abiertas > 0 ? ambar : verde} /></ConEnlace>
              <ConEnlace a="/cuenta/empleados"><Cifra etiqueta="Empleados activos" valor={r.empleados_activos} icono={<Users className="h-4 w-4" aria-hidden />} acento={verde} /></ConEnlace>
            </div>
          </section>
        </>
      )}

      <section aria-labelledby="t-accesos">
        <h2 id="t-accesos" className="mb-2 font-display text-base font-bold text-tinta-900">Accesos rápidos</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Acceso a={RUTA_CATALOGO_PORTAL} icono={<Shirt className="h-5 w-5" />} titulo="Consultar catálogo" />
          <Acceso a="/cuenta/solicitudes/nueva" icono={<FilePlus2 className="h-5 w-5" />} titulo="Crear solicitud" />
          <Acceso a="/cuenta/pedidos" icono={<ClipboardList className="h-5 w-5" />} titulo="Consultar solicitudes" />
          <Acceso a="/cuenta/empleados" icono={<Users className="h-5 w-5" />} titulo="Administrar empleados" />
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
