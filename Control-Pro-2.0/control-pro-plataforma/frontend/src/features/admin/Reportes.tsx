import { useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { descargar } from '../../api/cliente';
import { Boton, Campo, Entrada, Tarjeta, useAviso } from '../../components/ui';
import { mensajeError } from '../../lib/formato';
import { Encabezado, FiltroSucursal } from './AdminLayout';

const REPORTES = [
  ['pedidos', 'Pedidos', 'Folio, canal, cliente, estado, montos y sucursales que surten.'],
  ['pagos', 'Pagos', 'Método, estado, monto, reembolsos y fecha de validación.'],
  ['inventario', 'Inventario actual', 'Físico, reservado, comprometido, en tránsito y disponible por sucursal.'],
  ['movimientos', 'Movimientos de inventario', 'Kardex del periodo: entradas, salidas, ajustes, transferencias y reingresos.'],
  ['devoluciones', 'Devoluciones', 'Motivo, estado, unidades y monto reembolsado.'],
  ['sucursales', 'Comparativa de sucursales', 'Pedidos, unidades, faltantes, importe surtido y valor de existencias.'],
];

export default function Reportes() {
  const avisar = useAviso();
  const hoy = new Date().toISOString().slice(0, 10);
  const [desde, setDesde] = useState(new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(hoy);
  const [sucursal, setSucursal] = useState('');
  const bajar = (r: string, formato: string) =>
    descargar(`/admin/reportes/exportar/${r}?formato=${formato}&desde=${desde}&hasta=${hasta}${sucursal ? `&sucursal_id=${sucursal}` : ''}`).catch((e) => avisar(mensajeError(e), 'error'));
  return (
    <>
      <Encabezado titulo="Reportes y exportaciones" sub="Datos tomados directamente de la base central y limitados a tu alcance" />
      <Tarjeta className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <Campo etiqueta="Desde"><Entrada type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></Campo>
          <Campo etiqueta="Hasta"><Entrada type="date" value={hasta} max={hoy} onChange={(e) => setHasta(e.target.value)} /></Campo>
          <FiltroSucursal valor={sucursal} onCambio={setSucursal} />
        </div>
      </Tarjeta>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REPORTES.map(([k, n, d]) => (
          <Tarjeta key={k} titulo={n}>
            <p className="mb-4 text-sm text-tinta-500">{d}</p>
            <div className="flex gap-2">
              <Boton tam="sm" icono={<FileSpreadsheet className="h-4 w-4" />} onClick={() => bajar(k, 'xlsx')}>Excel</Boton>
              <Boton tam="sm" variante="secundario" icono={<FileText className="h-4 w-4" />} onClick={() => bajar(k, 'csv')}>CSV</Boton>
            </div>
          </Tarjeta>
        ))}
      </div>
      <p className="mt-4 text-xs text-tinta-400">El comprobante PDF de cada pedido se descarga desde su detalle. Los PDF no son comprobantes fiscales (CFDI): la facturación requiere un proveedor certificado (PAC).</p>
    </>
  );
}
