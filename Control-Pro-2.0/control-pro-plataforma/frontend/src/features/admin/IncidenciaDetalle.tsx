/**
 * Página de detalle de una incidencia en el panel (/admin/incidencias/:id): destino de las bandejas y de los avisos.
 * Reúne lo que antes vivía en el modal de la lista (descripción, evidencias, reposición, historial y el formulario de
 * seguimiento) sin cambiar ninguna acción: el backend sigue validando permisos y alcance en cada operación.
 */
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackagePlus, Truck } from 'lucide-react';
import { get, patch, post } from '../../api/cliente';
import type { Incidencia, Paquete, Pedido } from '../../api/tipos';
import { Aviso, Boton, Campo, Cargando, Entrada, ErrorCaja, Selector, Tarjeta, Texto, useAviso } from '../../components/ui';
import { BANDEJA_POR_ENVIAR, BANDEJAS_LURIMA } from '../../components/BandejasIncidencia';
import { EncabezadoIncidencia, ErrorIncidencia, SiguientePaso, VolverIncidencias } from '../../components/DetalleIncidencia';
import { useAuth } from '../../app/auth';
import { AdjuntarEvidencias, GaleriaEvidencias } from '../../components/Archivos';
import { ListaReposiciones } from '../../components/Reposiciones';
import { etiqueta } from '../../lib/formato';
import { HistorialIncidencia } from '../cuenta/DetalleSolicitud';

/** Regreso a la bandeja de origen (la lista pasa sus parámetros en el estado de la navegación); sin él, a la lista. */
function useRegreso() {
  const desde = (useLocation().state as { bandeja?: string } | null)?.bandeja ?? '';
  const clave = new URLSearchParams(desde).get('bandeja');
  const titulo = [...BANDEJAS_LURIMA, BANDEJA_POR_ENVIAR].find((b) => b.clave === clave)?.titulo;
  return { a: `/admin/incidencias${desde ? `?${desde}` : ''}`, texto: titulo ? `Volver a «${titulo}»` : 'Volver a incidencias' };
}

