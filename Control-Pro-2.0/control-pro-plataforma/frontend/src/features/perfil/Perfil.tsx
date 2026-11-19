/**
 * Perfil de quien inició sesión.
 * - Aprobador y distribuidora (`PerfilUsuario`, ruta /aprobador/perfil y /admin/perfil): foto, nombre, teléfono, área y
 *   cargo; contraseña; preferencias (tema, avisos en el dispositivo, app instalada).
 * - Sucursal (`PerfilSucursal`, dentro de Mi cuenta): foto, teléfono de contacto y preferencias. El nombre y el correo de
 *   la sucursal los administra el aprobador.
 */
import { FormEvent, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Camera, Check, KeyRound, Monitor, Moon, Sun, Trash2, UserRound } from 'lucide-react';
import { api, post } from '../../api/cliente';
import type { Cliente, Usuario } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { useTema } from '../../app/tema';
import Avatar, { useFotoPerfil } from '../../components/Avatar';
import { AvisosDispositivo } from '../../components/AppDispositivo';
import { Boton, Campo, Entrada, ErrorCaja, Tarjeta, useAviso } from '../../components/ui';
import { cls, fechaHora } from '../../lib/formato';

function guardarPerfil(datos: Record<string, string | null>) {
  return api<{ cuenta: Usuario | Cliente }>('/auth/perfil', { metodo: 'PATCH', cuerpo: datos });
}

/** Foto grande con acciones para cambiarla o quitarla. */
function FotoPerfil({ nombre, foto, detalle }: { nombre: string; foto?: string | null; detalle: React.ReactNode }) {
  const f = useFotoPerfil();
  return (
    <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
      {f.input}
      <button type="button" onClick={f.elegir} disabled={f.subiendo} aria-label={foto ? 'Cambiar foto de perfil' : 'Subir foto de perfil'}
        className="group relative shrink-0 rounded-full ring-4 ring-white shadow-suave">
        <Avatar nombre={nombre} foto={foto} className="h-24 w-24 text-2xl" />
        <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          <Camera className="h-6 w-6" aria-hidden /></span>
      </button>
      <div className="min-w-0">
        <p className="font-display text-xl font-extrabold leading-tight">{nombre}</p>
        <div className="mt-0.5 text-sm text-tinta-500">{detalle}</div>
        <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
          <Boton tam="sm" variante="secundario" icono={<Camera className="h-3.5 w-3.5" />} cargando={f.subiendo} onClick={f.elegir}>{foto ? 'Cambiar foto' : 'Subir foto'}</Boton>
          {foto && <Boton tam="sm" variante="fantasma" icono={<Trash2 className="h-3.5 w-3.5" />} onClick={f.quitar}>Quitar</Boton>}
        </div>
      </div>
    </div>
  );
}

/** Claro, oscuro o igual que el sistema. */
function SelectorTema() {
  const { preferencia, fijar, seguirSistema } = useTema();
  const opciones = [['claro', 'Claro', Sun], ['oscuro', 'Oscuro', Moon], ['sistema', 'Como el sistema', Monitor]] as const;
  return (
    <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-2">
      {opciones.map(([v, n, Icono]) => {
        const activo = preferencia === v;
        return (
          <button key={v} type="button" role="radio" aria-checked={activo} onClick={() => (v === 'sistema' ? seguirSistema() : fijar(v))}
            className={cls('flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-2xl px-2 text-xs font-semibold ring-1 transition',
              activo ? 'bg-menta-50 text-menta-800 ring-2 ring-menta-500' : 'text-tinta-600 ring-tinta-200 hover:bg-tinta-50')}>
            <Icono className="h-5 w-5" aria-hidden />{n}{activo && <Check className="sr-only" aria-label="seleccionado" />}
          </button>
        );
      })}
    </div>
  );
}

export function Preferencias() {
  return (
    <Tarjeta titulo="Preferencias" sub="Se guardan en este dispositivo">
      <p className="mb-2 text-sm font-semibold text-tinta-800">Tema</p>
      <SelectorTema />
      <p className="mb-2 mt-5 text-sm font-semibold text-tinta-800">Avisos y app</p>
      <AvisosDispositivo />
    </Tarjeta>
  );
}

function CambiarPassword() {
  const avisar = useAviso();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const m = useMutation({ mutationFn: () => post('/auth/password', { actual, nueva }),
    onSuccess: () => { setActual(''); setNueva(''); setRepetir(''); avisar('Contraseña actualizada. Tus otras sesiones se cerraron por seguridad.'); } });
  const reglas = [[nueva.length >= 8, '8 caracteres o más'], [/[A-Z]/.test(nueva) && /[a-z]/.test(nueva), 'Mayúsculas y minúsculas'], [/\d/.test(nueva), 'Al menos un número']] as const;
  const coincide = !!nueva && nueva === repetir;
  const enviar = (e: FormEvent) => { e.preventDefault(); if (coincide) m.mutate(); };
  return (
    <Tarjeta titulo="Contraseña" sub="Al cambiarla se cierran tus sesiones en otros dispositivos">
      <form onSubmit={enviar} className="space-y-3">
        <Campo etiqueta="Contraseña actual"><Entrada type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} required /></Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nueva contraseña"><Entrada type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} required /></Campo>
          <Campo etiqueta="Repite la nueva" error={repetir && !coincide ? 'No coincide' : undefined}><Entrada type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} required /></Campo>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {reglas.map(([ok, t]) => <li key={t} className={cls('flex items-center gap-1', ok ? 'text-menta-700' : 'text-tinta-400')}><Check className={cls('h-3.5 w-3.5', !ok && 'opacity-30')} aria-hidden />{t}</li>)}
        </ul>
        <ErrorCaja error={m.error} />
        <div className="flex justify-end"><Boton type="submit" icono={<KeyRound className="h-4 w-4" />} cargando={m.isPending} disabled={!actual || !coincide || reglas.some(([ok]) => !ok)}>Cambiar contraseña</Boton></div>
      </form>
    </Tarjeta>
  );
}

