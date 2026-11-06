import { FormEvent, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, UserPlus } from 'lucide-react';
import { get, post, put } from '../../api/cliente';
import type { ProductoResumen } from '../../api/tipos';
import { Boton, Campo, Cargando, Entrada, ErrorCaja, Modal, Selector, Tabla, Tarjeta, Td, useAviso } from '../../components/ui';
import { PUESTOS } from '../../lib/catalogo';
import { cls } from '../../lib/formato';

export type EmpleadoCorporativo = { id: number; numero: string; nombre: string; puesto: string; area: string | null; activo: boolean };
type Empleado = EmpleadoCorporativo;

export function productoElegible(empleado: EmpleadoCorporativo | undefined, producto: ProductoResumen | undefined,
  puestos: Record<string, number[]> | undefined) {
  return !empleado || !producto || (puestos?.[empleado.puesto] || []).includes(producto.id);
}

export function Empleados() {
  const qc = useQueryClient();
  const avisar = useAviso();
  const q = useQuery({ queryKey: ['empleados'], queryFn: () => get<Empleado[]>('/cuenta/empleados') });
  const [editar, setEditar] = useState<Empleado | 'nuevo' | null>(null);
  const [error, setError] = useState<unknown>(null);
  const guardar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, any>;
    f.activo = f.activo === 'on';
    if (!f.area) f.area = null;
    try {
      await (editar === 'nuevo' ? post('/cuenta/empleados', f) : put(`/cuenta/empleados/${(editar as Empleado).id}`, f));
      qc.invalidateQueries({ queryKey: ['empleados'] }); setEditar(null); setError(null); avisar('Empleado guardado.');
    } catch (err) { setError(err); }
  };
  const ed = editar && editar !== 'nuevo' ? editar : null;
  return (
    <Tarjeta titulo="Empleados" sub="Personas que reciben uniformes en los pedidos corporativos" accion={<Boton icono={<UserPlus className="h-4 w-4" />} onClick={() => setEditar('nuevo')}>Agregar</Boton>}>
      {q.isLoading ? <Cargando /> : (
        <Tabla columnas={['Número', 'Nombre', 'Puesto', 'Área', 'Estado', '']} vacia={!q.data?.length}>
          {q.data?.map((e) => (
            <tr key={e.id}><Td>{e.numero}</Td><Td className="font-semibold">{e.nombre}</Td><Td>{e.puesto}</Td><Td>{e.area || '—'}</Td>
              <Td><span className={cls('text-xs font-semibold', e.activo ? 'text-menta-700' : 'text-tinta-400')}>{e.activo ? 'Activo' : 'Inactivo'}</span></Td>
              <Td><Boton tam="sm" variante="fantasma" icono={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditar(e)}>Editar</Boton></Td></tr>
          ))}
        </Tabla>
      )}
      <Modal abierto={!!editar} titulo={ed ? 'Editar empleado' : 'Nuevo empleado'} onCerrar={() => setEditar(null)}>
        <form onSubmit={guardar} className="grid gap-3 sm:grid-cols-2" key={ed?.id || 'nuevo'}>
          <Campo etiqueta="Número de empleado"><Entrada name="numero" defaultValue={ed?.numero} required /></Campo>
          <Campo etiqueta="Nombre completo"><Entrada name="nombre" defaultValue={ed?.nombre} required minLength={3} /></Campo>
          <Campo etiqueta="Puesto"><Selector name="puesto" defaultValue={ed?.puesto || PUESTOS[0]}>{PUESTOS.map((p) => <option key={p}>{p}</option>)}</Selector></Campo>
          <Campo etiqueta="Área (opcional)"><Entrada name="area" defaultValue={ed?.area || ''} /></Campo>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="activo" defaultChecked={ed ? ed.activo : true} className="accent-menta-500" />Activo</label>
          <div className="sm:col-span-2"><ErrorCaja error={error} /></div>
          <div className="flex justify-end gap-2 sm:col-span-2"><Boton type="button" variante="secundario" onClick={() => setEditar(null)}>Cancelar</Boton><Boton type="submit">Guardar</Boton></div>
        </form>
      </Modal>
    </Tarjeta>
  );
}