export function IncidenciaDetalle() {
  const { id } = useParams();
  const qc = useQueryClient();
  const avisar = useAviso();
  const volver = useRegreso();
  const envia = useAuth().puede('surtido.operar');
  const clave = ['admin-incidencia', id];
  const q = useQuery({ queryKey: clave, queryFn: () => get<Incidencia>(`/admin/incidencias/${id}`) });
  const [nuevoEstado, setNuevoEstado] = useState('');
  const [comentario, setComentario] = useState('');
  const [adjuntos, setAdjuntos] = useState<string[]>([]);
  const cambio = (i: Incidencia) => { qc.setQueryData(clave, i); qc.invalidateQueries({ queryKey: ['admin-incidencias'] }); };
  const m = useMutation({
    mutationFn: () => patch<Incidencia>(`/admin/incidencias/${id}`, { estado: nuevoEstado || null, comentario: comentario || null, adjuntos }),
    onSuccess: (i) => { cambio(i); setNuevoEstado(''); setComentario(''); setAdjuntos([]); avisar('Incidencia actualizada.'); },
  });

  if (q.isLoading) return <div className="space-y-4"><VolverIncidencias {...volver} /><Cargando forma="pagina" texto="Cargando incidencia…" /></div>;
  if (!q.data) return (
    <div className="space-y-4"><VolverIncidencias {...volver} />
      <ErrorIncidencia error={q.error} volver={volver.a} textoVolver={volver.texto} onReintentar={() => q.refetch()} /></div>
  );
  const i = q.data;
  const referencia = i.pedido_id ? null : i.transferencia_id ? `Transferencia #${i.transferencia_id}` : i.devolucion_id ? `Devolución #${i.devolucion_id}` : null;
  return (
    <div className="space-y-5">
      <VolverIncidencias {...volver} />
      <EncabezadoIncidencia i={i} portal="lurima" contexto={<>
        {i.pedido_id && <div><dt className="inline">Solicitud: </dt><dd className="inline">
          <Link to={`/admin/pedidos/${i.pedido_id}`} className="font-semibold text-menta-700 hover:underline">{i.pedido_folio ?? `Pedido #${i.pedido_id}`}</Link></dd></div>}
        {i.cliente && <div><dt className="inline">Sucursal cliente: </dt><dd className="inline font-semibold text-tinta-800">{i.cliente}</dd></div>}
        {referencia && <div><dt className="inline">Origen: </dt><dd className="inline font-semibold text-tinta-800">{referencia}</dd></div>}
        {i.reposicion_de && <div><dt className="inline">Nació de la reposición de: </dt><dd className="inline">
          <Link to={`/admin/incidencias/${i.reposicion_de.id}`} className="font-semibold text-menta-700 hover:underline">{i.reposicion_de.folio}</Link></dd></div>}
      </>} />

      <SiguientePaso i={i} portal="lurima" texto={i.turno === 'lurima_reposicion' ? (envia
        ? 'enviar la reposición con su paquetería y guía, o marcarla como entregada cuando llegue.'
        : 'el almacén que surte envía la reposición con su guía; aquí ves su avance.') : undefined} />

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="min-w-0 space-y-5 lg:col-span-3">
          <Tarjeta titulo="Descripción">
            <p className="break-words rounded-lg bg-tinta-50 p-3 text-sm">{i.descripcion}</p>
            {(i.empleado || i.articulo) && <p className="mt-2 text-xs text-tinta-600"><b>Relacionada con:</b> {[i.empleado && `${i.empleado.nombre} (${i.empleado.puesto})`, i.articulo && `${i.articulo.nombre} talla ${i.articulo.talla}`].filter(Boolean).join(' · ')}</p>}
            {!!i.evidencias?.length && <div className="mt-3"><p className="mb-1.5 text-xs font-semibold uppercase text-tinta-400">Evidencia</p><GaleriaEvidencias urls={i.evidencias} titulo={`Evidencia de ${i.folio}`} /></div>}
          </Tarjeta>
          <Tarjeta titulo="Seguimiento" sub="Mensajes y movimientos en orden cronológico">
            <HistorialIncidencia i={i} />
          </Tarjeta>
        </div>
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {i.pedido_id && <Reposicion inc={i} envia={envia} onCambio={cambio} />}
          <Tarjeta titulo="Agregar seguimiento">
            <div className="space-y-4 text-sm">
              {i.cierre_por_sucursal && <Aviso>La sucursal confirma la solución para cerrarla; si no queda conforme, puede reabrirla. Tus comentarios los ve la sucursal.</Aviso>}
              <Campo etiqueta="Agregar comentario o resolución" ayuda="Se agrega al historial; no reemplaza lo anterior."><Texto value={comentario} onChange={(e) => setComentario(e.target.value)} /></Campo>
              {i.pedido_id && <Campo etiqueta="Fotos o documentos (opcional)" ayuda="Los verá la sucursal en la conversación."><AdjuntarEvidencias valor={adjuntos} onCambio={setAdjuntos} /></Campo>}
              <Campo etiqueta="Cambiar estado"><Selector value={nuevoEstado} onChange={(e) => setNuevoEstado(e.target.value)}><option value="">Sin cambio</option>
                {(i.transiciones ?? []).map((x) => <option key={x} value={x}>{etiqueta(x)}</option>)}</Selector></Campo>
              <ErrorCaja error={m.error} />
              <div className="flex justify-end"><Boton disabled={!comentario.trim() && !nuevoEstado && !adjuntos.length} cargando={m.isPending} onClick={() => m.mutate()}>Guardar</Boton></div>
            </div>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- reposición (envío adicional con su propia guía)

/**
 * Resolver la incidencia con un envío de reposición: se eligen las piezas (sugeridas a partir de la recepción), se
 * prepara el paquete en el almacén y sale con su propia paquetería y guía. Al llegar, la sucursal registra su recepción
 * y entrega a cada persona; si llega completo, la incidencia queda resuelta para que la sucursal confirme.
 *
 * Preparar y cancelar: `incidencia.gestionar` (el de esta página). Enviar con guía y marcar entregada: solo con
 * `surtido.operar` (`envia`), igual que el backend; sin él la reposición se ve en solo lectura.
 */
function Reposicion({ inc, envia, onCambio }: { inc: Incidencia; envia: boolean; onCambio: (i: Incidencia) => void }) {
  const avisar = useAviso();
  const [armando, setArmando] = useState(false);
  const [cant, setCant] = useState<Record<number, number>>({});
  const [guia, setGuia] = useState<Record<number, { paqueteria: string; guia: string }>>({});
  const activa = ['abierta', 'en_atencion'].includes(inc.estado);
  const enCurso = (inc.reposiciones || []).some((r) => !['entregado', 'cancelado'].includes(r.estado));
  // D-6: no se ofrece otra mientras haya una vigente: en curso o entregada sin recepción (eso último solo lo dice el
  // turno del backend). Tras cancelarla o tras una recepción incompleta, sí.
  const vigente = enCurso || inc.turno === 'sucursal_recibir';
  const pedido = useQuery({ queryKey: ['admin-pedido', String(inc.pedido_id)], queryFn: () => get<Pedido>(`/admin/pedidos/${inc.pedido_id}`), enabled: armando });
  const recargar = async () => onCambio(await get<Incidencia>(`/admin/incidencias/${inc.id}`));
  const abrir = () => {
    setCant(Object.fromEntries((inc.reposicion_sugerida || []).map((x) => [x.pedido_detalle_id, x.cantidad])));
    setArmando(true);
  };
  const preparar = useMutation({
    mutationFn: () => post<Incidencia>(`/admin/incidencias/${inc.id}/reposicion`, {
      partidas: Object.entries(cant).filter(([, c]) => c > 0).map(([id, c]) => ({ pedido_detalle_id: Number(id), cantidad: c })) }),
    onSuccess: (i) => { setArmando(false); onCambio(i); avisar('Reposición preparada. Captura la paquetería y la guía para enviarla.'); },
  });
  const despachar = useMutation({
    mutationFn: (pq: Paquete) => post(`/admin/paquetes/${pq.id}/despachar`, guia[pq.id]),
    onSuccess: async () => { await recargar(); avisar('Reposición enviada: la sucursal ya ve la guía.'); },
  });
  const entregado = useMutation({
    mutationFn: (pq: Paquete) => post(`/admin/paquetes/${pq.id}/eventos`, { estado: 'entregado', descripcion: 'Reposición entregada en la sucursal' }),
    onSuccess: async () => { await recargar(); avisar('Marcada como entregada. La sucursal registrará su recepción.'); },
  });
  const cancelar = useMutation({
    mutationFn: (pq: Paquete) => post<Incidencia>(`/admin/paquetes/${pq.id}/cancelar-reposicion`),
    onSuccess: (i) => { onCambio(i); avisar('Reposición cancelada; se liberó lo apartado.'); },
  });
  const porPersona = new Map<string, Pedido['detalles']>();
  for (const d of pedido.data?.detalles || []) {
    const k = d.empleado?.nombre ?? 'Sin asignar';
    porPersona.set(k, [...(porPersona.get(k) || []), d]);
  }
  const piezas = Object.values(cant).reduce((a, b) => a + b, 0);
  const fijarGuia = (id: number, campo: 'paqueteria' | 'guia', valor: string) =>
    setGuia({ ...guia, [id]: { paqueteria: guia[id]?.paqueteria || '', guia: guia[id]?.guia || '', [campo]: valor } });
  return (
    <div className="rounded-xl bg-sky-50/60 p-3 ring-1 ring-sky-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-sky-900">Reposición</p>
        {activa && !armando && !vigente && <Boton tam="sm" icono={<PackagePlus className="h-3.5 w-3.5" />} onClick={abrir}>
          {inc.reposiciones?.length ? 'Preparar otra reposición' : 'Preparar reposición'}</Boton>}
      </div>
      {activa && vigente && <p className="mt-1 text-xs text-sky-900/80">Hay una reposición vigente. Podrás preparar otra si se cancela o si no se recibe completa.</p>}
      {!inc.reposiciones?.length && !armando && <p className="mt-1 text-xs text-sky-900/80">
        Envía piezas nuevas en un paquete aparte, con su propia guía.{(inc.reposicion_sugerida || []).length ? ' Ya están sugeridas las piezas que llegaron mal.' : ''}</p>}
      <ListaReposiciones paquetes={inc.reposiciones} acciones={(pq) => pq.estado === 'preparado' ? (envia ? (
        <div className="flex w-full flex-wrap items-end gap-2">
          <Entrada className="min-w-0 flex-1 basis-32" placeholder="Paquetería" aria-label={`Paquetería de ${pq.folio}`} value={guia[pq.id]?.paqueteria || ''}
            onChange={(e) => fijarGuia(pq.id, 'paqueteria', e.target.value)} />
          <Entrada className="min-w-0 flex-1 basis-32" placeholder="Número de guía" aria-label={`Guía de ${pq.folio}`} value={guia[pq.id]?.guia || ''}
            onChange={(e) => fijarGuia(pq.id, 'guia', e.target.value)} />
          <Boton tam="sm" icono={<Truck className="h-3.5 w-3.5" />} disabled={!guia[pq.id]?.paqueteria?.trim() || !guia[pq.id]?.guia?.trim()}
            cargando={despachar.isPending} onClick={() => despachar.mutate(pq)}>Enviar con esta guía</Boton>
          <Boton tam="sm" variante="fantasma" cargando={cancelar.isPending} onClick={() => cancelar.mutate(pq)}>Cancelar</Boton>
        </div>
      ) : (
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-tinta-600">Lista para salir: el almacén la enviará con su paquetería y guía.</p>
          <Boton tam="sm" variante="fantasma" cargando={cancelar.isPending} onClick={() => cancelar.mutate(pq)}>Cancelar</Boton>
        </div>
      )) : envia && ['despachado', 'en_transito'].includes(pq.estado)
        ? <Boton tam="sm" variante="secundario" cargando={entregado.isPending} onClick={() => entregado.mutate(pq)}>Marcar como entregada</Boton>
        : null} />
      <ErrorCaja error={despachar.error || entregado.error || cancelar.error} />
      {armando && (
        <div className="mt-3 space-y-3">
          {pedido.isLoading ? <Cargando /> : [...porPersona.entries()].map(([nombre, dets]) => (
            <div key={nombre} className="rounded-lg bg-white p-2.5 ring-1 ring-sky-100">
              <p className="text-xs font-bold">{nombre}</p>
              <ul className="mt-1 space-y-1">{dets.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0">{d.nombre} · {d.talla}</span>
                  <Selector className="w-24 shrink-0" value={cant[d.id] || 0} aria-label={`Piezas de ${d.nombre} para ${nombre}`}
                    onChange={(e) => setCant({ ...cant, [d.id]: Number(e.target.value) })}>
                    {Array.from({ length: d.cantidad + 1 }, (_, k) => <option key={k} value={k}>{k}</option>)}</Selector>
                </li>))}</ul>
            </div>
          ))}
          <Aviso>Las piezas salen del inventario disponible del almacén que surtió cada artículo. El surtido original no cambia.</Aviso>
          <ErrorCaja error={preparar.error} />
          <div className="flex flex-wrap justify-end gap-2"><Boton variante="secundario" onClick={() => setArmando(false)}>Cancelar</Boton>
            <Boton disabled={!piezas} cargando={preparar.isPending} onClick={() => preparar.mutate()}>Preparar {piezas} pieza(s)</Boton></div>
        </div>
      )}
    </div>
  );
}
