import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, FileUp, Package, Truck, Undo2 } from 'lucide-react';
import { abrirPrivado, claveIdempotencia, get, post, subirArchivo } from '../../api/cliente';
import type { Paquete, Pedido } from '../../api/tipos';
import { Aviso, Boton, Campo, Cargando, Entrada, ErrorCaja, Estado, Modal, Selector, Tarjeta, Texto, useAviso } from '../../components/ui';
import { dinero, etiqueta, fechaHora, METODOS, mensajeError, MOTIVOS_DEVOLUCION } from '../../lib/formato';
import DetalleSolicitud from './DetalleSolicitud';

const DATOS_BANCARIOS = import.meta.env.VITE_DATOS_BANCARIOS as string | undefined;

function Linea({ p }: { p: Pedido }) {
  return (
    <ol className="relative space-y-4 border-l-2 border-arena-200 pl-5">
      {p.historial.map((h, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-menta-500 ring-4 ring-white" />
          <p className="text-sm font-semibold">{etiqueta(h.nuevo)}</p>
          <p className="text-xs text-tinta-400">{fechaHora(h.fecha)} · {h.actor}</p>
          {h.motivo && <p className="text-xs text-tinta-500">{h.motivo}</p>}
        </li>
      ))}
    </ol>
  );
}

