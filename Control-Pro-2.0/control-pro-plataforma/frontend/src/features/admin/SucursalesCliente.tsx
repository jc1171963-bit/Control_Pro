/**
 * Sucursales (cuentas cliente-empresa): el distribuidor las da de alta, edita sus datos y dirección, controla su acceso
 * y su contraseña. La sucursal solo administra a sus empleados.
 */
import { FormEvent, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, KeyRound, Lock, MapPin, Plus, Power, Search, Store, Unlock, Users } from 'lucide-react';
import { get, post, put } from '../../api/cliente';
import type { Direccion, Pagina, PedidoResumen } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { Aviso, Boton, Campo, Entrada, ErrorCaja, Estado, Modal, Paginacion, Selector, Tarjeta, useAviso, Vacio } from '../../components/ui';
import { Aparecer, EsqueletoLista } from '../../components/movimiento';
import { cls, fecha, fechaHora } from '../../lib/formato';
import { Encabezado } from './AdminLayout';
import { Contacto, SelectorZona, useOrganizacion, ZonaRef } from './Organizacion';

export type CuentaSucursal = {
  id: number; correo: string; nombre: string; telefono: string | null; razon_social: string | null; rfc: string | null; activo: boolean;
  zona: ZonaRef | null;
  creado: string; bloqueado_hasta: string | null; ultimo_acceso: string | null; empleados_activos: number; solicitudes: number;
  en_curso: number; por_revisar: number; ultima_solicitud: string | null; direccion: Direccion | null;
  empleados?: { id: number; numero: string; nombre: string; puesto: string; area: string | null; activo: boolean }[];
  solicitudes_recientes?: PedidoResumen[];
};

const provisional = (c: CuentaSucursal) => !!c.direccion?.referencias?.startsWith('Dirección provisional');

/** Zona de la sucursal (la división se toma de la zona). */
function CamposOrganizacion({ c }: { c?: Partial<CuentaSucursal> }) {
  return <Campo etiqueta="Zona" ayuda="La división se asigna según la zona."><SelectorZona valor={c?.zona?.id} /></Campo>;
}
const organizacionDe = (f: Record<string, string>) => ({ zona_id: f.zona_id ? Number(f.zona_id) : null });

const bloqueada = (c: CuentaSucursal) => !!c.bloqueado_hasta && new Date(c.bloqueado_hasta) > new Date();

/** Contraseña legible para entregar a la sucursal (letras y números, sin caracteres confusos). */
function generarPassword() {
  const letras = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const numeros = '23456789';
  const r = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(r.slice(0, 7), (n) => letras[n % letras.length]).join('') + Array.from(r.slice(7), (n) => numeros[n % numeros.length]).join('');
}

function CamposDireccion({ d }: { d?: Partial<Direccion> | null }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Campo etiqueta="Recibe (nombre o área)"><Entrada name="destinatario" defaultValue={d?.destinatario} required minLength={3} /></Campo>
      <Campo etiqueta="Teléfono de entrega"><Entrada name="dir_telefono" defaultValue={d?.telefono} required /></Campo>
      <Campo etiqueta="Calle"><Entrada name="calle" defaultValue={d?.calle} required /></Campo>
      <Campo etiqueta="Número"><Entrada name="numero" defaultValue={d?.numero} required /></Campo>
      <Campo etiqueta="Colonia"><Entrada name="colonia" defaultValue={d?.colonia} required /></Campo>
      <Campo etiqueta="Código postal"><Entrada name="cp" defaultValue={d?.cp} required pattern="[0-9]{5}" maxLength={5} /></Campo>
      <Campo etiqueta="Ciudad"><Entrada name="ciudad" defaultValue={d?.ciudad} required /></Campo>
      <Campo etiqueta="Estado"><Entrada name="estado" defaultValue={d?.estado} required /></Campo>
      <Campo etiqueta="Referencias (opcional)" className="sm:col-span-2"><Entrada name="referencias" defaultValue={d?.referencias || ''} /></Campo>
    </div>
  );
}

