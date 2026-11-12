import { Mail, Phone, UserRound } from 'lucide-react';
import { cls } from '../../lib/formato';

/** Contacto de la zona o de la división de la sucursal. Sin nombre se muestra como vacante. */
export default function ContactoZona({ rol, nombre, correo, telefono }: { rol: string; nombre: string | null; correo: string | null; telefono: string | null }) {
  return (
    <div className="text-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta-500">{rol}</p>
      <p className={cls('flex items-center gap-1.5 font-semibold', !nombre && 'text-amber-700')}><UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden />{nombre || 'Vacante'}</p>
      {correo && <a href={`mailto:${correo}`} className="flex items-center gap-1.5 break-all text-menta-700 hover:underline"><Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />{correo}</a>}
      {telefono && <a href={`tel:${telefono.replace(/\s/g, '')}`} className="flex items-center gap-1.5 text-tinta-600 hover:underline"><Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />{telefono}</a>}
    </div>
  );
}
