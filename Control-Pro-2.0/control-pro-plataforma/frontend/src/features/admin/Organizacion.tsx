/**
 * Organización de la red de sucursales: divisiones (con su responsable divisional) y zonas (con su gerente).
 * Directorio de contacto y edición de responsables; vacante = zona sin gerente.
 */
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Phone, UserRound } from 'lucide-react';
import { get, post, put } from '../../api/cliente';
import { useAuth } from '../../app/auth';
import { Boton, Campo, Entrada, ErrorCaja, Modal, Selector, Tarjeta, useAviso } from '../../components/ui';
import { Aparecer, EsqueletoLista } from '../../components/movimiento';
import { cls } from '../../lib/formato';
import { Encabezado } from './AdminLayout';

export type DivisionRef = { id: number; nombre: string; responsable: string | null; correo: string | null; telefono: string | null };
export type ZonaRef = { id: number; nombre: string; gerente: string | null; correo: string | null; telefono: string | null; vacante: boolean; division: DivisionRef | null };
export type ZonaOrg = ZonaRef & { total: number; activas: number; estados: string[] };
export type DivisionOrg = Omit<DivisionRef, 'id'> & { id: number | null; zonas: ZonaOrg[]; total: number; activas: number };
export type Organizacion = { divisiones: DivisionOrg[]; sin_zona: { total: number; activas: number }; estados: string[] };

export const useOrganizacion = () =>
  useQuery({ queryKey: ['organizacion-sucursales'], queryFn: () => get<Organizacion>('/admin/cuentas-sucursal/organizacion'), staleTime: 60_000 });

/** Nombre, correo y teléfono de un responsable; "Vacante" si no hay nombre. */
export function Contacto({ nombre, correo, telefono, rol, compacto = false }: { nombre: string | null; correo: string | null; telefono: string | null; rol: string; compacto?: boolean }) {
  return (
    <div className={cls('text-sm', compacto && 'text-xs')}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta-400">{rol}</p>
      <p className={cls('flex items-center gap-1.5 font-semibold', !nombre && 'text-amber-700')}><UserRound className="h-3.5 w-3.5 shrink-0" />{nombre || 'Vacante'}</p>
      {correo && <a href={`mailto:${correo}`} className="flex items-center gap-1.5 text-menta-700 hover:underline"><Mail className="h-3.5 w-3.5 shrink-0" />{correo}</a>}
      {telefono && <a href={`tel:${telefono.replace(/\s/g, '')}`} className="flex items-center gap-1.5 text-tinta-600 hover:underline"><Phone className="h-3.5 w-3.5 shrink-0" />{telefono}</a>}
    </div>
  );
}

/** Selector de zona agrupado por división (para el alta y la edición de una sucursal). */
export function SelectorZona({ valor, name = 'zona_id' }: { valor?: number | null; name?: string }) {
  const org = useOrganizacion();
  return (
    <Selector name={name} defaultValue={valor ?? ''}>
      <option value="">Sin zona</option>
      {org.data?.divisiones.map((d) => (
        <optgroup key={d.nombre} label={d.nombre}>{d.zonas.map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}</optgroup>
      ))}
    </Selector>
  );
}

type Editar = { tipo: 'division'; d: DivisionOrg } | { tipo: 'zona'; z: ZonaOrg | null; division_id: number | null };