export default function PerfilUsuario() {
  const { usuario, actualizarCuenta } = useAuth();
  const avisar = useAviso();
  const [datos, setDatos] = useState({ nombre: usuario?.nombre ?? '', telefono: usuario?.telefono ?? '', area: usuario?.area ?? '', cargo: usuario?.cargo ?? '' });
  const m = useMutation({
    mutationFn: () => guardarPerfil({ nombre: datos.nombre.trim(), telefono: datos.telefono.trim() || null, area: datos.area.trim() || null, cargo: datos.cargo.trim() || null }),
    onSuccess: (r) => { actualizarCuenta(r.cuenta); avisar('Perfil actualizado.'); },
  });
  if (!usuario) return null;
  const cambio = datos.nombre !== usuario.nombre || datos.telefono !== (usuario.telefono ?? '') || datos.area !== (usuario.area ?? '') || datos.cargo !== (usuario.cargo ?? '');
  const campo = (k: keyof typeof datos) => ({ value: datos[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDatos({ ...datos, [k]: e.target.value }) });
  return (
    <div className="space-y-5">
      <div><h1 className="font-display text-2xl font-extrabold tracking-tight">Mi perfil</h1>
        <p className="text-sm text-tinta-500">Personaliza cómo te ven las sucursales y la distribuidora, y ajusta tus preferencias.</p></div>
      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <div className="space-y-5">
          <Tarjeta>
            <FotoPerfil nombre={usuario.nombre} foto={usuario.foto}
              detalle={<>{[usuario.cargo, usuario.area].filter(Boolean).join(' · ') || usuario.rol.nombre}<span className="block text-xs">{usuario.correo}</span></>} />
          </Tarjeta>
          <Tarjeta titulo="Datos de perfil" sub="Se muestran en tu menú, en los mensajes y en las solicitudes que atiendes">
            <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
              <Campo etiqueta="Nombre completo"><Entrada {...campo('nombre')} required minLength={3} maxLength={120} autoComplete="name" /></Campo>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo etiqueta="Cargo" ayuda="Por ejemplo: Gerente de compras"><Entrada {...campo('cargo')} maxLength={80} autoComplete="organization-title" /></Campo>
                <Campo etiqueta="Área"><Entrada {...campo('area')} maxLength={80} /></Campo>
                <Campo etiqueta="Teléfono" ayuda="Para que te contacten por WhatsApp"><Entrada {...campo('telefono')} inputMode="tel" maxLength={20} autoComplete="tel" /></Campo>
                <Campo etiqueta="Correo de acceso" ayuda="Lo cambia el administrador del sistema"><Entrada value={usuario.correo} disabled readOnly /></Campo>
              </div>
              <ErrorCaja error={m.error} />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-tinta-400">{usuario.ultimo_acceso ? `Último acceso: ${fechaHora(usuario.ultimo_acceso)}` : ''}</p>
                <Boton type="submit" icono={<UserRound className="h-4 w-4" />} cargando={m.isPending} disabled={!cambio || datos.nombre.trim().length < 3}>Guardar cambios</Boton>
              </div>
            </form>
          </Tarjeta>
          <CambiarPassword />
        </div>
        <div className="space-y-5"><Preferencias /></div>
      </div>
    </div>
  );
}

/** Para Mi cuenta de la sucursal: foto, teléfono de contacto y preferencias. */
export function PerfilSucursal({ cliente }: { cliente: Cliente }) {
  const { actualizarCuenta } = useAuth();
  const avisar = useAviso();
  const [telefono, setTelefono] = useState(cliente.telefono ?? '');
  const m = useMutation({ mutationFn: () => guardarPerfil({ telefono: telefono.trim() || null }),
    onSuccess: (r) => { actualizarCuenta(r.cuenta); avisar('Teléfono de contacto actualizado.'); } });
  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
      <Tarjeta titulo="Perfil de la sucursal">
        <FotoPerfil nombre={cliente.razon_social || cliente.nombre} foto={cliente.foto} detalle={<>{cliente.nombre}<span className="block text-xs">{cliente.correo}</span></>} />
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="mt-5 flex flex-wrap items-end gap-3 border-t border-tinta-100 pt-4">
          <Campo etiqueta="Teléfono de contacto" ayuda="El aprobador y la distribuidora lo usan para comunicarse contigo" className="min-w-[220px] flex-1">
            <Entrada value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" maxLength={20} autoComplete="tel" /></Campo>
          <Boton type="submit" cargando={m.isPending} disabled={telefono === (cliente.telefono ?? '')}>Guardar</Boton>
          <div className="w-full"><ErrorCaja error={m.error} /></div>
        </form>
      </Tarjeta>
      <Preferencias />
    </div>
  );
}
