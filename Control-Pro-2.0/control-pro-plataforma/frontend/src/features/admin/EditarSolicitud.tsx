/**
 * El aprobador ajusta una solicitud en revisión: empleado, prenda, talla/color y cantidad de cada artículo.
 * El servidor valida todo de nuevo, deja el cambio en el historial y le avisa a la sucursal con el detalle.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { get, put } from '../../api/cliente';
import type { Pedido, ProductoDetalle } from '../../api/tipos';
import { Aviso, Boton, Campo, ErrorCaja, Modal, Selector, Texto, useAviso } from '../../components/ui';
import { EsqueletoLista } from '../../components/movimiento';
import { catalogoCompleto } from '../../lib/solicitud';
import type { CuentaSucursal } from './SucursalesCliente';

type Linea = { clave: string; empleado_id: number | ''; slug: string; variante_id: number | ''; cantidad: number; excepcion: string | null };

export default function EditarSolicitud({ p, abierto, onCerrar }: { p: Pedido; abierto: boolean; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const cuenta = useQuery({ queryKey: ['cuenta-sucursal', String(p.cliente.id)], queryFn: () => get<CuentaSucursal>(`/admin/cuentas-sucursal/${p.cliente.id}`), enabled: abierto });
  const catalogo = useQuery({ queryKey: ['catalogo-completo'], queryFn: catalogoCompleto, staleTime: 300_000, enabled: abierto });
  const [lineas, setLineas] = useState<Linea[] | null>(null);
  const [motivo, setMotivo] = useState('');

  // Las líneas parten de la solicitud actual (se inicializan cuando ya está el catálogo para ubicar cada prenda).
  if (abierto && lineas === null && catalogo.data) {
    const porNombre = new Map(catalogo.data.map((x) => [x.nombre, x.slug]));
    setLineas(p.detalles.map((d) => ({ clave: String(d.id), empleado_id: d.empleado?.id ?? '', slug: porNombre.get(d.nombre) || '',
      variante_id: d.variante_id, cantidad: d.cantidad, excepcion: d.excepcion })));
  }
  const slugs = useMemo(() => [...new Set((lineas || []).map((l) => l.slug).filter(Boolean))], [lineas]);
  const detalles = useQueries({ queries: slugs.map((slug) => ({ queryKey: ['producto', slug], queryFn: () => get<ProductoDetalle>(`/tienda/productos/${slug}`), staleTime: 300_000 })) });
  const varPorSlug = new Map(slugs.map((s, i) => [s, detalles[i]?.data?.variantes || []]));

  const fijar = (clave: string, cambios: Partial<Linea>) => setLineas((ls) => (ls || []).map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
  const cerrar = () => { setLineas(null); setMotivo(''); onCerrar(); };
  const guardar = useMutation({
    mutationFn: () => put<Pedido>(`/admin/pedidos/${p.id}/partidas`, {
      motivo, partidas: (lineas || []).map((l) => ({ empleado_id: l.empleado_id, variante_id: l.variante_id, cantidad: l.cantidad, excepcion: l.excepcion })) }),
    onSuccess: (r) => { qc.setQueryData(['admin-pedido', String(p.id)], r); qc.invalidateQueries({ queryKey: ['admin-solicitudes'] }); avisar('Solicitud actualizada. La sucursal recibió el detalle del cambio.'); cerrar(); },
  });
  const empleados = (cuenta.data?.empleados || []).filter((e) => e.activo);
  const completas = !!lineas?.length && lineas.every((l) => l.empleado_id && l.variante_id && l.cantidad > 0);

  return (
    <Modal abierto={abierto} titulo={`Editar solicitud ${p.folio}`} onCerrar={cerrar} ancho="max-w-4xl">
      {!lineas || cuenta.isLoading ? <EsqueletoLista filas={3} /> : (
        <div className="space-y-4">
          <Aviso>Ajusta prendas, tallas y cantidades antes de aprobar. La sucursal recibe una notificación con cada cambio y el motivo.</Aviso>
          <div className="space-y-2">
            {lineas.map((l) => (
              <div key={l.clave} className="grid items-end gap-2 rounded-xl p-3 ring-1 ring-arena-200 md:grid-cols-[1.1fr_1.4fr_1fr_120px_auto]">
                <Campo etiqueta="Empleado"><Selector value={l.empleado_id} onChange={(e) => fijar(l.clave, { empleado_id: Number(e.target.value) || '' })}>
                  <option value="">Elige…</option>{empleados.map((e) => <option key={e.id} value={e.id}>{e.nombre} · {e.puesto}</option>)}</Selector></Campo>
                <Campo etiqueta="Prenda"><Selector value={l.slug} onChange={(e) => fijar(l.clave, { slug: e.target.value, variante_id: '' })}>
                  <option value="">Elige…</option>{catalogo.data?.map((x) => <option key={x.slug} value={x.slug}>{x.nombre}</option>)}</Selector></Campo>
                <Campo etiqueta="Talla y color"><Selector value={l.variante_id} onChange={(e) => fijar(l.clave, { variante_id: Number(e.target.value) || '' })} disabled={!l.slug}>
                  <option value="">Elige…</option>{(varPorSlug.get(l.slug) || []).map((v) => <option key={v.id} value={v.id}>{v.talla} · {v.color}</option>)}</Selector></Campo>
                <Campo etiqueta="Cantidad">
                  <div className="flex h-10 items-center justify-between rounded-lg ring-1 ring-tinta-200">
                    <button type="button" className="px-2" aria-label="Menos" onClick={() => fijar(l.clave, { cantidad: Math.max(1, l.cantidad - 1) })}><Minus className="h-3.5 w-3.5" /></button>
                    <span className="font-bold">{l.cantidad}</span>
                    <button type="button" className="px-2" aria-label="Más" onClick={() => fijar(l.clave, { cantidad: Math.min(50, l.cantidad + 1) })}><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                </Campo>
                <button type="button" aria-label="Quitar artículo" onClick={() => setLineas((ls) => (ls || []).filter((x) => x.clave !== l.clave))}
                  className="mb-1 rounded-lg p-2 text-tinta-400 hover:bg-coral-50 hover:text-coral-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <Boton variante="secundario" icono={<Plus className="h-4 w-4" />}
            onClick={() => setLineas((ls) => [...(ls || []), { clave: `n${Date.now()}`, empleado_id: '', slug: '', variante_id: '', cantidad: 1, excepcion: null }])}>Agregar artículo</Boton>
          <Campo etiqueta="Motivo del cambio" ayuda="Se le envía a la sucursal junto con el detalle (mínimo 5 caracteres)."><Texto value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
          <ErrorCaja error={guardar.error || cuenta.error} />
          <div className="flex justify-end gap-2">
            <Boton variante="secundario" onClick={cerrar}>Cancelar</Boton>
            <Boton cargando={guardar.isPending} disabled={!completas || motivo.trim().length < 5} onClick={() => guardar.mutate()}>Guardar cambios</Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}
