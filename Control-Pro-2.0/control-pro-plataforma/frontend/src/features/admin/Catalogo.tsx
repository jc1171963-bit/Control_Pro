import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Plus, Search, Trash2 } from 'lucide-react';
import { get, post, put, subirArchivo } from '../../api/cliente';
import type { Pagina, ProductoDetalle } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { Boton, Campo, Cargando, Entrada, ErrorCaja, Modal, Paginacion, Selector, Tabla, Tarjeta, Td, Texto, useAviso } from '../../components/ui';
import { cls, dinero, fecha } from '../../lib/formato';
import { Encabezado, useSucursalesAdmin } from './AdminLayout';

type Cat = { id: number; nombre: string; slug: string };
const PUESTOS = ['Administración', 'Enfermería', 'Mantenimiento', 'Seguridad', 'Intendencia', 'Almacén'];
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function CatalogoAdmin() {
  const { puede } = useAuth();
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const q = useQuery({ queryKey: ['admin-productos', busqueda, pagina], queryFn: () => get<Pagina<ProductoDetalle>>(`/admin/productos?pagina=${pagina}&por_pagina=15&q=${encodeURIComponent(busqueda)}`), placeholderData: keepPreviousData });
  return (
    <>
      <Encabezado titulo="Catálogo de productos" sub="Catálogo maestro compartido por las tres sucursales">
        {puede('catalogo.gestionar') && <Link to="/admin/catalogo/nuevo" className="inline-flex h-10 items-center gap-2 rounded-lg bg-tinta-900 px-4 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Nuevo producto</Link>}
      </Encabezado>
      <Tarjeta>
        <form onSubmit={(e) => { e.preventDefault(); setBusqueda(texto); setPagina(1); }} className="relative mb-4 max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-300" />
          <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre o SKU" className="pl-9" /></form>
        {q.isLoading ? <Cargando /> : (
          <Tabla columnas={['', 'Producto', 'Categoría', 'Variantes', 'Precio', 'Existencia', 'Estado']} vacia={!q.data?.items.length}>
            {q.data?.items.map((p) => (
              <tr key={p.id} className="hover:bg-tinta-50/60">
                <Td><div className="h-12 w-12 overflow-hidden rounded-lg bg-arena-100">{p.imagen && <img src={p.imagen} alt="" className="h-full w-full object-cover" />}</div></Td>
                <Td><Link to={`/admin/catalogo/${p.id}`} className="font-semibold hover:text-menta-700">{p.nombre}</Link><p className="font-mono text-xs text-tinta-400">{p.sku_base}</p></Td>
                <Td>{p.categoria.nombre}</Td><Td>{p.variantes.filter((v) => v.activo).length} activas</Td><Td>{dinero(p.precio_base_desde)}</Td><Td>{p.disponible ?? 0} disp.</Td>
                <Td><span className={cls('text-xs font-semibold', p.activo ? 'text-menta-700' : 'text-tinta-400')}>{p.activo ? 'Activo' : 'Inactivo'}</span>
                  {!!p.sucursales_deshabilitadas.length && <p className="text-xs text-amber-700">{p.sucursales_deshabilitadas.length} sucursal(es) deshabilitada(s)</p>}</Td>
              </tr>
            ))}
          </Tabla>
        )}
        {q.data && <Paginacion pagina={q.data.pagina} paginas={q.data.paginas} total={q.data.total} onCambio={setPagina} />}
      </Tarjeta>
    </>
  );
}

type VarForm = { id?: number; sku: string; talla: string; color: string; color_hex: string; precio_base: string; activo: boolean };

export function ProductoEditor() {
  const { id } = useParams();
  const nuevo = id === 'nuevo';
  const { puede } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const avisar = useAviso();
  const cats = useQuery({ queryKey: ['admin-categorias'], queryFn: () => get<Cat[]>('/admin/categorias') });
  const sucs = useSucursalesAdmin();
  const q = useQuery({ queryKey: ['admin-producto', id], queryFn: () => get<ProductoDetalle>(`/admin/productos/${id}`), enabled: !nuevo });
  const [f, setF] = useState<any>({ sku_base: '', nombre: '', slug: '', descripcion: '', material: '', cuidados: '', categoria_id: '', destacado: false, activo: true, puestos: [], sucursales_deshabilitadas: [], imagenes: [] });
  const [vars, setVars] = useState<VarForm[]>([]);
  useEffect(() => {
    if (q.data) {
      const p = q.data;
      setF({ sku_base: p.sku_base, nombre: p.nombre, slug: p.slug, descripcion: p.descripcion, material: p.material || '', cuidados: p.cuidados || '', categoria_id: p.categoria.id,
        destacado: p.destacado, activo: p.activo, puestos: p.puestos, sucursales_deshabilitadas: p.sucursales_deshabilitadas, imagenes: p.imagenes.map((i) => i.url) });
      setVars(p.variantes.filter((v) => v.activo).map((v) => ({ id: v.id, sku: v.sku, talla: v.talla, color: v.color, color_hex: v.color_hex, precio_base: v.precio_base, activo: v.activo })));
    }
  }, [q.data]);
  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = { ...f, categoria_id: Number(f.categoria_id), material: f.material || null, cuidados: f.cuidados || null,
        variantes: vars.map(({ id: vid, ...v }) => ({ ...(vid ? { id: vid } : {}), ...v })) };
      return nuevo ? post<ProductoDetalle>('/admin/productos', cuerpo) : put<ProductoDetalle>(`/admin/productos/${id}`, cuerpo);
    },
    onSuccess: (p) => { qc.invalidateQueries({ queryKey: ['admin-productos'] }); qc.invalidateQueries({ queryKey: ['admin-producto'] }); avisar('Producto guardado.'); if (nuevo) nav(`/admin/catalogo/${p.id}`, { replace: true }); },
  });
  const [generador, setGenerador] = useState({ tallas: 'CH,M,G,XG', color: '', hex: '#1E3A5F', precio: '' });
  const generar = () => {
    const nuevas = generador.tallas.split(',').map((t) => t.trim()).filter(Boolean).map((t) => ({
      sku: `${f.sku_base}-${generador.color.split(' ').map((w) => w[0]).join('').toUpperCase()}-${t.toUpperCase()}`, talla: t, color: generador.color, color_hex: generador.hex, precio_base: generador.precio, activo: true }));
    setVars([...vars, ...nuevas.filter((n) => !vars.some((v) => v.sku === n.sku))]);
  };
  const editable = puede('catalogo.gestionar');

  if (!nuevo && q.isLoading) return <Cargando />;
  return (
    <>
      <Encabezado titulo={nuevo ? 'Nuevo producto' : f.nombre} sub={nuevo ? 'Alta en el catálogo maestro' : `SKU base ${f.sku_base} · ${vars.length} variante(s) activas`}>
        <Link to="/admin/catalogo" className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold ring-1 ring-tinta-200">Volver</Link>
        {editable && <Boton cargando={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton>}
      </Encabezado>
      <ErrorCaja error={guardar.error || q.error} />
      <fieldset disabled={!editable} className="mt-3 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Tarjeta titulo="Datos generales">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Nombre"><Entrada value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value, ...(nuevo ? { slug: slugify(e.target.value) } : {}) })} /></Campo>
              <Campo etiqueta="SKU base"><Entrada value={f.sku_base} onChange={(e) => setF({ ...f, sku_base: e.target.value.toUpperCase() })} /></Campo>
              <Campo etiqueta="Slug (URL)"><Entrada value={f.slug} onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })} /></Campo>
              <Campo etiqueta="Categoría"><Selector value={f.categoria_id} onChange={(e) => setF({ ...f, categoria_id: e.target.value })}><option value="">Elige…</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Selector></Campo>
              <Campo etiqueta="Descripción" className="sm:col-span-2"><Texto value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} /></Campo>
              <Campo etiqueta="Material"><Entrada value={f.material} onChange={(e) => setF({ ...f, material: e.target.value })} /></Campo>
              <Campo etiqueta="Cuidados"><Entrada value={f.cuidados} onChange={(e) => setF({ ...f, cuidados: e.target.value })} /></Campo>
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} />Activo en la tienda</label>
              <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={f.destacado} onChange={(e) => setF({ ...f, destacado: e.target.checked })} />Destacado en inicio</label>
            </div>
          </Tarjeta>
          <Tarjeta titulo="Variantes (talla × color)" sub="Las variantes con historial no se borran: al quitarlas quedan inactivas">
            <Tabla columnas={['SKU', 'Talla', 'Color', 'Hex', 'Precio (IVA incl.)', '']}>
              {vars.map((v, i) => (
                <tr key={v.id || v.sku}>
                  <Td><Entrada value={v.sku} onChange={(e) => setVars(vars.map((x, j) => j === i ? { ...x, sku: e.target.value } : x))} className="w-44 font-mono text-xs" /></Td>
                  <Td><Entrada value={v.talla} onChange={(e) => setVars(vars.map((x, j) => j === i ? { ...x, talla: e.target.value } : x))} className="w-20" /></Td>
                  <Td><Entrada value={v.color} onChange={(e) => setVars(vars.map((x, j) => j === i ? { ...x, color: e.target.value } : x))} className="w-32" /></Td>
                  <Td><input type="color" value={v.color_hex} onChange={(e) => setVars(vars.map((x, j) => j === i ? { ...x, color_hex: e.target.value.toUpperCase() } : x))} className="h-9 w-12 rounded" /></Td>
                  <Td><Entrada type="number" step="0.01" value={v.precio_base} onChange={(e) => setVars(vars.map((x, j) => j === i ? { ...x, precio_base: e.target.value } : x))} className="w-28" /></Td>
                  <Td><button type="button" onClick={() => setVars(vars.filter((_, j) => j !== i))} aria-label="Quitar variante"><Trash2 className="h-4 w-4 text-tinta-400" /></button></Td>
                </tr>
              ))}
            </Tabla>
            <div className="mt-4 grid items-end gap-2 rounded-xl bg-tinta-50 p-3 sm:grid-cols-[1.4fr_1fr_60px_1fr_auto]">
              <Campo etiqueta="Tallas (coma)"><Entrada value={generador.tallas} onChange={(e) => setGenerador({ ...generador, tallas: e.target.value })} /></Campo>
              <Campo etiqueta="Color"><Entrada value={generador.color} onChange={(e) => setGenerador({ ...generador, color: e.target.value })} /></Campo>
              <Campo etiqueta="Hex"><input type="color" value={generador.hex} onChange={(e) => setGenerador({ ...generador, hex: e.target.value.toUpperCase() })} className="h-10 w-full rounded" /></Campo>
              <Campo etiqueta="Precio"><Entrada type="number" value={generador.precio} onChange={(e) => setGenerador({ ...generador, precio: e.target.value })} /></Campo>
              <Boton type="button" variante="secundario" disabled={!f.sku_base || !generador.color || !generador.precio} onClick={generar}>Generar</Boton>
            </div>
          </Tarjeta>
        </div>
        <div className="space-y-5">
          <Tarjeta titulo="Imágenes">
            <div className="grid grid-cols-3 gap-2">
              {f.imagenes.map((u: string) => (
                <div key={u} className="relative aspect-square overflow-hidden rounded-lg bg-arena-100"><img src={u} alt="" className="h-full w-full object-cover" />
                  <button type="button" className="absolute right-1 top-1 rounded bg-white/90 p-1" onClick={() => setF({ ...f, imagenes: f.imagenes.filter((x: string) => x !== u) })} aria-label="Quitar"><Trash2 className="h-3.5 w-3.5" /></button></div>
              ))}
              <label className="grid aspect-square cursor-pointer place-items-center rounded-lg border-2 border-dashed border-tinta-200 text-tinta-400"><ImagePlus className="h-6 w-6" />
                <input type="file" accept=".png,.jpg,.jpeg,.webp" className="sr-only" onChange={async (e) => { const a = e.target.files?.[0]; if (a) { try { const u = await subirArchivo(a, true); setF((x: any) => ({ ...x, imagenes: [...x.imagenes, u] })); } catch (err: any) { avisar(err.message, 'error'); } } }} /></label>
            </div>
          </Tarjeta>
          <Tarjeta titulo="Puestos autorizados" sub="Regla del canal corporativo; fuera de ella se requiere excepción aprobada">
            <div className="flex flex-wrap gap-2">
              {PUESTOS.map((p) => <button type="button" key={p} onClick={() => setF({ ...f, puestos: f.puestos.includes(p) ? f.puestos.filter((x: string) => x !== p) : [...f.puestos, p] })}
                className={cls('rounded-full px-3 py-1 text-xs font-semibold ring-1', f.puestos.includes(p) ? 'bg-menta-500 text-white ring-menta-500' : 'ring-tinta-200')}>{p}</button>)}
            </div>
          </Tarjeta>
          <Tarjeta titulo="Habilitado por sucursal" sub="Si se deshabilita, la tienda no ofrece las existencias de esa sucursal">
            {sucs.data?.map((s) => (
              <label key={s.id} className="flex items-center justify-between py-1.5 text-sm"><span>{s.nombre}</span>
                <input type="checkbox" checked={!f.sucursales_deshabilitadas.includes(s.id)} onChange={(e) => setF({ ...f, sucursales_deshabilitadas: e.target.checked ? f.sucursales_deshabilitadas.filter((x: number) => x !== s.id) : [...f.sucursales_deshabilitadas, s.id] })} className="h-4 w-4 accent-menta-500" /></label>
            ))}
          </Tarjeta>
        </div>
      </fieldset>
    </>
  );
}

