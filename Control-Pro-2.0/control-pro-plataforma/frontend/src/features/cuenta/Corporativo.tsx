import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Power, UserPlus } from 'lucide-react';
import { get, post, put } from '../../api/cliente';
import type { ProductoResumen } from '../../api/tipos';
import { Boton, Campo, Cargando, Entrada, ErrorCaja, Modal, Selector, Tarjeta, useAviso, Vacio } from '../../components/ui';
import { useMediaQuery } from '../../components/useMediaQuery';
import { PUESTOS } from '../../lib/catalogo';
import { cls, mensajeError } from '../../lib/formato';

export type EmpleadoCorporativo = { id: number; numero: string; nombre: string; puesto: string; area: string | null; activo: boolean };
type Empleado = EmpleadoCorporativo;

export function productoElegible(empleado: EmpleadoCorporativo | undefined, producto: ProductoResumen | undefined,
  puestos: Record<string, number[]> | undefined) {
  return !empleado || !producto || (puestos?.[empleado.puesto] || []).includes(producto.id);
}

const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Empleados de la empresa. El backend solo permite listar, crear y editar: no se elimina, se desactiva (activo=false). */
export function Empleados() {
  const qc = useQueryClient();
  const avisar = useAviso();
  const ancho = useMediaQuery('(min-width: 768px)');
  const q = useQuery({ queryKey: ['empleados'], queryFn: () => get<Empleado[]>('/cuenta/empleados') });
  const [editar, setEditar] = useState<Empleado | 'nuevo' | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busca, setBusca] = useState('');
  const [estado, setEstado] = useState<'todos' | 'activos' | 'inactivos'>('todos');
  const alternar = useMutation({
    mutationFn: (e: Empleado) => put(`/cuenta/empleados/${e.id}`, { numero: e.numero, nombre: e.nombre, puesto: e.puesto, area: e.area, activo: !e.activo }),
    onSuccess: (_r, e) => { qc.invalidateQueries({ queryKey: ['empleados'] }); avisar(e.activo ? `${e.nombre} quedó inactivo.` : `${e.nombre} quedó activo.`); },
    onError: (err) => avisar(mensajeError(err), 'error'),
  });
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
  const termino = normalizar(busca.trim());
  const filas = (q.data || []).filter((e) => (estado === 'todos' || e.activo === (estado === 'activos'))
    && (!termino || normalizar(`${e.numero} ${e.nombre} ${e.puesto} ${e.area || ''}`).includes(termino)));
  const abrir = (v: Empleado | 'nuevo') => { setError(null); setEditar(v); };
  const acciones = (e: Empleado) => (
    <span className="flex flex-wrap justify-end gap-1.5">
      <Boton tam="sm" variante="fantasma" icono={<Pencil className="h-3.5 w-3.5" />} onClick={() => abrir(e)} aria-label={`Editar a ${e.nombre}`}>Editar</Boton>
      <Boton tam="sm" variante="secundario" icono={<Power className="h-3.5 w-3.5" />} disabled={alternar.isPending} onClick={() => alternar.mutate(e)}
        aria-label={`${e.activo ? 'Desactivar' : 'Activar'} a ${e.nombre}`}>{e.activo ? 'Desactivar' : 'Activar'}</Boton>
    </span>
  );
  const insignia = (e: Empleado) => <span className={cls('text-xs font-semibold', e.activo ? 'text-menta-700' : 'text-tinta-500')}>{e.activo ? 'Activo' : 'Inactivo'}</span>;
  return (
    <Tarjeta titulo="Empleados" sub="Personas que reciben uniformes en las solicitudes. No se eliminan: se desactivan."
      accion={<Boton icono={<UserPlus className="h-4 w-4" />} onClick={() => abrir('nuevo')}>Agregar</Boton>}>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block w-full text-sm sm:max-w-xs"><span className="mb-1 block font-semibold text-tinta-800">Buscar</span>
          <Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nombre, número, puesto o área" /></label>
        <label className="block w-full text-sm sm:w-44"><span className="mb-1 block font-semibold text-tinta-800">Estado</span>
          <Selector value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)}>
            <option value="todos">Todos</option><option value="activos">Activos</option><option value="inactivos">Inactivos</option></Selector></label>
      </div>
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : q.error ? null : !filas.length ? (
        q.data?.length ? <Vacio titulo="Sin coincidencias" texto="Prueba otra búsqueda o cambia el estado." />
          : <Vacio titulo="Aún no hay empleados" texto="Agrega a las personas que recibirán uniformes para poder crear solicitudes." />
      ) : ancho ? (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Empleados de la empresa</caption>
          <thead><tr className="border-b border-tinta-100 text-[11px] uppercase text-tinta-400">
            <th scope="col" className="py-2 pr-3">Número</th><th scope="col" className="px-3 py-2">Nombre</th><th scope="col" className="px-3 py-2">Puesto</th>
            <th scope="col" className="px-3 py-2">Área</th><th scope="col" className="px-3 py-2">Estado</th><th scope="col" className="py-2 pl-3"><span className="sr-only">Acciones</span></th></tr></thead>
          <tbody className="divide-y divide-tinta-100">
            {filas.map((e) => (
              <tr key={e.id} className={cls(!e.activo && 'text-tinta-500')}><td className="py-3 pr-3">{e.numero}</td><td className="px-3 py-3 font-semibold">{e.nombre}</td>
                <td className="px-3 py-3">{e.puesto}</td><td className="px-3 py-3">{e.area || '—'}</td><td className="px-3 py-3">{insignia(e)}</td><td className="py-3 pl-3">{acciones(e)}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="space-y-3">
          {filas.map((e) => (
            <li key={e.id} className="rounded-xl p-4 ring-1 ring-tinta-100">
              <div className="flex items-start justify-between gap-2"><p className="font-semibold">{e.nombre}</p>{insignia(e)}</div>
              <p className="text-sm text-tinta-500">No. {e.numero} · {e.puesto}{e.area ? ` · ${e.area}` : ''}</p>
              <div className="mt-2">{acciones(e)}</div>
            </li>
          ))}
        </ul>
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
