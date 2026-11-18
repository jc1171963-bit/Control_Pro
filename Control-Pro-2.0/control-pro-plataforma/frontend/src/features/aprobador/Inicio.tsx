/**
 * Panel principal del aprobador: lo que requiere su atención (solicitudes nuevas, permisos de padrón y mensajes) y el
 * seguimiento de las solicitudes de todas las sucursales (indicadores existentes del panel de solicitudes).
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ChevronRight, Inbox, KeyRound, MessagesSquare } from 'lucide-react';
import { get } from '../../api/cliente';
import type { Pagina, PedidoResumen, PermisoPadron } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { BASE_APROBADOR } from '../../app/panel';
import { Estado, Tarjeta, Vacio } from '../../components/ui';
import { EsqueletoLista } from '../../components/movimiento';
import { fechaHora } from '../../lib/formato';
import PanelSolicitudes from '../admin/PanelSolicitudes';
import { AREA_APROBADOR, useContadoresAprobador } from './AprobadorLayout';

const fechaLarga = () => new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

function Pendiente({ a, icono, valor, titulo, texto, fondo }: { a: string; icono: React.ReactNode; valor: number; titulo: string; texto: string; fondo: string }) {
  return (
    <Link to={a} className="vidrio group relative flex items-center gap-3.5 overflow-hidden rounded-2xl bg-white p-4 transition hover:-translate-y-0.5 sm:p-5">
      <span className="pointer-events-none absolute -right-6 -top-9 h-[90px] w-[90px] rounded-full bg-[#5ec8d82b]" aria-hidden />
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full sm:h-14 sm:w-14 ${fondo}`} aria-hidden>{icono}</span>
      <span className="relative min-w-0">
        <span className="block font-display text-[30px] font-extrabold leading-none">{valor}</span>
        <span className="mt-1 block text-sm font-bold">{titulo}</span>
        <span className="block text-[11px] text-[#71858b]">{texto}</span>
      </span>
      <ChevronRight className="relative ml-auto h-5 w-5 text-tinta-300 transition group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

export default function InicioAprobador() {
  const { usuario } = useAuth();
  const c = useContadoresAprobador();
  const nuevas = useQuery({ queryKey: ['aprobador-resumen', 'nuevas'], refetchInterval: 45_000,
    queryFn: () => get<Pagina<PedidoResumen>>('/admin/pedidos?canal=corporativo&estado=en_revision&por_pagina=5') });
  const permisos = useQuery({ queryKey: ['aprobador-resumen', 'permisos-lista'], refetchInterval: 45_000,
    queryFn: () => get<Pagina<PermisoPadron>>('/admin/permisos-padron?estado=pendiente&por_pagina=5') });
  const nombre = (usuario?.nombre ?? '').trim();
  return (
    <div className="space-y-6">
      <section className="relative isolate flex min-h-[250px] items-center overflow-hidden rounded-[29px] border border-white/55 p-6 text-white shadow-[0_18px_55px_rgba(25,91,87,.13)] sm:px-10 sm:py-8">
        <img src="/assets/escenas/pasillo-clinico.webp" alt="" width={1400} height={900} className="absolute inset-0 -z-20 h-full w-full object-cover object-[62%_center]" aria-hidden />
        <span className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(8,52,72,.97),rgba(11,79,108,.85)_45%,rgba(14,116,144,.1))] max-sm:bg-[linear-gradient(90deg,rgba(8,52,72,.97),rgba(11,79,108,.85))]" aria-hidden />
        <span className="pointer-events-none absolute inset-0 animate-destello bg-[linear-gradient(110deg,transparent_40%,#b7f3ff1a_65%,transparent_82%)]" aria-hidden />
        <div className="relative max-w-[600px]">
          <p className="inline-flex items-center gap-2 rounded-full border border-[#5ec8d888] bg-[#0e74906b] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em]">
            <span className="h-2 w-2 rounded-full bg-[#9be7f0]" aria-hidden />Aprobador corporativo · {fechaLarga()}
          </p>
          <h1 className="mt-3.5 font-display text-[30px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[40px]">Hola, <span className="text-[#9be7f0]">{nombre}</span></h1>
          <p className="mt-1 text-sm font-semibold text-white/80">{AREA_APROBADOR} · Salud Digna</p>
          <p className="mt-2 max-w-[500px] text-[15px] leading-relaxed sm:text-lg">
            {c.revisar ? `Tienes ${c.revisar} solicitud(es) por revisar` : 'No tienes solicitudes por revisar'}
            {c.permisos ? ` y ${c.permisos} permiso(s) de padrón por autorizar.` : '.'}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to={`${BASE_APROBADOR}/solicitudes?estado=en_revision`} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-gradient-to-r from-[#e9fbff] to-[#7fdce8] px-5 text-sm font-bold text-[#073a4d] transition hover:-translate-y-0.5">
              <Inbox className="h-4 w-4" aria-hidden />Revisar solicitudes</Link>
            <Link to={`${BASE_APROBADOR}/sucursales-cliente`} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/40 bg-white/10 px-5 text-sm font-bold backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white/20">
              Ver sucursales <ChevronRight className="h-4 w-4" aria-hidden /></Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="t-atencion">
        <h2 id="t-atencion" className="mb-3 flex items-center gap-3 font-display text-base font-bold"><span className="h-5 w-1.5 rounded-full bg-[#0e7490]" aria-hidden />Requiere tu atención</h2>
        <div className="grid gap-3 sm:grid-cols-3 sm:gap-5">
          <Pendiente a={`${BASE_APROBADOR}/solicitudes?estado=en_revision`} icono={<Inbox className="h-6 w-6" />} valor={c.revisar} titulo="Solicitudes nuevas" texto="Esperan tu revisión" fondo="bg-[#ffdfad] text-[#8a5300]" />
          <Pendiente a={`${BASE_APROBADOR}/permisos`} icono={<KeyRound className="h-6 w-6" />} valor={c.permisos} titulo="Permisos de padrón" texto={`${c.vigentes} vigente(s) ahora`} fondo="bg-[#6be5b8a8] text-[#00664a]" />
          <Pendiente a={`${BASE_APROBADOR}/mensajes`} icono={<MessagesSquare className="h-6 w-6" />} valor={c.mensajes} titulo="Mensajes sin leer" texto="Sucursales y distribuidora" fondo="bg-[#b5d9ff] text-[#0b4f86]" />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Tarjeta titulo="Solicitudes por revisar" sub="Las más recientes de las sucursales"
          accion={<Link to={`${BASE_APROBADOR}/solicitudes?estado=en_revision`} className="flex min-h-10 items-center gap-1 text-sm font-semibold text-menta-700 hover:underline">Ver todas <ArrowRight className="h-4 w-4" aria-hidden /></Link>}>
          {nuevas.isLoading ? <EsqueletoLista filas={3} /> : !nuevas.data?.items.length ? <Vacio titulo="Nada por revisar" texto="Cuando una sucursal envíe una solicitud aparecerá aquí." /> : (
            <ul className="divide-y divide-tinta-100">
              {nuevas.data.items.map((p) => (
                <li key={p.id}><Link to={`${BASE_APROBADOR}/pedidos/${p.id}`} className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-lg px-1 py-3 hover:bg-white/60">
                  <span className="min-w-0"><span className="font-display font-bold">{p.folio}</span> <span className="text-sm font-semibold text-tinta-700">· {p.cliente.nombre}</span>
                    <span className="block text-xs text-tinta-500">{fechaHora(p.creado)} · {p.articulos} artículo(s)</span></span>
                  <Estado valor={p.estado} /></Link></li>
              ))}
            </ul>
          )}
        </Tarjeta>
        <Tarjeta titulo="Permisos por autorizar" sub="Sucursales que quieren modificar su padrón de empleados"
          accion={<Link to={`${BASE_APROBADOR}/permisos`} className="flex min-h-10 items-center gap-1 text-sm font-semibold text-menta-700 hover:underline">Ver todos <ArrowRight className="h-4 w-4" aria-hidden /></Link>}>
          {permisos.isLoading ? <EsqueletoLista filas={3} /> : !permisos.data?.items.length ? <Vacio titulo="Sin permisos pendientes" texto="Las solicitudes de permiso de las sucursales aparecerán aquí." /> : (
            <ul className="divide-y divide-tinta-100">
              {permisos.data.items.map((p) => (
                <li key={p.id}><Link to={`${BASE_APROBADOR}/permisos`} className="block rounded-lg px-1 py-3 hover:bg-white/60">
                  <span className="font-display font-bold">{p.sucursal.nombre}</span>
                  <span className="block truncate text-sm">“{p.motivo}”</span>
                  <span className="block text-xs text-tinta-500">{fechaHora(p.solicitado)}</span></Link></li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>

      <section aria-labelledby="t-seguimiento">
        <h2 id="t-seguimiento" className="mb-3 flex items-center gap-3 font-display text-base font-bold"><span className="h-5 w-1.5 rounded-full bg-[#0e7490]" aria-hidden />Seguimiento de solicitudes</h2>
        <PanelSolicitudes encabezado={false} />
      </section>
    </div>
  );
}
