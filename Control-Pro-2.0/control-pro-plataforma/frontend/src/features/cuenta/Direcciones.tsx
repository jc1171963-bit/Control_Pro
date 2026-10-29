import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Pencil, Star, Trash2 } from 'lucide-react';
import { del, get, post, put } from '../../api/cliente';
import type { Direccion } from '../../api/tipos';
import { Boton, Campo, Cargando, Entrada, ErrorCaja, Modal, Tarjeta, useAviso, Vacio } from '../../components/ui';

export function FormDireccion({ inicial, onGuardada, onCancelar }: { inicial?: Direccion; onGuardada: (d: Direccion) => void; onCancelar?: () => void }) {
  const [error, setError] = useState<unknown>(null);
  const [cargando, setCargando] = useState(false);
  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, any>;
    f.predeterminada = f.predeterminada === 'on';
    if (!f.referencias) f.referencias = null;
    setCargando(true); setError(null);
    try { onGuardada(inicial ? await put(`/cuenta/direcciones/${inicial.id}`, f) : await post('/cuenta/direcciones', f)); }
    catch (err) { setError(err); } finally { setCargando(false); }
  };
  const v = (k: keyof Direccion) => (inicial ? String(inicial[k] ?? '') : '');
  return (
    <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-2">
      <Campo etiqueta="Alias"><Entrada name="alias" defaultValue={v('alias')} placeholder="Casa, Oficina…" required /></Campo>
      <Campo etiqueta="Quién recibe"><Entrada name="destinatario" defaultValue={v('destinatario')} required /></Campo>
      <Campo etiqueta="Calle"><Entrada name="calle" defaultValue={v('calle')} required /></Campo>
      <Campo etiqueta="Número"><Entrada name="numero" defaultValue={v('numero')} required /></Campo>
      <Campo etiqueta="Colonia"><Entrada name="colonia" defaultValue={v('colonia')} required /></Campo>
      <Campo etiqueta="Código postal"><Entrada name="cp" defaultValue={v('cp')} required pattern="[0-9]{5}" inputMode="numeric" maxLength={5} /></Campo>
      <Campo etiqueta="Ciudad"><Entrada name="ciudad" defaultValue={v('ciudad')} required /></Campo>
      <Campo etiqueta="Estado"><Entrada name="estado" defaultValue={v('estado')} required /></Campo>
      <Campo etiqueta="Teléfono"><Entrada name="telefono" type="tel" defaultValue={v('telefono')} required /></Campo>
      <Campo etiqueta="Referencias (opcional)"><Entrada name="referencias" defaultValue={v('referencias')} /></Campo>
      <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" name="predeterminada" defaultChecked={inicial?.predeterminada} className="accent-menta-500" />Usar como predeterminada</label>
      <div className="sm:col-span-2"><ErrorCaja error={error} /></div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        {onCancelar && <Boton type="button" variante="secundario" onClick={onCancelar}>Cancelar</Boton>}
        <Boton type="submit" cargando={cargando}>Guardar dirección</Boton>
      </div>
    </form>
  );
}

export default function Direcciones() {
  const qc = useQueryClient();
  const avisar = useAviso();
  const q = useQuery({ queryKey: ['direcciones'], queryFn: () => get<Direccion[]>('/cuenta/direcciones') });
  const [editar, setEditar] = useState<Direccion | 'nueva' | null>(null);
  const borrar = useMutation({ mutationFn: (id: number) => del(`/cuenta/direcciones/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['direcciones'] }); avisar('Dirección eliminada.'); } });
  return (
    <Tarjeta titulo="Direcciones de entrega" accion={<Boton onClick={() => setEditar('nueva')}>Agregar</Boton>}>
      {q.isLoading ? <Cargando /> : !q.data?.length ? <Vacio titulo="Sin direcciones" texto="Agrega una dirección para recibir tus pedidos." /> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {q.data.map((d) => (
            <div key={d.id} className="rounded-xl p-4 ring-1 ring-arena-200">
              <p className="flex items-center gap-2 font-bold"><MapPin className="h-4 w-4 text-menta-600" />{d.alias}{d.predeterminada && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}</p>
              <p className="mt-1 text-sm text-tinta-600">{d.destinatario} · {d.telefono}<br />{d.calle} {d.numero}, {d.colonia}<br />{d.ciudad}, {d.estado} · CP {d.cp}</p>
              <div className="mt-3 flex gap-2">
                <Boton tam="sm" variante="secundario" icono={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditar(d)}>Editar</Boton>
                <Boton tam="sm" variante="fantasma" icono={<Trash2 className="h-3.5 w-3.5" />} onClick={() => borrar.mutate(d.id)}>Quitar</Boton>
              </div>
            </div>
          ))}
        </div>
      )}
      <ErrorCaja error={borrar.error} />
      <Modal abierto={!!editar} titulo={editar === 'nueva' ? 'Nueva dirección' : 'Editar dirección'} onCerrar={() => setEditar(null)} ancho="max-w-2xl">
        <FormDireccion inicial={editar && editar !== 'nueva' ? editar : undefined} onCancelar={() => setEditar(null)}
          onGuardada={() => { setEditar(null); qc.invalidateQueries({ queryKey: ['direcciones'] }); avisar('Dirección guardada.'); }} />
      </Modal>
    </Tarjeta>
  );
}
