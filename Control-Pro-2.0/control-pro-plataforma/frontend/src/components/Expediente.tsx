/**
 * Expediente de la solicitud: todos sus documentos en un solo lugar.
 * - "Documentos adjuntos": los que se suben a mano (orden de compra, cotización, factura, comprobante, evidencia u otro).
 *   Los ven la sucursal, el aprobador y la distribuidora; solo quien lo subió puede quitarlo.
 * - "Generados por el sistema": PDF de la solicitud, guías, actas de recepción, comprobantes de entrega con firma y
 *   evidencias de incidencias y devoluciones, en orden cronológico.
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { ClipboardCheck, Download, FileCheck2, FileImage, FileSignature, FileText, FolderOpen, Paperclip, Receipt, Trash2, Truck, Upload } from 'lucide-react';
import { abrirPrivado, del, descargar, get, post, subirArchivo } from '../api/cliente';
import { cls, fechaHora, mensajeError } from '../lib/formato';
import { Boton, Campo, Entrada, ErrorCaja, Modal, Selector, Tarjeta, useAviso } from './ui';
import { EsqueletoLista } from './movimiento';

type Documento = { id: number; nombre: string; tipo: string; tipo_nombre: string; url: string; autor: string; fecha: string; puede_borrar: boolean };
type Generado = { clave: string; tipo: string; titulo: string; detalle?: string; fecha: string | null; url?: string; entrega_id?: number; accion?: 'pdf' | 'comprobante' };
type Datos = { documentos: Documento[]; generados: Generado[] };

const TIPOS: [string, string][] = [['orden_compra', 'Orden de compra'], ['cotizacion', 'Cotización'], ['factura', 'Factura'],
  ['comprobante', 'Comprobante'], ['evidencia', 'Evidencia'], ['otro', 'Otro documento']];
const ICONO: Record<string, LucideIcon> = { solicitud: FileText, guia: Truck, recepcion: ClipboardCheck, comprobante_entrega: FileSignature,
  evidencia: FileImage, orden_compra: Receipt, cotizacion: FileCheck2, factura: Receipt, comprobante: FileCheck2, otro: Paperclip };

export default function Expediente({ pedidoId, folio, origen, onComprobante }: {
  pedidoId: number; folio: string; origen: 'admin' | 'cuenta'; onComprobante: (entregaId: number) => void;
}) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const clave = ['expediente', origen, pedidoId];
  const q = useQuery({ queryKey: clave, queryFn: () => get<Datos>(`/${origen}/pedidos/${pedidoId}/expediente`) });
  const [subir, setSubir] = useState(false);
  const quitar = useMutation({ mutationFn: (id: number) => del(`/${origen}/pedidos/${pedidoId}/documentos/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: clave }); avisar('Documento quitado del expediente.'); }, onError: (e) => avisar(mensajeError(e), 'error') });
  const abrir = (g: Generado) => {
    if (g.accion === 'comprobante' && g.entrega_id) return onComprobante(g.entrega_id);
    if (g.accion === 'pdf') return descargar(origen === 'admin' ? `/admin/pedidos/${pedidoId}/pdf` : `/cuenta/pedidos/${pedidoId}/pdf`, `${folio}.pdf`).catch((e) => avisar(mensajeError(e), 'error'));
    if (g.url) abrirPrivado(g.url).catch((e) => avisar(mensajeError(e), 'error'));
  };
  const total = (q.data?.documentos.length ?? 0) + (q.data?.generados.length ?? 0);
  return (
    <Tarjeta titulo="Expediente" sub={q.data ? `${total} documento(s) de la solicitud` : 'Documentos de la solicitud'}
      accion={<Boton tam="sm" variante="secundario" icono={<Upload className="h-3.5 w-3.5" />} onClick={() => setSubir(true)}>Adjuntar documento</Boton>}>
      {q.isLoading ? <EsqueletoLista filas={3} texto="Cargando el expediente…" /> : q.error ? <ErrorCaja error={q.error} /> : (
        <div className="space-y-5">
          <section aria-label="Documentos adjuntos">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-tinta-400">Documentos adjuntos</p>
            {!q.data!.documentos.length ? (
              <button type="button" onClick={() => setSubir(true)} className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-tinta-200 p-4 text-left text-sm text-tinta-500 transition hover:border-menta-500 hover:text-menta-700">
                <FolderOpen className="h-5 w-5 shrink-0" aria-hidden />Aún no hay documentos. Adjunta la orden de compra, la cotización o la factura para tenerlas a la mano.</button>
            ) : (
              <ul className="divide-y divide-tinta-100">
                {q.data!.documentos.map((d) => {
                  const Icono = ICONO[d.tipo] ?? Paperclip;
                  return (
                    <li key={d.id} className="flex items-center gap-3 py-2.5">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-menta-50 text-menta-700"><Icono className="h-5 w-5" aria-hidden /></span>
                      <button type="button" onClick={() => abrirPrivado(d.url).catch((e) => avisar(mensajeError(e), 'error'))} className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-sm font-semibold hover:underline">{d.nombre}</span>
                        <span className="block text-xs text-tinta-500">{d.tipo_nombre} · {d.autor} · {fechaHora(d.fecha)}</span>
                      </button>
                      <button type="button" onClick={() => abrirPrivado(d.url)} className="grid h-9 w-9 place-items-center rounded-full text-tinta-500 hover:bg-tinta-50" aria-label={`Abrir ${d.nombre}`}><Download className="h-4 w-4" /></button>
                      {d.puede_borrar && <button type="button" onClick={() => quitar.mutate(d.id)} disabled={quitar.isPending} className="grid h-9 w-9 place-items-center rounded-full text-coral-600 hover:bg-coral-50 disabled:opacity-50" aria-label={`Quitar ${d.nombre}`}><Trash2 className="h-4 w-4" /></button>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section aria-label="Generados por el sistema">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-tinta-400">Generados por el sistema</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {q.data!.generados.map((g) => {
                const Icono = ICONO[g.tipo] ?? FileText;
                const accionable = !!(g.accion || g.url);
                return (
                  <li key={g.clave}>
                    <button type="button" disabled={!accionable} onClick={() => abrir(g)}
                      className={cls('flex h-full w-full items-start gap-3 rounded-xl p-3 text-left ring-1 ring-tinta-100 transition', accionable ? 'hover:bg-tinta-50 hover:ring-menta-500' : 'cursor-default')}>
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-tinta-50 text-tinta-600"><Icono className="h-4 w-4" aria-hidden /></span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold leading-tight">{g.titulo}</span>
                        <span className="block text-xs text-tinta-500">{[g.detalle, g.fecha && fechaHora(g.fecha)].filter(Boolean).join(' · ')}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
      <SubirDocumento abierto={subir} onCerrar={() => setSubir(false)} url={`/${origen}/pedidos/${pedidoId}/documentos`} folio={folio}
        alSubir={() => { qc.invalidateQueries({ queryKey: clave }); avisar('Documento agregado al expediente.'); }} />
    </Tarjeta>
  );
}

function SubirDocumento({ abierto, onCerrar, url, folio, alSubir }: { abierto: boolean; onCerrar: () => void; url: string; folio: string; alSubir: () => void }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('orden_compra');
  const m = useMutation({
    mutationFn: async () => post(url, { nombre: nombre.trim(), tipo, url: await subirArchivo(archivo!) }),
    onSuccess: () => { alSubir(); setArchivo(null); setNombre(''); onCerrar(); },
  });
  const elegir = (a: File | undefined) => {
    if (!a) return;
    setArchivo(a);
    if (!nombre.trim()) setNombre(a.name.replace(/\.\w+$/, '').replace(/[_-]+/g, ' ').slice(0, 160));
  };
  const valido = !!archivo && nombre.trim().length >= 3 && archivo.size <= 10_000_000;
  return (
    <Modal abierto={abierto} titulo="Adjuntar documento" sub={`Expediente de la solicitud ${folio}`} onCerrar={onCerrar}
      pie={<><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton icono={<Upload className="h-4 w-4" />} cargando={m.isPending} disabled={!valido} onClick={() => m.mutate()}>Adjuntar</Boton></>}>
      <div className="space-y-4">
        <button type="button" onClick={() => entrada.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); elegir(e.dataTransfer.files?.[0]); }}
          className={cls('flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition', archivo ? 'border-menta-500 bg-menta-50' : 'border-tinta-200 hover:border-menta-500')}>
          <Upload className="h-7 w-7 text-tinta-400" aria-hidden />
          {archivo ? <><span className="text-sm font-semibold">{archivo.name}</span><span className="text-xs text-tinta-500">{(archivo.size / 1024 / 1024).toFixed(2)} MB · toca para cambiarlo</span></>
            : <><span className="text-sm font-semibold">Elige o arrastra un PDF o una imagen</span><span className="text-xs text-tinta-500">PDF, JPG, PNG o WebP · máximo 10 MB</span></>}
        </button>
        {archivo && archivo.size > 10_000_000 && <p className="text-xs font-semibold text-coral-600">El archivo pesa más de 10 MB.</p>}
        <input ref={entrada} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" aria-label="Elegir documento" onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = ''; }} />
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <Campo etiqueta="Nombre del documento"><Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={160} placeholder="Ej. Orden de compra 4512" /></Campo>
          <Campo etiqueta="Tipo"><Selector value={tipo} onChange={(e) => setTipo(e.target.value)}>{TIPOS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</Selector></Campo>
        </div>
        <ErrorCaja error={m.error} />
      </div>
    </Modal>
  );
}
