/** Permisos de padrón: las sucursales piden permiso para modificar a sus empleados y el aprobador lo autoriza por tiempo. */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock3, KeyRound, Search, ShieldOff, X } from 'lucide-react';
import { get, post } from '../../api/cliente';
import type { Pagina, PermisoPadron } from '../../api/tipos';
import { Boton, Campo, Cargando, Entrada, ErrorCaja, Modal, Paginacion, Selector, Tarjeta, useAviso, Vacio } from '../../components/ui';
import { cls, fechaHora } from '../../lib/formato';

type Respuesta = Pagina<PermisoPadron> & { conteo: { pendientes: number; vigentes: number } };

export const ESTADO_PERMISO: Record<PermisoPadron['estado'], [string, string]> = {
  pendiente: ['Por autorizar', 'bg-amber-100 text-amber-800'], aprobado: ['Vigente', 'bg-menta-50 text-menta-700'],
  vencido: ['Vencido', 'bg-tinta-100 text-tinta-600'], rechazado: ['Rechazado', 'bg-coral-50 text-coral-700'],
  cancelado: ['Cancelado', 'bg-tinta-100 text-tinta-600'], terminado: ['Terminado', 'bg-tinta-100 text-tinta-600'],
};

export function EstadoPermiso({ estado }: { estado: PermisoPadron['estado'] }) {
  const [texto, color] = ESTADO_PERMISO[estado];
  return <span className={cls('rounded-full px-2.5 py-0.5 text-xs font-bold', color)}>{texto}</span>;
}

const FILTROS: [string, string][] = [['pendiente', 'Por autorizar'], ['vigente', 'Vigentes'], ['atendido', 'Atendidos'], ['', 'Todos']];
const HORAS = [2, 8, 24, 48, 72];

