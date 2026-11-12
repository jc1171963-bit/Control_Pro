import { Link } from 'react-router-dom';
import { IDENTIDAD_PORTAL } from '../../app/identidad';
import { cls } from '../../lib/formato';

/**
 * Marca del portal. Sin logotipo oficial muestra un espacio sustituible (iniciales con borde punteado), nunca un logotipo inventado.
 * `compacta` oculta el nombre en escritorio (riel de la barra lateral) y `minima` en pantallas de menos de 420 px (encabezado móvil),
 * siempre sin quitarlo para lectores de pantalla.
 */
export default function MarcaPortal({ claro = false, compacta = false, minima = false }: { claro?: boolean; compacta?: boolean; minima?: boolean }) {
  const { nombre, iniciales, logo } = IDENTIDAD_PORTAL;
  return (
    <Link to="/cuenta" className="flex shrink-0 items-center gap-2.5" aria-label={`${nombre}, inicio del portal`}>
      {logo ? <img src={logo} alt="" className="h-9 w-auto" /> : (
        <span aria-hidden className={cls('grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-dashed text-xs font-extrabold',
          claro ? 'border-white/50 bg-white/10 text-white' : 'border-sd-500/60 bg-sd-50 text-sd-900')}>{iniciales}</span>
      )}
      <span className={cls('font-display text-lg font-extrabold leading-none tracking-tight', claro ? 'text-white' : 'text-sd-900', compacta && 'lg:sr-only', minima && 'max-[419px]:sr-only')}>{nombre}</span>
    </Link>
  );
}
