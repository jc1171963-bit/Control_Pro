import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Check, CreditCard, Home, Landmark, Store } from 'lucide-react';
import { claveIdempotencia, get, post } from '../../api/cliente';
import type { Direccion, Pedido, Sucursal } from '../../api/tipos';
import { Aviso, Boton, Cargando, ErrorCaja, Texto } from '../../components/ui';
import { cls, dinero } from '../../lib/formato';
import { FormDireccion } from '../cuenta/Direcciones';
import { useCarrito } from './TiendaLayout';

const PASOS = ['Entrega', 'Pago', 'Revisión'];

function Opcion({ activo, onClick, icono, titulo, texto, deshabilitado }: { activo: boolean; onClick: () => void; icono: React.ReactNode; titulo: string; texto: string; deshabilitado?: boolean }) {
  return (
    <button type="button" disabled={deshabilitado} onClick={onClick}
      className={cls('flex w-full items-start gap-3 rounded-2xl bg-white p-4 text-left ring-2 transition', activo ? 'ring-menta-500' : 'ring-arena-200 hover:ring-arena-300', deshabilitado && 'cursor-not-allowed opacity-50')}>
      <span className={cls('grid h-10 w-10 shrink-0 place-items-center rounded-xl', activo ? 'bg-menta-500 text-white' : 'bg-arena-100 text-tinta-600')}>{icono}</span>
      <span><span className="block font-display font-bold">{titulo}</span><span className="text-sm text-tinta-500">{texto}</span></span>
      {activo && <Check className="ml-auto h-5 w-5 text-menta-600" />}
    </button>
  );
}

