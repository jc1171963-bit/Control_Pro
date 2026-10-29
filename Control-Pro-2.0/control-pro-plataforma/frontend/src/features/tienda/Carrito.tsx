import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { del, patch } from '../../api/cliente';
import { useAuth } from '../../app/auth';
import { Aviso, Boton, Cargando, ErrorCaja, useAviso, Vacio } from '../../components/ui';
import { dinero, mensajeError } from '../../lib/formato';
import { ImagenProducto } from './ProductoCard';
import { useCarrito } from './TiendaLayout';

export default function Carrito() {
  const { tipo } = useAuth();
  const q = useCarrito();
  const qc = useQueryClient();
  const avisar = useAviso();
  const cambiar = useMutation({
    mutationFn: ({ id, cantidad }: { id: number; cantidad: number }) => patch(`/cuenta/carrito/items/${id}`, { cantidad }),
    onSuccess: (d) => qc.setQueryData(['carrito'], d), onError: (e) => avisar(mensajeError(e), 'error'),
  });
  const quitar = useMutation({ mutationFn: (id: number) => del(`/cuenta/carrito/items/${id}`), onSuccess: (d) => qc.setQueryData(['carrito'], d) });

  if (tipo !== 'cliente') {
    return <div className="contenedor py-16"><Vacio titulo="Inicia sesión para ver tu carrito" texto="Guardamos tu carrito en tu cuenta para que lo veas desde cualquier dispositivo."
      accion={<Link to="/entrar?siguiente=/carrito" className="mt-2 rounded-full bg-tinta-900 px-5 py-2 text-sm font-semibold text-white">Entrar</Link>} /></div>;
  }
  if (q.isLoading) return <Cargando />;
  const c = q.data;
  if (!c || c.items.length === 0) {
    return <div className="contenedor py-16"><Vacio titulo="Tu carrito está vacío" texto="Explora el catálogo y agrega uniformes por talla y color."
      accion={<Link to="/catalogo" className="mt-2 rounded-full bg-tinta-900 px-5 py-2 text-sm font-semibold text-white">Ir al catálogo</Link>} /></div>;
  }
  const faltaEnvioGratis = Number(c.envio_gratis_desde) - (Number(c.totales.subtotal) - Number(c.totales.descuento));
  const bloqueado = c.items.some((i) => !i.activo || i.cantidad > i.disponible);

  return (
    <div className="contenedor py-8">
      <h1 className="mb-6 font-display text-3xl font-extrabold tracking-tight">Tu carrito</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {c.avisos.map((a) => <Aviso key={a} tipo="alerta">{a}</Aviso>)}
          <ErrorCaja error={q.error} />
          {c.items.map((i) => (
            <article key={i.id} className="flex gap-4 rounded-2xl bg-white p-3 ring-1 ring-arena-200 sm:p-4">
              <Link to={`/producto/${i.slug}`} className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-arena-100 sm:h-28 sm:w-28"><ImagenProducto src={i.imagen} alt={i.producto} /></Link>
              <div className="flex flex-1 flex-col">
                <div className="flex justify-between gap-2">
                  <div>
                    <Link to={`/producto/${i.slug}`} className="font-display font-bold hover:underline">{i.producto}</Link>
                    <p className="text-xs text-tinta-400">{i.sku}</p>
                    <p className="mt-1 flex items-center gap-2 text-sm text-tinta-600"><span className="h-3 w-3 rounded-full ring-1 ring-tinta-200" style={{ background: i.color_hex }} />{i.color} · Talla {i.talla}</p>
                    {i.promocion && <p className="mt-1 text-xs font-semibold text-coral-600">{i.promocion}</p>}
                  </div>
                  <p className="font-display font-extrabold">{dinero(i.importe)}</p>
                </div>
                <div className="mt-auto flex items-center justify-between pt-2">
                  <div className="flex h-9 items-center rounded-lg ring-1 ring-arena-300">
                    <button className="px-2.5 disabled:opacity-30" disabled={i.cantidad <= 1 || cambiar.isPending} onClick={() => cambiar.mutate({ id: i.id, cantidad: i.cantidad - 1 })} aria-label="Menos"><Minus className="h-3.5 w-3.5" /></button>
                    <span className="w-8 text-center text-sm font-bold">{i.cantidad}</span>
                    <button className="px-2.5 disabled:opacity-30" disabled={i.cantidad >= i.disponible || cambiar.isPending} onClick={() => cambiar.mutate({ id: i.id, cantidad: i.cantidad + 1 })} aria-label="Más"><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                  <span className="text-xs text-tinta-400">{dinero(Number(i.precio) - Number(i.descuento))} c/u · {i.disponible} disp.</span>
                  <button onClick={() => quitar.mutate(i.id)} className="rounded-lg p-2 text-tinta-400 hover:bg-coral-50 hover:text-coral-600" aria-label="Quitar"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
        <aside className="h-fit rounded-2xl bg-white p-5 ring-1 ring-arena-200 lg:sticky lg:top-32">
          <h2 className="font-display text-lg font-bold">Resumen</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt>Subtotal ({c.articulos} artículos)</dt><dd>{dinero(c.totales.subtotal)}</dd></div>
            {Number(c.totales.descuento) > 0 && <div className="flex justify-between text-coral-600"><dt>Descuentos</dt><dd>−{dinero(c.totales.descuento)}</dd></div>}
            <div className="flex justify-between"><dt>Envío a domicilio</dt><dd>{Number(c.totales.costo_envio) ? dinero(c.totales.costo_envio) : 'Sin costo'}</dd></div>
            <div className="flex justify-between border-t border-arena-200 pt-3 font-display text-lg font-extrabold"><dt>Total</dt><dd>{dinero(c.totales.total)}</dd></div>
            <p className="text-xs text-tinta-400">Incluye IVA de {dinero(c.totales.impuestos)}. Si recoges en sucursal, el envío no tiene costo.</p>
          </dl>
          {faltaEnvioGratis > 0 && <p className="mt-4 rounded-xl bg-menta-50 p-3 text-xs font-semibold text-menta-800">Te faltan {dinero(faltaEnvioGratis)} para envío sin costo.</p>}
          <Link to={bloqueado ? '#' : '/checkout'} aria-disabled={bloqueado}
            className={`mt-5 flex h-12 items-center justify-center gap-2 rounded-xl font-semibold text-white ${bloqueado ? 'pointer-events-none bg-tinta-300' : 'bg-menta-500 hover:bg-menta-600'}`}>
            <ShoppingBag className="h-5 w-5" />Continuar con la compra
          </Link>
          {bloqueado && <p className="mt-2 text-xs text-coral-600">Ajusta las cantidades marcadas para continuar.</p>}
          <p className="mt-3 text-center text-xs text-tinta-400">Las piezas se apartan cuando confirmas el pedido, por {c.reserva_horas} h si pagas por transferencia.</p>
          <Boton variante="fantasma" tam="sm" className="mt-2 w-full" onClick={() => history.back()}>Seguir comprando</Boton>
        </aside>
      </div>
    </div>
  );
}