type Promo = { id: number; nombre: string; tipo: string; valor: string; inicio: string; fin: string; sucursal_id: number | null; activo: boolean; productos: { id: number; nombre: string }[] };

export function Promociones() {
  const { puede, usuario } = useAuth();
  const qc = useQueryClient();
  const avisar = useAviso();
  const sucs = useSucursalesAdmin();
  const q = useQuery({ queryKey: ['promociones'], queryFn: () => get<Promo[]>('/admin/promociones') });
  const prods = useQuery({ queryKey: ['admin-productos', 'todos'], queryFn: () => get<Pagina<ProductoDetalle>>('/admin/productos?por_pagina=100&activos=1') });
  const [editar, setEditar] = useState<Promo | 'nueva' | null>(null);
  const [f, setF] = useState<any>({});
  const abrir = (p: Promo | 'nueva') => {
    const hoy = new Date();
    setF(p === 'nueva' ? { nombre: '', tipo: 'porcentaje', valor: '10', inicio: hoy.toISOString().slice(0, 16), fin: new Date(+hoy + 14 * 864e5).toISOString().slice(0, 16),
      sucursal_id: usuario?.rol.alcance_global ? '' : String(usuario?.sucursales[0]?.id || ''), activo: true, productos: [] }
      : { ...p, inicio: p.inicio.slice(0, 16), fin: p.fin.slice(0, 16), sucursal_id: p.sucursal_id ? String(p.sucursal_id) : '', productos: p.productos.map((x) => x.id) });
    setEditar(p);
  };
  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = { nombre: f.nombre, tipo: f.tipo, valor: f.valor, activo: f.activo, productos: f.productos, sucursal_id: f.sucursal_id ? Number(f.sucursal_id) : null,
        inicio: new Date(f.inicio).toISOString(), fin: new Date(f.fin).toISOString() };
      return editar === 'nueva' ? post('/admin/promociones', cuerpo) : put(`/admin/promociones/${(editar as Promo).id}`, cuerpo);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['promociones'] }); setEditar(null); avisar('Promoción guardada.'); },
  });
  const ahora = Date.now();
  return (
    <>
      <Encabezado titulo="Promociones" sub="Globales (tienda) o locales (solo al recoger en la sucursal)">
        {puede('promocion.gestionar') && <Boton icono={<Plus className="h-4 w-4" />} onClick={() => abrir('nueva')}>Nueva promoción</Boton>}
      </Encabezado>
      <Tarjeta>
        {q.isLoading ? <Cargando /> : (
          <Tabla columnas={['Nombre', 'Descuento', 'Alcance', 'Vigencia', 'Productos', 'Estado', '']} vacia={!q.data?.length}>
            {q.data?.map((p) => {
              const vigente = p.activo && +new Date(p.inicio) <= ahora && +new Date(p.fin) > ahora;
              return (
                <tr key={p.id}><Td className="font-semibold">{p.nombre}</Td><Td>{p.tipo === 'porcentaje' ? `${Number(p.valor)}%` : dinero(p.valor)}</Td>
                  <Td className="text-xs">{p.sucursal_id ? `Local · ${sucs.data?.find((s) => s.id === p.sucursal_id)?.nombre}` : 'Global'}</Td>
                  <Td className="text-xs">{fecha(p.inicio)} – {fecha(p.fin)}</Td><Td className="text-xs">{p.productos.map((x) => x.nombre).join(', ')}</Td>
                  <Td><span className={cls('text-xs font-semibold', vigente ? 'text-menta-700' : 'text-tinta-400')}>{vigente ? 'Vigente' : p.activo ? 'Fuera de vigencia' : 'Inactiva'}</span></Td>
                  <Td>{puede('promocion.gestionar') && <Boton tam="sm" variante="fantasma" onClick={() => abrir(p)}>Editar</Boton>}</Td></tr>
              );
            })}
          </Tabla>
        )}
      </Tarjeta>
      <Modal abierto={!!editar} titulo={editar === 'nueva' ? 'Nueva promoción' : 'Editar promoción'} onCerrar={() => setEditar(null)} ancho="max-w-xl">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre" className="sm:col-span-2"><Entrada value={f.nombre || ''} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Campo>
          <Campo etiqueta="Tipo"><Selector value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}><option value="porcentaje">Porcentaje</option><option value="monto">Monto fijo (MXN)</option></Selector></Campo>
          <Campo etiqueta="Valor"><Entrada type="number" value={f.valor || ''} onChange={(e) => setF({ ...f, valor: e.target.value })} /></Campo>
          <Campo etiqueta="Inicio"><Entrada type="datetime-local" value={f.inicio || ''} onChange={(e) => setF({ ...f, inicio: e.target.value })} /></Campo>
          <Campo etiqueta="Fin"><Entrada type="datetime-local" value={f.fin || ''} onChange={(e) => setF({ ...f, fin: e.target.value })} /></Campo>
          <Campo etiqueta="Alcance" className="sm:col-span-2"><Selector value={f.sucursal_id} onChange={(e) => setF({ ...f, sucursal_id: e.target.value })}>
            {puede('catalogo.gestionar') && <option value="">Global (toda la tienda)</option>}
            {(usuario?.rol.alcance_global ? sucs.data : sucs.data?.filter((s) => usuario?.sucursales.some((x) => x.id === s.id)))?.map((s) => <option key={s.id} value={s.id}>Solo al recoger en {s.nombre}</option>)}</Selector></Campo>
          <div className="sm:col-span-2">
            <p className="mb-1 text-sm font-semibold">Productos</p>
            <div className="max-h-48 overflow-y-auto rounded-lg p-2 ring-1 ring-tinta-200">
              {prods.data?.items.map((p) => <label key={p.id} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" checked={f.productos?.includes(p.id)}
                onChange={(e) => setF({ ...f, productos: e.target.checked ? [...f.productos, p.id] : f.productos.filter((x: number) => x !== p.id) })} />{p.nombre}</label>)}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} />Activa</label>
          <div className="sm:col-span-2"><ErrorCaja error={guardar.error} /></div>
          <div className="flex justify-end gap-2 sm:col-span-2"><Boton variante="secundario" onClick={() => setEditar(null)}>Cancelar</Boton><Boton cargando={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton></div>
        </div>
      </Modal>
    </>
  );
}
