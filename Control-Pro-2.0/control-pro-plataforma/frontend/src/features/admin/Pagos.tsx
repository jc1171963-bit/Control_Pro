import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown, FileText } from 'lucide-react';
import { abrirPrivado, descargar, get, post } from '../../api/cliente';
import type { Pago, Pagina, Reembolso } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { Aviso, Boton, Campo, Cargando, Entrada, ErrorCaja, Estado, Modal, Paginacion, Tabla, Tarjeta, Td, Texto, useAviso } from '../../components/ui';
import { cls, dinero, fechaHora, METODOS } from '../../lib/formato';
import { Encabezado } from './AdminLayout';

const PESTANAS = [['en_proceso', 'Por validar'], ['pendiente', 'Créditos por cobrar'], ['confirmado,reembolsado_parcial,reembolsado', 'Confirmados'], ['rechazado,cancelado', 'Rechazados / cancelados'], ['reembolsos', 'Reembolsos']];

export default function Pagos() {
  const { puede } = useAuth();
  const qc = useQueryClient();
  const avisar = useAviso();
  const [tab, setTab] = useState('en_proceso');
  const [pagina, setPagina] = useState(1);
  const pagos = useQuery({ queryKey: ['admin-pagos', tab, pagina], enabled: tab !== 'reembolsos', queryFn: () => get<Pagina<Pago>>(`/admin/pagos?estado=${tab}&pagina=${pagina}`) });
  const reemb = useQuery({ queryKey: ['admin-reembolsos', pagina], enabled: tab === 'reembolsos', queryFn: () => get<Pagina<Reembolso>>(`/admin/reembolsos?pagina=${pagina}`) });
  const [accion, setAccion] = useState<{ tipo: 'validar' | 'rechazar' | 'cobrar' | 'reembolsar'; id: number; monto: string; folio: string } | null>(null);
  const [texto, setTexto] = useState('');
  const m = useMutation({
    mutationFn: () => {
      const a = accion!;
      if (a.tipo === 'rechazar') return post(`/admin/pagos/${a.id}/rechazar`, { motivo: texto });
      if (a.tipo === 'reembolsar') return post(`/admin/reembolsos/${a.id}/realizar`, { referencia: texto });
      return post(`/admin/pagos/${a.id}/validar`, { nota: texto || null });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-pagos'] }); qc.invalidateQueries({ queryKey: ['admin-reembolsos'] }); setAccion(null); setTexto(''); avisar('Registro actualizado.'); },
  });
  const textoObligatorio = accion?.tipo !== 'validar';
  return (
    <>
      <Encabezado titulo="Pagos y reembolsos" sub="La confirmación de un pago siempre la hace una persona autorizada">
        <Boton variante="secundario" icono={<FileDown className="h-4 w-4" />} onClick={() => descargar('/admin/reportes/exportar/pagos?formato=xlsx')}>Exportar</Boton>
      </Encabezado>
      <div className="mb-4"><Aviso>No hay pasarela de pago integrada: las transferencias se validan contra el estado de cuenta y el efectivo se registra en caja. Nunca se guardan datos de tarjetas.</Aviso></div>
      <Tarjeta>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {PESTANAS.map(([v, n]) => <button key={v} onClick={() => { setTab(v); setPagina(1); }} className={cls('rounded-full px-3 py-1 text-xs font-semibold ring-1', tab === v ? 'bg-tinta-900 text-white ring-tinta-900' : 'ring-tinta-200')}>{n}</button>)}
        </div>
        {tab !== 'reembolsos' ? (pagos.isLoading ? <Cargando /> : (
          <>
            <ErrorCaja error={pagos.error} />
            <Tabla columnas={['Pago', 'Pedido', 'Cliente', 'Método', 'Referencia', 'Monto', 'Estado', '']} vacia={!pagos.data?.items.length}>
              {pagos.data?.items.map((p) => (
                <tr key={p.id}>
                  <Td><p className="font-semibold">{p.folio}</p><p className="text-xs text-tinta-400">{fechaHora(p.creado)}</p></Td>
                  <Td><Link to={`/admin/pedidos/${p.pedido?.id}`} className="font-semibold text-menta-700 hover:underline">{p.pedido?.folio}</Link><p className="text-xs text-tinta-400">Total {dinero(p.pedido?.total)}</p></Td>
                  <Td>{p.pedido?.cliente}</Td><Td className="text-xs">{METODOS[p.metodo]}</Td>
                  <Td className="text-xs">{p.referencia || '—'}{p.comprobante_url && <button onClick={() => abrirPrivado(p.comprobante_url!)} className="ml-1 inline-flex items-center gap-1 font-semibold text-menta-700"><FileText className="h-3 w-3" />comprobante</button>}
                    {p.motivo_rechazo && <p className="text-coral-600">{p.motivo_rechazo}</p>}</Td>
                  <Td className="font-semibold">{dinero(p.monto)}</Td><Td><Estado valor={p.estado} /></Td>
                  <Td>{puede('pago.validar') && (
                    p.estado === 'en_proceso' ? <div className="flex gap-1">
                      <Boton tam="sm" variante="menta" onClick={() => setAccion({ tipo: 'validar', id: p.id, monto: p.monto, folio: p.folio })}>Validar</Boton>
                      <Boton tam="sm" variante="secundario" onClick={() => setAccion({ tipo: 'rechazar', id: p.id, monto: p.monto, folio: p.folio })}>Rechazar</Boton></div>
                      : p.estado === 'pendiente' && p.metodo === 'credito_corporativo' ? <Boton tam="sm" onClick={() => setAccion({ tipo: 'cobrar', id: p.id, monto: p.monto, folio: p.folio })}>Registrar cobro</Boton> : null)}</Td>
                </tr>
              ))}
            </Tabla>
            {pagos.data && <Paginacion pagina={pagos.data.pagina} paginas={pagos.data.paginas} total={pagos.data.total} onCambio={setPagina} />}
          </>
        )) : (reemb.isLoading ? <Cargando /> : (
          <>
            <Tabla columnas={['Fecha', 'Pedido', 'Cliente', 'Tipo', 'Motivo', 'Monto', 'Estado', '']} vacia={!reemb.data?.items.length}>
              {reemb.data?.items.map((r) => (
                <tr key={r.id}><Td className="text-xs">{fechaHora(r.creado)}</Td><Td><Link to={`/admin/pedidos/${r.pedido?.id}`} className="font-semibold text-menta-700">{r.pedido?.folio}</Link></Td>
                  <Td>{r.pedido?.cliente}</Td><Td className="text-xs">{r.tipo === 'ajuste' ? 'Ajuste a crédito' : 'Reembolso'}</Td><Td className="max-w-xs text-xs">{r.motivo}{r.referencia && <p className="text-tinta-400">Ref. {r.referencia}</p>}</Td>
                  <Td className="font-semibold">{dinero(r.monto)}</Td><Td><Estado valor={r.estado} /></Td>
                  <Td>{r.estado === 'pendiente' && puede('reembolso.autorizar') && <Boton tam="sm" onClick={() => setAccion({ tipo: 'reembolsar', id: r.id, monto: r.monto, folio: r.pedido?.folio || '' })}>Registrar</Boton>}</Td></tr>
              ))}
            </Tabla>
            {reemb.data && <Paginacion pagina={reemb.data.pagina} paginas={reemb.data.paginas} total={reemb.data.total} onCambio={setPagina} />}
          </>
        ))}
      </Tarjeta>
      <Modal abierto={!!accion} titulo={accion ? { validar: 'Validar pago', rechazar: 'Rechazar pago', cobrar: 'Registrar cobro de crédito', reembolsar: 'Registrar reembolso' }[accion.tipo] + ` · ${accion.folio}` : ''} onCerrar={() => setAccion(null)}>
        <div className="space-y-4">
          <p className="text-sm">Monto: <b>{dinero(accion?.monto)}</b></p>
          {accion?.tipo === 'validar' && <Aviso>Confirma solo si el depósito aparece en el estado de cuenta con la referencia indicada.</Aviso>}
          {accion?.tipo === 'reembolsar' && <Aviso>Registra la referencia de la transferencia de devolución, el folio de caja o la nota de crédito.</Aviso>}
          <Campo etiqueta={accion?.tipo === 'rechazar' ? 'Motivo del rechazo' : accion?.tipo === 'validar' ? 'Nota (opcional)' : 'Referencia'}>
            {accion?.tipo === 'rechazar' ? <Texto value={texto} onChange={(e) => setTexto(e.target.value)} /> : <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} />}
          </Campo>
          <ErrorCaja error={m.error} />
          <div className="flex justify-end gap-2"><Boton variante="secundario" onClick={() => setAccion(null)}>Cancelar</Boton>
            <Boton variante={accion?.tipo === 'rechazar' ? 'peligro' : 'primario'} disabled={textoObligatorio && texto.trim().length < (accion?.tipo === 'rechazar' ? 5 : 4)} cargando={m.isPending} onClick={() => m.mutate()}>Confirmar</Boton></div>
        </div>
      </Modal>
    </>
  );
}
