import { Link } from 'react-router-dom';
import { Rotate3d } from 'lucide-react';
import type { ProductoResumen } from '../../api/tipos';
import { useConfig } from '../../app/config';
import { cls, dinero } from '../../lib/formato';

// Compartido con el carrito y el portal de sucursales: no cambiar su aspecto sin revisar esos usos.
export function ImagenProducto({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  return src ? (
    <img src={src} alt={alt} loading="lazy" className={cls('h-full w-full object-cover', className)} />
  ) : (
    <div className={cls('grid h-full w-full place-items-center bg-arena-200 text-xs text-tinta-400', className)}>Sin imagen</div>
  );
}

export default function ProductoCard({ p, orden = 0 }: { p: ProductoResumen; orden?: number }) {
  const { canalTienda } = useConfig();
  const agotado = p.disponible === 0;
  const conDescuento = p.precio_desde && p.precio_base_desde && Number(p.precio_desde) < Number(p.precio_base_desde);
  return (
    <Link to={`/producto/${p.slug}`} style={{ animationDelay: `${Math.min(orden, 12) * 45}ms` }}
      className="group flex animate-aparecer flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-lurima-100 transition duration-300 hover:-translate-y-1 hover:shadow-suave hover:ring-lurima-200">
      <div className="relative aspect-square overflow-hidden bg-lurima-50">
        <ImagenProducto src={p.imagen} alt={p.nombre} className="transition duration-500 group-hover:scale-[1.03]" />
        <div className="absolute left-3 top-3 flex flex-col gap-1">
          {canalTienda && p.en_promocion && <span className="rounded-full bg-coral-500 px-2 py-0.5 text-[11px] font-bold text-white">Promoción</span>}
          {canalTienda && agotado && <span className="rounded-full bg-lurima-900 px-2 py-0.5 text-[11px] font-bold text-white">Agotado</span>}
          {p.giro_360 && <span className="flex items-center gap-1 self-start rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold text-lurima-800 ring-1 ring-lurima-100"><Rotate3d className="h-3 w-3 text-bienestar-600" />360°</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-bienestar-700">{p.categoria.nombre}</span>
        <h3 className="font-display text-[15px] font-bold leading-snug text-lurima-900">{p.nombre}</h3>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          {canalTienda ? (
            <div>
              <span className="text-[11px] text-tinta-500">Desde</span>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-lg font-extrabold text-lurima-900">{dinero(p.precio_desde)}</span>
                {conDescuento && <span className="text-xs text-tinta-500 line-through">{dinero(p.precio_base_desde)}</span>}
              </div>
            </div>
          ) : <span className="text-xs font-semibold text-bienestar-700 transition group-hover:translate-x-0.5">Ver detalle →</span>}
          {p.colores.length > 0 && (
            <div className="flex -space-x-1">
              {p.colores.slice(0, 4).map(([n, h]) => <span key={n} title={n} aria-hidden className="h-4 w-4 rounded-full ring-2 ring-white" style={{ background: h }} />)}
              <span className="sr-only">Colores: {p.colores.map(([n]) => n).join(', ')}</span>
            </div>
          )}
        </div>
        <p className="text-[11px] text-tinta-500">Tallas {p.tallas.slice(0, 5).join(' · ')}{p.tallas.length > 5 ? ' …' : ''}</p>
      </div>
    </Link>
  );
}