export default function OrganizacionPagina() {
  const { puede } = useAuth();
  const qc = useQueryClient();
  const avisar = useAviso();
  const org = useOrganizacion();
  const [editar, setEditar] = useState<Editar | null>(null);
  const gestiona = puede('cliente.gestionar');
  const guardar = useMutation({
    mutationFn: (f: Record<string, string>) => {
      const contacto = { correo: f.correo || null, telefono: f.telefono || null };
      if (editar?.tipo === 'division') return put(`/admin/cuentas-sucursal/organizacion/divisiones/${editar.d.id}`, { nombre: f.nombre, responsable: f.responsable || null, ...contacto });
      const cuerpo = { nombre: f.nombre, gerente: f.gerente || null, division_id: f.division_id ? Number(f.division_id) : null, ...contacto };
      return editar?.tipo === 'zona' && editar.z ? put(`/admin/cuentas-sucursal/organizacion/zonas/${editar.z.id}`, cuerpo) : post('/admin/cuentas-sucursal/organizacion/zonas', cuerpo);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['organizacion-sucursales'] }); qc.invalidateQueries({ queryKey: ['cuentas-sucursal'] }); avisar('Organización actualizada.'); setEditar(null); },
  });
  const vacantes = org.data?.divisiones.flatMap((d) => d.zonas).filter((z) => z.vacante).length || 0;
  return (
    <>
      <Encabezado titulo="Divisiones y zonas" sub={`Directorio de responsables de la red de sucursales${vacantes ? ` · ${vacantes} zona(s) vacante(s)` : ''}`}>
        {gestiona && <Boton onClick={() => setEditar({ tipo: 'zona', z: null, division_id: null })}>Nueva zona</Boton>}
      </Encabezado>
      <ErrorCaja error={org.error} />
      {org.isLoading ? <EsqueletoLista filas={4} /> : (
        <div className="space-y-5">
          {org.data?.divisiones.map((d, i) => (
            <Aparecer key={d.nombre} orden={i}>
              <Tarjeta titulo={<span className="flex items-center gap-2">División {d.nombre}<span className="rounded-full bg-tinta-100 px-2 py-0.5 text-xs font-semibold text-tinta-600">{d.zonas.length} zonas · {d.activas} sucursales</span></span>}
                accion={gestiona && d.id != null && <Boton tam="sm" variante="secundario" onClick={() => setEditar({ tipo: 'division', d })}>Editar responsable</Boton>}>
                {d.id != null && <div className="mb-4 rounded-xl bg-menta-50 p-3"><Contacto rol="Responsable divisional" nombre={d.responsable} correo={d.correo} telefono={d.telefono} /></div>}
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {d.zonas.map((z) => (
                    <div key={z.id} className={cls('rounded-xl p-3 ring-1', z.vacante ? 'bg-amber-50/60 ring-amber-200' : 'ring-tinta-100')}>
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <Link to={`/admin/sucursales-cliente?zona=${z.id}`} className="font-display font-bold hover:text-menta-700">{z.nombre}</Link>
                        <span className="text-xs text-tinta-400">{z.activas} sucursal(es)</span>
                      </div>
                      <Contacto compacto rol="Gerente de zona" nombre={z.gerente} correo={z.correo} telefono={z.telefono} />
                      <p className="mt-2 text-[11px] text-tinta-400">{z.estados.join(' · ')}</p>
                      {gestiona && <button onClick={() => setEditar({ tipo: 'zona', z, division_id: d.id })} className="mt-2 text-xs font-semibold text-menta-700 hover:underline">Editar</button>}
                    </div>
                  ))}
                </div>
              </Tarjeta>
            </Aparecer>
          ))}
        </div>
      )}
      <Modal abierto={!!editar} titulo={editar?.tipo === 'division' ? `División ${editar.d.nombre}` : editar?.z ? `Zona ${editar.z.nombre}` : 'Nueva zona'} onCerrar={() => setEditar(null)}>
        {editar && (
          <form className="space-y-3" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); guardar.mutate(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>); }}>
            <Campo etiqueta="Nombre"><Entrada name="nombre" required defaultValue={editar.tipo === 'division' ? editar.d.nombre : editar.z?.nombre} /></Campo>
            {editar.tipo === 'zona' && (
              <Campo etiqueta="División"><Selector name="division_id" defaultValue={editar.division_id ?? ''}>
                <option value="">Sin división</option>{org.data?.divisiones.filter((d) => d.id != null).map((d) => <option key={d.id!} value={d.id!}>{d.nombre}</option>)}</Selector></Campo>
            )}
            <Campo etiqueta={editar.tipo === 'division' ? 'Responsable divisional' : 'Gerente de zona'} ayuda="Déjalo vacío si el puesto está vacante.">
              <Entrada name={editar.tipo === 'division' ? 'responsable' : 'gerente'} defaultValue={(editar.tipo === 'division' ? editar.d.responsable : editar.z?.gerente) || ''} /></Campo>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Correo"><Entrada name="correo" type="email" defaultValue={(editar.tipo === 'division' ? editar.d.correo : editar.z?.correo) || ''} /></Campo>
              <Campo etiqueta="Teléfono"><Entrada name="telefono" defaultValue={(editar.tipo === 'division' ? editar.d.telefono : editar.z?.telefono) || ''} /></Campo>
            </div>
            <ErrorCaja error={guardar.error} />
            <div className="flex justify-end gap-2"><Boton type="button" variante="secundario" onClick={() => setEditar(null)}>Cancelar</Boton><Boton type="submit" cargando={guardar.isPending}>Guardar</Boton></div>
          </form>
        )}
      </Modal>
    </>
  );
}