export default function Checkout() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const carrito = useCarrito();
  const dirs = useQuery({ queryKey: ['direcciones'], queryFn: () => get<Direccion[]>('/cuenta/direcciones') });
  const sucs = useQuery({ queryKey: ['sucursales-publicas'], queryFn: () => get<Sucursal[]>('/tienda/sucursales') });
  const [paso, setPaso] = useState(0);
  const [modalidad, setModalidad] = useState<'envio' | 'recoger'>('envio');
  const [direccion, setDireccion] = useState<number | null>(null);
  const [sucursal, setSucursal] = useState<number | null>(null);
  const [metodo, setMetodo] = useState<'transferencia' | 'efectivo'>('transferencia');
  const [notas, setNotas] = useState('');
  const [nuevaDir, setNuevaDir] = useState(false);
  const [clave] = useState(() => claveIdempotencia('checkout'));

  const dirSel = direccion ?? dirs.data?.find((d) => d.predeterminada)?.id ?? dirs.data?.[0]?.id ?? null;
  const confirmar = useMutation({
    mutationFn: () => post<Pedido>('/cuenta/checkout', {
      modalidad, metodo_pago: metodo, clave_idempotencia: clave, notas: notas || null,
      ...(modalidad === 'envio' ? { direccion_id: dirSel } : { sucursal_id: sucursal }),
    }),
    onSuccess: (p) => { qc.invalidateQueries({ queryKey: ['carrito'] }); nav(`/cuenta/pedidos/${p.id}?nuevo=1`, { replace: true }); },
  });

  if (carrito.isLoading || dirs.isLoading) return <Cargando />;
  if (!carrito.data?.items.length) return <div className="contenedor py-16 text-center"><p>Tu carrito está vacío.</p><Link to="/catalogo" className="font-semibold text-menta-700">Ir al catálogo</Link></div>;
  const c = carrito.data;
  const listoEntrega = modalidad === 'envio' ? !!dirSel : !!sucursal;
  const envio = modalidad === 'recoger' ? 0 : Number(c.totales.costo_envio);
  const totalEstimado = Number(c.totales.subtotal) - Number(c.totales.descuento) + envio;

  return (
    <div className="contenedor max-w-5xl py-8">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Finalizar compra</h1>
      <ol className="mt-5 flex gap-2 text-sm font-semibold" aria-label="Pasos">
        {PASOS.map((p, i) => (
          <li key={p} className={cls('flex flex-1 items-center gap-2 rounded-full px-3 py-2', i === paso ? 'bg-tinta-900 text-white' : i < paso ? 'bg-menta-100 text-menta-800' : 'bg-white text-tinta-400 ring-1 ring-arena-200')}>
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white/20 text-xs">{i < paso ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>{p}
          </li>
        ))}
      </ol>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {paso === 0 && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Opcion activo={modalidad === 'envio'} onClick={() => { setModalidad('envio'); setMetodo('transferencia'); }} icono={<Home className="h-5 w-5" />} titulo="Envío a domicilio" texto="Surtimos desde la sucursal de tu zona." />
                <Opcion activo={modalidad === 'recoger'} onClick={() => setModalidad('recoger')} icono={<Store className="h-5 w-5" />} titulo="Recoger en sucursal" texto="Sin costo de envío; paga ahí en efectivo." />
              </div>
              {modalidad === 'envio' ? (
                <div className="space-y-2">
                  <p className="font-display font-bold">¿A dónde lo enviamos?</p>
                  {dirs.data?.map((d) => (
                    <label key={d.id} className={cls('flex cursor-pointer gap-3 rounded-2xl bg-white p-4 ring-2', dirSel === d.id ? 'ring-menta-500' : 'ring-arena-200')}>
                      <input type="radio" name="dir" checked={dirSel === d.id} onChange={() => setDireccion(d.id)} className="mt-1 accent-menta-500" />
                      <span className="text-sm"><span className="font-bold">{d.alias}</span> · {d.destinatario}<br />{d.calle} {d.numero}, {d.colonia}, {d.ciudad}, {d.estado} · CP {d.cp}</span>
                    </label>
                  ))}
                  {nuevaDir ? (
                    <div className="rounded-2xl bg-white p-4 ring-1 ring-arena-200">
                      <FormDireccion onGuardada={(d) => { setDireccion(d.id); setNuevaDir(false); qc.invalidateQueries({ queryKey: ['direcciones'] }); }} onCancelar={() => setNuevaDir(false)} />
                    </div>
                  ) : <Boton variante="secundario" onClick={() => setNuevaDir(true)}>Agregar dirección</Boton>}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="font-display font-bold">Elige la sucursal</p>
                  {sucs.data?.filter((s) => s.permite_recoger).map((s) => (
                    <label key={s.id} className={cls('flex cursor-pointer gap-3 rounded-2xl bg-white p-4 ring-2', sucursal === s.id ? 'ring-menta-500' : 'ring-arena-200')}>
                      <input type="radio" name="suc" checked={sucursal === s.id} onChange={() => setSucursal(s.id)} className="mt-1 accent-menta-500" />
                      <span className="text-sm"><span className="font-bold">{s.nombre}</span><br />{s.direccion}, {s.ciudad} · {Object.entries(s.horario || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}</span>
                    </label>
                  ))}
                  <p className="text-xs text-tinta-400">Al recoger, todo el pedido debe estar disponible en esa sucursal; si falta algo te lo indicaremos al confirmar.</p>
                </div>
              )}
              <div className="flex justify-end"><Boton disabled={!listoEntrega} onClick={() => setPaso(1)}>Continuar al pago</Boton></div>
            </>
          )}

          {paso === 1 && (
            <>
              <Opcion activo={metodo === 'transferencia'} onClick={() => setMetodo('transferencia')} icono={<Landmark className="h-5 w-5" />} titulo="Transferencia bancaria (SPEI)"
                texto="Al confirmar te damos los datos. Registra la referencia y Finanzas la valida antes de preparar tu pedido." />
              <Opcion activo={metodo === 'efectivo'} deshabilitado={modalidad !== 'recoger'} onClick={() => setMetodo('efectivo')} icono={<Banknote className="h-5 w-5" />} titulo="Efectivo en sucursal"
                texto={modalidad === 'recoger' ? 'Paga en caja; tu pedido se prepara en cuanto se registra el cobro.' : 'Disponible solo si recoges en sucursal.'} />
              <Opcion activo={false} deshabilitado onClick={() => undefined} icono={<CreditCard className="h-5 w-5" />} titulo="Tarjeta de crédito o débito"
                texto="Aún no disponible: requiere integrar una pasarela de pago certificada." />
              <div className="flex justify-between"><Boton variante="secundario" onClick={() => setPaso(0)}>Atrás</Boton><Boton onClick={() => setPaso(2)}>Revisar pedido</Boton></div>
            </>
          )}

          {paso === 2 && (
            <>
              <div className="rounded-2xl bg-white p-4 ring-1 ring-arena-200">
                <p className="mb-2 font-display font-bold">Artículos</p>
                <ul className="divide-y divide-arena-200 text-sm">
                  {c.items.map((i) => (
                    <li key={i.id} className="flex justify-between py-2"><span>{i.cantidad} × {i.producto} <span className="text-tinta-400">({i.color}, {i.talla})</span></span><span className="font-semibold">{dinero(i.importe)}</span></li>
                  ))}
                </ul>
              </div>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-2xl bg-white p-4 ring-1 ring-arena-200"><p className="font-bold">Entrega</p>
                  {modalidad === 'envio' ? (() => { const d = dirs.data?.find((x) => x.id === dirSel); return d && <p>{d.calle} {d.numero}, {d.colonia}, {d.ciudad} · CP {d.cp}</p>; })()
                    : <p>Recoger en {sucs.data?.find((s) => s.id === sucursal)?.nombre}</p>}
                </div>
                <div className="rounded-2xl bg-white p-4 ring-1 ring-arena-200"><p className="font-bold">Pago</p><p>{metodo === 'transferencia' ? 'Transferencia bancaria' : 'Efectivo en sucursal'}</p></div>
              </div>
              <label className="block text-sm font-semibold">Notas para tu pedido (opcional)<Texto value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} className="mt-1" /></label>
              <Aviso>Al confirmar, apartamos las piezas. {metodo === 'transferencia' ? `Si no registras tu pago en ${c.reserva_horas} h, la reserva se libera.` : 'Pasa a pagar a la sucursal elegida.'} El total final lo calcula el sistema con las promociones vigentes.</Aviso>
              <ErrorCaja error={confirmar.error} />
              <div className="flex justify-between"><Boton variante="secundario" onClick={() => setPaso(1)}>Atrás</Boton>
                <Boton variante="menta" tam="lg" cargando={confirmar.isPending} onClick={() => confirmar.mutate()}>Confirmar pedido</Boton></div>
            </>
          )}
        </div>

        <aside className="h-fit rounded-2xl bg-white p-5 ring-1 ring-arena-200">
          <p className="font-display font-bold">Resumen</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{dinero(c.totales.subtotal)}</dd></div>
            {Number(c.totales.descuento) > 0 && <div className="flex justify-between text-coral-600"><dt>Descuentos</dt><dd>−{dinero(c.totales.descuento)}</dd></div>}
            <div className="flex justify-between"><dt>Envío</dt><dd>{envio ? dinero(envio) : 'Sin costo'}</dd></div>
            <div className="flex justify-between border-t border-arena-200 pt-2 font-display text-lg font-extrabold"><dt>Total estimado</dt><dd>{dinero(totalEstimado)}</dd></div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
