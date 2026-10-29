import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Pencil, Plus, Search, UserPlus } from 'lucide-react';
import { get, post, put } from '../../api/cliente';
import type { Cliente, Pagina, Sucursal, Usuario } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { Boton, Campo, Cargando, Entrada, ErrorCaja, Estado, Modal, Paginacion, Selector, Tabla, Tarjeta, Td, useAviso } from '../../components/ui';
import { cls, dinero, fecha, fechaHora } from '../../lib/formato';
import { ListaNotificaciones } from '../cuenta/Notificaciones';
import { Encabezado, useSucursalesAdmin } from './AdminLayout';

export function Clientes() {
  const [params, setParams] = useSearchParams();
  const [texto, setTexto] = useState(params.get('q') || '');
  const [pagina, setPagina] = useState(1);
  const [tipo, setTipo] = useState('');
  const q = useQuery({ queryKey: ['admin-clientes', params.get('q'), tipo, pagina], placeholderData: keepPreviousData,
    queryFn: () => get<Pagina<Cliente>>(`/admin/clientes?pagina=${pagina}&q=${encodeURIComponent(params.get('q') || '')}${tipo ? `&tipo=${tipo}` : ''}`) });
  const [sel, setSel] = useState<number | null>(null);
  const det = useQuery({ queryKey: ['admin-cliente', sel], queryFn: () => get<any>(`/admin/clientes/${sel}`), enabled: !!sel });
  return (
    <>
      <Encabezado titulo="Clientes" sub="Personas y cuentas corporativas registradas en la tienda" />
      <Tarjeta>
        <div className="mb-4 flex flex-wrap gap-2">
          <form onSubmit={(e) => { e.preventDefault(); setParams(texto ? { q: texto } : {}); setPagina(1); }} className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-300" />
            <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre, razón social o correo" className="w-72 pl-9" /></form>
          <Selector value={tipo} onChange={(e) => { setTipo(e.target.value); setPagina(1); }} className="w-40"><option value="">Todos</option><option value="persona">Personas</option><option value="empresa">Empresas</option></Selector>
        </div>
        {q.isLoading ? <Cargando /> : (
          <Tabla columnas={['Cliente', 'Correo', 'Tipo', 'RFC', 'Alta', '']} vacia={!q.data?.items.length}>
            {q.data?.items.map((c) => <tr key={c.id}><Td className="font-semibold">{c.razon_social || c.nombre}{c.razon_social && <p className="text-xs font-normal text-tinta-400">{c.nombre}</p>}</Td><Td>{c.correo}</Td>
              <Td className="capitalize">{c.tipo}</Td><Td className="font-mono text-xs">{c.rfc || '—'}</Td><Td className="text-xs">{fecha(c.creado)}</Td><Td><Boton tam="sm" variante="secundario" onClick={() => setSel(c.id)}>Ver</Boton></Td></tr>)}
          </Tabla>
        )}
        {q.data && <Paginacion pagina={q.data.pagina} paginas={q.data.paginas} total={q.data.total} onCambio={setPagina} />}
      </Tarjeta>
      <Modal abierto={!!sel} titulo={det.data ? det.data.razon_social || det.data.nombre : 'Cliente'} onCerrar={() => setSel(null)} ancho="max-w-3xl">
        {det.isLoading ? <Cargando /> : det.data && (
          <div className="space-y-4 text-sm">
            <p>{det.data.correo} · {det.data.telefono || 'sin teléfono'} · cliente desde {fecha(det.data.creado)}</p>
            <div><p className="mb-1 font-semibold">Direcciones</p>{det.data.direcciones.map((d: any) => <p key={d.id} className="text-xs">{d.alias}: {d.calle} {d.numero}, {d.colonia}, {d.ciudad} · CP {d.cp}</p>)}</div>
            <div><p className="mb-1 font-semibold">Pedidos</p>
              <Tabla columnas={['Folio', 'Fecha', 'Total', 'Estado']} vacia={!det.data.pedidos.length}>
                {det.data.pedidos.map((p: any) => <tr key={p.id}><Td><Link to={`/admin/pedidos/${p.id}`} className="font-semibold text-menta-700">{p.folio}</Link></Td><Td className="text-xs">{fecha(p.creado)}</Td><Td>{dinero(p.total)}</Td><Td><Estado valor={p.estado} /></Td></tr>)}
              </Tabla></div>
            <div><p className="mb-1 font-semibold">Pagos</p>
              <Tabla columnas={['Folio', 'Método', 'Monto', 'Estado']} vacia={!det.data.pagos.length}>
                {det.data.pagos.map((p: any) => <tr key={p.id}><Td>{p.folio}</Td><Td className="text-xs">{p.metodo}</Td><Td>{dinero(p.monto)}</Td><Td><Estado valor={p.estado} /></Td></tr>)}
              </Tabla></div>
          </div>
        )}
      </Modal>
    </>
  );
}

