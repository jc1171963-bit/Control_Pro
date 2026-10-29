import { FormEvent, useState } from 'react';
import { patch, post } from '../../api/cliente';
import type { Cliente } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { Boton, Campo, Entrada, ErrorCaja, Tarjeta, useAviso } from '../../components/ui';

export default function Perfil() {
  const { cliente, actualizarCuenta } = useAuth();
  const avisar = useAviso();
  const [e1, setE1] = useState<unknown>(null);
  const [e2, setE2] = useState<unknown>(null);
  const guardar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      const d = await patch<Cliente>('/cuenta/perfil', { nombre: f.nombre, telefono: f.telefono || null, ...(cliente?.tipo === 'empresa' ? { razon_social: f.razon_social } : {}) });
      actualizarCuenta(d); setE1(null); avisar('Perfil actualizado.');
    } catch (err) { setE1(err); }
  };
  const cambiar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
    if (f.nueva !== f.confirmar) { setE2(new Error('Las contraseñas no coinciden.')); return; }
    try { await post('/auth/password', { actual: f.actual, nueva: f.nueva }); form.reset(); setE2(null); avisar('Contraseña actualizada.'); } catch (err) { setE2(err); }
  };
  return (
    <div className="space-y-5">
      <Tarjeta titulo="Datos de contacto">
        <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
          {cliente?.tipo === 'empresa' && <Campo etiqueta="Razón social"><Entrada name="razon_social" defaultValue={cliente.razon_social || ''} /></Campo>}
          <Campo etiqueta="Nombre"><Entrada name="nombre" defaultValue={cliente?.nombre} required minLength={3} /></Campo>
          <Campo etiqueta="Teléfono"><Entrada name="telefono" defaultValue={cliente?.telefono || ''} /></Campo>
          <Campo etiqueta="Correo" ayuda="Para cambiarlo, contacta a atención a clientes."><Entrada value={cliente?.correo} disabled /></Campo>
          <div className="sm:col-span-2"><ErrorCaja error={e1} /></div>
          <div className="sm:col-span-2"><Boton type="submit">Guardar cambios</Boton></div>
        </form>
      </Tarjeta>
      <Tarjeta titulo="Contraseña">
        <form onSubmit={cambiar} className="grid gap-4 sm:grid-cols-3">
          <Campo etiqueta="Actual"><Entrada name="actual" type="password" required autoComplete="current-password" /></Campo>
          <Campo etiqueta="Nueva"><Entrada name="nueva" type="password" required minLength={8} autoComplete="new-password" /></Campo>
          <Campo etiqueta="Confirmar"><Entrada name="confirmar" type="password" required autoComplete="new-password" /></Campo>
          <div className="sm:col-span-3"><ErrorCaja error={e2} /></div>
          <div><Boton type="submit">Cambiar contraseña</Boton></div>
        </form>
      </Tarjeta>
    </div>
  );
}
