import { Link } from 'react-router-dom';
import { IDENTIDAD_PORTAL } from '../../app/identidad';
import { cls } from '../../lib/formato';

/**
 * Marca del portal. Con logotipo oficial lo muestra tal cual, sobre fondo claro (es un logotipo de texto pensado para
 * fondo blanco; no se recolorea ni se redibuja). Sin logotipo muestra un espacio sustituible (iniciales con borde punteado).
 * `compacta` oculta el nombre en escritorio y `minima` en pantallas de menos de 420 px, sin quitarlo para lectores de pantalla.
 */
export default function MarcaPortal({ claro = false, compacta = false, minima = false, className }: { claro?: boolean; compacta?: boolean; minima?: boolean; className?: string }) {
  const { nombre, iniciales, logo } = IDENTIDAD_PORTAL;
  if (logo) {
    return (
      <Link to="/cuenta" className={cls('flex shrink-0 items-center rounded-md', className)} aria-label={`${nombre}, inicio del portal`}>
        <img src={logo} alt="" width={185} height={39} className="h-8 w-auto sm:h-9" />
      </Link>
    );
  }
  return (
    <Link to="/cuenta" className={cls('flex shrink-0 items-center gap-2.5', className)} aria-label={`${nombre}, inicio del portal`}>
      <span aria-hidden className={cls('grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-dashed text-xs font-extrabold',
        claro ? 'border-white/50 bg-white/10 text-white' : 'border-sd-500/60 bg-sd-50 text-sd-900')}>{iniciales}</span>
      <span className={cls('font-display text-lg font-extrabold leading-none tracking-tight', claro ? 'text-white' : 'text-sd-900', compacta && 'lg:sr-only', minima && 'max-[419px]:sr-only')}>{nombre}</span>
    </Link>
  );
}
