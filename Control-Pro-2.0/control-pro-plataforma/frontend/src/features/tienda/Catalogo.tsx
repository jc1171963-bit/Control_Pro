import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SlidersHorizontal, X } from 'lucide-react';
import { get } from '../../api/cliente';
import type { Pagina, ProductoResumen } from '../../api/tipos';
import { Boton, Cargando, ErrorCaja, Paginacion, Vacio } from '../../components/ui';
import { cls } from '../../lib/formato';
import ProductoCard from './ProductoCard';

type Resp = Pagina<ProductoResumen> & { facetas: { tallas: string[]; colores: { nombre: string; hex: string }[] } };
type Cat = { id: number; nombre: string; slug: string; productos: number };

export default function Catalogo() {
  const [params, setParams] = useSearchParams();
  const [panel, setPanel] = useState(false);
  const consulta = params.toString();
  const datos = useQuery({ queryKey: ['catalogo', consulta], queryFn: () => get<Resp>(`/tienda/productos?por_pagina=12&${consulta}`), placeholderData: keepPreviousData });
  const cats = useQuery({ queryKey: ['categorias'], queryFn: () => get<Cat[]>('/tienda/categorias'), staleTime: 300_000 });

  const fijar = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v === null || v === '' || p.get(k) === v) p.delete(k); else p.set(k, v);
    if (k !== 'pagina') p.delete('pagina');
    setParams(p);
  };
  const activos = ['q', 'categoria', 'talla', 'color', 'precio_min', 'precio_max', 'disponible', 'promocion'].filter((k) => params.get(k));
  const catActual = cats.data?.find((c) => c.slug === params.get('categoria'));

  const filtros = (
    <div className="space-y-6 text-sm">
      <div>
        <p className="mb-2 font-display font-bold">Categoría</p>
        <div className="space-y-1">
          {cats.data?.map((c) => (
            <button key={c.slug} onClick={() => fijar('categoria', c.slug)}
              className={cls('flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-arena-200', params.get('categoria') === c.slug && 'bg-tinta-900 text-white hover:bg-tinta-800')}>
              {c.nombre}<span className="text-xs opacity-60">{c.productos}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 font-display font-bold">Talla</p>
        <div className="flex flex-wrap gap-1.5">
          {datos.data?.facetas.tallas.map((t) => (
            <button key={t} onClick={() => fijar('talla', t)} className={cls('min-w-10 rounded-lg px-2 py-1.5 text-xs font-semibold ring-1', params.get('talla') === t ? 'bg-tinta-900 text-white ring-tinta-900' : 'bg-white ring-arena-300 hover:ring-tinta-400')}>{t}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 font-display font-bold">Color</p>
        <div className="flex flex-wrap gap-2">
          {datos.data?.facetas.colores.map((c) => (
            <button key={c.nombre} onClick={() => fijar('color', c.nombre)} title={c.nombre} aria-label={c.nombre}
              className={cls('h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-arena-100', params.get('color') === c.nombre ? 'ring-tinta-900' : 'ring-arena-300')} style={{ background: c.hex }} />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 font-display font-bold">Precio (MXN)</p>
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const p = new URLSearchParams(params);
          ['precio_min', 'precio_max'].forEach((k) => { const v = String(f.get(k) || ''); v ? p.set(k, v) : p.delete(k); }); p.delete('pagina'); setParams(p); }}>
          <input name="precio_min" type="number" min={0} defaultValue={params.get('precio_min') || ''} placeholder="Mín" className="h-9 w-full rounded-lg border-0 px-2 ring-1 ring-arena-300" />
          <input name="precio_max" type="number" min={0} defaultValue={params.get('precio_max') || ''} placeholder="Máx" className="h-9 w-full rounded-lg border-0 px-2 ring-1 ring-arena-300" />
          <Boton tam="sm" type="submit">OK</Boton>
        </form>
      </div>
      <label className="flex items-center gap-2 font-semibold">
        <input type="checkbox" checked={params.get('disponible') === '1'} onChange={(e) => fijar('disponible', e.target.checked ? '1' : null)} className="h-4 w-4 rounded accent-menta-500" />
        Solo con existencias
      </label>
    </div>
  );

  return (
    <div className="contenedor py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-menta-700">Catálogo</p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">{params.get('q') ? `Resultados para “${params.get('q')}”` : catActual?.nombre || 'Todos los productos'}</h1>
          <p className="text-sm text-tinta-400">{datos.data?.total ?? '…'} producto(s)</p>
        </div>
        <div className="flex items-center gap-2">
          <Boton variante="secundario" className="lg:hidden" onClick={() => setPanel(true)} icono={<SlidersHorizontal className="h-4 w-4" />}>Filtros</Boton>
          <select value={params.get('orden') || 'relevancia'} onChange={(e) => fijar('orden', e.target.value === 'relevancia' ? null : e.target.value)} aria-label="Ordenar"
            className="h-10 rounded-lg border-0 bg-white pr-8 text-sm ring-1 ring-arena-300">
            <option value="relevancia">Más relevantes</option><option value="precio_asc">Menor precio</option>
            <option value="precio_desc">Mayor precio</option><option value="nuevos">Más recientes</option><option value="nombre">Nombre A–Z</option>
          </select>
        </div>
      </div>
      {activos.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {activos.map((k) => (
            <button key={k} onClick={() => fijar(k, null)} className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold ring-1 ring-arena-300">
              {k === 'disponible' ? 'Con existencias' : k === 'promocion' ? 'En promoción' : `${k.replace('_', ' ')}: ${params.get(k)}`}<X className="h-3 w-3" />
            </button>
          ))}
          <button onClick={() => setParams({})} className="text-xs font-semibold text-coral-600">Limpiar todo</button>
        </div>
      )}
      <div className="grid gap-8 lg:grid-cols-[230px_1fr]">
        <aside className="hidden lg:block">{filtros}</aside>
        <div>
          <ErrorCaja error={datos.error} />
          {datos.isLoading ? <Cargando /> : datos.data && datos.data.items.length === 0 ? (
            <Vacio titulo="No encontramos productos" texto="Prueba con otros filtros o una búsqueda diferente." />
          ) : (
            <div className={cls('grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-3', datos.isFetching && 'opacity-60')}>
              {datos.data?.items.map((p) => <ProductoCard key={p.id} p={p} />)}
            </div>
          )}
          {datos.data && <Paginacion pagina={datos.data.pagina} paginas={datos.data.paginas} total={datos.data.total} onCambio={(p) => fijar('pagina', String(p))} />}
        </div>
      </div>
      {panel && (
        <div className="fixed inset-0 z-50 bg-tinta-950/40 lg:hidden" onClick={() => setPanel(false)}>
          <div className="absolute inset-y-0 left-0 w-80 max-w-[85vw] overflow-y-auto bg-arena-50 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><p className="font-display text-lg font-bold">Filtros</p><button onClick={() => setPanel(false)} aria-label="Cerrar"><X className="h-5 w-5" /></button></div>
            {filtros}
          </div>
        </div>
      )}
    </div>
  );
}
