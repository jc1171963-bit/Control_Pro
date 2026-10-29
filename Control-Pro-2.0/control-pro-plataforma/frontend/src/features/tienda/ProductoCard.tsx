import { Link } from 'react-router-dom';
import type { ProductoResumen } from '../../api/tipos';
import { cls, dinero } from '../../lib/formato';

export function ImagenProducto({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  return src ? (
    <img src={src} alt={alt} loading="lazy" className={cls('h-full w-full object-cover', className)} />
  ) : (
    <div className={cls('grid h-full w-full place-items-center bg-arena-200 text-xs text-tinta-400', className)}>Sin imagen</div>
  );
}

export default function ProductoCard({ p }: { p: ProductoResumen }) {
  const agotado = p.disponible === 0;
  const conDescuento = p.precio_desde && p.precio_base_desde && Number(p.precio_desde) < Number(p.precio_base_desde);
  return (
    <Link to={`/producto/${p.slug}`} className="group flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-arena-200 transition hover:-translate-y-0.5 hover:shadow-suave">
      <div className="relative aspect-square overflow-hidden bg-arena-100">
        <ImagenProducto src={p.imagen} alt={p.nombre} className="transition duration-500 group-hover:scale-[1.03]" />
        <div className="absolute left-3 top-3 flex flex-col gap-1">
          {p.en_promocion && <span className="rounded-full bg-coral-500 px-2 py-0.5 text-[11px] font-bold text-white">Promoción</span>}
          {agotado && <span className="rounded-full bg-tinta-900 px-2 py-0.5 text-[11px] font-bold text-white">Agotado</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-menta-700">{p.categoria.nombre}</span>
        <h3 className="font-display text-[15px] font-bold leading-snug text-tinta-900">{p.nombre}</h3>
        <div className="mt-auto flex items-end justify-between pt-3">
          <div>
            <span className="text-[11px] text-tinta-400">Desde</span>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-lg font-extrabold text-tinta-900">{dinero(p.precio_desde)}</span>
              {conDescuento && <span className="text-xs text-tinta-400 line-through">{dinero(p.precio_base_desde)}</span>}
            </div>
          </div>
          <div className="flex -space-x-1" aria-label="Colores">
            {p.colores.slice(0, 4).map(([n, h]) => <span key={n} title={n} className="h-4 w-4 rounded-full ring-2 ring-white" style={{ background: h }} />)}
          </div>
        </div>
        <p className="text-[11px] text-tinta-400">Tallas {p.tallas.slice(0, 5).join(' · ')}{p.tallas.length > 5 ? ' …' : ''}</p>
      </div>
    </Link>
  );
}
