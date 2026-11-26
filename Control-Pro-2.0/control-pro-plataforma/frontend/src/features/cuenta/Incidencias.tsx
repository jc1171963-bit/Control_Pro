/**
 * «Mis incidencias» de la sucursal: todas las de sus solicitudes, aunque la solicitud ya haya terminado.
 * Cada incidencia es una conversación con la comercializadora; cuando la marca como resuelta, la sucursal confirma la
 * solución (se cierra) o la reabre explicando el motivo (vuelve a «En atención»). El historial nunca se borra.
 */
import { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '../../api/cliente';
import type { ConteoBandejas, Incidencia, Pagina, Pedido } from '../../api/tipos';
import { Aviso, Boton, Cargando, Campo, ErrorCaja, Modal, Paginacion, Tarjeta, Texto, Vacio, useAviso } from '../../components/ui';
import { AdjuntarEvidencias, GaleriaEvidencias } from '../../components/Archivos';
import TarjetaIncidencia from '../../components/TarjetaIncidencia';
import { BANDEJAS_SUCURSAL, filtroBandeja, PestanasBandeja } from '../../components/BandejasIncidencia';
import { EncabezadoIncidencia, ErrorIncidencia, SiguientePaso, VolverIncidencias } from '../../components/DetalleIncidencia';
import { etiqueta } from '../../lib/formato';
import { HistorialIncidencia, RecepcionPaquete } from './DetalleSolicitud';
import { ListaReposiciones } from '../../components/Reposiciones';

/** Bandejas por turno (backend). La bandeja y la página viven en la URL: al volver del detalle se conserva el contexto. */
export default function MisIncidencias() {
  const [params, setParams] = useSearchParams();
  const bandeja = BANDEJAS_SUCURSAL.find((b) => b.clave === params.get('bandeja')) ?? BANDEJAS_SUCURSAL[0];
  const pagina = Math.max(1, Number(params.get('pagina')) || 1);
  const cambiar = (cambios: Record<string, string>) => {
    const p = new URLSearchParams(params);
    Object.entries(cambios).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    setParams(p, { replace: true });
  };
  const filtro = filtroBandeja(bandeja);
  const q = useQuery({ queryKey: ['mis-incidencias', bandeja.clave, pagina],
    queryFn: () => get<Pagina<Incidencia> & { conteo: ConteoBandejas }>(`/cuenta/incidencias?pagina=${pagina}${filtro ? `&${filtro}` : ''}`) });
  return (
    <Tarjeta titulo="Mis incidencias" sub="Problemas reportados en tus solicitudes y su atención por Lurima">
      <div className="mb-4">
        <PestanasBandeja etiqueta="Bandejas de incidencias" bandejas={BANDEJAS_SUCURSAL} activa={bandeja.clave} conteo={q.data?.conteo}
          onCambio={(clave) => cambiar({ bandeja: clave, pagina: '' })} />
      </div>
      <div role="tabpanel" aria-label={bandeja.titulo}>
        <ErrorCaja error={q.error} />
        {q.isLoading ? <Cargando /> : q.error ? null : !q.data?.items.length
          ? <Vacio titulo={`Sin incidencias en «${bandeja.titulo}»`} texto={bandeja.vacio} /> : (
          <ul className="divide-y divide-tinta-100">
            {q.data.items.map((i) => (
              <li key={i.id}>
                <TarjetaIncidencia i={i} portal="sucursal" a={`/cuenta/incidencias/${i.id}`} state={{ bandeja: params.toString() }}
                  contexto={<><span>Solicitud {i.pedido_folio}</span><span>Estado: {etiqueta(i.estado)}</span></>} />
              </li>
            ))}
          </ul>
        )}
        {q.data && <Paginacion pagina={q.data.pagina} paginas={q.data.paginas} total={q.data.total} onCambio={(p) => cambiar({ pagina: String(p) })} />}
      </div>
    </Tarjeta>
  );
}

export function IncidenciaSucursal() {
  const { id } = useParams();
  // Regreso a la bandeja de origen (la lista pasa sus parámetros); sin ella (aviso, enlace directo), a la lista
  const volverA = (useLocation().state as { bandeja?: string } | null)?.bandeja ?? '';
  const origen = BANDEJAS_SUCURSAL.find((b) => b.clave === new URLSearchParams(volverA).get('bandeja'));
  const volver = { a: `/cuenta/incidencias${volverA ? `?${volverA}` : ''}`, texto: origen ? `Volver a «${origen.titulo}»` : 'Volver a mis incidencias' };
  const qc = useQueryClient();
  const avisar = useAviso();
  const clave = ['mi-incidencia', id];
  const q = useQuery({ queryKey: clave, queryFn: () => get<Incidencia>(`/cuenta/incidencias/${id}`) });
  const [texto, setTexto] = useState('');
  const [adjuntos, setAdjuntos] = useState<string[]>([]);
  const [reabrir, setReabrir] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [recibir, setRecibir] = useState(false);
  // D-7: con una reposición entregada por recibir (turno del backend), se carga la solicitud —la misma consulta que su
  // página— para recibirla aquí con el formulario de siempre; el backend valida la recepción como desde la solicitud.
  const porRecibir = q.data?.turno === 'sucursal_recibir' && !!q.data.pedido_id;
  const pedido = useQuery({ queryKey: ['pedido', String(q.data?.pedido_id)], queryFn: () => get<Pedido>(`/cuenta/pedidos/${q.data?.pedido_id}`), enabled: porRecibir });
  const paquete = porRecibir ? pedido.data?.paquetes.find((pq) => pq.reposicion?.incidencia_id === q.data?.id && pq.estado === 'entregado' && !pq.recepcion) : undefined;
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

  if (q.isLoading) return <div className="space-y-4"><VolverIncidencias {...volver} /><Cargando texto="Cargando incidencia…" /></div>;
  if (!q.data) return (
    <div className="space-y-4"><VolverIncidencias {...volver} />
      <ErrorIncidencia error={q.error} volver={volver.a} textoVolver={volver.texto} onReintentar={() => q.refetch()} /></div>
  );
  const i = q.data;
  const conversa = i.cierre_por_sucursal && i.estado !== 'cerrada';
  return (
    <div className="space-y-5">
      <VolverIncidencias {...volver} />
      <EncabezadoIncidencia i={i} portal="sucursal" contexto={i.pedido_id ? <div><dt className="inline">Solicitud: </dt><dd className="inline">
        <Link to={`/cuenta/pedidos/${i.pedido_id}`} className="font-semibold text-menta-700 hover:underline">{i.pedido_folio}</Link></dd></div> : null} />
      <SiguientePaso i={i} portal="sucursal" accion={paquete && (
        <Boton icono={<ClipboardCheck className="h-4 w-4" />} onClick={() => setRecibir(true)}>Registrar recepción de {paquete.folio}</Boton>)} />
      <Tarjeta titulo="Detalle y conversación">
        <p className="break-words rounded-lg bg-tinta-50 p-3 text-sm"><b>Descripción:</b> {i.descripcion}</p>
        {(i.empleado || i.articulo) && <p className="mt-2 text-xs text-tinta-600"><b>Relacionada con:</b> {[i.empleado && `${i.empleado.nombre} (${i.empleado.puesto})`, i.articulo && `${i.articulo.nombre} talla ${i.articulo.talla}`].filter(Boolean).join(' · ')}</p>}
        {!!i.evidencias?.length && <div className="mt-3"><GaleriaEvidencias urls={i.evidencias} titulo={`Evidencia de ${i.folio}`} /></div>}
        {!!i.reposiciones?.length && <div className="mt-4"><p className="text-xs font-bold uppercase tracking-wide text-tinta-500">Envío de reposición</p>
          <ListaReposiciones paquetes={i.reposiciones} /></div>}

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

      {paquete && pedido.data && (
        <Modal abierto={recibir} titulo={`Recepción del paquete ${paquete.folio}`} onCerrar={() => setRecibir(false)} ancho="max-w-2xl">
          <RecepcionPaquete pq={paquete} p={pedido.data} onCerrar={() => setRecibir(false)} />
        </Modal>
      )}
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
