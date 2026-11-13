/**
 * Secciones informativas de la tienda (versión mínima). No hay contenido institucional aprobado ni endpoint de
 * mensajes: solo se muestran datos reales (eslogan, ubicaciones de la API) y, en las preguntas frecuentes, textos
 * que la interfaz ya presenta hoy. Pendiente de aprobación del negocio antes de ampliarlos.
 */
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useConfig } from '../../app/config';
import { EncabezadoPagina } from './Decoracion';
import FormularioContacto from './FormularioContacto';
import { ListaUbicaciones } from './Ubicaciones';

function Pagina({ eyebrow, titulo, sub, children }: { eyebrow: string; titulo: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <>
      <EncabezadoPagina eyebrow={eyebrow} titulo={titulo} sub={sub} />
      <div className="contenedor py-10">{children}</div>
    </>
  );
}

const enlace = 'font-semibold text-lurima-800 underline hover:text-lurima-600';

export function Acerca() {
  return (
    <Pagina eyebrow="Distribuidora Lurima" titulo="Acerca de nosotros" sub={<><strong className="text-lurima-900">Salud y bienestar a tu alcance.</strong> Productos de calidad para el cuidado de tu empresa y tu gente.</>}>
      <div className="grid items-center gap-8 md:grid-cols-2">
        <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem]">
          <img src="/assets/escenas/almacen.webp" alt="" loading="lazy" width={1400} height={900} className="h-full w-full object-cover" />
          <span className="absolute inset-0 bg-gradient-to-tr from-lurima-950/40 to-transparent" aria-hidden />
        </div>
        <div>
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-lurima-900 sm:text-3xl">Uniformes y equipo de trabajo para tu equipo</h2>
          <p className="mt-3 text-tinta-600">Consulta el catálogo por categoría, talla y color, y la disponibilidad en cada una de nuestras ubicaciones.</p>
          <p className="mt-5"><Link to="/catalogo" className="inline-flex h-11 items-center rounded-full bg-lurima-900 px-5 text-sm font-semibold text-white hover:bg-lurima-800">Conoce nuestro catálogo</Link></p>
        </div>
      </div>
      <h2 className="mt-16 font-display text-2xl font-extrabold tracking-tight text-lurima-900 sm:text-3xl">Dónde estamos</h2>
      <ListaUbicaciones nivel="h3" />
    </Pagina>
  );
}

export function Contacto() {
  return (
    <Pagina eyebrow="Distribuidora Lurima" titulo="Contacto" sub="Escríbenos o comunícate con la sucursal que te quede más cerca.">
      <div className="grid items-start gap-8 lg:grid-cols-[1.35fr_1fr] lg:gap-10">
        <FormularioContacto />
        <aside aria-labelledby="t-ubicaciones">
          <h2 id="t-ubicaciones" className="font-display text-xl font-extrabold tracking-tight text-lurima-900">Nuestras sucursales</h2>
          <p className="mt-1 text-sm text-tinta-600">También puedes llamarnos o visitarnos.</p>
          <ListaUbicaciones nivel="h3" compacta className="mt-4" />
        </aside>
      </div>
    </Pagina>
  );
}

export function Preguntas() {
  const { canalTienda } = useConfig();
  const preguntas: [string, ReactNode][] = [
    ['¿Puedo ver el catálogo sin tener cuenta?', <>Sí. El catálogo y la ficha de cada producto son públicos: puedes buscar por categoría, talla y color y consultar la disponibilidad. <Link to="/catalogo" className={enlace}>Ir al catálogo</Link>.</>],
    ['¿Cómo entro como empresa o sucursal?', canalTienda
      ? <>Desde «Acceso empresas», con tu correo y tu contraseña. Si aún no tienes cuenta, puedes <Link to="/registro?tipo=empresa" className={enlace}>crear una cuenta de empresa</Link>.</>
      : <>Desde «Acceso empresas», con el correo y la contraseña que te dio tu distribuidor. Las cuentas de sucursal las crea tu distribuidor. <Link to="/entrar" className={enlace}>Ir al acceso</Link>.</>],
    ['¿Cómo pido uniformes para mis empleados?', 'Desde tu cuenta de empresa registras a tus empleados, armas la solicitud por persona y puesto y la envías a revisión. El distribuidor puede aprobarla, devolverla para corrección o rechazarla.'],
    ['¿Cómo sigo mi solicitud?', 'Cada solicitud tiene su seguimiento: revisión, surtido, envío por paquete, recepción en la sucursal y entrega con firma de cada empleado.'],
    ['¿Olvidé mi contraseña, qué hago?', canalTienda
      ? <>Usa <Link to="/recuperar" className={enlace}>«¿Olvidaste tu contraseña?»</Link>: te enviamos un enlace válido por 30 minutos.</>
      : 'Si eres una sucursal, tu distribuidor restablece tu contraseña: pídesela directamente.'],
    ...(canalTienda ? [['¿Cómo pago mi pedido?', 'Por transferencia bancaria (SPEI) o, si recoges en sucursal, en efectivo. El pago con tarjeta aún no está disponible.'] as [string, ReactNode]] : []),
  ];
  return (
    <Pagina eyebrow="Ayuda" titulo="Preguntas frecuentes">
      <div className="max-w-3xl divide-y divide-lurima-100 rounded-3xl bg-white shadow-suave ring-1 ring-lurima-100">
        {preguntas.map(([p, r]) => (
          <details key={p} className="group p-5">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-display font-bold text-lurima-900 [&::-webkit-details-marker]:hidden">
              {p}<ChevronDown className="h-5 w-5 shrink-0 text-lurima-500 transition group-open:rotate-180" aria-hidden />
            </summary>
            <div className="mt-2 text-tinta-600">{r}</div>
          </details>
        ))}
      </div>
    </Pagina>
  );
}
