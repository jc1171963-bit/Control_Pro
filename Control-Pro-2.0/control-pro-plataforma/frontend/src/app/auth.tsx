import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { cabeceraCsrf, navegador, post, renovar, sesion, TipoSesion, ultimaRenovacion } from '../api/cliente';
import type { Cliente, Usuario } from '../api/tipos';
import { AvisoSesion } from '../components/AvisoSesion';
import * as actividad from './actividad';
import { olvidarDispositivo, revisarSuscripcion } from './pwa';

type Estado = { tipo: TipoSesion | null; cliente: Cliente | null; usuario: Usuario | null; cargando: boolean };
type Ctx = Estado & {
  entrarCliente: (correo: string, password: string) => Promise<void>;
  entrarUsuario: (correo: string, password: string) => Promise<void>;
  /** Portal Salud Digna: sucursales y aprobador corporativo con el mismo formulario. Devuelve quién entró. */
  entrarPortal: (correo: string, password: string) => Promise<{ tipo: TipoSesion; cuenta: Cliente | Usuario }>;
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
    void revisarSuscripcion(); // también al reanudar, cuando el token no cambia
    setEstado({ tipo, cliente: tipo === 'cliente' ? cuenta : null, usuario: tipo === 'usuario' ? cuenta : null, cargando: false });
  }, []);

  /** Limpia solo esta pestaña (sin llamar al servidor). */
  const limpiarLocal = useCallback(() => {
    sesion.fijar(null);
    qc.clear();
    setEstado({ tipo: null, cliente: null, usuario: null, cargando: false });
  }, [qc]);

  useEffect(() => {
    actividad.instalar();
    actividad.configurar({
      async cierreGlobal() { // el usuario cerró o el servidor confirmó el fin: revoca el sid y limpia
        // Antes de revocar (aún hay sesión para avisar al servidor): los avisos push de esta cuenta no deben seguir
        // llegando a este dispositivo. Si la sesión ya no sirve, igual se cancela la suscripción en el navegador.
        await olvidarDispositivo();
        await fetch('/api/auth/logout', {
          method: 'POST', credentials: 'include',
          headers: { ...(sesion.token() ? { Authorization: `Bearer ${sesion.token()}` } : {}), ...cabeceraCsrf() },
        }).catch(() => undefined);
        limpiarLocal();
      },
      cierreRemoto: limpiarLocal, // otra pestaña ya cerró la sesión
      pausa: () => qc.clear(),
      reanudado: (d) => aplicar(d.tipo, d.cuenta),
    });
    const quitar = sesion.alExpirar(() => {
      if (sesion.token()) return;
      setEstado({ tipo: null, cliente: null, usuario: null, cargando: false });
      actividad.sesionPerdida(sesion.motivo()); // 401 confirmado al renovar: cierre global
    });
    // Otra pestaña inició sesión con otra cuenta (la cookie ya es suya): nada de la cuenta anterior debe quedar a la vista.
    // Se vacía la caché y se recarga; al arrancar, esta pestaña toma la cuenta vigente. No es un cierre: no revoca nada.
    const quitarCambio = sesion.alCambiarIdentidad(() => {
      qc.clear();
      navegador.recargar();
    });
    // Una pestaña en pausa no se recupera sola: espera a que el servidor confirme y la renovación se complete.
    if (actividad.obtenerFase() !== 'pausada') {
      renovar().then((ok) => {
        if (ok && ultimaRenovacion) {
          aplicar(ultimaRenovacion.tipo, ultimaRenovacion.cuenta);
          actividad.iniciar(ultimaRenovacion.sesion);
        } else setEstado((e) => ({ ...e, cargando: false }));
      });
    }
    return () => { quitar(); quitarCambio(); };
  }, [aplicar, limpiarLocal, qc]);

  const entrar = (d: any, tipo: TipoSesion) => {
    qc.clear();
    aplicar(tipo, d.cuenta, d.access_token);
    actividad.iniciar(d.sesion);
  };

  const valor: Ctx = {
    ...estado,
    async entrarCliente(correo, password) {
      entrar(await post('/auth/cliente/login', { correo, password }), 'cliente');
    },
    async entrarUsuario(correo, password) {
      entrar(await post('/auth/login', { correo, password }), 'usuario');
    },
    async entrarPortal(correo, password) {
      const d = await post('/auth/portal/login', { correo, password });
      entrar(d, d.tipo);
      return { tipo: d.tipo, cuenta: d.cuenta };
    },
    async registrar(datos) {
      entrar(await post('/auth/cliente/registro', datos), 'cliente');
    },
    async salir() {
      // Cierre global: olvida este dispositivo para push, revoca la sesión en el servidor y cierra todas las pestañas.
      await actividad.cierreGlobal('cierre');
    },
    puede: (...permisos) => !!estado.usuario && permisos.every((p) => estado.usuario!.permisos.includes(p)),
    actualizarCuenta: (c) => setEstado((e) => (e.tipo === 'cliente' ? { ...e, cliente: c as Cliente } : { ...e, usuario: c as Usuario })),
  };
  return (
    <AuthCtx.Provider value={valor}>
      {children}
      <AvisoSesion onCerrarSesion={() => void valor.salir()} />
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth fuera de AuthProvider');
  return c;
}
