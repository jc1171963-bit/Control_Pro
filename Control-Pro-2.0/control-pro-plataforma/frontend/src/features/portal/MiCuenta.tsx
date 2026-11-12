import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { get } from '../../api/cliente';
import type { Cliente, Direccion, ResumenSucursal } from '../../api/tipos';
import { Aviso, Cargando, ErrorCaja, Tarjeta } from '../../components/ui';
import ContactoZona from './ContactoZona';

const Dato = ({ t, v }: { t: string; v: string | null | undefined }) => <div><dt className="text-xs text-tinta-500">{t}</dt><dd className="font-semibold">{v || '—'}</dd></div>;

/**
 * «Mi cuenta» de la sucursal: datos, dirección de entrega y contactos de zona, todo de solo lectura (los administra el distribuidor).
 * Reutiliza las consultas ya existentes; no hay preferencias ni edición porque el backend no las ofrece.
 */
export default function MiCuenta({ cliente }: { cliente: Cliente }) {
  const dirs = useQuery({ queryKey: ['direcciones'], queryFn: () => get<Direccion[]>('/cuenta/direcciones') });
  const resumen = useQuery({ queryKey: ['resumen-sucursal'], queryFn: () => get<ResumenSucursal>('/cuenta/resumen') });
  const zona = resumen.data?.zona;
  return (
    <div className="space-y-5">
      <Tarjeta titulo="Datos de la sucursal" sub="Los administra tu distribuidor: datos, dirección y contraseña. Si necesitas un cambio, pídeselo.">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <Dato t="Sucursal" v={cliente.razon_social} /><Dato t="Contacto responsable" v={cliente.nombre} />
          <Dato t="Correo de acceso" v={cliente.correo} /><Dato t="Teléfono" v={cliente.telefono} />
        </dl>
      </Tarjeta>
      <Tarjeta titulo="Dirección de entrega" sub="A donde se envían los paquetes de tus solicitudes">
        <ErrorCaja error={dirs.error} />
        {dirs.isLoading ? <Cargando /> : dirs.error ? null : !dirs.data?.length ? <Aviso>Aún no tienes una dirección registrada. Pide a tu distribuidor que la agregue.</Aviso> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {dirs.data.map((d) => (
              <div key={d.id} className="rounded-xl p-4 ring-1 ring-tinta-100">
                <p className="flex items-center gap-2 font-bold"><MapPin className="h-4 w-4 text-menta-600" aria-hidden />{d.alias}{d.predeterminada && <span className="rounded-full bg-sd-50 px-2 py-0.5 text-[11px] font-semibold text-sd-900">Predeterminada</span>}</p>
                <p className="mt-1 text-sm text-tinta-600">{d.destinatario} · {d.telefono}<br />{d.calle} {d.numero}, {d.colonia}<br />{d.ciudad}, {d.estado} · CP {d.cp}{d.referencias && <><br />Ref.: {d.referencias}</>}</p>
              </div>
            ))}
          </div>
        )}
      </Tarjeta>
      {zona && (
        <Tarjeta titulo={`Tu zona: ${zona.nombre}`} sub={zona.division ? `División ${zona.division.nombre}` : undefined}>
          <div className="grid gap-3 sm:grid-cols-2">
            <ContactoZona rol="Gerente de zona" nombre={zona.gerente} correo={zona.correo} telefono={zona.telefono} />
            {zona.division && <ContactoZona rol="Responsable divisional" nombre={zona.division.responsable} correo={zona.division.correo} telefono={zona.division.telefono} />}
          </div>
        </Tarjeta>
      )}
    </div>
  );
}
