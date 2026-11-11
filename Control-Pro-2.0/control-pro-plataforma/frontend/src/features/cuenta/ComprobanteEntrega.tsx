/**
 * Comprobante de una entrega individual: artículos recibidos, quién entregó, fecha, firma del empleado y su
 * conformidad. Lo usan la sucursal (`/cuenta/entregas/:id`) y el personal interno (`/admin/entregas/:id`).
 */
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { get } from '../../api/cliente';
import type { EntregaIndividual } from '../../api/tipos';
import { Boton, ErrorCaja, Estado, Modal } from '../../components/ui';
import { Esqueleto } from '../../components/movimiento';
import { fechaHora } from '../../lib/formato';

export default function ComprobanteEntrega({ entregaId, origen, folio, onCerrar }: {
  entregaId: number | null; origen: 'cuenta' | 'admin'; folio?: string; onCerrar: () => void;
}) {
  const q = useQuery({ queryKey: ['comprobante', origen, entregaId], enabled: entregaId != null,
    queryFn: () => get<EntregaIndividual>(`/${origen}/entregas/${entregaId}`) });
  const e = q.data;
  return (
    <Modal abierto={entregaId != null} titulo="Comprobante de entrega" onCerrar={onCerrar} ancho="max-w-xl">
      <ErrorCaja error={q.error} />
      {q.isLoading || !e ? <div className="space-y-3"><Esqueleto className="h-16" /><Esqueleto className="h-40" /></div> : (
        <div className="space-y-4 text-sm" id="comprobante-entrega">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-display text-lg font-bold">{e.empleado.nombre}</p>
              <p className="text-xs text-tinta-500">{e.empleado.puesto} · No. {e.empleado.numero}{folio ? ` · Solicitud ${folio}` : ''}</p>
            </div>
            <Estado valor={e.estado} />
          </div>

          <table className="w-full text-xs">
            <thead><tr className="border-b border-tinta-100 text-left text-[11px] uppercase text-tinta-400"><th className="py-1.5">Artículo</th><th className="py-1.5">Talla</th><th className="py-1.5 text-right">Entregadas</th></tr></thead>
            <tbody className="divide-y divide-tinta-100">
              {e.detalles.map((d) => (
                <tr key={d.pedido_detalle_id}><td className="py-1.5">{d.nombre}<span className="block text-tinta-400">{d.sku}</span></td><td className="py-1.5">{d.talla}</td>
                  <td className={d.entregada < d.esperada ? 'py-1.5 text-right font-semibold text-coral-600' : 'py-1.5 text-right font-semibold'}>{d.entregada} de {d.esperada}</td></tr>
              ))}
            </tbody>
          </table>

          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div><dt className="text-tinta-400">Entregó</dt><dd className="font-semibold">{e.registrado_por || '—'}</dd></div>
            <div><dt className="text-tinta-400">Fecha y hora</dt><dd className="font-semibold">{fechaHora(e.entregado_en)}</dd></div>
            {e.observaciones && <div className="col-span-2"><dt className="text-tinta-400">Observaciones de la entrega</dt><dd>{e.observaciones}</dd></div>}
          </dl>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-tinta-400">Firma de recibido</p>
            {e.firma ? (
              <div className="rounded-xl border-2 border-dashed border-tinta-200 bg-white p-2">
                <img src={e.firma} alt={`Firma de ${e.empleado.nombre}`} className="mx-auto max-h-44 w-full object-contain" />
                <p className="mt-1 border-t border-tinta-200 pt-1 text-center text-xs text-tinta-500">{e.empleado.nombre}</p>
              </div>
            ) : <p className="text-xs text-tinta-400">Aún no se registra la entrega.</p>}
          </div>

          <div className="rounded-xl bg-arena-50 p-3 text-xs">
            <p className="font-semibold">Conformidad del empleado</p>
            {e.conformidad_en ? (
              <>
                <p className="mt-1 text-base text-amber-500">{'★'.repeat(e.valoracion || 0)}<span className="text-tinta-200">{'★'.repeat(5 - (e.valoracion || 0))}</span></p>
                <p className="text-tinta-500">Registrada el {fechaHora(e.conformidad_en)}</p>
                {e.conformidad_comentario && <p className="mt-1">“{e.conformidad_comentario}”</p>}
              </>
            ) : <p className="mt-1 text-tinta-400">Pendiente de registrar.</p>}
          </div>

          <div className="flex justify-end gap-2 print:hidden">
            <Boton variante="secundario" icono={<Printer className="h-4 w-4" />} onClick={() => window.print()}>Imprimir</Boton>
            <Boton onClick={onCerrar}>Cerrar</Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
