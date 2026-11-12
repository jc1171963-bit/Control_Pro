import { useConfig } from '../../app/config';
import { ListaUbicaciones } from './Ubicaciones';

export default function Sucursales() {
  const { canalTienda } = useConfig();
  return (
    <div className="contenedor py-10">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-lurima-900">Nuestras sucursales</h1>
      {/* El pago y la entrega en mostrador solo existen con la tienda en línea encendida. */}
      <p className="mt-1 text-tinta-600">{canalTienda ? 'Recoge tu pedido sin costo y paga en efectivo al recogerlo.' : 'Estas son nuestras ubicaciones.'}</p>
      <ListaUbicaciones mostrarRecoger={canalTienda} className="mt-8" />
    </div>
  );
}
