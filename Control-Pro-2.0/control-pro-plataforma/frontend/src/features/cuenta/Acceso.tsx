import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { post } from '../../api/cliente';
import { useAuth } from '../../app/auth';
import { useConfig } from '../../app/config';
import { Aviso, Boton, Campo, Entrada, ErrorCaja } from '../../components/ui';
import { cls } from '../../lib/formato';
import { Cintas } from '../tienda/Decoracion';

/** Marco de acceso con la identidad de la tienda LURIMA (estas rutas viven en su layout). Solo presentación. */
function Marco({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-b from-lurima-50 to-white">
      <Cintas className="absolute -left-24 bottom-0 h-32 w-[40rem] opacity-40" />
      <div className="contenedor relative flex justify-center py-10 sm:py-14">
        <div className="grid w-full max-w-4xl overflow-hidden rounded-[2rem] bg-white shadow-suave ring-1 ring-lurima-100 md:grid-cols-[1fr_1.1fr]">
          <div className="relative hidden min-h-[32rem] bg-lurima-950 md:block" aria-hidden>
            <img src="/assets/escenas/uniformes-clinicos.webp" alt="" width={1200} height={1200} className="absolute inset-0 h-full w-full object-cover opacity-70" />
            <span className="absolute inset-0 bg-gradient-to-t from-lurima-950 via-lurima-950/50 to-lurima-900/10" />
            <div className="absolute inset-x-0 bottom-0 p-8 text-white">
              <span className="block h-14 w-14 overflow-hidden rounded-full bg-white ring-4 ring-white/20"><img src="/lurima-logo.jpeg" alt="" className="h-full w-full scale-[1.6] object-cover" /></span>
              <p className="mt-4 font-display text-2xl font-extrabold leading-tight">Distribuidora Lurima</p>
              <p className="text-sm text-lurima-100">Salud y bienestar a tu alcance</p>
            </div>
          </div>
          <div className="p-7 sm:p-10">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-lurima-900 sm:text-3xl">{titulo}</h1>
            {sub && <p className="mt-1 text-sm text-tinta-600">{sub}</p>}
            <div className="mt-7">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const destinoSeguro = (s: string | null, defecto: string) => (s && s.startsWith('/') && !s.startsWith('//') ? s : defecto);

export function Entrar() {
  const { entrarCliente } = useAuth();
  const { canalTienda } = useConfig();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<unknown>(null);
  const [cargando, setCargando] = useState(false);
  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setCargando(true); setError(null);
    try {
      await entrarCliente(String(f.get('correo')), String(f.get('password')));
      nav(destinoSeguro(params.get('siguiente'), '/cuenta'), { replace: true });
    } catch (err) { setError(err); } finally { setCargando(false); }
  };
  return (
    <Marco titulo={canalTienda ? 'Entra a tu cuenta' : 'Portal de sucursal'} sub={canalTienda ? 'Consulta pedidos, paga y da seguimiento a tus envíos.' : 'Entra con el correo y la contraseña que te dio tu distribuidor.'}>
      <form onSubmit={enviar} className="space-y-4">
        <Campo etiqueta="Correo electrónico"><Entrada name="correo" type="email" autoComplete="email" required /></Campo>
        <Campo etiqueta="Contraseña"><Entrada name="password" type="password" autoComplete="current-password" required /></Campo>
        <ErrorCaja error={error} />
        <Boton type="submit" className="w-full" tam="lg" cargando={cargando}>Entrar</Boton>
      </form>
      <div className="mt-5 flex justify-between text-sm">
        <Link to="/recuperar" className="font-semibold text-tinta-500 hover:text-tinta-800">¿Olvidaste tu contraseña?</Link>
        {canalTienda && <Link to={`/registro${params.get('siguiente') ? `?siguiente=${encodeURIComponent(params.get('siguiente')!)}` : ''}`} className="font-semibold text-menta-700">Crear cuenta</Link>}
      </div>
    </Marco>
  );
}

const esquemaRegistro = z.object({
  nombre: z.string().trim().min(3, 'Escribe tu nombre completo.'),
  correo: z.string().email('Correo inválido.'),
  telefono: z.string().regex(/^[0-9+\-\s()]{8,20}$/, 'Teléfono inválido.').optional().or(z.literal('')),
  password: z.string().min(8, 'Mínimo 8 caracteres.').regex(/[A-Za-z]/, 'Incluye letras.').regex(/[0-9]/, 'Incluye números.'),
  confirmar: z.string(),
  tipo: z.enum(['persona', 'empresa']),
  razon_social: z.string().optional(),
  rfc: z.string().regex(/^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/, 'RFC inválido (en mayúsculas).').optional().or(z.literal('')),
}).refine((d) => d.password === d.confirmar, { path: ['confirmar'], message: 'Las contraseñas no coinciden.' })
  .refine((d) => d.tipo === 'persona' || (d.razon_social || '').trim().length >= 3, { path: ['razon_social'], message: 'Indica la razón social.' });

export function Registro() {
  const { registrar } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { canalTienda } = useConfig();
  const [tipo, setTipo] = useState<'persona' | 'empresa'>(params.get('tipo') === 'empresa' || !canalTienda ? 'empresa' : 'persona');
  useEffect(() => { if (!canalTienda) setTipo('empresa'); }, [canalTienda]);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [cargando, setCargando] = useState(false);
  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = { ...Object.fromEntries(new FormData(e.currentTarget)), tipo } as Record<string, string>;
    const r = esquemaRegistro.safeParse(datos);
    if (!r.success) { setErrores(Object.fromEntries(r.error.issues.map((i) => [i.path[0], i.message]))); return; }
    setErrores({}); setCargando(true); setError(null);
    try {
      const { confirmar: _c, ...resto } = r.data;
      await registrar({ ...resto, telefono: resto.telefono || null, rfc: resto.rfc || null, razon_social: tipo === 'empresa' ? resto.razon_social : null });
      nav(destinoSeguro(params.get('siguiente'), tipo === 'empresa' ? '/cuenta' : '/catalogo'), { replace: true });
    } catch (err) { setError(err); } finally { setCargando(false); }
  };
  return (
    !canalTienda ? (
    <Marco titulo="Alta de sucursales" sub="Las cuentas de sucursal las crea tu distribuidor.">
      <Aviso>Pide a tu distribuidor que dé de alta tu sucursal; te entregará el correo y la contraseña para entrar al portal.</Aviso>
      <p className="mt-4 text-center text-sm">¿Ya tienes cuenta? <Link to="/entrar" className="font-semibold text-menta-700">Entra</Link></p>
    </Marco>
    ) : <Marco titulo={canalTienda ? 'Crea tu cuenta' : 'Registra tu sucursal'} sub={canalTienda ? 'Compra en línea y sigue cada pedido.' : 'Solicita uniformes por empleado y sigue cada entrega.'}>
      {canalTienda && <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-arena-100 p-1 text-sm font-semibold">
        {(['persona', 'empresa'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTipo(t)} className={cls('rounded-lg py-2', tipo === t ? 'bg-white shadow-sm' : 'text-tinta-500')}>{t === 'persona' ? 'Persona' : 'Empresa'}</button>
        ))}
      </div>}
      <form onSubmit={enviar} className="space-y-4" noValidate>
        {tipo === 'empresa' && (
          <>
            <Campo etiqueta={canalTienda ? 'Razón social' : 'Nombre de la sucursal o razón social'} error={errores.razon_social}><Entrada name="razon_social" /></Campo>
            <Campo etiqueta="RFC (opcional)" error={errores.rfc}><Entrada name="rfc" className="uppercase" maxLength={13} /></Campo>
          </>
        )}
        <Campo etiqueta={tipo === 'empresa' ? 'Nombre del contacto' : 'Nombre completo'} error={errores.nombre}><Entrada name="nombre" autoComplete="name" /></Campo>
        <Campo etiqueta="Correo electrónico" error={errores.correo}><Entrada name="correo" type="email" autoComplete="email" /></Campo>
        <Campo etiqueta="Teléfono (opcional)" error={errores.telefono}><Entrada name="telefono" type="tel" autoComplete="tel" /></Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Contraseña" error={errores.password} ayuda="8+ caracteres con letras y números"><Entrada name="password" type="password" autoComplete="new-password" /></Campo>
          <Campo etiqueta="Confirmar" error={errores.confirmar}><Entrada name="confirmar" type="password" autoComplete="new-password" /></Campo>
        </div>
        <ErrorCaja error={error} />
        <Boton type="submit" className="w-full" tam="lg" cargando={cargando}>Crear cuenta</Boton>
        <p className="text-center text-sm">¿Ya tienes cuenta? <Link to="/entrar" className="font-semibold text-menta-700">Entra</Link></p>
      </form>
    </Marco>
  );
}

