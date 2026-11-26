/**
 * Resumen de incidencias del inicio del panel: un indicador por bandeja de trabajo, con enlace a esa bandeja, y las
 * más recientes de la bandeja inicial del perfil (sin repetir el siguiente paso: el chip ya lo dice). Los números salen del mismo `conteo` que acompaña a la lista
 * (/admin/incidencias, backend: turno_service.conteo_bandejas), así que coinciden con las pestañas. No calcula turnos.
 */
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { get } from '../../api/cliente';
import type { ConteoBandejas, Incidencia, Pagina, TurnoIncidencia } from '../../api/tipos';
import { useAuth } from '../../app/auth';
import { bandejasPanel, contarBandeja, filtroBandeja } from '../../components/BandejasIncidencia';
import TarjetaIncidencia from '../../components/TarjetaIncidencia';
import { Boton, ErrorCaja, Tarjeta } from '../../components/ui';
import { EsqueletoLista } from '../../components/movimiento';
import { cls } from '../../lib/formato';

/** Desglose por turno de algunas bandejas (solo lectura del conteo; se omiten los ceros). */
const DESGLOSE: Record<string, [TurnoIncidencia, string][]> = {
  por_atender: [['lurima_atender', 'sin atender'], ['lurima_responder', 'con respuesta de la sucursal'], ['interna', 'interna(s)']],
  esperando: [['sucursal_responder', 'respuesta'], ['sucursal_recibir', 'recepción'], ['sucursal_confirmar', 'confirmación']],
};

export default function ResumenIncidencias() {
  const { puede, usuario } = useAuth();
  const { bandejas, inicial } = bandejasPanel(puede('surtido.operar'), usuario?.rol.codigo);
  // Cerradas y Todas no son trabajo pendiente: se consultan en la lista
  const indicadores = bandejas.filter((b) => b.turnos || b.porEnviar);
  const q = useQuery({ queryKey: ['admin-incidencias', 'inicio', inicial.clave],
    queryFn: () => get<Pagina<Incidencia> & { conteo: ConteoBandejas }>(`/admin/incidencias?por_pagina=3&${filtroBandeja(inicial)}`) });
  const conteo = q.data?.conteo;
  const items = q.data?.items ?? [];
  const n = contarBandeja(inicial, conteo) ?? 0;
  const enlace = (clave: string) => `/admin/incidencias?bandeja=${clave}`;

  return (
    <Tarjeta titulo="Incidencias" sub="Trabajo pendiente por bandeja"
      accion={<Link to="/admin/incidencias" className="flex min-h-11 items-center gap-1 text-sm font-semibold text-menta-700 hover:underline">Ir a incidencias <ArrowRight className="h-4 w-4" aria-hidden /></Link>}>
      {q.isLoading ? <EsqueletoLista filas={2} /> : q.error ? (
        <div className="space-y-3"><ErrorCaja error={q.error} /><Boton variante="secundario" onClick={() => q.refetch()}>Reintentar</Boton></div>
      ) : (
        <div className="space-y-4">
          <ul className={cls('grid grid-cols-2 gap-2.5', indicadores.length > 3 ? 'lg:grid-cols-4' : 'sm:grid-cols-3')} aria-label="Incidencias por bandeja">
            {indicadores.map((b) => {
              const valor = contarBandeja(b, conteo) ?? 0;
              const urgente = b.accion && valor > 0;
              const desglose = (DESGLOSE[b.clave] ?? []).filter(([t]) => conteo?.por_turno[t]).map(([t, txt]) => `${conteo!.por_turno[t]} ${txt}`);
              return (
                <li key={b.clave}>
                  <Link to={enlace(b.clave)} aria-label={`${b.titulo}: ${valor}`}
                    className={cls('block h-full rounded-xl p-3 ring-1 transition hover:-translate-y-0.5 hover:bg-white',
                      urgente ? 'bg-amber-50 ring-amber-300' : 'bg-white/70 ring-tinta-100')}>
                    <span className="block text-xs font-semibold text-tinta-600">{b.titulo}</span>
                    <span className={cls('block font-display text-2xl font-extrabold tabular-nums', urgente ? 'text-amber-900' : 'text-tinta-900')}>{valor}</span>
                    {desglose.length > 0 && <span className="block text-[11px] text-tinta-600">{desglose.join(' · ')}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-tinta-500">Lo más reciente en «{inicial.titulo}»</h3>
            {!items.length ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-tinta-600"><CheckCircle2 className="h-4 w-4 shrink-0 text-menta-600" aria-hidden />{inicial.vacio}</p>
            ) : (
              <>
                <ul className="mt-1 divide-y divide-tinta-100">
                  {items.map((i) => <li key={i.id}><TarjetaIncidencia i={i} portal="lurima" a={`/admin/incidencias/${i.id}`} etiqueta={`Gestionar ${i.folio}`}
                    state={{ bandeja: `bandeja=${inicial.clave}` }} contexto={<span>{[i.pedido_folio, i.cliente].filter(Boolean).join(' · ')}</span>} /></li>)}
                </ul>
                {n > items.length && <Link to={enlace(inicial.clave)} className="mt-1 inline-flex min-h-9 items-center text-sm font-semibold text-menta-700 hover:underline">Ver las {n} en «{inicial.titulo}»</Link>}
              </>
            )}
          </div>
        </div>
      )}
    </Tarjeta>
  );
}