const DIAS = ['lunes-viernes', 'sabado', 'domingo'];

export function Sucursales() {
  const { puede } = useAuth();
  const qc = useQueryClient();
  const avisar = useAviso();
  const q = useSucursalesAdmin();
  const usuarios = useQuery({ queryKey: ['admin-usuarios'], queryFn: () => get<Usuario[]>('/admin/usuarios'), enabled: puede('usuario.gestionar') });
  const [sel, setSel] = useState<Sucursal | 'nueva' | null>(null);
  const [f, setF] = useState<any>({});
  const abrir = (s: Sucursal | 'nueva') => {
    setSel(s);
    setF(s === 'nueva' ? { codigo: '', nombre: '', direccion: '', ciudad: '', estado: '', cp: '', telefono: '', correo: '', horario: Object.fromEntries(DIAS.map((d) => [d, ''])), permite_recoger: true, activo: true, zonas: [], responsable_id: '' }
      : { ...s, telefono: s.telefono || '', correo: s.correo || '', responsable_id: s.responsable?.id || '', zonas: s.zonas || [] });
  };
  const guardar = useMutation({
    mutationFn: () => {
      const { id: _i, responsable: _r, ...resto } = f;
      const cuerpo = { ...resto, telefono: f.telefono || null, correo: f.correo || null, responsable_id: f.responsable_id ? Number(f.responsable_id) : null,
        zonas: f.zonas.filter((z: any) => z.cp_prefijo).map((z: any) => ({ cp_prefijo: String(z.cp_prefijo), prioridad: Number(z.prioridad) || 1 })) };
      return sel === 'nueva' ? post('/admin/sucursales', cuerpo) : put(`/admin/sucursales/${(sel as Sucursal).id}`, cuerpo);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-sucursales'] }); setSel(null); avisar('Sucursal guardada.'); },
  });
  return (
    <>
      <Encabezado titulo="Sucursales" sub="Datos, horarios, responsables y zonas de surtido por código postal">
        {puede('sucursal.gestionar') && <Boton icono={<Plus className="h-4 w-4" />} onClick={() => abrir('nueva')}>Nueva sucursal</Boton>}
      </Encabezado>
      {q.isLoading ? <Cargando /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {q.data?.map((s) => (
            <Tarjeta key={s.id} titulo={<span className="flex items-center gap-2"><Building2 className="h-4 w-4 text-menta-600" />{s.nombre}</span>} sub={`${s.codigo} · ${s.activo ? 'Operativa' : 'Inactiva'}`}
              accion={puede('sucursal.gestionar') && <Boton tam="sm" variante="secundario" icono={<Pencil className="h-3.5 w-3.5" />} onClick={() => abrir(s)}>Editar</Boton>}>
              <dl className="space-y-1 text-sm">
                <p>{s.direccion}, {s.ciudad}, {s.estado} · CP {s.cp}</p>
                <p className="text-tinta-500">{s.telefono} · {s.correo}</p>
                <p className="text-tinta-500">Responsable: <b>{s.responsable?.nombre || 'sin asignar'}</b></p>
                <p className="text-xs text-tinta-400">Horario: {Object.entries(s.horario || {}).map(([k, v]) => `${k} ${v}`).join(' · ')}</p>
                <p className="text-xs text-tinta-400">Zonas (CP): {s.zonas?.map((z) => `${z.cp_prefijo}* (p${z.prioridad})`).join(', ') || '—'}</p>
                <p className={cls('text-xs font-semibold', s.permite_recoger ? 'text-menta-700' : 'text-tinta-400')}>{s.permite_recoger ? 'Entrega en mostrador habilitada' : 'Sin entrega en mostrador'}</p>
              </dl>
            </Tarjeta>
          ))}
        </div>
      )}
      <Modal abierto={!!sel} titulo={sel === 'nueva' ? 'Nueva sucursal' : `Editar ${f.nombre}`} onCerrar={() => setSel(null)} ancho="max-w-2xl">
        <div className="grid gap-3 sm:grid-cols-2">
          {[['codigo', 'Código'], ['nombre', 'Nombre'], ['direccion', 'Dirección'], ['ciudad', 'Ciudad'], ['estado', 'Estado'], ['cp', 'Código postal'], ['telefono', 'Teléfono'], ['correo', 'Correo']].map(([k, n]) =>
            <Campo key={k} etiqueta={n}><Entrada value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Campo>)}
          <Campo etiqueta="Responsable"><Selector value={f.responsable_id || ''} onChange={(e) => setF({ ...f, responsable_id: e.target.value })}><option value="">Sin asignar</option>
            {usuarios.data?.map((u) => <option key={u.id} value={u.id}>{u.nombre} · {u.rol.nombre}</option>)}</Selector></Campo>
          <div className="space-y-2 pt-6 text-sm">
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={f.permite_recoger} onChange={(e) => setF({ ...f, permite_recoger: e.target.checked })} />Entrega en mostrador</label>
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} />Activa</label>
          </div>
          <div className="sm:col-span-2"><p className="mb-1 text-sm font-semibold">Horario</p><div className="grid gap-2 sm:grid-cols-3">
            {DIAS.map((d) => <Campo key={d} etiqueta={d}><Entrada value={f.horario?.[d] || ''} placeholder="09:00-19:00" onChange={(e) => setF({ ...f, horario: { ...f.horario, [d]: e.target.value } })} /></Campo>)}</div></div>
          <div className="sm:col-span-2"><p className="mb-1 text-sm font-semibold">Zonas de surtido (prefijo de CP y prioridad; 1 = primera opción)</p>
            {(f.zonas || []).map((z: any, i: number) => (
              <div key={i} className="mb-2 flex gap-2"><Entrada value={z.cp_prefijo} placeholder="50" onChange={(e) => setF({ ...f, zonas: f.zonas.map((x: any, j: number) => j === i ? { ...x, cp_prefijo: e.target.value } : x) })} />
                <Entrada type="number" min={1} value={z.prioridad} onChange={(e) => setF({ ...f, zonas: f.zonas.map((x: any, j: number) => j === i ? { ...x, prioridad: e.target.value } : x) })} className="w-24" />
                <Boton variante="fantasma" onClick={() => setF({ ...f, zonas: f.zonas.filter((_: any, j: number) => j !== i) })}>Quitar</Boton></div>
            ))}
            <Boton tam="sm" variante="secundario" onClick={() => setF({ ...f, zonas: [...(f.zonas || []), { cp_prefijo: '', prioridad: 1 }] })}>Agregar zona</Boton>
          </div>
          <div className="sm:col-span-2"><ErrorCaja error={guardar.error} /></div>
          <div className="flex justify-end gap-2 sm:col-span-2"><Boton variante="secundario" onClick={() => setSel(null)}>Cancelar</Boton><Boton cargando={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton></div>
        </div>
      </Modal>
    </>
  );
}