function RegistrarPago({ p }: { p: Pedido }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [ref, setRef] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [clave] = useState(() => claveIdempotencia('pago'));
  const m = useMutation({
    mutationFn: async () => {
      const comprobante_url = archivo ? await subirArchivo(archivo) : null;
      return post(`/cuenta/pedidos/${p.id}/pagos`, { referencia: ref, comprobante_url, clave_idempotencia: clave });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pedido', String(p.id)] }); avisar('Registramos tu pago. Finanzas lo validará en breve.'); },
  });
  return (
    <div className="space-y-3">
      <Aviso>
        <p className="font-semibold">Paga {dinero(p.saldo)} por transferencia y registra tu referencia.</p>
        {DATOS_BANCARIOS ? <p className="mt-1 whitespace-pre-line">{DATOS_BANCARIOS}</p> : <p className="mt-1">Los datos bancarios de la empresa se configuran en el sistema (variable VITE_DATOS_BANCARIOS). Mientras tanto, solicítalos a tu sucursal.</p>}
        <p className="mt-1">Concepto: <b>{p.folio}</b>. La reserva vence el {fechaHora(p.reserva_expira)}.</p>
      </Aviso>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Campo etiqueta="Referencia o clave de rastreo"><Entrada value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Ej. clave de rastreo SPEI" /></Campo>
        <Campo etiqueta="Comprobante (PDF o imagen)">
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm ring-1 ring-tinta-200"><FileUp className="h-4 w-4" />{archivo ? archivo.name.slice(0, 22) : 'Adjuntar'}
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="sr-only" onChange={(e) => setArchivo(e.target.files?.[0] || null)} /></label>
        </Campo>
      </div>
      <ErrorCaja error={m.error} />
      <Boton disabled={ref.trim().length < 4} cargando={m.isPending} onClick={() => m.mutate()}>Registrar pago</Boton>
    </div>
  );
}

function SolicitarDevolucion({ p, onCerrar }: { p: Pedido; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [motivo, setMotivo] = useState('talla_incorrecta');
  const [desc, setDesc] = useState('');
  const [cant, setCant] = useState<Record<number, number>>({});
  const [archivos, setArchivos] = useState<File[]>([]);
  const elegibles = p.detalles.filter((d) => d.cantidad_entregada - d.cantidad_devuelta > 0);
  const m = useMutation({
    mutationFn: async () => {
      const urls = await Promise.all(archivos.map((a) => subirArchivo(a)));
      const evidencias = urls.length ? urls : desc.trim() ? [`Descripción: ${desc.trim().slice(0, 280)}`] : [];
      return post(`/cuenta/pedidos/${p.id}/devoluciones`, {
        motivo, descripcion: desc, evidencias,
        partidas: Object.entries(cant).filter(([, c]) => c > 0).map(([id, c]) => ({ pedido_detalle_id: Number(id), cantidad: c })),
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pedido', String(p.id)] }); avisar('Solicitud de devolución enviada.'); onCerrar(); },
  });
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {elegibles.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl p-3 ring-1 ring-arena-200 text-sm">
            <span>{d.nombre} <span className="text-tinta-400">({d.talla}, {d.color})</span></span>
            <Selector className="w-24" value={cant[d.id] || 0} onChange={(e) => setCant({ ...cant, [d.id]: Number(e.target.value) })}>
              {Array.from({ length: d.cantidad_entregada - d.cantidad_devuelta + 1 }, (_, i) => <option key={i} value={i}>{i}</option>)}
            </Selector>
          </div>
        ))}
      </div>
      <Campo etiqueta="Motivo"><Selector value={motivo} onChange={(e) => setMotivo(e.target.value)}>{Object.entries(MOTIVOS_DEVOLUCION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Selector></Campo>
      <Campo etiqueta="Describe el problema" ayuda="Mínimo 10 caracteres"><Texto value={desc} onChange={(e) => setDesc(e.target.value)} /></Campo>
      <Campo etiqueta="Fotos o documentos de evidencia" ayuda="Hasta 6 archivos. Si no tienes fotos, la descripción se registra como evidencia.">
        <input type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf" onChange={(e) => setArchivos(Array.from(e.target.files || []).slice(0, 6))} className="text-sm" />
      </Campo>
      <ErrorCaja error={m.error} />
      <div className="flex justify-end gap-2"><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton cargando={m.isPending} disabled={!Object.values(cant).some((c) => c > 0) || desc.trim().length < 10} onClick={() => m.mutate()}>Enviar solicitud</Boton></div>
    </div>
  );
}

function PaqueteCard({ pq }: { pq: Paquete }) {
  return (
    <div className="rounded-xl p-4 ring-1 ring-arena-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold"><Package className="h-4 w-4 text-menta-600" />{pq.folio} <span className="text-xs font-normal text-tinta-400">desde {pq.sucursal}</span></p>
        <Estado valor={pq.estado} />
      </div>
      <p className="mt-1 text-xs text-tinta-500">{pq.contenido.map((c) => `${c.cantidad}× ${c.nombre} (${c.talla})`).join(' · ')}</p>
      {pq.envio && (
        <div className="mt-3 rounded-lg bg-arena-50 p-3 text-xs">
          <p className="flex items-center gap-1 font-semibold"><Truck className="h-3.5 w-3.5" />{pq.envio.paqueteria} · Guía {pq.envio.guia}</p>
          {!pq.envio.rastreo_externo && <p className="text-tinta-400">Eventos registrados por la sucursal (sin rastreo automático de la paquetería).</p>}
          <ul className="mt-2 space-y-1">{pq.envio.eventos.map((ev, i) => <li key={i}>{fechaHora(ev.fecha)} · <b>{etiqueta(ev.estado)}</b> — {ev.descripcion}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

export default function PedidoDetalle() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const avisar = useAviso();
  const q = useQuery({ queryKey: ['pedido', id], queryFn: () => get<Pedido>(`/cuenta/pedidos/${id}`) });
  const [cancelar, setCancelar] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [devolver, setDevolver] = useState(false);
  const cancelarM = useMutation({
    mutationFn: () => post(`/cuenta/pedidos/${id}/cancelar`, { motivo }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pedido', id] }); setCancelar(false); avisar('Pedido cancelado. Si ya habías pagado, generamos el reembolso.'); },
  });
  const enCamino = useMutation({
    mutationFn: ({ dev, guia }: { dev: number; guia: string }) => post(`/cuenta/devoluciones/${dev}/en-camino`, { guia: guia || null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pedido', id] }), onError: (e) => avisar(mensajeError(e), 'error'),
  });

  if (q.isLoading) return <Cargando />;
  if (!q.data) return <ErrorCaja error={q.error} />;
  const p = q.data;
  if (p.canal === 'corporativo') return <DetalleSolicitud p={p} />;
  const cancelable = ['en_revision', 'devuelto', 'pendiente_pago', 'pago_en_revision', 'confirmado'].includes(p.estado);
  const devolvible = ['parcialmente_entregado', 'entregado'].includes(p.estado) && p.detalles.some((d) => d.cantidad_entregada > d.cantidad_devuelta);

  return (
    <div className="space-y-5">
      {params.get('nuevo') && (
        <div className="flex items-start gap-3 rounded-2xl bg-menta-500 p-5 text-white">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" />
          <div><p className="font-display text-lg font-bold">¡Pedido {p.folio} recibido!</p>
            <p className="text-sm text-menta-50">{p.metodo_pago === 'efectivo' ? `Pasa a pagar a ${p.sucursal_recoger?.nombre}. Lo preparamos en cuanto se registre el cobro.` : 'Registra tu transferencia abajo para que lo preparemos.'}</p></div>
        </div>
      )}
      <Tarjeta titulo={<span className="flex flex-wrap items-center gap-2">Pedido {p.folio} <Estado valor={p.estado} /></span>}
        sub={`${fechaHora(p.creado)} · ${METODOS[p.metodo_pago]} · ${p.modalidad === 'recoger' ? `Recoger en ${p.sucursal_recoger?.nombre}` : 'Envío a domicilio'}`}
        accion={<div className="flex gap-2">
          {devolvible && <Boton tam="sm" variante="secundario" icono={<Undo2 className="h-3.5 w-3.5" />} onClick={() => setDevolver(true)}>Solicitar devolución</Boton>}
          {cancelable && <Boton tam="sm" variante="fantasma" onClick={() => setCancelar(true)}>Cancelar pedido</Boton>}
        </div>}>
        {p.estado === 'pendiente_pago' && p.metodo_pago === 'transferencia' && <RegistrarPago p={p} />}
        {p.estado === 'pendiente_pago' && p.metodo_pago === 'efectivo' && <Aviso>Paga {dinero(p.saldo)} en caja de {p.sucursal_recoger?.nombre} ({p.sucursal_recoger?.direccion}). La reserva vence el {fechaHora(p.reserva_expira)}.</Aviso>}
        {p.estado === 'pago_en_revision' && <Aviso><span className="flex items-center gap-2"><Clock className="h-4 w-4" />Tu pago está en validación. Te avisaremos cuando se confirme.</span></Aviso>}

        <div className="mt-4 -mx-5 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-y border-arena-200 bg-arena-50 text-left text-[11px] uppercase text-tinta-400">
              <th className="px-5 py-2">Artículo</th><th className="px-3 py-2">Cant.</th><th className="px-3 py-2">Seguimiento</th><th className="px-5 py-2 text-right">Importe</th></tr></thead>
            <tbody className="divide-y divide-arena-200">{p.detalles.map((d) => (
              <tr key={d.id}>
                <td className="px-5 py-3"><p className="font-semibold">{d.nombre}</p><p className="text-xs text-tinta-400">{d.sku} · {d.color} · {d.talla}</p></td>
                <td className="px-3 py-3">{d.cantidad}</td>
                <td className="px-3 py-3 text-xs">{d.cantidad_entregada > 0 && <span className="mr-2 text-menta-700">{d.cantidad_entregada} entregada(s)</span>}{d.cantidad_cancelada > 0 && <span className="mr-2 text-coral-600">{d.cantidad_cancelada} cancelada(s)</span>}{d.cantidad_devuelta > 0 && <span className="text-tinta-500">{d.cantidad_devuelta} devuelta(s)</span>}</td>
                <td className="px-5 py-3 text-right font-semibold">{dinero(d.importe)}{Number(d.descuento_unitario) > 0 && <p className="text-xs font-normal text-coral-600">−{dinero(d.descuento_unitario)} c/u</p>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <dl className="ml-auto mt-4 max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{dinero(p.subtotal)}</dd></div>
          {Number(p.descuento) > 0 && <div className="flex justify-between text-coral-600"><dt>Descuentos</dt><dd>−{dinero(p.descuento)}</dd></div>}
          <div className="flex justify-between"><dt>Envío</dt><dd>{Number(p.costo_envio) ? dinero(p.costo_envio) : 'Sin costo'}</dd></div>
          <div className="flex justify-between border-t border-arena-200 pt-2 font-display text-lg font-extrabold"><dt>Total</dt><dd>{dinero(p.total)}</dd></div>
          <p className="text-right text-xs text-tinta-400">IVA incluido {dinero(p.impuestos)}</p>
        </dl>
      </Tarjeta>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          {p.paquetes.length > 0 && (
            <Tarjeta titulo="Paquetes y envíos">
              <div className="space-y-3">{p.paquetes.map((pq) => <PaqueteCard key={pq.id} pq={pq} />)}</div>
            </Tarjeta>
          )}
          {p.devoluciones.length > 0 && (
            <Tarjeta titulo="Devoluciones">
              {p.devoluciones.map((d) => (
                <div key={d.id} className="mb-3 rounded-xl p-4 text-sm ring-1 ring-arena-200">
                  <div className="flex items-center justify-between"><span className="font-semibold">{d.folio} · {MOTIVOS_DEVOLUCION[d.motivo]}</span><Estado valor={d.estado} /></div>
                  <p className="mt-1 text-xs text-tinta-500">{d.detalles.map((x) => `${x.cantidad}× ${x.nombre} (${x.talla})`).join(' · ')}</p>
                  {d.sucursal_recibe && d.estado === 'autorizada' && (
                    <div className="mt-2 space-y-2"><Aviso>Entrega o envía los artículos a {d.sucursal_recibe.nombre}, {d.sucursal_recibe.direccion}.</Aviso>
                      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); enCamino.mutate({ dev: d.id, guia: String(new FormData(e.currentTarget).get('guia') || '') }); }}>
                        <Entrada name="guia" placeholder="Guía de retorno (opcional)" /><Boton tam="sm" type="submit">Ya lo envié</Boton></form></div>
                  )}
                  {d.resolucion && <p className="mt-1 text-xs">Resolución: {d.resolucion}</p>}
                  {Number(d.monto_reembolso) > 0 && <p className="mt-1 text-xs font-semibold text-menta-700">Reembolso: {dinero(d.monto_reembolso)}</p>}
                  {d.evidencias.filter((x) => x.startsWith('/api/')).map((x, i) => <button key={x} onClick={() => abrirPrivado(x)} className="mr-2 mt-1 text-xs font-semibold text-menta-700 underline">Evidencia {i + 1}</button>)}
                </div>
              ))}
            </Tarjeta>
          )}
          {p.pagos.length > 0 && (
            <Tarjeta titulo="Pagos">
              <ul className="divide-y divide-arena-200 text-sm">
                {p.pagos.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{x.folio} · {METODOS[x.metodo]} {x.referencia && <span className="text-tinta-400">· {x.referencia}</span>}</span>
                    <span className="flex items-center gap-2">{dinero(x.monto)}<Estado valor={x.estado} /></span>
                    {x.motivo_rechazo && <p className="w-full text-xs text-coral-600">{x.motivo_rechazo}</p>}
                    {x.reembolsos.map((r) => <p key={r.id} className="w-full text-xs text-tinta-500">Reembolso {dinero(r.monto)} · {etiqueta(r.estado)} {r.referencia ? `· ${r.referencia}` : ''}</p>)}
                  </li>
                ))}
              </ul>
            </Tarjeta>
          )}
        </div>
        <Tarjeta titulo="Historial"><Linea p={p} /></Tarjeta>
      </div>

      <Modal abierto={cancelar} titulo="Cancelar pedido" onCerrar={() => setCancelar(false)}>
        <p className="mb-3 text-sm text-tinta-500">Las piezas apartadas se liberan. Si ya pagaste, se genera un reembolso.</p>
        <Campo etiqueta="Motivo"><Texto value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
        <ErrorCaja error={cancelarM.error} />
        <div className="mt-4 flex justify-end gap-2"><Boton variante="secundario" onClick={() => setCancelar(false)}>Volver</Boton>
          <Boton variante="peligro" disabled={motivo.trim().length < 5} cargando={cancelarM.isPending} onClick={() => cancelarM.mutate()}>Cancelar pedido</Boton></div>
      </Modal>
      <Modal abierto={devolver} titulo="Solicitar devolución" onCerrar={() => setDevolver(false)} ancho="max-w-xl">
        <SolicitarDevolucion p={p} onCerrar={() => setDevolver(false)} />
      </Modal>
    </div>
  );
}