export default function Permisos() {
  const [params, setParams] = useSearchParams();
  const estado = params.get('estado') ?? 'pendiente';
  const pagina = Number(params.get('pagina') || 1);
  const [busca, setBusca] = useState(params.get('q') || '');
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); if (k !== 'pagina') p.delete('pagina'); setParams(p); };
  const qc = useQueryClient();
  const avisar = useAviso();
  const q = useQuery({ queryKey: ['permisos-padron', estado, pagina, params.get('q')], placeholderData: keepPreviousData,
    queryFn: () => get<Respuesta>(`/admin/permisos-padron?por_pagina=15&pagina=${pagina}&estado=${estado}${params.get('q') ? `&q=${encodeURIComponent(params.get('q')!)}` : ''}`) });
  const [accion, setAccion] = useState<{ p: PermisoPadron; decision: 'aprobado' | 'rechazado' | 'revocado' } | null>(null);
  const [horas, setHoras] = useState(24);
  const [respuesta, setRespuesta] = useState('');
  const decidir = useMutation({
    mutationFn: () => post<PermisoPadron>(`/admin/permisos-padron/${accion!.p.id}/decision`,
      { decision: accion!.decision, respuesta: respuesta.trim() || null, horas: accion!.decision === 'aprobado' ? horas : null }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['permisos-padron'] });
      qc.invalidateQueries({ queryKey: ['aprobador-resumen'] });
      avisar(p.estado === 'aprobado' ? `Permiso autorizado para ${p.sucursal.nombre}.` : p.estado === 'rechazado' ? 'Solicitud rechazada.' : 'Permiso cerrado.');
      setAccion(null); setRespuesta('');
    },
  });
  const abrir = (p: PermisoPadron, decision: 'aprobado' | 'rechazado' | 'revocado') => { decidir.reset(); setRespuesta(''); setHoras(24); setAccion({ p, decision }); };
  const titulos = { aprobado: 'Autorizar permiso', rechazado: 'Rechazar solicitud', revocado: 'Cerrar permiso vigente' };
  return (
    <div className="space-y-4">
      <div><h1 className="font-display text-2xl font-extrabold tracking-tight">Permisos de padrón</h1>
        <p className="text-sm text-tinta-500">Las sucursales necesitan tu autorización para dar de alta, editar o desactivar empleados.</p></div>
      {q.data && (
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="vidrio rounded-2xl bg-white p-4"><p className="font-display text-3xl font-extrabold">{q.data.conteo.pendientes}</p><p className="text-xs font-bold text-tinta-600">Por autorizar</p></div>
          <div className="vidrio rounded-2xl bg-white p-4"><p className="font-display text-3xl font-extrabold">{q.data.conteo.vigentes}</p><p className="text-xs font-bold text-tinta-600">Vigentes ahora</p></div>
        </div>
      )}
      <Tarjeta>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar permisos">
            {FILTROS.map(([v, n]) => <button key={v} type="button" onClick={() => set('estado', v)} aria-pressed={estado === v}
              className={cls('rounded-full px-3 py-1 text-xs font-semibold ring-1 transition', estado === v ? 'bg-sd-900 text-white ring-sd-900' : 'ring-tinta-200 hover:bg-white')}>{n}</button>)}
          </div>
          <form className="relative ml-auto w-full sm:w-64" role="search" onSubmit={(e) => { e.preventDefault(); set('q', busca.trim()); }}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-400" aria-hidden />
            <Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar sucursal" className="pl-9" aria-label="Buscar sucursal" />
          </form>
        </div>
        <ErrorCaja error={q.error} />
        {q.isLoading ? <Cargando /> : !q.data?.items.length ? (
          <Vacio titulo={estado === 'pendiente' ? 'No hay permisos por autorizar' : 'Sin resultados'} texto="Cuando una sucursal pida permiso para modificar su padrón aparecerá aquí." />
        ) : (
          <ul className="divide-y divide-tinta-100">
            {q.data.items.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start gap-3 py-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#ffdfad] text-[#8a5300]" aria-hidden><KeyRound className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/aprobador/sucursales-cliente/${p.sucursal.id}`} className="font-display font-bold hover:text-menta-700">{p.sucursal.nombre}</Link>
                    <EstadoPermiso estado={p.estado} />{p.sucursal.zona && <span className="text-xs text-tinta-400">Zona {p.sucursal.zona}</span>}
                  </div>
                  <p className="mt-1 text-sm">“{p.motivo}”</p>
                  <p className="mt-1 text-xs text-tinta-500">Solicitado {fechaHora(p.solicitado)}
                    {p.estado === 'aprobado' && p.vigente_hasta && <> · <Clock3 className="inline h-3 w-3" aria-hidden /> vigente hasta {fechaHora(p.vigente_hasta)}</>}
                    {p.resuelto_por && <> · atendió {p.resuelto_por}</>}{p.respuesta && <> · “{p.respuesta}”</>}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.estado === 'pendiente' && <>
                    <Boton tam="sm" variante="secundario" icono={<X className="h-3.5 w-3.5" />} onClick={() => abrir(p, 'rechazado')}>Rechazar</Boton>
                    <Boton tam="sm" icono={<Check className="h-3.5 w-3.5" />} onClick={() => abrir(p, 'aprobado')}>Autorizar</Boton></>}
                  {p.estado === 'aprobado' && <Boton tam="sm" variante="secundario" icono={<ShieldOff className="h-3.5 w-3.5" />} onClick={() => abrir(p, 'revocado')}>Cerrar permiso</Boton>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {q.data && <Paginacion pagina={q.data.pagina} paginas={q.data.paginas} total={q.data.total} onCambio={(n) => set('pagina', String(n))} />}
      </Tarjeta>

      <Modal abierto={!!accion} titulo={accion ? titulos[accion.decision] : ''} onCerrar={() => setAccion(null)}>
        {accion && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); decidir.mutate(); }}>
            <p className="text-sm"><b>{accion.p.sucursal.nombre}</b>: “{accion.p.motivo}”</p>
            {accion.decision === 'aprobado' && (
              <Campo etiqueta="Duración del permiso" ayuda="Al terminar, el padrón se vuelve a bloquear. La sucursal también puede cerrarlo antes.">
                <Selector value={horas} onChange={(e) => setHoras(Number(e.target.value))}>{HORAS.map((h) => <option key={h} value={h}>{h} horas</option>)}</Selector>
              </Campo>
            )}
            <Campo etiqueta={accion.decision === 'rechazado' ? 'Motivo del rechazo' : 'Comentario para la sucursal (opcional)'}>
              <Entrada value={respuesta} onChange={(e) => setRespuesta(e.target.value)} required={accion.decision === 'rechazado'} minLength={accion.decision === 'rechazado' ? 5 : undefined} maxLength={300} />
            </Campo>
            <ErrorCaja error={decidir.error} />
            <div className="flex justify-end gap-2"><Boton type="button" variante="secundario" onClick={() => setAccion(null)}>Cancelar</Boton>
              <Boton type="submit" variante={accion.decision === 'aprobado' ? 'primario' : 'peligro'} cargando={decidir.isPending}>{titulos[accion.decision]}</Boton></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
