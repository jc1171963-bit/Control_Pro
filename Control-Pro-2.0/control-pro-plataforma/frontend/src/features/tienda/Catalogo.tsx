import { ReactNode, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SlidersHorizontal, X } from 'lucide-react';
import { get } from '../../api/cliente';
import type { Pagina, ProductoResumen } from '../../api/tipos';
import { useConfig } from '../../app/config';
import { Boton, ErrorCaja, Paginacion, Vacio } from '../../components/ui';
import { Esqueleto } from '../../components/movimiento';
import { cls } from '../../lib/formato';
import ProductoCard from './ProductoCard';

type Resp = Pagina<ProductoResumen> & { facetas: { tallas: string[]; colores: { nombre: string; hex: string }[] } };
type Cat = { id: number; nombre: string; slug: string; productos: number };

const FILTROS_URL = ['q', 'categoria', 'talla', 'color', 'precio_min', 'precio_max', 'disponible', 'promocion'];
const NOMBRES: Record<string, string> = { talla: 'Talla', color: 'Color', precio_min: 'Precio mín.', precio_max: 'Precio máx.' };

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 font-display font-bold text-lurima-900">{titulo}</legend>
      {children}
    </fieldset>
  );
}

export default function Catalogo() {
  const [params, setParams] = useSearchParams();
  const [panel, setPanel] = useState(false);
  const { canalTienda } = useConfig();
  const consulta = params.toString();
  const datos = useQuery({ queryKey: ['catalogo', consulta], queryFn: () => get<Resp>(`/tienda/productos?por_pagina=12&${consulta}`), placeholderData: keepPreviousData });
  const cats = useQuery({ queryKey: ['categorias'], queryFn: () => get<Cat[]>('/tienda/categorias'), staleTime: 300_000 });

  // Panel de filtros en móvil: se cierra con Escape y el foco vuelve al botón que lo abrió.
  useEffect(() => {
    if (!panel) return;
    const f = (e: KeyboardEvent) => e.key === 'Escape' && setPanel(false);
    window.addEventListener('keydown', f);
    return () => { window.removeEventListener('keydown', f); document.getElementById('abrir-filtros')?.focus(); };
  }, [panel]);

  const fijar = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v === null || v === '' || p.get(k) === v) p.delete(k); else p.set(k, v);
    if (k !== 'pagina') p.delete('pagina');
    setParams(p);
  };
  const activos = FILTROS_URL.filter((k) => params.get(k));
  const catActual = cats.data?.find((c) => c.slug === params.get('categoria'));
  const etiquetaFiltro = (k: string) => k === 'disponible' ? 'Con existencias' : k === 'promocion' ? 'En promoción'
    : k === 'categoria' ? `Categoría: ${catActual?.nombre ?? params.get(k)}` : k === 'q' ? `Búsqueda: ${params.get(k)}` : `${NOMBRES[k]}: ${params.get(k)}`;

  const filtros = (
    <div className="space-y-6 text-sm">
      <Grupo titulo="Categoría">
        <div className="space-y-1">
          {cats.data?.map((c) => (
            <button key={c.slug} type="button" onClick={() => fijar('categoria', c.slug)} aria-pressed={params.get('categoria') === c.slug}
              className={cls('flex min-h-9 w-full items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-lurima-50', params.get('categoria') === c.slug && 'bg-lurima-800 text-white hover:bg-lurima-700')}>
              {c.nombre}<span className="text-xs opacity-70">{c.productos}</span>
            </button>
          ))}
        </div>
      </Grupo>
      <Grupo titulo="Talla">
        <div className="flex flex-wrap gap-1.5">
          {datos.data?.facetas.tallas.map((t) => (
            <button key={t} type="button" onClick={() => fijar('talla', t)} aria-pressed={params.get('talla') === t}
              className={cls('min-h-9 min-w-10 rounded-lg px-2 py-1.5 text-xs font-semibold ring-1', params.get('talla') === t ? 'bg-lurima-800 text-white ring-lurima-800' : 'bg-white ring-lurima-200 hover:ring-lurima-500')}>{t}</button>
          ))}
        </div>
      </Grupo>
      <Grupo titulo="Color">
        <div className="flex flex-wrap gap-2">
          {datos.data?.facetas.colores.map((c) => (
            <button key={c.nombre} type="button" onClick={() => fijar('color', c.nombre)} title={c.nombre} aria-label={c.nombre} aria-pressed={params.get('color') === c.nombre}
              className={cls('h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-white', params.get('color') === c.nombre ? 'ring-lurima-800' : 'ring-lurima-200')} style={{ background: c.hex }} />
          ))}
        </div>
      </Grupo>
      {canalTienda && (
        <Grupo titulo="Precio (MXN)">
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const p = new URLSearchParams(params);
            ['precio_min', 'precio_max'].forEach((k) => { const v = String(f.get(k) || ''); v ? p.set(k, v) : p.delete(k); }); p.delete('pagina'); setParams(p); }}>
            <input name="precio_min" type="number" min={0} defaultValue={params.get('precio_min') || ''} placeholder="Mín" aria-label="Precio mínimo" className="h-9 w-full rounded-lg border-0 px-2 ring-1 ring-lurima-200 focus:ring-2 focus:ring-lurima-500" />
            <input name="precio_max" type="number" min={0} defaultValue={params.get('precio_max') || ''} placeholder="Máx" aria-label="Precio máximo" className="h-9 w-full rounded-lg border-0 px-2 ring-1 ring-lurima-200 focus:ring-2 focus:ring-lurima-500" />
            <Boton tam="sm" type="submit">OK</Boton>
          </form>
        </Grupo>
      )}
      <label className="flex min-h-9 items-center gap-2 font-semibold text-lurima-900">
        <input type="checkbox" checked={params.get('disponible') === '1'} onChange={(e) => fijar('disponible', e.target.checked ? '1' : null)} className="h-4 w-4 rounded accent-bienestar-500" />
        Solo con existencias
      </label>
    </div>
  );

  return (
    <div className="contenedor py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-bienestar-600">Catálogo</p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-lurima-900">{params.get('q') ? `Resultados para “${params.get('q')}”` : catActual?.nombre || 'Todos los productos'}</h1>
          <p className="text-sm text-lurima-500" aria-live="polite">{datos.data ? `${datos.data.total} producto(s)` : datos.isLoading ? 'Cargando…' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Boton id="abrir-filtros" variante="secundario" className="lg:hidden" onClick={() => setPanel(true)} aria-haspopup="dialog" icono={<SlidersHorizontal className="h-4 w-4" />}>
            Filtros{activos.length > 0 && ` (${activos.length})`}
          </Boton>
          <select value={params.get('orden') || 'relevancia'} onChange={(e) => fijar('orden', e.target.value === 'relevancia' ? null : e.target.value)} aria-label="Ordenar"
            className="h-10 rounded-lg border-0 bg-white pr-8 text-sm ring-1 ring-lurima-200 focus:ring-2 focus:ring-lurima-500">
            <option value="relevancia">Más relevantes</option>
            {canalTienda && <><option value="precio_asc">Menor precio</option><option value="precio_desc">Mayor precio</option></>}
            <option value="nuevos">Más recientes</option><option value="nombre">Nombre A–Z</option>
          </select>
        </div>
      </div>
      {activos.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {activos.map((k) => (
            <button key={k} type="button" onClick={() => fijar(k, null)} aria-label={`Quitar filtro: ${etiquetaFiltro(k)}`} className="flex min-h-8 items-center gap-1 rounded-full bg-lurima-50 px-3 py-1 text-xs font-semibold text-lurima-800 ring-1 ring-lurima-200 hover:bg-lurima-100">
              {etiquetaFiltro(k)}<X className="h-3 w-3" />
            </button>
          ))}
          <button type="button" onClick={() => setParams({})} className="min-h-8 text-xs font-semibold text-coral-600 hover:underline">Limpiar todo</button>
        </div>
      )}
      <div className="grid gap-8 lg:grid-cols-[230px_1fr]">
        <aside className="hidden lg:block" aria-label="Filtros">{filtros}</aside>
        <div aria-busy={datos.isFetching}>
          <div className="space-y-3">
            <ErrorCaja error={datos.error} />
            {datos.error && <Boton variante="secundario" onClick={() => datos.refetch()}>Reintentar</Boton>}
          </div>
          {datos.isLoading ? <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <Esqueleto key={i} className="aspect-[3/4]" />)}</div> : datos.data && datos.data.items.length === 0 ? (
            <Vacio titulo="No encontramos productos" texto="Prueba con otros filtros o una búsqueda diferente."
              accion={activos.length > 0 ? <Boton variante="secundario" className="mt-2" onClick={() => setParams({})}>Limpiar filtros</Boton> : undefined} />
          ) : (
            <div className={cls('grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-3', datos.isFetching && 'opacity-60')}>
              {datos.data?.items.map((p, i) => <ProductoCard key={p.id} p={p} orden={i} />)}
            </div>
          )}
          {datos.data && <Paginacion pagina={datos.data.pagina} paginas={datos.data.paginas} total={datos.data.total} onCambio={(p) => fijar('pagina', String(p))} />}
        </div>
      </div>
      {panel && (
        <div className="fixed inset-0 z-50 bg-lurima-950/40 lg:hidden" onClick={() => setPanel(false)}>
          <div role="dialog" aria-modal="true" aria-label="Filtros" className="absolute inset-y-0 left-0 w-80 max-w-[85vw] overflow-y-auto bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><p className="font-display text-lg font-bold text-lurima-900">Filtros</p>
              <button type="button" autoFocus onClick={() => setPanel(false)} aria-label="Cerrar filtros" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-lurima-50"><X className="h-5 w-5" /></button></div>
            {filtros}
          </div>
        </div>
      )}
    </div>
  );
}