type Rol = { codigo: string; nombre: string; descripcion: string; alcance_global: boolean; permisos: string[] };

export function Usuarios() {
  const qc = useQueryClient();
  const avisar = useAviso();
  const q = useQuery({ queryKey: ['admin-usuarios'], queryFn: () => get<Usuario[]>('/admin/usuarios') });
  const roles = useQuery({ queryKey: ['admin-roles'], queryFn: () => get<Rol[]>('/admin/roles') });
  const sucs = useSucursalesAdmin();
  const [sel, setSel] = useState<Usuario | 'nuevo' | null>(null);
  const [f, setF] = useState<any>({});
  const abrir = (u: Usuario | 'nuevo') => { setSel(u); setF(u === 'nuevo' ? { correo: '', nombre: '', rol: 'inventario', sucursales: [], activo: true, password: '' } : { correo: u.correo, nombre: u.nombre, rol: u.rol.codigo, sucursales: u.sucursales.map((s) => s.id), activo: u.activo, password: '' }); };
  const rolSel = roles.data?.find((r) => r.codigo === f.rol);
  const guardar = useMutation({
    mutationFn: () => { const cuerpo = { ...f, password: f.password || null, sucursales: rolSel?.alcance_global ? [] : f.sucursales };
      return sel === 'nuevo' ? post('/admin/usuarios', cuerpo) : put(`/admin/usuarios/${(sel as Usuario).id}`, cuerpo); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-usuarios'] }); setSel(null); avisar('Usuario guardado.'); },
  });
  const desbloquear = useMutation({ mutationFn: (id: number) => post(`/admin/usuarios/${id}/desbloquear`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-usuarios'] }); avisar('Usuario desbloqueado.'); } });
  return (
    <>
      <Encabezado titulo="Usuarios y roles" sub="Cada permiso se valida en el servidor, junto con el alcance por sucursal">
        <Boton icono={<UserPlus className="h-4 w-4" />} onClick={() => abrir('nuevo')}>Nuevo usuario</Boton>
      </Encabezado>
      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Tarjeta>
          {q.isLoading ? <Cargando /> : (
            <Tabla columnas={['Usuario', 'Rol', 'Alcance', 'Último acceso', 'Estado', '']} vacia={!q.data?.length}>
              {q.data?.map((u) => <tr key={u.id}><Td><p className="font-semibold">{u.nombre}</p><p className="text-xs text-tinta-400">{u.correo}</p></Td><Td className="text-xs">{u.rol.nombre}</Td>
                <Td className="text-xs">{u.rol.alcance_global ? 'Todas' : u.sucursales.map((s) => s.nombre.replace('Sucursal ', '')).join(', ')}</Td><Td className="text-xs">{fechaHora(u.ultimo_acceso)}</Td>
                <Td>{u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date() ? <button className="text-xs font-semibold text-coral-600" onClick={() => desbloquear.mutate(u.id)}>Bloqueado · desbloquear</button>
                  : <span className={cls('text-xs font-semibold', u.activo ? 'text-menta-700' : 'text-tinta-400')}>{u.activo ? 'Activo' : 'Inactivo'}</span>}</Td>
                <Td><Boton tam="sm" variante="fantasma" icono={<Pencil className="h-3.5 w-3.5" />} onClick={() => abrir(u)}>Editar</Boton></Td></tr>)}
            </Tabla>
          )}
        </Tarjeta>
        <Tarjeta titulo="Roles">
          <ul className="space-y-3 text-sm">{roles.data?.map((r) => <li key={r.codigo}><p className="font-semibold">{r.nombre} <span className="text-xs font-normal text-tinta-400">{r.alcance_global ? '· global' : '· por sucursal'}</span></p>
            <p className="text-xs text-tinta-500">{r.descripcion}</p><p className="mt-1 text-[11px] text-tinta-400">{r.permisos.length} permisos</p></li>)}</ul>
        </Tarjeta>
      </div>
      <Modal abierto={!!sel} titulo={sel === 'nuevo' ? 'Nuevo usuario' : 'Editar usuario'} onCerrar={() => setSel(null)}>
        <div className="space-y-3">
          <Campo etiqueta="Nombre"><Entrada value={f.nombre || ''} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></Campo>
          <Campo etiqueta="Correo"><Entrada type="email" value={f.correo || ''} onChange={(e) => setF({ ...f, correo: e.target.value })} /></Campo>
          <Campo etiqueta="Rol"><Selector value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value })}>{roles.data?.map((r) => <option key={r.codigo} value={r.codigo}>{r.nombre}</option>)}</Selector></Campo>
          {rolSel && !rolSel.alcance_global && <div><p className="mb-1 text-sm font-semibold">Sucursales asignadas</p>{sucs.data?.map((s) => <label key={s.id} className="mr-4 inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.sucursales.includes(s.id)} onChange={(e) => setF({ ...f, sucursales: e.target.checked ? [...f.sucursales, s.id] : f.sucursales.filter((x: number) => x !== s.id) })} />{s.nombre}</label>)}</div>}
          <Campo etiqueta={sel === 'nuevo' ? 'Contraseña inicial' : 'Nueva contraseña (opcional)'} ayuda="8+ caracteres con letras y números"><Entrada type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></Campo>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} />Activo</label>
          <ErrorCaja error={guardar.error} />
          <div className="flex justify-end gap-2"><Boton variante="secundario" onClick={() => setSel(null)}>Cancelar</Boton><Boton cargando={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton></div>
        </div>
      </Modal>
    </>
  );
}

type Aud = { id: number; fecha: string; accion: string; entidad: string; entidad_id: number | null; sucursal_id: number | null; actor: string; antes: any; despues: any; ip: string | null };

export function Auditoria() {
  const [f, setF] = useState({ entidad: '', accion: '' });
  const [aplicado, setAplicado] = useState(f);
  const [pagina, setPagina] = useState(1);
  const q = useQuery({ queryKey: ['auditoria', aplicado, pagina], placeholderData: keepPreviousData,
    queryFn: () => get<Pagina<Aud>>(`/admin/auditoria?pagina=${pagina}&por_pagina=30${aplicado.entidad ? `&entidad=${aplicado.entidad}` : ''}${aplicado.accion ? `&accion=${encodeURIComponent(aplicado.accion)}` : ''}`) });
  const [sel, setSel] = useState<Aud | null>(null);
  return (
    <>
      <Encabezado titulo="Auditoría" sub="Bitácora de solo inserción: no puede modificarse ni borrarse" />
      <Tarjeta>
        <form onSubmit={(e) => { e.preventDefault(); setAplicado(f); setPagina(1); }} className="mb-4 flex flex-wrap gap-2">
          <Selector value={f.entidad} onChange={(e) => setF({ ...f, entidad: e.target.value })} className="w-44"><option value="">Todas las entidades</option>
            {['pedido', 'pago', 'reembolso', 'inventario', 'transferencia', 'paquete', 'devolucion', 'incidencia', 'producto', 'promocion', 'sucursal', 'usuario', 'cliente'].map((x) => <option key={x}>{x}</option>)}</Selector>
          <Entrada value={f.accion} onChange={(e) => setF({ ...f, accion: e.target.value })} placeholder="Acción (ej. validar)" className="w-56" />
          <Boton type="submit" variante="secundario" icono={<Search className="h-4 w-4" />}>Filtrar</Boton>
        </form>
        {q.isLoading ? <Cargando /> : (
          <Tabla columnas={['Fecha', 'Acción', 'Entidad', 'Actor', 'IP', '']} vacia={!q.data?.items.length}>
            {q.data?.items.map((a) => <tr key={a.id}><Td className="text-xs">{fechaHora(a.fecha)}</Td><Td className="font-mono text-xs">{a.accion}</Td><Td className="text-xs">{a.entidad} #{a.entidad_id ?? '—'}</Td>
              <Td className="text-xs">{a.actor}</Td><Td className="font-mono text-xs">{a.ip || '—'}</Td><Td>{(a.antes || a.despues) && <Boton tam="sm" variante="fantasma" onClick={() => setSel(a)}>Detalle</Boton>}</Td></tr>)}
          </Tabla>
        )}
        {q.data && <Paginacion pagina={q.data.pagina} paginas={q.data.paginas} total={q.data.total} onCambio={setPagina} />}
      </Tarjeta>
      <Modal abierto={!!sel} titulo={sel ? `${sel.accion} · ${sel.entidad} #${sel.entidad_id}` : ''} onCerrar={() => setSel(null)} ancho="max-w-2xl">
        {sel && <div className="grid gap-3 sm:grid-cols-2 text-xs">
          <div><p className="mb-1 font-semibold">Antes</p><pre className="overflow-x-auto rounded-lg bg-tinta-50 p-3">{JSON.stringify(sel.antes, null, 2) || '—'}</pre></div>
          <div><p className="mb-1 font-semibold">Después</p><pre className="overflow-x-auto rounded-lg bg-tinta-50 p-3">{JSON.stringify(sel.despues, null, 2) || '—'}</pre></div>
        </div>}
      </Modal>
    </>
  );
}

export function NotificacionesAdmin() {
  return <><Encabezado titulo="Notificaciones" sub="Avisos de los eventos que requieren tu atención" /><ListaNotificaciones base="/admin" clave="notif-admin" /></>;
}