const direccionDe = (f: Record<string, string>) => ({
  destinatario: f.destinatario, telefono: f.dir_telefono, calle: f.calle, numero: f.numero, colonia: f.colonia, cp: f.cp,
  ciudad: f.ciudad, estado: f.estado, referencias: f.referencias || null,
});

function NuevaSucursal({ onCerrar }: { onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [password, setPassword] = useState(generarPassword);
  const m = useMutation({
    mutationFn: (f: Record<string, string>) => post<CuentaSucursal>('/admin/cuentas-sucursal', {
      razon_social: f.razon_social, nombre: f.nombre, correo: f.correo, telefono: f.telefono || null, rfc: f.rfc || null,
      password, direccion: { alias: 'Sucursal', ...direccionDe(f) }, ...organizacionDe(f),
    }),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ['cuentas-sucursal'] }); qc.invalidateQueries({ queryKey: ['organizacion-sucursales'] }); avisar(`Sucursal ${c.razon_social} creada. Entrégale su correo y contraseña.`); onCerrar(); },
  });
  return (
    <form className="space-y-5" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); m.mutate(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre de la sucursal o razón social" className="sm:col-span-2"><Entrada name="razon_social" required minLength={3} /></Campo>
        <Campo etiqueta="Contacto responsable"><Entrada name="nombre" required minLength={3} /></Campo>
        <Campo etiqueta="Teléfono (opcional)"><Entrada name="telefono" /></Campo>
        <Campo etiqueta="Correo de acceso"><Entrada name="correo" type="email" required /></Campo>
        <Campo etiqueta="RFC (opcional)"><Entrada name="rfc" className="uppercase" maxLength={13} /></Campo>
      </div>
      <CamposOrganizacion />
      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-bold"><MapPin className="h-4 w-4 text-menta-600" />Dirección de entrega</p>
        <CamposDireccion />
      </div>
      <Campo etiqueta="Contraseña inicial" ayuda="Entrégasela a la sucursal; solo el distribuidor puede cambiarla.">
        <div className="flex gap-2"><Entrada value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
          <Boton type="button" variante="secundario" onClick={() => setPassword(generarPassword())}>Generar</Boton></div>
      </Campo>
      <ErrorCaja error={m.error} />
      <div className="flex justify-end gap-2"><Boton type="button" variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton type="submit" cargando={m.isPending}>Crear sucursal</Boton></div>
    </form>
  );
}

