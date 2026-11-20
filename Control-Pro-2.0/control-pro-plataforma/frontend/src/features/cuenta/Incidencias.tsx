/**
 * «Mis incidencias» de la sucursal: todas las de sus solicitudes, aunque la solicitud ya haya terminado.
 * Cada incidencia es una conversación con la comercializadora; cuando la marca como resuelta, la sucursal confirma la
 * solución (se cierra) o la reabre explicando el motivo (vuelve a «En atención»). El historial nunca se borra.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ShieldAlert } from 'lucide-react';
import { get, post } from '../../api/cliente';
import type { Incidencia, Pagina } from '../../api/tipos';
import { Aviso, Boton, Cargando, Campo, ErrorCaja, Estado, Modal, Paginacion, Tarjeta, Texto, Vacio, useAviso } from '../../components/ui';
import { AdjuntarEvidencias, GaleriaEvidencias } from '../../components/Archivos';
import { cls, fechaHora, tipoIncidencia } from '../../lib/formato';
import { HistorialIncidencia } from './DetalleSolicitud';

const FILTROS: [string, string][] = [['abierta,en_atencion', 'En curso'], ['resuelta', 'Por confirmar'], ['cerrada', 'Cerradas'], ['', 'Todas']];

export default function MisIncidencias() {
  const [estado, setEstado] = useState('');
  const [pagina, setPagina] = useState(1);
  const q = useQuery({ queryKey: ['mis-incidencias', estado, pagina],
    queryFn: () => get<Pagina<Incidencia>>(`/cuenta/incidencias?pagina=${pagina}${estado ? `&estado=${estado}` : ''}`) });
  return (
    <Tarjeta titulo="Mis incidencias" sub="Problemas reportados en tus solicitudes y su atención por la comercializadora">
      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
        {FILTROS.map(([v, n]) => (
          <button key={v} type="button" aria-pressed={estado === v} onClick={() => { setEstado(v); setPagina(1); }}
            className={cls('min-h-8 rounded-full px-3 py-1 text-xs font-semibold ring-1', estado === v ? 'bg-tinta-900 text-white ring-tinta-900' : 'ring-tinta-200')}>{n}</button>
        ))}
      </div>
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : q.error ? null : !q.data?.items.length
        ? <Vacio titulo="Sin incidencias" texto="Si algo falla con una solicitud, repórtalo desde su detalle." /> : (
        <ul className="divide-y divide-tinta-100">
          {q.data.items.map((i) => (
            <li key={i.id}>
              <Link to={`/cuenta/incidencias/${i.id}`} className="flex items-start justify-between gap-3 py-3 hover:bg-tinta-50/60">
                <span className="min-w-0 text-sm">
                  <b>{i.folio}</b> · {tipoIncidencia(i.tipo)}
                  <span className="block truncate text-xs text-tinta-500">Solicitud {i.pedido_folio} · {i.descripcion}</span>
                  <span className="block text-xs text-tinta-400">Actualizada {fechaHora(i.actualizado)}</span>
                </span>
                <Estado valor={i.estado} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {q.data && <Paginacion pagina={q.data.pagina} paginas={q.data.paginas} total={q.data.total} onCambio={setPagina} />}
    </Tarjeta>
  );
}

export function IncidenciaSucursal() {
  const { id } = useParams();
  const qc = useQueryClient();
  const avisar = useAviso();
  const clave = ['mi-incidencia', id];
  const q = useQuery({ queryKey: clave, queryFn: () => get<Incidencia>(`/cuenta/incidencias/${id}`) });
  const [texto, setTexto] = useState('');
  const [adjuntos, setAdjuntos] = useState<string[]>([]);
  const [reabrir, setReabrir] = useState(false);
  const [motivo, setMotivo] = useState('');
  const listo = (i: Incidencia, aviso: string) => {
    qc.setQueryData(clave, i);
    qc.invalidateQueries({ queryKey: ['mis-incidencias'] });
    qc.invalidateQueries({ queryKey: ['pedido', String(i.pedido_id)] });
    avisar(aviso);
  };
  const enviar = useMutation({ mutationFn: () => post<Incidencia>(`/cuenta/incidencias/${id}/mensajes`, { texto, adjuntos }),
    onSuccess: (i) => { setTexto(''); setAdjuntos([]); listo(i, 'Mensaje enviado.'); } });
  const confirmar = useMutation({ mutationFn: () => post<Incidencia>(`/cuenta/incidencias/${id}/confirmar`),
    onSuccess: (i) => listo(i, 'Confirmaste la solución. La incidencia quedó cerrada.') });
  const reabrirM = useMutation({ mutationFn: () => post<Incidencia>(`/cuenta/incidencias/${id}/reabrir`, { motivo }),
    onSuccess: (i) => { setReabrir(false); setMotivo(''); listo(i, 'La incidencia volvió a «En atención».'); } });

  if (q.isLoading) return <Cargando />;
  if (!q.data) return <ErrorCaja error={q.error} />;
  const i = q.data;
  const conversa = i.cierre_por_sucursal && i.estado !== 'cerrada';
  return (
    <div className="space-y-5">
      <Link to="/cuenta/incidencias" className="inline-flex min-h-8 items-center gap-1 text-sm font-semibold text-menta-700 hover:underline"><ChevronLeft className="h-4 w-4" aria-hidden />Mis incidencias</Link>
      <Tarjeta titulo={<span className="flex flex-wrap items-center gap-2"><ShieldAlert className="h-4 w-4" aria-hidden />Incidencia {i.folio} <Estado valor={i.estado} /></span>}
        sub={<>{tipoIncidencia(i.tipo)} · reportada {fechaHora(i.creado)} · <Link to={`/cuenta/pedidos/${i.pedido_id}`} className="font-semibold text-menta-700 hover:underline">Solicitud {i.pedido_folio}</Link></>}>
        <p className="rounded-lg bg-tinta-50 p-3 text-sm"><b>Descripción:</b> {i.descripcion}</p>
        {(i.empleado || i.articulo) && <p className="mt-2 text-xs text-tinta-600"><b>Relacionada con:</b> {[i.empleado && `${i.empleado.nombre} (${i.empleado.puesto})`, i.articulo && `${i.articulo.nombre} talla ${i.articulo.talla}`].filter(Boolean).join(' · ')}</p>}
        {!!i.evidencias?.length && <div className="mt-3"><GaleriaEvidencias urls={i.evidencias} titulo={`Evidencia de ${i.folio}`} /></div>}

        {i.estado === 'resuelta' && i.cierre_por_sucursal && (
          <div className="mt-4 space-y-3 rounded-xl bg-menta-50 p-4 ring-1 ring-menta-200">
            <p className="text-sm"><b>La comercializadora la marcó como resuelta:</b> {i.resolucion}</p>
            <p className="text-sm text-tinta-600">Si el problema quedó solucionado, confírmalo para cerrarla. Si no, reábrela y explica qué falta.</p>
            <ErrorCaja error={confirmar.error} />
            <div className="flex flex-wrap gap-2">
              <Boton cargando={confirmar.isPending} onClick={() => confirmar.mutate()}>Confirmar solución</Boton>
              <Boton variante="secundario" onClick={() => { reabrirM.reset(); setReabrir(true); }}>No quedó resuelta: reabrir</Boton>
            </div>
          </div>
        )}
        {i.estado === 'cerrada' && <div className="mt-4"><Aviso>Incidencia cerrada. Si el problema vuelve a presentarse, repórtalo como una incidencia nueva desde la solicitud.</Aviso></div>}

        <h3 className="mt-5 text-xs font-semibold uppercase text-tinta-400">Conversación e historial</h3>
        <HistorialIncidencia i={i} />

        {conversa && (
          <div className="mt-4 space-y-2">
            <Campo etiqueta="Escribe a la comercializadora" ayuda="Tu mensaje queda en el historial de la incidencia; no se puede borrar.">
              <Texto value={texto} maxLength={2000} onChange={(e) => setTexto(e.target.value)} />
            </Campo>
            <Campo etiqueta="Fotos o documentos (opcional)">
              <AdjuntarEvidencias valor={adjuntos} onCambio={setAdjuntos} />
            </Campo>
            <ErrorCaja error={enviar.error} />
            <div className="flex justify-end"><Boton cargando={enviar.isPending} disabled={texto.trim().length < 2 && !adjuntos.length} onClick={() => enviar.mutate()}>Enviar mensaje</Boton></div>
          </div>
        )}
      </Tarjeta>

      <Modal abierto={reabrir} titulo={`Reabrir incidencia ${i.folio}`} onCerrar={() => setReabrir(false)}>
        <div className="space-y-4">
          <Campo etiqueta="¿Qué falta por resolver?" ayuda="Mínimo 10 caracteres. La comercializadora lo verá en el historial.">
            <Texto value={motivo} maxLength={1000} onChange={(e) => setMotivo(e.target.value)} />
          </Campo>
          <ErrorCaja error={reabrirM.error} />
          <div className="flex justify-end gap-2">
            <Boton variante="secundario" onClick={() => setReabrir(false)}>Cancelar</Boton>
            <Boton cargando={reabrirM.isPending} disabled={motivo.trim().length < 10} onClick={() => reabrirM.mutate()}>Reabrir</Boton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
