import type { PedidoResumen } from '../api/tipos';
import { fecha } from '../lib/formato';
import { Selector } from './ui';

/** A qué solicitud se agrega un artículo: el id de un borrador existente o 'nuevo' para empezar otro. */
export type DestinoBorrador = number | 'nuevo';

/**
 * Elección explícita del borrador destino. Con borradores, parte del más reciente (el comportamiento de siempre) pero
 * lo muestra y permite cambiarlo; sin borradores avisa que se creará uno.
 */
export default function SelectorBorrador({ borradores, valor, onCambio }: { borradores: PedidoResumen[]; valor: DestinoBorrador | undefined; onCambio: (d: DestinoBorrador) => void }) {
  if (!borradores.length) return <p className="text-xs text-tinta-500">Se creará una solicitud nueva (borrador) con este artículo.</p>;
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold text-tinta-800">Agregar a</span>
      <Selector value={String(valor ?? borradores[0].id)} onChange={(e) => onCambio(e.target.value === 'nuevo' ? 'nuevo' : Number(e.target.value))}>
        {borradores.map((b) => <option key={b.id} value={b.id}>{b.folio} · {b.articulos} artículo(s) · {fecha(b.creado)}</option>)}
        <option value="nuevo">Solicitud nueva</option>
      </Selector>
    </label>
  );
}