export function SucursalesCliente() {
  const { puede } = useAuth();
  const [texto, setTexto] = useState('');
  const [buscar, setBuscar] = useState('');
  const [activo, setActivo] = useState('1');
  const [pagina, setPagina] = useState(1);
  const [nueva, setNueva] = useState(false);
  const [params] = useSearchParams();
  const [division, setDivision] = useState('');
  const [zona, setZona] = useState(params.get('zona') || '');
  const [estado, setEstado] = useState('');
  const org = useOrganizacion();
  const filtro = new URLSearchParams({ pagina: String(pagina), por_pagina: '24', ...(buscar ? { q: buscar } : {}), ...(activo ? { activo } : {}),
    ...(division ? { division } : {}), ...(zona ? { zona } : {}), ...(estado ? { estado } : {}) }).toString();
  const q = useQuery({ queryKey: ['cuentas-sucursal', filtro], placeholderData: keepPreviousData,
    queryFn: () => get<Pagina<CuentaSucursal>>(`/admin/cuentas-sucursal?${filtro}`) });
  const zonasVisibles = (org.data?.divisiones || []).filter((d) => !division || String(d.id ?? '-') === division).flatMap((d) => d.zonas);
  const zonaActual = (org.data?.divisiones || []).flatMap((d) => d.zonas).find((z) => String(z.id) === zona);
  const cambiar = (fn: (v: string) => void) => (v: string) => { fn(v); setPagina(1); };
  return (
    <>
      <Encabezado titulo="Sucursales" sub="Cuentas de las sucursales que solicitan uniformes para sus empleados">
        {puede('cliente.gestionar') && <Boton icono={<Plus className="h-4 w-4" />} onClick={() => setNueva(true)}>Nueva sucursal</Boton>}
      </Encabezado>
      <Tarjeta>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <form onSubmit={(e) => { e.preventDefault(); setBuscar(texto); setPagina(1); }} className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-300" />
            <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre, contacto o correo" className="w-64 pl-9" />
          </form>
          <Selector value={division} onChange={(e) => { cambiar(setDivision)(e.target.value); setZona(''); }} className="!w-44" aria-label="División">
            <option value="">Todas las divisiones</option>{org.data?.divisiones.map((d) => <option key={d.nombre} value={d.id ?? '-'}>{d.nombre} ({d.total})</option>)}</Selector>
          <Selector value={zona} onChange={(e) => cambiar(setZona)(e.target.value)} className="!w-52" aria-label="Zona">
            <option value="">Todas las zonas</option>{zonasVisibles.map((z) => <option key={z.id} value={z.id}>{z.nombre} ({z.total})</option>)}</Selector>
          <Selector value={estado} onChange={(e) => cambiar(setEstado)(e.target.value)} className="!w-48" aria-label="Estado">
            <option value="">Todos los estados</option>{org.data?.estados.map((x) => <option key={x} value={x}>{x}</option>)}</Selector>
          {[['1', 'Activas'], ['0', 'Inactivas'], ['', 'Todas']].map(([v, n]) => (
            <button key={v} onClick={() => { setActivo(v); setPagina(1); }} className={cls('rounded-full px-3 py-1 text-xs font-semibold ring-1 transition', activo === v ? 'bg-tinta-900 text-white ring-tinta-900' : 'ring-tinta-200 hover:bg-tinta-50')}>{n}</button>
          ))}
        </div>
        {!zona && zonasVisibles.length > 0 && (
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {zonasVisibles.map((z) => (
              <button key={z.id} onClick={() => cambiar(setZona)(String(z.id))} className="shrink-0 rounded-xl px-3 py-2 text-left ring-1 ring-tinta-100 transition hover:bg-menta-50 hover:ring-menta-300">
                <span className="block text-xs font-bold">{z.nombre}</span>
                <span className="block text-[11px] text-tinta-400">{z.activas} activa(s){z.division ? ` · ${z.division.nombre}` : ''}</span>
              </button>
            ))}
          </div>
        )}
        {zonaActual && (
          <div className="mb-4 grid gap-3 rounded-xl bg-menta-50 p-3 sm:grid-cols-[1fr_1fr_auto]">
            <div><p className="font-display text-lg font-bold">Zona {zonaActual.nombre}</p>
              <p className="text-xs text-tinta-500">{zonaActual.division ? `División ${zonaActual.division.nombre} · ` : ''}{zonaActual.total} sucursal(es) en {zonaActual.estados.join(', ')}</p></div>
            <Contacto compacto rol="Gerente de zona" nombre={zonaActual.gerente} correo={zonaActual.correo} telefono={zonaActual.telefono} />
            <button onClick={() => cambiar(setZona)('')} className="self-start text-xs font-semibold text-menta-700">Ver todas las zonas</button>
          </div>
        )}
        <ErrorCaja error={q.error} />
        {q.isLoading ? <EsqueletoLista /> : !q.data?.items.length ? <Vacio titulo="Sin sucursales" texto="Da de alta la primera sucursal con el botón Nueva sucursal." /> : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {q.data.items.map((c, i) => (
              <Aparecer key={c.id} orden={i}>
                <Link to={`/admin/sucursales-cliente/${c.id}`} className={cls('group block h-full rounded-2xl p-4 ring-1 transition hover:-translate-y-0.5 hover:shadow-suave', c.activo ? 'bg-white ring-tinta-100' : 'bg-tinta-50 ring-tinta-100 opacity-75')}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex items-center gap-2"><span className="grid h-10 w-10 place-items-center rounded-xl bg-menta-50 text-menta-700"><Store className="h-5 w-5" /></span>
                      <span><span className="block font-display font-bold leading-tight">{c.razon_social || c.nombre}</span>
                        <span className="block text-xs text-tinta-400">{c.zona ? `Zona ${c.zona.nombre}` : 'Sin zona'}{c.zona?.division ? ` · ${c.zona.division.nombre}` : ''}</span></span></span>
                    <span className="flex flex-col items-end gap-1">
                      <span className={cls('rounded-full px-2 py-0.5 text-[11px] font-bold', c.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-tinta-200 text-tinta-600')}>{c.activo ? 'Activa' : 'Inactiva'}</span>
                      {bloqueada(c) && <span className="flex items-center gap-1 rounded-full bg-coral-100 px-2 py-0.5 text-[11px] font-bold text-coral-700"><Lock className="h-3 w-3" />Bloqueada</span>}
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-arena-50 p-2"><dt className="text-[10px] uppercase text-tinta-400">Empleados</dt><dd className="font-display text-lg font-extrabold">{c.empleados_activos}</dd></div>
                    <div className="rounded-lg bg-arena-50 p-2"><dt className="text-[10px] uppercase text-tinta-400">En curso</dt><dd className="font-display text-lg font-extrabold">{c.en_curso}</dd></div>
                    <div className={cls('rounded-lg p-2', c.por_revisar ? 'bg-amber-50' : 'bg-arena-50')}><dt className="text-[10px] uppercase text-tinta-400">Por revisar</dt><dd className="font-display text-lg font-extrabold">{c.por_revisar}</dd></div>
                  </dl>
                  <p className="mt-3 flex items-center justify-between text-xs text-tinta-400">
                    <span>{c.direccion ? c.direccion.estado : 'Sin dirección'}{provisional(c) && <span className="ml-1 font-semibold text-amber-700">· dirección por capturar</span>} · {c.solicitudes} solicitud(es)</span>
                    <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </p>
                </Link>
              </Aparecer>
            ))}
          </div>
        )}
        {q.data && <Paginacion pagina={q.data.pagina} paginas={q.data.paginas} total={q.data.total} onCambio={setPagina} />}
      </Tarjeta>
      <Modal abierto={nueva} titulo="Nueva sucursal" onCerrar={() => setNueva(false)} ancho="max-w-2xl">{nueva && <NuevaSucursal onCerrar={() => setNueva(false)} />}</Modal>
    </>
  );
}

export function SucursalCliente() {
  const { id } = useParams();
  const { puede } = useAuth();
  const qc = useQueryClient();
  const avisar = useAviso();
  const q = useQuery({ queryKey: ['cuenta-sucursal', id], queryFn: () => get<CuentaSucursal>(`/admin/cuentas-sucursal/${id}`) });
  const [modal, setModal] = useState<'datos' | 'direccion' | 'password' | 'estado' | null>(null);
  const [password, setPassword] = useState('');
  const refrescar = (c: CuentaSucursal, texto: string) => {
    qc.setQueryData(['cuenta-sucursal', id], { ...q.data, ...c });
    qc.invalidateQueries({ queryKey: ['cuentas-sucursal'] });
    avisar(texto); setModal(null);
  };
  const datos = useMutation({ mutationFn: (f: Record<string, string>) => put<CuentaSucursal>(`/admin/cuentas-sucursal/${id}`, {
    razon_social: f.razon_social, nombre: f.nombre, correo: f.correo, telefono: f.telefono || null, rfc: f.rfc || null, ...organizacionDe(f) }),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ['organizacion-sucursales'] }); refrescar(c, 'Datos de la sucursal actualizados.'); } });
  const direccion = useMutation({ mutationFn: (f: Record<string, string>) => put<CuentaSucursal>(`/admin/cuentas-sucursal/${id}/direccion`, { alias: 'Sucursal', ...direccionDe(f) }),
    onSuccess: (c) => refrescar(c, 'Dirección de entrega actualizada.') });
  const clave = useMutation({ mutationFn: () => post<CuentaSucursal>(`/admin/cuentas-sucursal/${id}/password`, { password }),
    onSuccess: (c) => refrescar(c, 'Contraseña actualizada. Entrégasela a la sucursal.') });
  const estado = useMutation({ mutationFn: () => put<CuentaSucursal>(`/admin/cuentas-sucursal/${id}`, { activo: !q.data!.activo }),
    onSuccess: (c) => refrescar(c, c.activo ? 'Sucursal activada.' : 'Sucursal desactivada: ya no puede entrar.') });
  const desbloquear = useMutation({ mutationFn: () => post<CuentaSucursal>(`/admin/cuentas-sucursal/${id}/desbloquear`),
    onSuccess: (c) => refrescar(c, 'Cuenta desbloqueada.'), onError: (e: any) => avisar(e.message, 'error') });

  if (q.isLoading) return <EsqueletoLista filas={3} />;
  if (!q.data) return <ErrorCaja error={q.error} />;
  const c = q.data;
  const gestiona = puede('cliente.gestionar');
  const enviar = (fn: (f: Record<string, string>) => void) => (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); fn(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>); };
  return (
    <>
      <Encabezado titulo={c.razon_social || c.nombre} sub={`Sucursal desde ${fecha(c.creado)} · último acceso ${c.ultimo_acceso ? fechaHora(c.ultimo_acceso) : 'nunca'}`}>
        <Link to="/admin/sucursales-cliente" className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold ring-1 ring-tinta-200">Volver</Link>
        {gestiona && <Boton variante={c.activo ? 'secundario' : 'menta'} icono={<Power className="h-4 w-4" />} onClick={() => setModal('estado')}>{c.activo ? 'Desactivar' : 'Activar'}</Boton>}
      </Encabezado>
      {!c.activo && <div className="mb-4"><Aviso tipo="alerta">Sucursal inactiva: no puede entrar al portal ni enviar solicitudes.</Aviso></div>}
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Tarjeta titulo="Datos generales" accion={gestiona && <Boton tam="sm" variante="secundario" onClick={() => setModal('datos')}>Editar</Boton>}>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-tinta-400">Sucursal / razón social</dt><dd className="font-semibold">{c.razon_social || '—'}</dd></div>
              <div><dt className="text-xs text-tinta-400">Contacto responsable</dt><dd className="font-semibold">{c.nombre}</dd></div>
              <div><dt className="text-xs text-tinta-400">Correo de acceso</dt><dd className="font-semibold">{c.correo}</dd></div>
              <div><dt className="text-xs text-tinta-400">Teléfono</dt><dd className="font-semibold">{c.telefono || '—'}</dd></div>
              <div><dt className="text-xs text-tinta-400">RFC</dt><dd className="font-semibold">{c.rfc || '—'}</dd></div>
              <div><dt className="text-xs text-tinta-400">División</dt><dd className="font-semibold">{c.zona?.division?.nombre || 'Sin división'}</dd></div>
              <div><dt className="text-xs text-tinta-400">Zona</dt><dd className="font-semibold">{c.zona?.nombre || 'Sin zona'}</dd></div>
            </dl>
          </Tarjeta>
          <Tarjeta titulo="Dirección de entrega" accion={gestiona && <Boton tam="sm" variante="secundario" onClick={() => setModal('direccion')}>{c.direccion ? 'Editar' : 'Agregar'}</Boton>}>
            {provisional(c) && <div className="mb-3"><Aviso tipo="alerta">Dirección provisional: captura la dirección real para que los envíos lleguen correctamente.</Aviso></div>}
            {c.direccion ? <p className="text-sm">{c.direccion.destinatario} · {c.direccion.telefono}<br />{c.direccion.calle} {c.direccion.numero}, {c.direccion.colonia}<br />{c.direccion.ciudad}, {c.direccion.estado} · CP {c.direccion.cp}
              {c.direccion.referencias && !provisional(c) && <span className="block text-xs text-tinta-400">{c.direccion.referencias}</span>}</p>
              : <Aviso tipo="alerta">Sin dirección: la sucursal no puede crear solicitudes hasta que la registres.</Aviso>}
          </Tarjeta>
          <Tarjeta titulo={<span className="flex items-center gap-2"><Users className="h-4 w-4" />Empleados ({c.empleados?.filter((e) => e.activo).length})</span>} sub="Los da de alta y edita la propia sucursal">
            {!c.empleados?.length ? <p className="text-sm text-tinta-400">La sucursal aún no registra empleados.</p> : (
              <div className="grid gap-2 sm:grid-cols-2">
                {c.empleados.map((e) => (
                  <div key={e.id} className={cls('rounded-lg p-2 text-sm ring-1 ring-tinta-100', !e.activo && 'opacity-50')}>
                    <p className="font-semibold">{e.nombre}</p><p className="text-xs text-tinta-400">No. {e.numero} · {e.puesto}{e.area ? ` · ${e.area}` : ''}{!e.activo ? ' · inactivo' : ''}</p>
                  </div>
                ))}
              </div>
            )}
          </Tarjeta>
          <Tarjeta titulo="Solicitudes recientes">
            {!c.solicitudes_recientes?.length ? <p className="text-sm text-tinta-400">Sin solicitudes enviadas.</p> : (
              <ul className="divide-y divide-tinta-100">
                {c.solicitudes_recientes.map((p) => (
                  <li key={p.id}><Link to={`/admin/pedidos/${p.id}`} className="flex items-center justify-between gap-2 py-2 text-sm hover:text-menta-700">
                    <span><b>{p.folio}</b> · {fecha(p.creado)} · {p.articulos} prenda(s)</span><Estado valor={p.estado} /></Link></li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>
        <div className="space-y-5">
          <Tarjeta titulo="Acceso al portal">
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between"><span className="text-tinta-500">Estado</span><span className="font-semibold">{c.activo ? 'Activa' : 'Inactiva'}</span></li>
              <li className="flex justify-between"><span className="text-tinta-500">Bloqueo por intentos</span><span className="font-semibold">{bloqueada(c) ? `Hasta ${fechaHora(c.bloqueado_hasta)}` : 'No'}</span></li>
              <li className="flex justify-between"><span className="text-tinta-500">Último acceso</span><span className="font-semibold">{c.ultimo_acceso ? fechaHora(c.ultimo_acceso) : 'Nunca'}</span></li>
            </ul>
            {gestiona && (
              <div className="mt-4 grid gap-2">
                <Boton variante="secundario" icono={<KeyRound className="h-4 w-4" />} onClick={() => { setPassword(generarPassword()); setModal('password'); }}>Cambiar contraseña</Boton>
                {bloqueada(c) && <Boton variante="secundario" icono={<Unlock className="h-4 w-4" />} cargando={desbloquear.isPending} onClick={() => desbloquear.mutate()}>Desbloquear</Boton>}
              </div>
            )}
            <p className="mt-3 text-xs text-tinta-400">La sucursal no puede cambiar su contraseña ni sus datos; solo administra a sus empleados.</p>
          </Tarjeta>
          {c.zona && (
            <Tarjeta titulo="Responsables">
              <div className="space-y-3">
                <Contacto rol={`Gerente de zona · ${c.zona.nombre}`} nombre={c.zona.gerente} correo={c.zona.correo} telefono={c.zona.telefono} />
                {c.zona.division && <Contacto rol={`Responsable divisional · ${c.zona.division.nombre}`} nombre={c.zona.division.responsable} correo={c.zona.division.correo} telefono={c.zona.division.telefono} />}
              </div>
            </Tarjeta>
          )}
          <Tarjeta titulo="Resumen">
            <dl className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-arena-50 p-3"><dt className="text-[10px] uppercase text-tinta-400">Solicitudes</dt><dd className="font-display text-2xl font-extrabold">{c.solicitudes}</dd></div>
              <div className="rounded-lg bg-arena-50 p-3"><dt className="text-[10px] uppercase text-tinta-400">En curso</dt><dd className="font-display text-2xl font-extrabold">{c.en_curso}</dd></div>
              <div className="rounded-lg bg-arena-50 p-3"><dt className="text-[10px] uppercase text-tinta-400">Por revisar</dt><dd className="font-display text-2xl font-extrabold">{c.por_revisar}</dd></div>
              <div className="rounded-lg bg-arena-50 p-3"><dt className="text-[10px] uppercase text-tinta-400">Empleados</dt><dd className="font-display text-2xl font-extrabold">{c.empleados_activos}</dd></div>
            </dl>
          </Tarjeta>
        </div>
      </div>

      <Modal abierto={modal === 'datos'} titulo="Datos de la sucursal" onCerrar={() => setModal(null)} ancho="max-w-xl">
        <form className="space-y-4" onSubmit={enviar((f) => datos.mutate(f))}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Sucursal / razón social" className="sm:col-span-2"><Entrada name="razon_social" defaultValue={c.razon_social || ''} required minLength={3} /></Campo>
            <Campo etiqueta="Contacto responsable"><Entrada name="nombre" defaultValue={c.nombre} required minLength={3} /></Campo>
            <Campo etiqueta="Teléfono"><Entrada name="telefono" defaultValue={c.telefono || ''} /></Campo>
            <Campo etiqueta="Correo de acceso"><Entrada name="correo" type="email" defaultValue={c.correo} required /></Campo>
            <Campo etiqueta="RFC"><Entrada name="rfc" defaultValue={c.rfc || ''} className="uppercase" maxLength={13} /></Campo>
          </div>
          <CamposOrganizacion c={c} />
          <ErrorCaja error={datos.error} />
          <div className="flex justify-end gap-2"><Boton type="button" variante="secundario" onClick={() => setModal(null)}>Cancelar</Boton><Boton type="submit" cargando={datos.isPending}>Guardar</Boton></div>
        </form>
      </Modal>
      <Modal abierto={modal === 'direccion'} titulo="Dirección de entrega" onCerrar={() => setModal(null)} ancho="max-w-xl">
        <form className="space-y-4" onSubmit={enviar((f) => direccion.mutate(f))}>
          <CamposDireccion d={c.direccion} />
          <ErrorCaja error={direccion.error} />
          <div className="flex justify-end gap-2"><Boton type="button" variante="secundario" onClick={() => setModal(null)}>Cancelar</Boton><Boton type="submit" cargando={direccion.isPending}>Guardar</Boton></div>
        </form>
      </Modal>
      <Modal abierto={modal === 'password'} titulo="Cambiar contraseña de la sucursal" onCerrar={() => setModal(null)}>
        <div className="space-y-4">
          <Campo etiqueta="Nueva contraseña" ayuda="Mínimo 8 caracteres con letras y números. La anterior deja de funcionar.">
            <div className="flex gap-2"><Entrada value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
              <Boton type="button" variante="secundario" onClick={() => setPassword(generarPassword())}>Generar</Boton></div>
          </Campo>
          <ErrorCaja error={clave.error} />
          <div className="flex justify-end gap-2"><Boton variante="secundario" onClick={() => setModal(null)}>Cancelar</Boton><Boton cargando={clave.isPending} disabled={password.length < 8} onClick={() => clave.mutate()}>Guardar contraseña</Boton></div>
        </div>
      </Modal>
      <Modal abierto={modal === 'estado'} titulo={c.activo ? 'Desactivar sucursal' : 'Activar sucursal'} onCerrar={() => setModal(null)}>
        <p className="text-sm text-tinta-600">{c.activo ? 'La sucursal no podrá entrar al portal ni enviar solicitudes. Sus solicitudes en curso siguen su proceso normal.' : 'La sucursal podrá volver a entrar y enviar solicitudes.'}</p>
        <div className="mt-3"><ErrorCaja error={estado.error} /></div>
        <div className="mt-4 flex justify-end gap-2"><Boton variante="secundario" onClick={() => setModal(null)}>Cancelar</Boton>
          <Boton variante={c.activo ? 'peligro' : 'menta'} cargando={estado.isPending} onClick={() => estado.mutate()}>{c.activo ? 'Desactivar' : 'Activar'}</Boton></div>
      </Modal>
    </>
  );
}
