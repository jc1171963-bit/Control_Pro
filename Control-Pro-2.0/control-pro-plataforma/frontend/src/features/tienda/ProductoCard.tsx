import { Link } from 'react-router-dom';
import { ArrowUpRight, ImageOff, Rotate3d } from 'lucide-react';
import type { ProductoResumen } from '../../api/tipos';
import { useConfig } from '../../app/config';
import { useContextoCatalogo } from './contextoCatalogo';
import { cls, dinero } from '../../lib/formato';
import { fotoIlustrativa } from '../../lib/fotosIlustrativas';

// Compartido con el carrito y el portal de sucursales: no cambiar su aspecto sin revisar esos usos.
// Las ilustraciones SVG del seed se sustituyen por fotos de stock ilustrativas (ver lib/fotosIlustrativas.ts).
export function ImagenProducto({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const url = fotoIlustrativa(src) ?? src;
  return url ? (
    <img src={url} alt={alt} loading="lazy" decoding="async" width={800} height={800} className={cls('h-full w-full object-cover', className)} />
  ) : (
    <div className={cls('grid h-full w-full place-items-center bg-lurima-50 text-xs text-tinta-500', className)}>
      <span className="flex flex-col items-center gap-1"><ImageOff className="h-6 w-6 text-lurima-300" aria-hidden />Sin imagen</span>
    </div>
  );
}

export default function ProductoCard({ p, orden = 0 }: { p: ProductoResumen; orden?: number }) {
  const { canalTienda } = useConfig();
  const { portal, rutaProducto } = useContextoCatalogo();
  const tienda = canalTienda && !portal; // el portal corporativo no muestra precios aunque la tienda esté encendida
  const agotado = p.disponible === 0;
  const conDescuento = p.precio_desde && p.precio_base_desde && Number(p.precio_desde) < Number(p.precio_base_desde);
  return (
    <Link to={`${rutaProducto}/${p.slug}`} style={{ animationDelay: `${Math.min(orden, 12) * 45}ms` }}
      className="group flex animate-aparecer flex-col rounded-[1.4rem] bg-white p-2 shadow-sm ring-1 ring-lurima-100 transition duration-300 hover:-translate-y-1 hover:shadow-suave hover:ring-lurima-200">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-gradient-to-br from-lurima-50 to-lurima-100">
        <ImagenProducto src={p.imagen} alt={p.nombre} className="transition duration-700 ease-out group-hover:scale-[1.05]" />
        <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1">
          <span className="max-w-full truncate rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-lurima-800 shadow-sm backdrop-blur">{p.categoria.nombre}</span>
          {tienda && p.en_promocion && <span className="rounded-full bg-coral-600 px-2 py-0.5 text-[11px] font-bold text-white">Promoción</span>}
          {tienda && agotado && <span className="rounded-full bg-lurima-900 px-2 py-0.5 text-[11px] font-bold text-white">Agotado</span>}
          {p.giro_360 && <span className="flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold text-lurima-800"><Rotate3d className="h-3 w-3 text-bienestar-600" />360°</span>}
        </div>
        <span aria-hidden className="absolute bottom-2.5 right-2.5 grid h-9 w-9 translate-y-1 place-items-center rounded-full bg-lurima-900 text-white opacity-0 shadow-lg transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 px-2.5 pb-2.5 pt-3">
        <h3 className="font-display text-[15px] font-bold leading-snug text-lurima-900 sm:text-base">{p.nombre}</h3>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          {tienda ? (
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
