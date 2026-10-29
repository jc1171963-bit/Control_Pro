import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Banknote, ClipboardList, PackageOpen, Receipt, Truck } from 'lucide-react';
import { get } from '../../api/cliente';
import { useAuth } from '../../app/auth';
import { Cargando, Cifra, ErrorCaja, Tabla, Tarjeta, Td } from '../../components/ui';
import { dinero, fecha, fechaHora, TIPOS_MOVIMIENTO } from '../../lib/formato';
import { Encabezado, FiltroSucursal } from './AdminLayout';

type Dash = {
  periodo: { desde: string; hasta: string };
  pedidos: { recibidos: number; pendientes: number; por_surtir: number; en_preparacion: number; en_camino: number; entregados: number; cancelados: number };
  ventas_registradas: { pedidos: number; importe: string };
  pagos_confirmados: { bruto: string; reembolsado: string; neto: string; por_validar: number };
  mas_vendidos: { sku: string; nombre: string; talla: string; unidades: number; importe: string }[];
  serie_diaria: { dia: string; pedidos: number; ventas: string }[];
  existencias_bajas: { sucursal: string; sku: string; producto: string; talla: string; disponible: number; minimo: number; en_transito: number }[];
  devoluciones_abiertas: number; incidencias_abiertas: number;
  movimientos_recientes: { id: number; fecha: string; sku: string; tipo: string; cantidad: number; saldo: number; usuario: string }[];
};
type Comp = { sucursal_id: number; sucursal: string; pedidos: number; unidades_asignadas: number; unidades_despachadas: number; faltantes: number;
  importe_surtido: string; existencia_unidades: number; existencia_valor: string; existencias_bajas: number };

