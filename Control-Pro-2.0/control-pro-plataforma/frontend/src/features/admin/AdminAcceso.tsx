import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { post } from '../../api/cliente';
import { useAuth } from '../../app/auth';
import { Aviso, Boton, Campo, Entrada, ErrorCaja } from '../../components/ui';
import { MarcaLurima } from '../tienda/TiendaLayout';
import FondoPortal from '../portal/FondoPortal';

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
    <div className="tema-lu relative isolate flex min-h-screen items-center justify-center bg-[#e8eef8] px-4 py-8">
      <FondoPortal paleta="lurima" />
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/80 bg-white/55 shadow-[0_30px_80px_rgba(18,58,115,.22)] backdrop-blur-2xl lg:grid-cols-[1.05fr_1fr]">
        {/* Lado de marca: foto de uniformes con el degradado azul LURIMA y la franja de colores del logotipo. */}
        <div className="relative hidden min-h-[560px] overflow-hidden lg:block" aria-hidden>
          <img src="/assets/escenas/almacen.webp" alt="" width={1400} height={900} className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute inset-0 bg-[linear-gradient(160deg,rgba(8,28,59,.92),rgba(18,58,115,.82)_45%,rgba(31,81,146,.55))]" />
          <span className="pointer-events-none absolute inset-0 animate-destello bg-[linear-gradient(110deg,transparent_40%,#ffffff14_65%,transparent_82%)]" />
          <div className="relative flex h-full flex-col justify-between p-10 text-white">
            <div className="flex items-center gap-3">
              <span className="h-14 w-14 overflow-hidden rounded-full bg-white ring-4 ring-white/20"><img src="/lurima-logo.jpeg" alt="" className="h-full w-full scale-[1.6] object-cover" /></span>
              <span><span className="block font-display text-xl font-extrabold">Distribuidora Lurima</span><span className="block text-sm text-lurima-100">Salud y bienestar a tu alcance</span></span>
            </div>
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em]">
                <span className="h-2 w-2 rounded-full bg-bienestar-400" />Panel de operación</p>
              <h1 className="mt-4 font-display text-[40px] font-extrabold leading-[1.05] tracking-tight">Surtido, envíos y órdenes <span className="text-bienestar-400">en un solo lugar.</span></h1>
              <ul className="mt-6 space-y-2.5 text-sm text-lurima-100">
                {['Órdenes aprobadas por el corporativo, listas para surtir', 'Inventario, surtido y guías por paquete', 'Pagos, devoluciones y auditoría por rol'].map((t) => (
                  <li key={t} className="flex items-center gap-2.5"><CheckCircle2 className="h-4 w-4 shrink-0 text-bienestar-400" />{t}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-3 h-1 w-40 rounded-full bg-gradient-to-r from-lurima-400 via-bienestar-400 to-coral-500" />
              <p className="text-xs text-lurima-200">Acceso exclusivo para personal autorizado. Toda acción queda registrada.</p>
            </div>
          </div>
        </div>

        {/* Formulario */}
        <div className="relative bg-white/75 p-7 sm:p-10">
          <div className="h-1 w-full rounded-full bg-gradient-to-r from-lurima-500 via-bienestar-500 to-coral-500 lg:hidden" aria-hidden />
          <div className="mt-6 lg:hidden"><MarcaLurima /></div>
          <p className="mt-6 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-bienestar-700 lg:mt-2"><ShieldCheck className="h-4 w-4" />Personal interno</p>
          <h2 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-lurima-900">Inicia sesión</h2>
          <p className="mt-1 text-sm text-tinta-500">Entra con tu correo institucional de la distribuidora.</p>
          <form onSubmit={enviar} className="mt-7 space-y-4">
            <Campo etiqueta="Correo institucional"><Entrada name="correo" type="email" autoComplete="username" required className="h-12 rounded-xl" /></Campo>
            <Campo etiqueta="Contraseña"><Entrada name="password" type="password" autoComplete="current-password" required className="h-12 rounded-xl" /></Campo>
            <ErrorCaja error={error} />
            <Boton type="submit" className="h-12 w-full rounded-xl bg-gradient-to-r from-lurima-800 to-lurima-600 text-base shadow-[0_10px_24px_rgba(18,58,115,.3)] hover:from-lurima-900 hover:to-lurima-700" cargando={cargando}>Entrar al panel</Boton>
          </form>
          <button onClick={pedirRecuperacion} className="mt-4 text-sm font-semibold text-lurima-600 hover:text-lurima-900">Olvidé mi contraseña</button>
          {recuperar && <div className="mt-3 space-y-2"><Aviso>{recuperar.mensaje}</Aviso>
            {recuperar.token_desarrollo && <Link className="text-xs font-bold text-amber-800 underline" to={`/admin/restablecer?token=${recuperar.token_desarrollo}`}>Modo desarrollo: abrir enlace</Link>}</div>}
          <div className="mt-8 rounded-2xl bg-lurima-50/80 p-4 text-xs text-lurima-800 ring-1 ring-lurima-100">
            ¿Eres sucursal o aprobador corporativo? Entra por el <Link to="/entrar" className="font-bold text-bienestar-700 hover:underline">portal de sucursales</Link>.
          </div>
          <Link to="/" className="mt-6 block text-xs text-tinta-500 hover:text-lurima-800">← Volver a la tienda</Link>
        </div>
      </div>
    </div>
  );
}
