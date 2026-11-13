import { useConfig } from '../../app/config';
import { EncabezadoPagina } from './Decoracion';
import { ListaUbicaciones } from './Ubicaciones';

export default function Sucursales() {
  const { canalTienda } = useConfig();
  return (
    <>
      {/* El pago y la entrega en mostrador solo existen con la tienda en línea encendida. */}
      <EncabezadoPagina eyebrow="Ubicaciones" titulo="Nuestras sucursales"
        sub={canalTienda ? 'Recoge tu pedido sin costo y paga en efectivo al recogerlo.' : 'Estas son nuestras ubicaciones.'} />
      <div className="contenedor py-10">
        <ListaUbicaciones mostrarRecoger={canalTienda} className="mt-0" />
      </div>
    </>
  );
}