function Barras({ serie }: { serie: Dash['serie_diaria'] }) {
  if (!serie.length) return <p className="py-10 text-center text-sm text-tinta-400">Sin pedidos en el periodo.</p>;
  const max = Math.max(...serie.map((s) => Number(s.ventas)), 1);
  return (
    <div className="flex h-48 items-end gap-1 border-b border-tinta-100" role="img" aria-label="Ventas registradas por día">
      {serie.map((s) => (
        <div key={s.dia} className="group relative flex h-full max-w-16 flex-1 flex-col items-center justify-end">
          <div className="w-full rounded-t-md bg-menta-500/80 transition group-hover:bg-menta-600" style={{ height: `${Math.max(2, (Number(s.ventas) / max) * 100)}%` }} />
          <span className="pointer-events-none absolute -top-9 z-10 hidden whitespace-nowrap rounded-md bg-tinta-900 px-2 py-1 text-[11px] text-white group-hover:block">{fecha(s.dia)} · {dinero(s.ventas)} · {s.pedidos} ped.</span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { puede } = useAuth();
  const [sucursal, setSucursal] = useState('');
  const [dias, setDias] = useState(30);
  const desde = new Date(Date.now() - (dias - 1) * 864e5).toISOString().slice(0, 10);
  const q = useQuery({ queryKey: ['dashboard', sucursal, dias], queryFn: () => get<Dash>(`/admin/reportes/dashboard?desde=${desde}${sucursal ? `&sucursal_id=${sucursal}` : ''}`), enabled: puede('reporte.ver') });
  const comp = useQuery({ queryKey: ['comparativa', dias], queryFn: () => get<Comp[]>(`/admin/reportes/sucursales?desde=${desde}`), enabled: puede('reporte.ver') });

  if (!puede('reporte.ver')) {
    return <Tarjeta titulo="Bienvenido"><p className="text-sm text-tinta-500">Usa el menú para acceder a tus módulos. <Link to="/admin/surtido" className="font-semibold text-menta-700">Ir a surtido</Link></p></Tarjeta>;
  }
  const d = q.data;
  const maxImporte = Math.max(...(comp.data || []).map((c) => Number(c.importe_surtido)), 1);
  return (
    <>
      <Encabezado titulo="Panel de operación" sub={d ? `Del ${fecha(d.periodo.desde)} al ${fecha(d.periodo.hasta)}` : undefined}>
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Periodo" className="h-10 rounded-lg border-0 bg-white pr-8 text-sm ring-1 ring-tinta-200">
          <option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option><option value={90}>Últimos 90 días</option>
        </select>
        <FiltroSucursal valor={sucursal} onCambio={setSucursal} />
      </Encabezado>
      <ErrorCaja error={q.error} />
      {q.isLoading || !d ? <Cargando /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Cifra etiqueta="Pedidos recibidos" valor={d.pedidos.recibidos} detalle={`${d.pedidos.cancelados} cancelados o expirados`} icono={<ClipboardList className="h-4 w-4" />} />
            <Cifra etiqueta="Por pagar / revisar" valor={d.pedidos.pendientes} detalle={`${d.pagos_confirmados.por_validar} pago(s) por validar`} icono={<Receipt className="h-4 w-4" />} acento="bg-amber-100 text-amber-700" />
            <Cifra etiqueta="Por surtir" valor={d.pedidos.por_surtir + d.pedidos.en_preparacion} detalle={`${d.pedidos.en_preparacion} en preparación`} icono={<PackageOpen className="h-4 w-4" />} acento="bg-sky-100 text-sky-700" />
            <Cifra etiqueta="En camino / entregados" valor={`${d.pedidos.en_camino} / ${d.pedidos.entregados}`} icono={<Truck className="h-4 w-4" />} acento="bg-violet-100 text-violet-700" />
            <Cifra etiqueta="Ventas registradas" valor={dinero(d.ventas_registradas.importe)} detalle={`${d.ventas_registradas.pedidos} pedidos confirmados`} icono={<ClipboardList className="h-4 w-4" />} acento="bg-menta-100 text-menta-700" />
            <Cifra etiqueta="Pagos confirmados (neto)" valor={dinero(d.pagos_confirmados.neto)} detalle={`Reembolsado ${dinero(d.pagos_confirmados.reembolsado)}`} icono={<Banknote className="h-4 w-4" />} acento="bg-emerald-100 text-emerald-700" />
          </div>
          <p className="-mt-2 text-xs text-tinta-400">Ventas registradas = pedidos con pago validado o aprobación corporativa. Pagos confirmados = dinero validado menos reembolsos realizados. Un pedido recibido no es venta hasta confirmarse.</p>

          <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
            <Tarjeta titulo="Ventas registradas por día"><Barras serie={d.serie_diaria} /></Tarjeta>
            <Tarjeta titulo="Alertas" sub="Lo que requiere atención">
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between"><Link to="/admin/pagos" className="hover:underline">Pagos por validar</Link><b>{d.pagos_confirmados.por_validar}</b></li>
                <li className="flex justify-between"><Link to="/admin/devoluciones" className="hover:underline">Devoluciones abiertas</Link><b>{d.devoluciones_abiertas}</b></li>
                <li className="flex justify-between"><Link to="/admin/incidencias" className="hover:underline">Incidencias abiertas</Link><b className={d.incidencias_abiertas ? 'text-coral-600' : ''}>{d.incidencias_abiertas}</b></li>
                <li className="flex justify-between"><Link to="/admin/inventario?bajo=1" className="hover:underline">Existencias bajas</Link><b className={d.existencias_bajas.length ? 'text-amber-700' : ''}>{d.existencias_bajas.length}{d.existencias_bajas.length === 10 ? '+' : ''}</b></li>
              </ul>
            </Tarjeta>
          </div>

          <Tarjeta titulo="Comparativa entre sucursales" sub="Pedidos confirmados asignados a cada sucursal en el periodo">
            <Tabla columnas={['Sucursal', 'Pedidos', 'Unidades asignadas', 'Despachadas', 'Faltantes', 'Importe surtido', 'Existencia', 'Valor de existencia', 'Bajas']} vacia={!comp.data?.length}>
              {comp.data?.map((c) => (
                <tr key={c.sucursal_id}>
                  <Td className="font-semibold">{c.sucursal}</Td><Td>{c.pedidos}</Td><Td>{c.unidades_asignadas}</Td><Td>{c.unidades_despachadas}</Td>
                  <Td className={c.faltantes ? 'text-coral-600' : ''}>{c.faltantes}</Td>
                  <Td><div className="flex items-center gap-2"><div className="h-2 w-24 overflow-hidden rounded-full bg-tinta-100"><div className="h-full bg-menta-500" style={{ width: `${(Number(c.importe_surtido) / maxImporte) * 100}%` }} /></div>{dinero(c.importe_surtido)}</div></Td>
                  <Td>{c.existencia_unidades} u</Td><Td>{dinero(c.existencia_valor)}</Td><Td className={c.existencias_bajas ? 'text-amber-700 font-semibold' : ''}>{c.existencias_bajas}</Td>
                </tr>
              ))}
            </Tabla>
          </Tarjeta>

          <div className="grid gap-5 xl:grid-cols-2">
            <Tarjeta titulo="Más vendidos">
              <Tabla columnas={['Producto', 'Talla', 'Unidades', 'Importe']} vacia={!d.mas_vendidos.length}>
                {d.mas_vendidos.map((m) => <tr key={m.sku}><Td><p className="font-semibold">{m.nombre}</p><p className="text-xs text-tinta-400">{m.sku}</p></Td><Td>{m.talla}</Td><Td>{m.unidades}</Td><Td>{dinero(m.importe)}</Td></tr>)}
              </Tabla>
            </Tarjeta>
            <Tarjeta titulo="Existencias bajas" accion={<Link to="/admin/inventario?bajo=1" className="text-xs font-semibold text-menta-700">Ver todas</Link>}>
              <Tabla columnas={['Sucursal', 'Producto', 'Disponible', 'Mínimo', 'En tránsito']} vacia={!d.existencias_bajas.length}>
                {d.existencias_bajas.map((b) => <tr key={b.sucursal + b.sku}><Td>{b.sucursal.replace('Sucursal ', '')}</Td><Td><p className="font-semibold">{b.producto} · {b.talla}</p><p className="text-xs text-tinta-400">{b.sku}</p></Td>
                  <Td className={b.disponible <= 0 ? 'font-bold text-coral-600' : 'font-semibold text-amber-700'}>{b.disponible}</Td><Td>{b.minimo}</Td><Td>{b.en_transito}</Td></tr>)}
              </Tabla>
            </Tarjeta>
          </div>
          <Tarjeta titulo="Movimientos de inventario recientes">
            <Tabla columnas={['Fecha', 'SKU', 'Tipo', 'Cantidad', 'Saldo', 'Usuario']} vacia={!d.movimientos_recientes.length}>
              {d.movimientos_recientes.map((m) => <tr key={m.id}><Td className="text-xs">{fechaHora(m.fecha)}</Td><Td>{m.sku}</Td><Td>{TIPOS_MOVIMIENTO[m.tipo]}</Td>
                <Td className={m.cantidad < 0 ? 'text-coral-600' : 'text-menta-700'}>{m.cantidad > 0 ? '+' : ''}{m.cantidad}</Td><Td>{m.saldo}</Td><Td className="text-xs">{m.usuario}</Td></tr>)}
            </Tabla>
          </Tarjeta>
          {!!d.incidencias_abiertas && <p className="flex items-center gap-2 text-xs text-coral-600"><AlertTriangle className="h-3.5 w-3.5" />Hay incidencias abiertas que impiden cerrar algunos pedidos.</p>}
        </div>
      )}
    </>
  );
}
