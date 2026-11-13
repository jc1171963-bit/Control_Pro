/**
 * Confirmación antes de enviar (o reenviar) una solicitud a revisión: es la acción que entrega la solicitud al
 * distribuidor y deja de poder editarse. Explica qué sucederá y resume lo que se envía. Los errores del servidor se
 * muestran aquí mismo para poder reintentar.
 */
import { Send } from 'lucide-react';
import { Boton, ErrorCaja, Modal } from '../../components/ui';

type Props = {
  abierto: boolean; reenvio?: boolean; folio?: string; empleados: number; articulos: number; excepciones: number;
  cargando: boolean; error: unknown; onConfirmar: () => void; onCerrar: () => void;
};

export default function ConfirmarEnvio({ abierto, reenvio, folio, empleados, articulos, excepciones, cargando, error, onConfirmar, onCerrar }: Props) {
  const cifras: [string, number][] = [['Empleados', empleados], ['Artículos', articulos], ['Excepciones', excepciones]];
  return (
    <Modal abierto={abierto} titulo={reenvio ? 'Reenviar la solicitud a revisión' : 'Enviar la solicitud a revisión'} onCerrar={onCerrar}>
      <div className="space-y-4">
        <dl className="grid grid-cols-3 gap-2 text-center">
          {cifras.map(([t, n]) => (
            <div key={t} className="flex flex-col-reverse rounded-xl bg-sd-50 px-2 py-3 ring-1 ring-sd-100">
              <dt className="text-xs text-tinta-500">{t}</dt>
              <dd className="font-display text-2xl font-extrabold text-tinta-900">{n}</dd>
            </div>
          ))}
        </dl>
        <ul className="space-y-2 text-sm text-tinta-700">
          <li>• {folio ? `La solicitud ${folio}` : 'La solicitud'} pasa al distribuidor y <b>ya no podrás editarla</b>, salvo que te la devuelva para corrección.</li>
          <li>• Enviar no es aprobar: el distribuidor puede aprobarla, devolverla o rechazarla. Te avisaremos en Notificaciones.</li>
          {excepciones > 0 && <li>• Las {excepciones} excepción(es) por puesto se revisan con su justificación.</li>}
        </ul>
        <ErrorCaja error={error} />
        <div className="flex flex-wrap justify-end gap-2">
          <Boton variante="secundario" onClick={onCerrar} disabled={cargando}>Seguir revisando</Boton>
          <Boton icono={<Send className="h-4 w-4" aria-hidden />} cargando={cargando} onClick={onConfirmar}>Confirmar envío</Boton>
        </div>
      </div>
    </Modal>
  );
}
