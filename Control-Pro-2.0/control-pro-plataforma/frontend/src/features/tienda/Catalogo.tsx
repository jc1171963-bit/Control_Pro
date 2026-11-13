import { ReactNode, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { get } from '../../api/cliente';
import type { Pagina, ProductoResumen } from '../../api/tipos';
import { useConfig } from '../../app/config';
import { Boton, Entrada, ErrorCaja, Paginacion, Selector, Vacio } from '../../components/ui';
import { Esqueleto } from '../../components/movimiento';
import { cls } from '../../lib/formato';
import { catalogoPorConsulta, elegible, PuestosAutorizados } from '../../lib/solicitud';
import type { EmpleadoCorporativo } from '../cuenta/Corporativo';
import { useContextoCatalogo } from './contextoCatalogo';
import { EncabezadoPagina } from './Decoracion';
import ProductoCard from './ProductoCard';

type Resp = Pagina<ProductoResumen> & { facetas: { tallas: string[]; colores: { nombre: string; hex: string }[] } };
type Cat = { id: number; nombre: string; slug: string; productos: number };

const FILTROS_URL = ['q', 'categoria', 'talla', 'color', 'precio_min', 'precio_max', 'disponible', 'promocion', 'puesto'];
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
  const { portal } = useContextoCatalogo();
  const tienda = canalTienda && !portal; // el portal corporativo no muestra precios aunque la tienda esté encendida
  const qc = useQueryClient();
  const puesto = portal ? params.get('puesto') || '' : '';
  const consulta = params.toString();
  const datos = useQuery({
    queryKey: ['catalogo', consulta, puesto],
    queryFn: async (): Promise<Resp> => {
      if (!puesto) return get<Resp>(`/tienda/productos?por_pagina=12&${consulta}`);
      // El backend no filtra por puesto: se trae todo lo que cumple la consulta y se filtra aquí, para que totales y páginas sean exactos.
      const resto = new URLSearchParams(params); resto.delete('pagina'); resto.delete('puesto');
      const [mapa, todos] = await Promise.all([
        qc.fetchQuery({ queryKey: ['puestos-autorizados'], queryFn: () => get<PuestosAutorizados>('/cuenta/puestos-autorizados') }),
        catalogoPorConsulta(resto.toString()),
      ]);
      const aptos = todos.items.filter((p) => elegible(mapa, puesto, p.id));
      const por = 12, paginas = Math.ceil(aptos.length / por);
      const pagina = Math.min(Math.max(1, Number(params.get('pagina')) || 1), Math.max(paginas, 1));
      return { items: aptos.slice((pagina - 1) * por, pagina * por), total: aptos.length, pagina, por_pagina: por, paginas, facetas: todos.facetas };
    },
    placeholderData: keepPreviousData,
  });
  const empleados = useQuery({ queryKey: ['empleados'], queryFn: () => get<EmpleadoCorporativo[]>('/cuenta/empleados'), enabled: portal });
  const delEquipo = [...new Set((empleados.data || []).filter((e) => e.activo).map((e) => e.puesto))];
  const opcionesPuesto = (puesto && !delEquipo.includes(puesto) ? [...delEquipo, puesto] : delEquipo).sort();
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
  const activos = FILTROS_URL.filter((k) => params.get(k) && (k !== 'puesto' || portal));
  const catActual = cats.data?.find((c) => c.slug === params.get('categoria'));
  const etiquetaFiltro = (k: string) => k === 'disponible' ? 'Con existencias' : k === 'promocion' ? 'En promoción'
    : k === 'categoria' ? `Categoría: ${catActual?.nombre ?? params.get(k)}` : k === 'q' ? `Búsqueda: ${params.get(k)}` : k === 'puesto' ? `Autorizados para: ${params.get(k)}` : `${NOMBRES[k]}: ${params.get(k)}`;

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
      {tienda && (
        <Grupo titulo="Precio (MXN)">
          <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const p = new URLSearchParams(params);
            ['precio_min', 'precio_max'].forEach((k) => { const v = String(f.get(k) || ''); v ? p.set(k, v) : p.delete(k); }); p.delete('pagina'); setParams(p); }}>
            <input name="precio_min" type="number" min={0} defaultValue={params.get('precio_min') || ''} placeholder="Mín" aria-label="Precio mínimo" className="h-9 w-full rounded-lg border-0 px-2 ring-1 ring-lurima-200 focus:ring-2 focus:ring-lurima-500" />
            <input name="precio_max" type="number" min={0} defaultValue={params.get('precio_max') || ''} placeholder="Máx" aria-label="Precio máximo" className="h-9 w-full rounded-lg border-0 px-2 ring-1 ring-lurima-200 focus:ring-2 focus:ring-lurima-500" />
            <Boton tam="sm" type="submit">OK</Boton>
          </form>
        </Grupo>
      )}
      {portal && (
        <Grupo titulo="Autorizados para el puesto">
          <Selector value={puesto} onChange={(e) => fijar('puesto', e.target.value)} aria-label="Puesto">
            <option value="">Todos los productos</option>
            {opcionesPuesto.map((x) => <option key={x} value={x}>{x}</option>)}
          </Selector>
          {!empleados.isLoading && opcionesPuesto.length === 0 && <p className="mt-1 text-xs text-tinta-500">Registra empleados para filtrar por su puesto.</p>}
        </Grupo>
      )}
      <label className="flex min-h-9 items-center gap-2 font-semibold text-lurima-900">
        <input type="checkbox" checked={params.get('disponible') === '1'} onChange={(e) => fijar('disponible', e.target.checked ? '1' : null)} className="h-4 w-4 rounded accent-bienestar-500" />
        Solo con existencias
      </label>
    </div>
  );

  const titulo = params.get('q') ? `Resultados para “${params.get('q')}”` : catActual?.nombre || 'Todos los productos';
  const conteo = <p className="text-sm font-semibold text-tinta-600" aria-live="polite">{datos.data ? `${datos.data.total} producto(s)` : datos.isLoading ? 'Cargando…' : ''}</p>;
  return (
    <>
    {!portal && (
      <EncabezadoPagina eyebrow="Catálogo" titulo={titulo}>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">{conteo}<p className="text-xs text-tinta-500">Fotografías ilustrativas: el artículo puede variar en color y detalle.</p></div>
        {!!cats.data?.length && (
          <ul className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 lg:hidden" aria-label="Categorías">
            {cats.data.map((c) => (
              <li key={c.slug} className="shrink-0">
                <button type="button" onClick={() => fijar('categoria', c.slug)} aria-pressed={params.get('categoria') === c.slug}
                  className={cls('min-h-10 rounded-full px-4 text-sm font-semibold ring-1 transition', params.get('categoria') === c.slug ? 'bg-lurima-900 text-white ring-lurima-900' : 'bg-white text-lurima-800 ring-lurima-200 hover:ring-lurima-500')}>{c.nombre}</button>
              </li>
            ))}
          </ul>
        )}
      </EncabezadoPagina>
    )}
    <div className="contenedor py-8">
      <div className={cls('mb-6 flex flex-wrap items-end gap-4', portal ? 'justify-between' : 'justify-end')}>
        {portal && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-bienestar-600">Catálogo</p>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-lurima-900">{titulo}</h1>
            {conteo}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Boton id="abrir-filtros" variante="secundario" className="lg:hidden" onClick={() => setPanel(true)} aria-haspopup="dialog" icono={<SlidersHorizontal className="h-4 w-4" />}>
            Filtros{activos.length > 0 && ` (${activos.length})`}
          </Boton>
          <select value={params.get('orden') || 'relevancia'} onChange={(e) => fijar('orden', e.target.value === 'relevancia' ? null : e.target.value)} aria-label="Ordenar"
            className="h-10 rounded-lg border-0 bg-white pr-8 text-sm ring-1 ring-lurima-200 focus:ring-2 focus:ring-lurima-500">
            <option value="relevancia">Más relevantes</option>
            {tienda && <><option value="precio_asc">Menor precio</option><option value="precio_desc">Mayor precio</option></>}
            <option value="nuevos">Más recientes</option><option value="nombre">Nombre A–Z</option>
          </select>
        </div>
      </div>
      {portal && (
        <div className="mb-6">
          <form role="search" className="flex max-w-xl gap-2" onSubmit={(e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get('q') || '').trim();
            const p = new URLSearchParams(params); if (v) p.set('q', v); else p.delete('q'); p.delete('pagina'); setParams(p); }}>
            <label className="sr-only" htmlFor="buscar-catalogo">Buscar productos</label>
            <Entrada id="buscar-catalogo" name="q" key={params.get('q') || ''} defaultValue={params.get('q') || ''} placeholder="Buscar productos o SKU" />
            <Boton type="submit" icono={<Search className="h-4 w-4" aria-hidden />}>Buscar</Boton>
          </form>
          <p className="mt-2 text-xs text-tinta-500">Elige un producto para agregarlo a una solicitud. Las fotografías son ilustrativas.</p>
        </div>
      )}
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
    </>
  );
}