export function Recuperar() {
  const { canalTienda } = useConfig();
  const [hecho, setHecho] = useState<{ mensaje: string; token_desarrollo?: string } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try { setHecho(await post('/auth/recuperar', { correo: new FormData(e.currentTarget).get('correo'), tipo: 'cliente' })); } catch (err) { setError(err); }
  };
  return (
    <Marco titulo="Recupera tu acceso" sub="Te enviaremos un enlace válido por 30 minutos.">
      {hecho ? (
        <div className="space-y-3">
          <Aviso>{hecho.mensaje}</Aviso>
          {hecho.token_desarrollo && (
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Modo desarrollo (sin servidor de correo): <Link className="font-bold underline" to={`/cuenta/restablecer?token=${hecho.token_desarrollo}`}>abrir enlace de restablecimiento</Link></p>
          )}
        </div>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          {!canalTienda && <Aviso>Si eres una sucursal, tu distribuidor restablece tu contraseña: pídesela directamente.</Aviso>}
          <Campo etiqueta="Correo electrónico"><Entrada name="correo" type="email" required /></Campo>
          <ErrorCaja error={error} />
          <Boton type="submit" className="w-full">Enviar enlace</Boton>
        </form>
      )}
    </Marco>
  );
}

export function Restablecer() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [error, setError] = useState<unknown>(null);
  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get('password') !== f.get('confirmar')) { setError(new Error('Las contraseñas no coinciden.')); return; }
    try {
      const r = await post('/auth/restablecer', { token: params.get('token'), password: f.get('password') });
      nav(r.tipo === 'usuario' ? '/admin/entrar' : '/entrar', { replace: true });
    } catch (err) { setError(err); }
  };
  return (
    <Marco titulo="Nueva contraseña">
      <form onSubmit={enviar} className="space-y-4">
        <Campo etiqueta="Contraseña nueva" ayuda="8+ caracteres con letras y números"><Entrada name="password" type="password" required minLength={8} /></Campo>
        <Campo etiqueta="Confirmar"><Entrada name="confirmar" type="password" required /></Campo>
        <ErrorCaja error={error} />
        <Boton type="submit" className="w-full">Guardar</Boton>
      </form>
    </Marco>
  );
}
