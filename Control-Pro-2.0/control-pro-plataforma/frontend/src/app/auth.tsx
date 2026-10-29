import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { post, renovar, sesion, TipoSesion, ultimaRenovacion } from '../api/cliente';
import type { Cliente, Usuario } from '../api/tipos';

type Estado = { tipo: TipoSesion | null; cliente: Cliente | null; usuario: Usuario | null; cargando: boolean };
type Ctx = Estado & {
  entrarCliente: (correo: string, password: string) => Promise<void>;
  entrarUsuario: (correo: string, password: string) => Promise<void>;
  registrar: (datos: Record<string, unknown>) => Promise<void>;
  salir: () => Promise<void>;
  puede: (...permisos: string[]) => boolean;
  actualizarCuenta: (c: Cliente | Usuario) => void;
};

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [estado, setEstado] = useState<Estado>({ tipo: null, cliente: null, usuario: null, cargando: true });

  const aplicar = useCallback((tipo: TipoSesion, cuenta: any, token?: string) => {
    if (token) sesion.fijar(token);
    setEstado({ tipo, cliente: tipo === 'cliente' ? cuenta : null, usuario: tipo === 'usuario' ? cuenta : null, cargando: false });
  }, []);

  useEffect(() => {
    renovar().then((ok) => {
      if (ok && ultimaRenovacion) aplicar(ultimaRenovacion.tipo, ultimaRenovacion.cuenta);
      else setEstado((e) => ({ ...e, cargando: false }));
    });
    const quitar = sesion.alExpirar(() => {
      if (!sesion.token()) setEstado({ tipo: null, cliente: null, usuario: null, cargando: false });
    });
    return () => { quitar(); };
  }, [aplicar]);

  const valor: Ctx = {
    ...estado,
    async entrarCliente(correo, password) {
      const d = await post('/auth/cliente/login', { correo, password });
      qc.clear();
      aplicar('cliente', d.cuenta, d.access_token);
    },
    async entrarUsuario(correo, password) {
      const d = await post('/auth/login', { correo, password });
      qc.clear();
      aplicar('usuario', d.cuenta, d.access_token);
    },
    async registrar(datos) {
      const d = await post('/auth/cliente/registro', datos);
      qc.clear();
      aplicar('cliente', d.cuenta, d.access_token);
    },
    async salir() {
      const csrf = document.cookie.split('; ').find((c) => c.startsWith('csrf_refresh_token='))?.split('=')[1];
      await fetch('/api/auth/logout', {
        method: 'POST', credentials: 'include',
        headers: { ...(sesion.token() ? { Authorization: `Bearer ${sesion.token()}` } : {}), ...(csrf ? { 'X-CSRF-TOKEN': decodeURIComponent(csrf) } : {}) },
      }).catch(() => undefined);
      sesion.fijar(null);
      qc.clear();
      setEstado({ tipo: null, cliente: null, usuario: null, cargando: false });
    },
    puede: (...permisos) => !!estado.usuario && permisos.every((p) => estado.usuario!.permisos.includes(p)),
    actualizarCuenta: (c) => setEstado((e) => (e.tipo === 'cliente' ? { ...e, cliente: c as Cliente } : { ...e, usuario: c as Usuario })),
  };
  return <AuthCtx.Provider value={valor}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth fuera de AuthProvider');
  return c;
}
