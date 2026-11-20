/**
 * Editor de las partidas de una solicitud: empleado, prenda, talla/color y cantidad de cada artículo.
 * - modo «gerente»: el Gerente de compras ajusta una solicitud en revisión; el cambio aplica de inmediato.
 * - modo «propuesta»: la comercializadora propone cambios (también precio y descuento) a una solicitud aprobada; quedan
 *   pendientes hasta que el Gerente de compras los acepta. Cada guardado crea una versión nueva.
 * El servidor valida todo de nuevo y deja el cambio en el historial.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { get, post, put } from '../../api/cliente';
import type { Pedido, ProductoDetalle } from '../../api/tipos';
import { Aviso, Boton, Campo, Entrada, ErrorCaja, Modal, Selector, Texto, useAviso } from '../../components/ui';
import { EsqueletoLista } from '../../components/movimiento';
import { catalogoCompleto } from '../../lib/solicitud';
import type { CuentaSucursal } from './SucursalesCliente';

type Linea = {
  clave: string; pedido_detalle_id: number | null; empleado_id: number | ''; slug: string; variante_id: number | ''; cantidad: number;
  excepcion: string | null; precio: string; descuento: string;
};

export default function EditarSolicitud({ p, abierto, onCerrar, modo = 'gerente' }: {
  p: Pedido; abierto: boolean; onCerrar: () => void; modo?: 'gerente' | 'propuesta';
}) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const propuesta = modo === 'propuesta';
  const pendiente = p.negociacion?.pendiente ?? null;
  const cuenta = useQuery({ queryKey: ['cuenta-sucursal', String(p.cliente.id)], queryFn: () => get<CuentaSucursal>(`/admin/cuentas-sucursal/${p.cliente.id}`), enabled: abierto });
  const catalogo = useQuery({ queryKey: ['catalogo-completo'], queryFn: catalogoCompleto, staleTime: 300_000, enabled: abierto });
  const [lineas, setLineas] = useState<Linea[] | null>(null);
  const [motivo, setMotivo] = useState('');

  // Las líneas parten de lo vigente (o de la última versión de la propuesta pendiente) cuando ya está el catálogo.
  if (abierto && lineas === null && catalogo.data) {
    const porNombre = new Map(catalogo.data.map((x) => [x.nombre, x.slug]));
    const base = propuesta && pendiente ? pendiente.version_actual.partidas.map((x) => ({ ...x, id: x.pedido_detalle_id, empleado_id: x.empleado_id }))
      : p.detalles.map((d) => ({ ...d, id: d.id as number | null, empleado_id: d.empleado?.id ?? null }));
    setLineas(base.map((d, i) => ({ clave: String(d.id ?? `n${i}`), pedido_detalle_id: d.id, empleado_id: d.empleado_id ?? '',
      slug: porNombre.get(d.nombre) || '', variante_id: d.variante_id, cantidad: d.cantidad, excepcion: d.excepcion,
      precio: String(d.precio_unitario), descuento: String(d.descuento_unitario) })));
  }
  const slugs = useMemo(() => [...new Set((lineas || []).map((l) => l.slug).filter(Boolean))], [lineas]);
  const detalles = useQueries({ queries: slugs.map((slug) => ({ queryKey: ['producto', slug], queryFn: () => get<ProductoDetalle>(`/tienda/productos/${slug}`), staleTime: 300_000 })) });
  const varPorSlug = new Map(slugs.map((s, i) => [s, detalles[i]?.data?.variantes || []]));

  const fijar = (clave: string, cambios: Partial<Linea>) => setLineas((ls) => (ls || []).map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
  const cerrar = () => { setLineas(null); setMotivo(''); onCerrar(); };
  const guardar = useMutation({
    mutationFn: () => {
      const partidas = (lineas || []).map((l) => ({ empleado_id: l.empleado_id, variante_id: l.variante_id, cantidad: l.cantidad, excepcion: l.excepcion,
        ...(propuesta ? { pedido_detalle_id: l.pedido_detalle_id, precio_unitario: l.precio === '' ? null : l.precio, descuento_unitario: l.descuento === '' ? null : l.descuento } : {}) }));
      return propuesta
        ? post<Pedido>(`/admin/pedidos/${p.id}/propuestas`, { partidas, nota: motivo, version_vista: pendiente?.version_actual.numero ?? null })
        : put<Pedido>(`/admin/pedidos/${p.id}/partidas`, { motivo, partidas });
    },
    onSuccess: (r) => {
      qc.setQueryData(['admin-pedido', String(p.id)], r); qc.invalidateQueries({ queryKey: ['admin-solicitudes'] });
      avisar(propuesta ? 'Propuesta guardada. El Gerente de compras ya puede revisarla.' : 'Solicitud actualizada. La sucursal recibió el detalle del cambio.');
      cerrar();
    },
  });
  const empleados = (cuenta.data?.empleados || []).filter((e) => e.activo);
  const precioValido = (l: Linea) => !propuesta || (l.precio !== '' && Number(l.precio) >= 0 && Number(l.descuento || 0) >= 0 && Number(l.descuento || 0) <= Number(l.precio));
  const completas = !!lineas?.length && lineas.every((l) => l.empleado_id && l.variante_id && l.cantidad > 0 && precioValido(l));
  const titulo = propuesta ? (pendiente ? `Modificar propuesta ${pendiente.numero} · ${p.folio}` : `Proponer cambios · ${p.folio}`) : `Editar solicitud ${p.folio}`;

  return (
    <Modal abierto={abierto} titulo={titulo} onCerrar={cerrar} ancho="max-w-5xl">
      {!lineas || cuenta.isLoading ? <EsqueletoLista filas={3} /> : (
        <div className="space-y-4">
          <Aviso>{propuesta
            ? 'Los cambios quedan como propuesta: las condiciones vigentes no cambian hasta que el Gerente de compras la acepte. El precio negociado es solo de esta solicitud; el catálogo no cambia.'
            : 'Ajusta prendas, tallas y cantidades antes de aprobar. La sucursal recibe una notificación con cada cambio y el motivo.'}</Aviso>
          <div className="space-y-2">
            {lineas.map((l) => (
              <div key={l.clave} className={`grid items-end gap-2 rounded-xl p-3 ring-1 ring-arena-200 ${propuesta ? 'md:grid-cols-[1fr_1.2fr_0.9fr_110px_110px_110px_auto]' : 'md:grid-cols-[1.1fr_1.4fr_1fr_120px_auto]'}`}>
                <Campo etiqueta="Empleado"><Selector value={l.empleado_id} onChange={(e) => fijar(l.clave, { empleado_id: Number(e.target.value) || '' })}>
                  <option value="">Elige…</option>{empleados.map((e) => <option key={e.id} value={e.id}>{e.nombre} · {e.puesto}</option>)}</Selector></Campo>
                <Campo etiqueta="Prenda"><Selector value={l.slug} onChange={(e) => fijar(l.clave, { slug: e.target.value, variante_id: '', precio: '', descuento: '' })}>
                  <option value="">Elige…</option>{catalogo.data?.map((x) => <option key={x.slug} value={x.slug}>{x.nombre}</option>)}</Selector></Campo>
                <Campo etiqueta="Talla y color"><Selector value={l.variante_id} onChange={(e) => {
                  const v = (varPorSlug.get(l.slug) || []).find((x) => x.id === Number(e.target.value));
                  fijar(l.clave, { variante_id: Number(e.target.value) || '', ...(propuesta && v ? { precio: String(v.precio ?? v.precio_base), descuento: String(v.descuento ?? '0.00') } : {}) });
                }} disabled={!l.slug}>
                  <option value="">Elige…</option>{(varPorSlug.get(l.slug) || []).map((v) => <option key={v.id} value={v.id}>{v.talla} · {v.color}</option>)}</Selector></Campo>
                <Campo etiqueta="Cantidad">
                  <div className="flex h-10 items-center justify-between rounded-lg ring-1 ring-tinta-200">
                    <button type="button" className="px-2" aria-label="Menos" onClick={() => fijar(l.clave, { cantidad: Math.max(1, l.cantidad - 1) })}><Minus className="h-3.5 w-3.5" /></button>
                    <span className="font-bold">{l.cantidad}</span>
                    <button type="button" className="px-2" aria-label="Más" onClick={() => fijar(l.clave, { cantidad: Math.min(50, l.cantidad + 1) })}><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                </Campo>
                {propuesta && <>
                  <Campo etiqueta="Precio unitario"><Entrada type="number" min={0} step="0.01" inputMode="decimal" value={l.precio} onChange={(e) => fijar(l.clave, { precio: e.target.value })} /></Campo>
                  <Campo etiqueta="Descuento unitario"><Entrada type="number" min={0} step="0.01" inputMode="decimal" value={l.descuento} onChange={(e) => fijar(l.clave, { descuento: e.target.value })} /></Campo>
                </>}
                <button type="button" aria-label="Quitar artículo" onClick={() => setLineas((ls) => (ls || []).filter((x) => x.clave !== l.clave))}
                  className="mb-1 rounded-lg p-2 text-tinta-400 hover:bg-coral-50 hover:text-coral-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <Boton variante="secundario" icono={<Plus className="h-4 w-4" />}
            onClick={() => setLineas((ls) => [...(ls || []), { clave: `n${Date.now()}`, pedido_detalle_id: null, empleado_id: '', slug: '', variante_id: '', cantidad: 1, excepcion: null, precio: '', descuento: '' }])}>Agregar artículo</Boton>
          <Campo etiqueta={propuesta ? 'Nota de la propuesta' : 'Motivo del cambio'}
            ayuda={propuesta ? 'La verá el Gerente de compras junto con la comparación (mínimo 5 caracteres).' : 'Se le envía a la sucursal junto con el detalle (mínimo 5 caracteres).'}>
            <Texto value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} /></Campo>
          <ErrorCaja error={guardar.error || cuenta.error} />
          <div className="flex justify-end gap-2">
            <Boton variante="secundario" onClick={cerrar}>Cancelar</Boton>
            <Boton cargando={guardar.isPending} disabled={!completas || motivo.trim().length < 5} onClick={() => guardar.mutate()}>{propuesta ? 'Guardar propuesta' : 'Guardar cambios'}</Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
