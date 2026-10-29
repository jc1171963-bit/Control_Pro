import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { post } from '../../api/cliente';
import { useAuth } from '../../app/auth';
import { Aviso, Boton, Campo, Entrada, ErrorCaja } from '../../components/ui';
import { Marca } from '../tienda/TiendaLayout';

export function AdminEntrar() {
  const { entrarUsuario } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<unknown>(null);
  const [cargando, setCargando] = useState(false);
  const [recuperar, setRecuperar] = useState<null | { mensaje: string; token_desarrollo?: string }>(null);
  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setCargando(true); setError(null);
    try {
      await entrarUsuario(String(f.get('correo')), String(f.get('password')));
      const s = params.get('siguiente');
      nav(s && s.startsWith('/admin') ? s : '/admin', { replace: true });
    } catch (err) { setError(err); } finally { setCargando(false); }
  };
  const pedirRecuperacion = async () => {
    const correo = (document.querySelector('input[name=correo]') as HTMLInputElement)?.value;
    if (!correo) { setError(new Error('Escribe tu correo para recuperar el acceso.')); return; }
    setRecuperar(await post('/auth/recuperar', { correo, tipo: 'usuario' }));
  };
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-tinta-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -left-20 bottom-0 h-96 w-96 rounded-full bg-menta-500/20 blur-3xl" />
        <Marca claro />
        <div className="relative">
          <h1 className="font-display text-4xl font-extrabold leading-tight">Operación centralizada para tres sucursales.</h1>
          <p className="mt-3 max-w-md text-tinta-300">Pedidos, inventario, surtido, pagos, devoluciones y auditoría con permisos por rol y por sucursal.</p>
        </div>
        <p className="relative text-xs text-tinta-400">Acceso exclusivo para personal autorizado. Toda acción queda registrada.</p>
      </div>
      <div className="flex items-center justify-center bg-tinta-50 p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Marca /></div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-menta-700"><ShieldCheck className="h-4 w-4" />Personal interno</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold">Inicia sesión</h2>
          <form onSubmit={enviar} className="mt-6 space-y-4">
            <Campo etiqueta="Correo institucional"><Entrada name="correo" type="email" autoComplete="username" required /></Campo>
            <Campo etiqueta="Contraseña"><Entrada name="password" type="password" autoComplete="current-password" required /></Campo>
            <ErrorCaja error={error} />
            <Boton type="submit" className="w-full" tam="lg" cargando={cargando}>Entrar al panel</Boton>
          </form>
          <button onClick={pedirRecuperacion} className="mt-4 text-sm font-semibold text-tinta-500 hover:text-tinta-800">Olvidé mi contraseña</button>
          {recuperar && <div className="mt-3 space-y-2"><Aviso>{recuperar.mensaje}</Aviso>
            {recuperar.token_desarrollo && <Link className="text-xs font-bold text-amber-800 underline" to={`/admin/restablecer?token=${recuperar.token_desarrollo}`}>Modo desarrollo: abrir enlace</Link>}</div>}
          <Link to="/" className="mt-8 block text-xs text-tinta-400 hover:text-tinta-700">← Volver a la tienda</Link>
        </div>
      </div>
    </div>
  );
}
