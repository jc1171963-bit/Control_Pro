/**
 * Negociación de una solicitud aprobada y acuerdo de pago (antes de autorizarla). Lo usan la comercializadora (panel) y el
 * Gerente de compras (portal del aprobador), con lo que cada permiso permita:
 * - `pedido.negociar`: proponer o modificar (cada cambio es una versión), descartar, registrar el acuerdo y marcar el pago resuelto.
 * - `pedido.aceptar_propuesta`: aceptar la última versión de la propuesta pendiente.
 * El servidor valida cada acción; los botones solo reflejan lo que se puede hacer.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileSignature, Handshake, PencilLine, X } from 'lucide-react';
import { post } from '../../api/cliente';
import type { AcuerdoPago, PartidaPropuesta, Pedido, Propuesta } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { Aviso, Boton, Campo, Entrada, ErrorCaja, Estado, Modal, Tabla, Tarjeta, Td, Texto, useAviso } from '../../components/ui';
import { cls, dinero, fechaHora } from '../../lib/formato';
import EditarSolicitud from './EditarSolicitud';

const CAMBIO: Record<string, [string, string]> = {
  agregada: ['Agregada', 'bg-menta-50 text-menta-800'], eliminada: ['Eliminada', 'bg-coral-50 text-coral-700'],
  modificada: ['Modificada', 'bg-amber-50 text-amber-800'], sin_cambio: ['Sin cambio', 'bg-tinta-50 text-tinta-500'],
};

function Antes({ a, d, f = (x) => x }: { a?: string | number | null; d?: string | number | null; f?: (x: string) => string }) {
  const va = a == null ? null : f(String(a));
  const vd = d == null ? null : f(String(d));
  if (va === vd || va == null || vd == null) return <>{vd ?? <s className="text-tinta-400">{va}</s>}</>;
  return <><s className="text-tinta-400">{va}</s> → <b>{vd}</b></>;
}

export function Comparacion({ c }: { c: Propuesta['comparacion'] }) {
  const m = (x: string) => dinero(x);
  return (
    <>
      <Tabla columnas={['Cambio', 'Artículo', 'Empleado', 'Cantidad', 'Precio unitario', 'Descuento unitario', 'Importe']}>
        {c.filas.map((r, i) => {
          const x = (r.despues ?? r.antes) as PartidaPropuesta;
          const [txt, tono] = CAMBIO[r.cambio];
          return (
            <tr key={i} className={r.cambio === 'sin_cambio' ? 'text-tinta-500' : ''}>
              <Td><span className={cls('rounded-full px-2 py-0.5 text-[11px] font-semibold', tono)}>{txt}</span></Td>
              <Td><p className="font-semibold"><Antes a={r.antes && `${r.antes.nombre} · ${r.antes.talla}`} d={r.despues && `${r.despues.nombre} · ${r.despues.talla}`} /></p>
                <p className="text-xs text-tinta-400">{x.sku} · {x.color}{r.despues && ` · catálogo ${dinero(r.despues.precio_catalogo)}`}</p>
                {r.despues?.excepcion && <p className="mt-1 text-[11px] text-amber-700">Excepción: {r.despues.excepcion}</p>}</Td>
              <Td className="text-xs"><Antes a={r.antes?.empleado} d={r.despues?.empleado} /></Td>
              <Td><Antes a={r.antes?.cantidad} d={r.despues?.cantidad} /></Td>
              <Td className="text-xs"><Antes a={r.antes?.precio_unitario} d={r.despues?.precio_unitario} f={m} /></Td>
              <Td className="text-xs"><Antes a={r.antes?.descuento_unitario} d={r.despues?.descuento_unitario} f={m} /></Td>
              <Td className="text-xs"><Antes a={r.antes?.importe} d={r.despues?.importe} f={m} /></Td>
            </tr>
          );
        })}
      </Tabla>
      <dl className="ml-auto mt-3 grid max-w-md grid-cols-4 gap-x-3 gap-y-1 text-right text-sm">
        <dt className="text-left text-xs text-tinta-400" /> <dt className="text-xs text-tinta-400">Vigente</dt><dt className="text-xs text-tinta-400">Propuesta</dt><dt className="text-xs text-tinta-400">Diferencia</dt>
        {(['subtotal', 'descuento', 'total'] as const).map((k) => (
          <div key={k} className={cls('contents', k === 'total' && 'font-bold')}>
            <dd className="text-left capitalize">{k}</dd><dd>{dinero(c.antes[k])}</dd><dd>{dinero(c.despues[k])}</dd>
            <dd className={Number(c.diferencia[k]) < 0 ? 'text-coral-700' : Number(c.diferencia[k]) > 0 ? 'text-menta-700' : ''}>{Number(c.diferencia[k]) > 0 ? '+' : ''}{dinero(c.diferencia[k])}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function Versiones({ pr }: { pr: Propuesta }) {
  return (
    <ol className="mt-3 space-y-1 text-xs text-tinta-600">
      {pr.versiones.map((v) => <li key={v.id}><b>Versión {v.numero}</b> · {fechaHora(v.creado)} · {v.creado_por} · total {dinero(v.total)} — {v.nota}</li>)}
    </ol>
  );
}

export default function PanelNegociacion({ p }: { p: Pedido }) {
  const { puede } = useAuth();
  const qc = useQueryClient();
  const avisar = useAviso();
  const n = p.negociacion!;
  const abierta = p.estado === 'aprobado';
  const negocia = puede('pedido.negociar') && abierta;
  const acepta = puede('pedido.aceptar_propuesta') && abierta;
  const pend = n.pendiente;
  const vigente: AcuerdoPago | undefined = n.acuerdos[0];
  const resuelto = !!n.pago_resuelto?.vigente;
  const [editar, setEditar] = useState(false);
  const [modal, setModal] = useState<'aceptar' | 'descartar' | 'acuerdo' | null>(null);
  const [excepciones, setExcepciones] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [acuerdo, setAcuerdo] = useState({ forma: '', condiciones: '', fecha_pago: '', observaciones: '' });
  const listo = (r: Pedido, aviso: string) => { qc.setQueryData(['admin-pedido', String(p.id)], r); avisar(aviso); setModal(null); };
  const accion = useMutation({
    mutationFn: (que: 'aceptar' | 'descartar' | 'acuerdo' | 'resuelto') => {
      const url = `/admin/pedidos/${p.id}`;
      if (que === 'aceptar') return post<Pedido>(`${url}/propuestas/aceptar`, { version_id: pend!.version_actual.id, aceptar_excepciones: excepciones });
      if (que === 'descartar') return post<Pedido>(`${url}/propuestas/descartar`, { motivo });
      if (que === 'acuerdo') return post<Pedido>(`${url}/acuerdo-pago`, { ...acuerdo, observaciones: acuerdo.observaciones || null });
      return post<Pedido>(`${url}/pago-resuelto`, { acuerdo_id: n.acuerdo_vigente_id });
    },
    onSuccess: (r, que) => listo(r, { aceptar: 'Propuesta aceptada: las condiciones del pedido se actualizaron.', descartar: 'Propuesta descartada.',
      acuerdo: 'Acuerdo de pago registrado.', resuelto: 'Pago marcado como resuelto.' }[que]),
  });
  const abrir = (que: 'aceptar' | 'descartar' | 'acuerdo') => {
    accion.reset(); setExcepciones(false); setMotivo('');
    if (que === 'acuerdo') setAcuerdo(vigente ? { forma: vigente.forma, condiciones: vigente.condiciones, fecha_pago: vigente.fecha_pago, observaciones: vigente.observaciones ?? '' }
      : { forma: '', condiciones: '', fecha_pago: '', observaciones: '' });
    setModal(que);
  };
  const conExcepciones = !!pend?.comparacion.filas.some((f) => f.despues?.excepcion && f.cambio !== 'sin_cambio');
  const historial = n.propuestas;
  if (!abierta && !pend && !historial.length && !n.acuerdos.length) return null;

  return (
    <Tarjeta titulo={<span className="flex items-center gap-2"><Handshake className="h-4 w-4" aria-hidden />Negociación y pago</span>}
      sub="Las propuestas no cambian el pedido hasta que el Gerente de compras las acepta. Aceptar no autoriza ni resuelve el pago."
      accion={negocia && !pend ? <Boton tam="sm" variante="secundario" icono={<PencilLine className="h-3.5 w-3.5" />} onClick={() => setEditar(true)}>Proponer cambios</Boton> : undefined}>
      <div className="space-y-5">
        {pend ? (
          <section aria-label="Propuesta pendiente" className="rounded-xl p-4 ring-1 ring-amber-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">Propuesta {pend.numero} · versión {pend.version_actual.numero} <Estado valor="pendiente" className="ml-1" /></p>
              <div className="flex flex-wrap gap-2">
                {negocia && <Boton tam="sm" variante="secundario" icono={<PencilLine className="h-3.5 w-3.5" />} onClick={() => setEditar(true)}>Modificar</Boton>}
                {negocia && <Boton tam="sm" variante="fantasma" icono={<X className="h-3.5 w-3.5" />} onClick={() => abrir('descartar')}>Descartar</Boton>}
                {acepta && <Boton tam="sm" variante="menta" icono={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => abrir('aceptar')}>Aceptar propuesta</Boton>}
              </div>
            </div>
            <p className="mb-3 mt-1 text-sm text-tinta-600">{pend.versiones[pend.versiones.length - 1]?.nota}</p>
            <Comparacion c={pend.comparacion} />
            <Versiones pr={pend} />
          </section>
        ) : abierta && <p className="text-sm text-tinta-500">Sin propuesta pendiente. {negocia ? 'Si acordaron cambios con el Gerente de compras, regístralos con «Proponer cambios».' : 'La comercializadora puede proponer cambios antes de autorizar.'}</p>}

        {!!historial.length && (
          <details className="rounded-xl p-3 ring-1 ring-tinta-100">
            <summary className="cursor-pointer text-sm font-semibold">Propuestas anteriores ({historial.length})</summary>
            <div className="mt-3 space-y-4">
              {historial.map((pr) => (
                <div key={pr.id}>
                  <p className="text-sm"><b>Propuesta {pr.numero}</b> <Estado valor={pr.estado} className="ml-1" />
                    {pr.aceptada_en && <span className="text-xs text-tinta-500"> · aceptada {fechaHora(pr.aceptada_en)} por {pr.aceptada_por}</span>}
                    {pr.motivo_descarte && <span className="text-xs text-tinta-500"> · {pr.motivo_descarte}</span>}</p>
                  <Comparacion c={pr.comparacion} />
                  <Versiones pr={pr} />
                </div>
              ))}
            </div>
          </details>
        )}

        <section aria-label="Acuerdo de pago" className="rounded-xl p-4 ring-1 ring-tinta-100">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-semibold"><FileSignature className="h-4 w-4" aria-hidden />Acuerdo de pago
              {vigente && <span className={cls('rounded-full px-2 py-0.5 text-[11px] font-semibold', resuelto ? 'bg-menta-50 text-menta-800' : 'bg-amber-50 text-amber-800')}>
                {resuelto ? 'Pago resuelto' : 'Pago sin resolver'}</span>}</p>
            <div className="flex flex-wrap gap-2">
              {negocia && <Boton tam="sm" variante="secundario" onClick={() => abrir('acuerdo')}>{vigente ? 'Actualizar acuerdo' : 'Registrar acuerdo'}</Boton>}
              {negocia && vigente && !resuelto && <Boton tam="sm" variante="menta" cargando={accion.isPending && accion.variables === 'resuelto'} disabled={!!pend}
                onClick={() => accion.mutate('resuelto')}>Marcar pago resuelto</Boton>}
            </div>
          </div>
          {!modal && <ErrorCaja error={accion.error} />}
          {vigente ? (
            <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[140px_1fr]">
              <dt className="text-tinta-500">Forma de pago</dt><dd>{vigente.forma}</dd>
              <dt className="text-tinta-500">Condiciones</dt><dd className="whitespace-pre-line">{vigente.condiciones}</dd>
              <dt className="text-tinta-500">Fecha de pago</dt><dd>{new Date(`${vigente.fecha_pago}T12:00:00`).toLocaleDateString('es-MX')}</dd>
              {vigente.observaciones && <><dt className="text-tinta-500">Observaciones</dt><dd>{vigente.observaciones}</dd></>}
              <dt className="text-tinta-500">Registrado</dt><dd className="text-xs">Versión {vigente.version} · {fechaHora(vigente.creado)} · {vigente.registrado_por}</dd>
            </dl>
          ) : <p className="mt-2 text-sm text-tinta-500">Aún no hay acuerdo de pago. Se necesita, marcado como resuelto, para autorizar la solicitud.</p>}
          {pend && negocia && vigente && !resuelto && <p className="mt-2 text-xs text-amber-700">Acepta o descarta la propuesta pendiente antes de resolver el pago.</p>}
          {n.pago_resuelto && !resuelto && <p className="mt-2 text-xs text-amber-700">El pago se había marcado como resuelto, pero el acuerdo o las condiciones cambiaron después: hay que volver a resolverlo.</p>}
          {n.acuerdos.length > 1 && (
            <details className="mt-3 text-xs text-tinta-600"><summary className="cursor-pointer font-semibold">Versiones anteriores del acuerdo ({n.acuerdos.length - 1})</summary>
              <ol className="mt-2 space-y-1">{n.acuerdos.slice(1).map((a) => <li key={a.id}>Versión {a.version} · {fechaHora(a.creado)} · {a.forma}, pago el {a.fecha_pago} — {a.condiciones}</li>)}</ol>
            </details>
          )}
          <p className="mt-3 text-xs text-tinta-500">Adjunta los documentos del pago en el expediente con el tipo «Documento de pago»: los ve el Gerente de compras, no la sucursal.</p>
        </section>
      </div>

      {editar && <EditarSolicitud p={p} abierto={editar} onCerrar={() => setEditar(false)} modo="propuesta" />}
      <Modal abierto={modal !== null} titulo={{ aceptar: 'Aceptar propuesta', descartar: 'Descartar propuesta', acuerdo: 'Acuerdo de pago' }[modal ?? 'aceptar']} onCerrar={() => setModal(null)}>
        <div className="space-y-4">
          {modal === 'aceptar' && <>
            <p className="text-sm text-tinta-600">Las condiciones del pedido pasarán a ser las de la versión {pend?.version_actual.numero} ({dinero(pend?.comparacion.despues.total ?? '0')}). Aceptar no autoriza el pedido ni resuelve el pago.</p>
            {conExcepciones && <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><input type="checkbox" checked={excepciones} onChange={(e) => setExcepciones(e.target.checked)} className="mt-1" />Autorizo los artículos fuera de la regla por puesto incluidos en la propuesta.</label>}
          </>}
          {modal === 'descartar' && <Campo etiqueta="Motivo" ayuda="Mínimo 5 caracteres; queda en el historial."><Texto value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} /></Campo>}
          {modal === 'acuerdo' && <>
            {vigente && <Aviso>Guardar crea una versión nueva del acuerdo; si el pago ya estaba resuelto, habrá que volver a marcarlo.</Aviso>}
            <Campo etiqueta="Forma de pago"><Entrada value={acuerdo.forma} maxLength={120} onChange={(e) => setAcuerdo({ ...acuerdo, forma: e.target.value })} placeholder="Transferencia, cheque, crédito…" /></Campo>
            <Campo etiqueta="Condiciones"><Texto value={acuerdo.condiciones} maxLength={1000} onChange={(e) => setAcuerdo({ ...acuerdo, condiciones: e.target.value })} /></Campo>
            <Campo etiqueta="Fecha comprometida de pago"><Entrada type="date" value={acuerdo.fecha_pago} onChange={(e) => setAcuerdo({ ...acuerdo, fecha_pago: e.target.value })} /></Campo>
            <Campo etiqueta="Observaciones (opcional)"><Texto value={acuerdo.observaciones} maxLength={1000} onChange={(e) => setAcuerdo({ ...acuerdo, observaciones: e.target.value })} /></Campo>
          </>}
          <ErrorCaja error={accion.error} />
          <div className="flex justify-end gap-2">
            <Boton variante="secundario" onClick={() => setModal(null)}>Cancelar</Boton>
            <Boton cargando={accion.isPending} onClick={() => modal && accion.mutate(modal)}
              disabled={(modal === 'aceptar' && conExcepciones && !excepciones) || (modal === 'descartar' && motivo.trim().length < 5)
                || (modal === 'acuerdo' && (acuerdo.forma.trim().length < 2 || acuerdo.condiciones.trim().length < 2 || !acuerdo.fecha_pago))}>
              {{ aceptar: 'Aceptar propuesta', descartar: 'Descartar', acuerdo: 'Guardar acuerdo' }[modal ?? 'aceptar']}</Boton>
          </div>
        </div>
      </Modal>
    </Tarjeta>
  );
}
