/**
 * Detalle de una solicitud de sucursal con trazabilidad completa. Cada proceso conserva su propio estado:
 * revisión, surtido, envío (por paquete), recepción en sucursal, entrega individual y conformidad.
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDown, ArrowRightCircle, CheckCircle2, ChevronLeft, ClipboardCheck, Clock, FilePlus2, Info, MessageSquare, Package, PenLine, RotateCcw, Send, ShieldAlert, Star, Truck } from 'lucide-react';
import ConfirmarEnvio from '../portal/ConfirmarEnvio';
import { post } from '../../api/cliente';
import type { EntregaIndividual, Incidencia, Paquete, Pedido } from '../../api/tipos';
import { Aviso, Boton, Campo, Entrada, ErrorCaja, Estado, Firma, Modal, Selector, Tarjeta, Texto, useAviso } from '../../components/ui';
import { useCelebrar } from '../../components/Celebracion';
import { AdjuntarEvidencias, GaleriaEvidencias } from '../../components/Archivos';
import FirmaEnLinea from '../../components/FirmaEnLinea';
import Expediente from '../../components/Expediente';
import { CabezaIndividual, ContenidoPorPersona, individualesDe } from '../../components/PaqueteIndividual';
import { ListaReposiciones } from '../../components/Reposiciones';
import TarjetaIncidencia from '../../components/TarjetaIncidencia';
import { Aparecer, Etapa, LineaProceso, Palomita } from '../../components/movimiento';
import ComprobanteEntrega from './ComprobanteEntrega';
import LineaTiempoSolicitud from '../../components/LineaTiempoSolicitud';
import { useConfig } from '../../app/config';
import { BotonWhatsApp, ChatSolicitud } from '../colaboracion/Mensajes';
import { cls, etiqueta, fechaHora, PROBLEMAS_CONFORMIDAD, PROBLEMAS_RECEPCION, TIPOS_INCIDENCIA } from '../../lib/formato';


function etapasPaquete(pq: Paquete): Etapa[] {
  const orden = ['preparado', 'despachado', 'en_transito', 'entregado'];
  const i = pq.estado === 'incidencia' ? 2 : orden.indexOf(pq.estado);
  const paso = (k: number, clave: string, titulo: string): Etapa => ({ clave, titulo, estado: i > k ? 'hecha' : i === k ? (pq.estado === 'incidencia' ? 'alerta' : 'actual') : 'pendiente' });
  return [paso(0, 'pre', 'Preparado'), paso(1, 'env', 'Enviado'), paso(2, 'tra', 'En tránsito'),
    { clave: 'lle', titulo: 'Entregado', estado: pq.estado === 'entregado' ? (pq.recepcion ? 'hecha' : 'actual') : 'pendiente' },
    { clave: 'rec', titulo: 'Recibido en sucursal', estado: pq.recepcion ? (pq.recepcion.estado === 'parcial' ? 'alerta' : 'hecha') : 'pendiente' }];
}

// El historial guardado antes del cambio de denominación conserva el prefijo anterior; ambos se reconocen.
const PREFIJOS_CAMBIO = ['Modificada por el Gerente de compras: ', 'Modificada por el distribuidor: '];

/** Texto de un cambio hecho por el Gerente de compras (sin el prefijo), o null si la entrada no es un cambio suyo. */
export function cambioDelGerente(motivo?: string | null): string | null {
  const prefijo = PREFIJOS_CAMBIO.find((x) => motivo?.startsWith(x));
  return prefijo ? motivo!.slice(prefijo.length) : null;
}

// ---------------------------------------------------------------- qué sigue (derivado solo de los datos de la solicitud)

type Siguiente = { tono: 'accion' | 'espera' | 'alerta' | 'fin'; titulo: string; texto: string; ir?: 'paquetes' | 'empleados' };

export function proximoPaso(p: Pedido): Siguiente {
  const entregas = p.entregas_individuales || [];
  const porRecibir = p.paquetes.filter((pq) => pq.estado === 'entregado' && !pq.recepcion).length;
  const porEntregar = entregas.filter((e) => e.estado === 'pendiente' && p.paquetes.find((pq) => pq.id === e.paquete_id)?.recepcion).length;
  const porConformar = entregas.filter((e) => e.estado !== 'pendiente' && !e.conformidad_en).length;
  const motivo = p.aprobaciones?.filter((a) => a.decision !== 'aprobado').slice(-1)[0]?.motivo;
  switch (p.estado) {
    case 'borrador': return { tono: 'accion', titulo: 'Revisa y envía tu solicitud', texto: 'Está guardada como borrador: el Gerente de compras todavía no la ve. Edítala si hace falta y envíala a revisión.' };
    case 'en_revision': return { tono: 'espera', titulo: 'En revisión por el Gerente de compras', texto: 'No necesitas hacer nada por ahora. Te avisaremos cuando la apruebe, la devuelva para corrección o la rechace.' };
    case 'devuelto': return { tono: 'alerta', titulo: 'Corrige y reenvía la solicitud', texto: motivo ? `Observación del Gerente de compras: ${motivo}` : 'El Gerente de compras la devolvió para corrección.' };
    case 'rechazado': return { tono: 'fin', titulo: 'Solicitud rechazada', texto: motivo ? `Motivo: ${motivo}` : 'El Gerente de compras rechazó la solicitud.' };
    case 'cancelado': return { tono: 'fin', titulo: 'Solicitud cancelada', texto: 'Esta solicitud ya no avanza.' };
    case 'aprobado': return { tono: 'espera', titulo: 'Aprobada: pendiente de autorización de la distribuidora', texto: 'La distribuidora se pondrá en contacto para el pago. En cuanto la autorice, el almacén preparará tu pedido.' };
    case 'expirado': return { tono: 'fin', titulo: 'Solicitud vencida', texto: 'No se autorizó dentro del plazo. Envía una nueva solicitud si aún la necesitas.' };
  }
  if (porRecibir) return { tono: 'accion', titulo: `Registra la recepción de ${porRecibir} paquete(s)`, texto: 'Ya llegaron a tu sucursal. Confirma lo que recibiste, artículo por artículo, antes de entregarlo a cada empleado.', ir: 'paquetes' };
  if (porEntregar) return { tono: 'accion', titulo: `Entrega los artículos a ${porEntregar} empleado(s)`, texto: 'Los paquetes ya están en tu sucursal. Registra cada entrega con la firma del empleado.', ir: 'empleados' };
  if (porConformar) return { tono: 'accion', titulo: `Registra la conformidad de ${porConformar} empleado(s)`, texto: 'Cada empleado confirma cómo recibió sus artículos y puede reportar un problema.', ir: 'empleados' };
  if (p.estado === 'cerrado') return { tono: 'fin', titulo: 'Solicitud cerrada', texto: 'Todas las entregas y conformidades quedaron registradas.' };
  if (['confirmado', 'en_preparacion'].includes(p.estado)) return { tono: 'espera', titulo: 'Aprobada: el almacén prepara tu pedido', texto: 'Te avisaremos cuando salga cada paquete.' };
  if (['parcialmente_enviado', 'enviado'].includes(p.estado)) return { tono: 'espera', titulo: 'Tus paquetes van en camino', texto: 'Cuando llegue un paquete a tu sucursal, regístralo en la sección Paquetes.', ir: 'paquetes' };
  return { tono: 'espera', titulo: 'Entregas en curso', texto: 'No hay acciones pendientes de tu sucursal por ahora.' };
}

const TONOS_SIGUIENTE = {
  accion: ['bg-menta-50 ring-menta-200', 'bg-menta-500 text-white', ArrowRightCircle],
  espera: ['bg-sd-50 ring-sd-100', 'bg-sd-900 text-white', Clock],
  alerta: ['bg-amber-50 ring-amber-200', 'bg-amber-500 text-white', AlertTriangle],
  fin: ['bg-tinta-50 ring-tinta-100', 'bg-tinta-500 text-white', CheckCircle2],
} as const;

/** Qué sigue en la solicitud; las incidencias se separan por su turno (backend: turno_actor), sin calcular nada. */
function QueSigue({ s, incidencias }: { s: Siguiente; incidencias: Incidencia[] }) {
  const [fondo, icono, Icono] = TONOS_SIGUIENTE[s.tono];
  const teEsperan = incidencias.filter((i) => i.turno_actor === 'sucursal');
  const conLurima = incidencias.filter((i) => i.turno_actor === 'lurima').length;
  return (
    <section aria-labelledby="t-que-sigue" className={cls('flex flex-col gap-4 rounded-2xl p-5 ring-1 sm:flex-row sm:items-center', fondo)}>
      <span className={cls('grid h-11 w-11 shrink-0 place-items-center rounded-xl', icono)} aria-hidden><Icono className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-tinta-500">Qué sigue</p>
        <h2 id="t-que-sigue" className="font-display text-lg font-bold text-tinta-900">{s.titulo}</h2>
        <p className="mt-0.5 text-sm text-tinta-700">{s.texto}</p>
        {teEsperan.length > 0 && (
          <p className="mt-1 text-sm font-semibold text-amber-800">
            {teEsperan.length === 1 ? '1 incidencia te espera' : `${teEsperan.length} incidencias te esperan`}:{' '}
            {teEsperan.map((i, n) => <span key={i.id}>{n > 0 && ', '}<Link to={`/cuenta/incidencias/${i.id}`} className="underline hover:text-amber-950">{i.folio}</Link></span>)}
          </p>
        )}
        {conLurima > 0 && <p className="mt-1 text-sm text-tinta-600">{conLurima === 1 ? '1 incidencia en seguimiento con Lurima.' : `${conLurima} incidencias en seguimiento con Lurima.`}</p>}
      </div>
      {s.ir && (
        <Boton variante="secundario" className="shrink-0" icono={<ArrowDown className="h-4 w-4" aria-hidden />}
          onClick={() => document.getElementById(`seccion-${s.ir}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          {s.ir === 'paquetes' ? 'Ir a Paquetes' : 'Ir a Empleados'}
        </Boton>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- recepción del paquete

/** También se usa desde la incidencia (D-7) para recibir una reposición: mismo formulario y mismo endpoint. */
export function RecepcionPaquete({ pq, p, onCerrar }: { pq: Paquete; p: Pedido; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const filas = pq.contenido;
  // Por artículo: si llegó bien o con problema; con problema, cuántas piezas sirven (en buen estado), tipo, nota y fotos.
  const [problema, setProblema] = useState<Record<number, string>>({});
  const [buenas, setBuenas] = useState<Record<number, number>>({});
  const [nota, setNota] = useState<Record<number, string>>({});
  const [fotos, setFotos] = useState<Record<number, string[]>>({});
  const [fotosPaquete, setFotosPaquete] = useState<string[]>([]);
  const [obs, setObs] = useState('');
  const conProblema = filas.filter((c) => problema[c.pedido_detalle_id]);
  const m = useMutation({
    mutationFn: () => post(`/cuenta/paquetes/${pq.id}/recepcion`, {
      completa: conProblema.length === 0, diferencias: obs || null, evidencias: fotosPaquete,
      partidas: filas.map((c) => {
        const id = c.pedido_detalle_id;
        return problema[id]
          ? { pedido_detalle_id: id, recibida: buenas[id] ?? 0, problema: problema[id], nota: nota[id] || null, evidencias: fotos[id] || [] }
          : { pedido_detalle_id: id, recibida: c.cantidad };
      }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedido', String(p.id)] }); qc.invalidateQueries({ queryKey: ['resumen-sucursal'] });
      // Una reposición recibida cambia su incidencia (turno y estado): se recargan también las incidencias
      qc.invalidateQueries({ queryKey: ['mi-incidencia'] }); qc.invalidateQueries({ queryKey: ['mis-incidencias'] });
      avisar(conProblema.length ? `Recepción de ${pq.folio} registrada con incidencia.` : `Recepción del paquete ${pq.folio} registrada.`); onCerrar();
    },
  });
  const marcar = (id: number, tipo: string) => {
    setProblema({ ...problema, [id]: tipo });
    if (tipo && buenas[id] === undefined) setBuenas({ ...buenas, [id]: 0 });
  };
  const piezasMal = conProblema.reduce((t, c) => t + c.cantidad - (buenas[c.pedido_detalle_id] ?? 0), 0);
  return (
    <div className="space-y-4">
      <Aviso>Abre el paquete grande y revisa cada paquete individual con el nombre de la persona. Marca solo lo que llegó con
        problema; todo lo demás se registra como recibido completo.</Aviso>
      <div className="space-y-4">
      {individualesDe(pq).map((g) => (
      <section key={g.empleado ? `e${g.empleado.id}` : 'sin'} className="rounded-2xl bg-arena-50/60 p-3 ring-1 ring-arena-200"
        aria-label={g.empleado ? `Paquete individual de ${g.empleado.nombre}` : 'Piezas sin asignar'}>
      <CabezaIndividual g={g} />
      <ul className="mt-3 space-y-2">
        {g.piezas.map((c) => {
          const id = c.pedido_detalle_id;
          const mal = !!problema[id];
          return (
          <li key={id} className={cls('rounded-xl p-3 text-sm ring-1', mal ? 'bg-amber-50 ring-amber-200' : 'bg-white ring-arena-200')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0"><b>{c.nombre}</b> · {c.talla}{c.color ? <span className="text-tinta-500"> · {c.color}</span> : null}
                <span className="text-tinta-500"> · {c.cantidad} pieza(s)</span></span>
              <div role="radiogroup" aria-label={`¿Cómo llegó ${c.nombre}?`} className="flex rounded-full bg-tinta-50 p-0.5 ring-1 ring-tinta-100">
                <button type="button" role="radio" aria-checked={!mal} onClick={() => marcar(id, '')}
                  className={cls('min-h-9 rounded-full px-3 text-xs font-semibold transition', !mal ? 'bg-menta-500 text-white shadow' : 'text-tinta-600')}>Llegó bien</button>
                <button type="button" role="radio" aria-checked={mal} onClick={() => marcar(id, problema[id] || 'danado')}
                  className={cls('min-h-9 rounded-full px-3 text-xs font-semibold transition', mal ? 'bg-amber-500 text-white shadow' : 'text-tinta-600')}>Con problema</button>
              </div>
            </div>
            {mal && (
              <div className="mt-3 space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Campo etiqueta="¿Qué pasó?">
                    <Selector value={problema[id]} onChange={(e) => marcar(id, e.target.value)} aria-label={`Problema con ${c.nombre}`}>
                      {Object.entries(PROBLEMAS_RECEPCION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Selector>
                  </Campo>
                  <Campo etiqueta="Piezas en buen estado" ayuda="Las que sí se pueden entregar.">
                    <Selector value={buenas[id] ?? 0} onChange={(e) => setBuenas({ ...buenas, [id]: Number(e.target.value) })} aria-label={`Piezas de ${c.nombre} en buen estado`}>
                      {Array.from({ length: c.cantidad }, (_, i) => <option key={i} value={i}>{i} de {c.cantidad}</option>)}</Selector>
                  </Campo>
                </div>
                <Entrada placeholder="Describe el problema (opcional): manga rota, talla equivocada…" value={nota[id] || ''} onChange={(e) => setNota({ ...nota, [id]: e.target.value })} aria-label={`Nota sobre ${c.nombre}`} />
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-tinta-700">Fotos del problema <span className="font-normal text-tinta-500">(recomendado)</span></p>
                  <AdjuntarEvidencias valor={fotos[id] || []} onCambio={(u) => setFotos({ ...fotos, [id]: u })} pdf={false} />
                </div>
              </div>
            )}
          </li>
          );
        })}
      </ul>
      </section>
      ))}
      </div>
      <Campo etiqueta="Fotos del paquete (opcional)" ayuda="Caja golpeada, abierta o mojada, etiqueta, etc.">
        <AdjuntarEvidencias valor={fotosPaquete} onCambio={setFotosPaquete} pdf={false} max={6} />
      </Campo>
      <Campo etiqueta="Observaciones generales (opcional)"><Texto value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
      {conProblema.length > 0 && (
        <Aviso tipo="alerta">
          <b>{piezasMal} pieza(s) con problema.</b> Se abrirá una incidencia con tus fotos. La entrega a cada persona solo pedirá lo
          que llegó en buen estado, y lo que falta llegará en un <b>envío de reposición con su propia guía</b>.
        </Aviso>
      )}
      <ErrorCaja error={m.error} />
      <div className="flex flex-wrap justify-end gap-2"><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton cargando={m.isPending} onClick={() => m.mutate()}>{conProblema.length ? 'Registrar recepción con incidencia' : 'Confirmar recepción completa'}</Boton></div>
    </div>
  );
}

// ---------------------------------------------------------------- entrega individual con firma

function EntregaConFirma({ e, p, onCerrar }: { e: EntregaIndividual; p: Pedido; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [firma, setFirma] = useState<string | null>(null);
  const [quien, setQuien] = useState('');
  const [obs, setObs] = useState('');
  const [cant, setCant] = useState<Record<number, number>>(Object.fromEntries(e.detalles.map((d) => [d.pedido_detalle_id, d.esperada])));
  const [hecho, setHecho] = useState<EntregaIndividual | null>(null);
  const m = useMutation({
    mutationFn: () => post<EntregaIndividual>(`/cuenta/entregas/${e.id}`, { firma, registrado_por: quien, observaciones: obs || null, cantidades: cant }),
    onSuccess: (r) => {
      setHecho(r);
      qc.invalidateQueries({ queryKey: ['pedido', String(p.id)] }); qc.invalidateQueries({ queryKey: ['resumen-sucursal'] });
      avisar(r.estado === 'entregada' ? `Entrega a ${e.empleado.nombre} registrada.` : 'Entrega registrada con incidencia.');
    },
  });
  if (hecho) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <Palomita className="text-menta-500" />
        <p className="font-display text-lg font-bold">Entrega registrada</p>
        <p className="text-sm text-tinta-500">{e.empleado.nombre} firmó de recibido. Entregó: {hecho.registrado_por}.</p>
        <span className="animate-sello rounded-lg border-2 border-menta-600 px-3 py-1 font-display text-sm font-extrabold uppercase tracking-widest text-menta-700">Firmado</span>
        <Boton onClick={onCerrar}>Listo</Boton>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-tinta-500">{e.empleado.nombre} · {e.empleado.puesto} · No. {e.empleado.numero}</p>
      {e.detalles.map((d) => (
        <div key={d.pedido_detalle_id} className="flex items-center justify-between gap-3 rounded-xl p-3 text-sm ring-1 ring-arena-200">
          <span>{d.nombre} · {d.talla}</span>
          <label className="flex items-center gap-2 text-xs">Entregadas
            <Selector className="w-20" value={cant[d.pedido_detalle_id]} onChange={(ev) => setCant({ ...cant, [d.pedido_detalle_id]: Number(ev.target.value) })}>
              {Array.from({ length: d.esperada + 1 }, (_, i) => <option key={i} value={i}>{i}</option>)}</Selector> de {d.esperada}</label>
        </div>
      ))}
      <Campo etiqueta="¿Quién entrega?" ayuda="Nombre de la persona de la sucursal que hace la entrega"><Entrada value={quien} onChange={(ev) => setQuien(ev.target.value)} /></Campo>
      <Campo etiqueta="Observaciones (opcional)"><Texto value={obs} onChange={(ev) => setObs(ev.target.value)} /></Campo>
      <div><p className="mb-1 text-sm font-semibold">Firma de {e.empleado.nombre}</p><Firma titulo={`Firma de ${e.empleado.nombre}`} onCambio={setFirma} /></div>
      <ErrorCaja error={m.error} />
      <div className="flex justify-end gap-2"><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton disabled={!firma || quien.trim().length < 3} cargando={m.isPending} onClick={() => m.mutate()}>Registrar entrega</Boton></div>
    </div>
  );
}

// ---------------------------------------------------------------- conformidad del empleado

function Conformidad({ e, p, onCerrar }: { e: EntregaIndividual; p: Pedido; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [val, setVal] = useState(5);
  const [todoBien, setTodoBien] = useState(true);
  const [problema, setProblema] = useState('talla');
  const [articulo, setArticulo] = useState<number | ''>(e.detalles.length === 1 ? e.detalles[0].pedido_detalle_id : '');
  const [comentario, setComentario] = useState('');
  const m = useMutation({
    mutationFn: () => post(`/cuenta/entregas/${e.id}/conformidad`, { valoracion: val, comentario: comentario || null,
      problema: todoBien ? null : problema, pedido_detalle_id: todoBien || articulo === '' ? null : articulo }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pedido', String(p.id)] }); qc.invalidateQueries({ queryKey: ['resumen-sucursal'] });
      avisar(todoBien ? `Conformidad de ${e.empleado.nombre} registrada.` : 'Se registró la conformidad y se abrió una incidencia.'); onCerrar(); },
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-tinta-500">{e.empleado.nombre} confirma cómo recibió sus artículos.</p>
      <div>
        <p className="mb-1 text-sm font-semibold">Valoración de la entrega</p>
        <div className="flex gap-1" role="radiogroup" aria-label="Valoración">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={val === n} aria-label={`${n} de 5`} onClick={() => setVal(n)}
              className={cls('rounded-lg p-1 transition hover:scale-110', n <= val ? 'text-amber-400' : 'text-tinta-200')}>
              <Star key={`${n}-${val}`} className={cls('h-8 w-8', n <= val && 'animate-rebote fill-current')} style={{ animationDelay: `${n * 40}ms` }} />
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-arena-100 p-1 text-sm font-semibold">
        <button type="button" onClick={() => setTodoBien(true)} className={cls('rounded-lg py-2 transition', todoBien ? 'bg-white shadow-sm' : 'text-tinta-500')}>Todo correcto</button>
        <button type="button" onClick={() => setTodoBien(false)} className={cls('rounded-lg py-2 transition', !todoBien ? 'bg-white shadow-sm' : 'text-tinta-500')}>Reportar un problema</button>
      </div>
      {!todoBien && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Problema"><Selector value={problema} onChange={(ev) => setProblema(ev.target.value)}>{Object.entries(PROBLEMAS_CONFORMIDAD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Selector></Campo>
          <Campo etiqueta="Artículo"><Selector value={articulo} onChange={(ev) => setArticulo(ev.target.value ? Number(ev.target.value) : '')}>
            <option value="">General</option>{e.detalles.map((d) => <option key={d.pedido_detalle_id} value={d.pedido_detalle_id}>{d.nombre} · {d.talla}</option>)}</Selector></Campo>
        </div>
      )}
      <Campo etiqueta={todoBien ? 'Comentario (opcional)' : 'Describe el problema'}><Texto value={comentario} onChange={(ev) => setComentario(ev.target.value)} /></Campo>
      <ErrorCaja error={m.error} />
      <div className="flex justify-end gap-2"><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton cargando={m.isPending} disabled={!todoBien && comentario.trim().length < 5} onClick={() => m.mutate()}>Registrar conformidad</Boton></div>
    </div>
  );
}

// ---------------------------------------------------------------- incidencias

function NuevaIncidencia({ p, onCerrar }: { p: Pedido; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [tipo, setTipo] = useState('articulo_faltante');
  const [empleado, setEmpleado] = useState<number | ''>('');
  const [articulo, setArticulo] = useState<number | ''>('');
  const [paquete, setPaquete] = useState<number | ''>('');
  const [desc, setDesc] = useState('');
  const [evidencias, setEvidencias] = useState<string[]>([]);
  const empleados = [...new Map(p.detalles.filter((d) => d.empleado).map((d) => [d.empleado!.id, d.empleado!])).values()];
  const m = useMutation({
    mutationFn: () => post(`/cuenta/pedidos/${p.id}/incidencias`, { tipo, descripcion: desc, prioridad: 'media',
      empleado_id: empleado || null, pedido_detalle_id: articulo || null, paquete_id: paquete || null, evidencias }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pedido', String(p.id)] }); avisar('Incidencia registrada.'); onCerrar(); },
  });
  const tipos = ['articulo_faltante', 'articulo_danado', 'talla_incorrecta', 'articulo_incorrecto', 'paquete_no_recibido', 'otro'];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Tipo"><Selector value={tipo} onChange={(e) => setTipo(e.target.value)}>{tipos.map((t) => <option key={t} value={t}>{TIPOS_INCIDENCIA[t]}</option>)}</Selector></Campo>
        <Campo etiqueta="Paquete (opcional)"><Selector value={paquete} onChange={(e) => setPaquete(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Toda la solicitud</option>{p.paquetes.map((pq) => <option key={pq.id} value={pq.id}>{pq.folio}</option>)}</Selector></Campo>
        <Campo etiqueta="Empleado (opcional)"><Selector value={empleado} onChange={(e) => { setEmpleado(e.target.value ? Number(e.target.value) : ''); setArticulo(''); }}>
          <option value="">General</option>{empleados.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</Selector></Campo>
        <Campo etiqueta="Artículo (opcional)"><Selector value={articulo} onChange={(e) => setArticulo(e.target.value ? Number(e.target.value) : '')}>
          <option value="">General</option>{p.detalles.filter((d) => !empleado || d.empleado?.id === empleado).map((d) => <option key={d.id} value={d.id}>{d.nombre} · {d.talla}{empleado ? '' : ` · ${d.empleado?.nombre}`}</option>)}</Selector></Campo>
      </div>
      <Campo etiqueta="Descripción" ayuda="Mínimo 10 caracteres"><Texto value={desc} onChange={(e) => setDesc(e.target.value)} /></Campo>
      <div><p className="mb-1.5 text-sm font-semibold text-tinta-800">Foto de evidencia <span className="font-normal text-tinta-400">(recomendada)</span></p>
        <AdjuntarEvidencias valor={evidencias} onCambio={setEvidencias} /></div>
      <ErrorCaja error={m.error} />
      <div className="flex justify-end gap-2"><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton cargando={m.isPending} disabled={desc.trim().length < 10} onClick={() => m.mutate()}>Registrar incidencia</Boton></div>
    </div>
  );
}

type EntradaSeguimiento = Incidencia['seguimiento'][number];

/** Mensajes de la sucursal con significado propio, por su estructura (no por el texto): siguen siendo mensajes humanos. */
function especial(s: EntradaSeguimiento): 'confirmada' | 'reabierta' | null {
  if (s.clase !== 'mensaje' || s.lado !== 'sucursal' || s.anterior !== 'resuelta') return null;
  return s.nuevo === 'cerrada' ? 'confirmada' : s.nuevo !== 'resuelta' ? 'reabierta' : null;
}

/** Ícono del evento según lo que cambió (creación, resolución o cierre, otro cambio de estado, nota). */
function iconoEvento(s: EntradaSeguimiento) {
  if (!s.anterior) return FilePlus2;
  if (s.anterior !== s.nuevo) return s.nuevo === 'resuelta' || s.nuevo === 'cerrada' ? CheckCircle2 : ArrowRightCircle;
  return Info;
}

/** Quién figura en un evento. Del lado de la sucursal, salvo su alta, un evento es una nota automática (p. ej. la
 *  resolución al recibir completa la reposición): no se le atribuye como si la hubiera escrito. */
const autorEvento = (s: EntradaSeguimiento) => (s.lado === 'sucursal' && s.anterior ? 'Registro automático' : s.actor);

const cambioEstado = (s: EntradaSeguimiento) => (s.anterior && s.anterior !== s.nuevo ? `${etiqueta(s.anterior)} → ${etiqueta(s.nuevo)}` : null);

/**
 * Seguimiento en orden cronológico (el del backend). `clase` (backend: es_humana) decide la forma: los mensajes de
 * personas van en una tarjeta con su autor; los eventos automáticos, en una línea discreta con ícono. La confirmación
 * y la reapertura de la sucursal se ven como mensajes con su etiqueta. El contenido se muestra tal cual.
 */
export function HistorialIncidencia({ i }: { i: Incidencia }) {
  if (!i.seguimiento.length) return <p className="mt-2 text-xs text-tinta-500">Todavía no hay movimientos ni mensajes.</p>;
  return (
    <ol className="mt-2 space-y-2.5">
      {i.seguimiento.map((s, k) => {
        if (s.clase === 'evento') {
          const Icono = iconoEvento(s);
          return (
            <Aparecer como="li" orden={k} key={k} className="flex gap-2 px-1 text-xs text-tinta-500">
              <Icono className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tinta-400" aria-hidden />
              <p className="min-w-0 break-words"><span className="sr-only">Evento del sistema: </span>
                {[...new Set([s.anterior ? cambioEstado(s) : 'Incidencia registrada', s.comentario])].filter(Boolean).join(' · ')}
                <span className="text-tinta-400"> · {autorEvento(s)} · {fechaHora(s.fecha)}</span>
                {s.responsable && <span className="text-tinta-400"> · Responsable: {s.responsable}</span>}</p>
            </Aparecer>
          );
        }
        const tipo = especial(s);
        const Icono = tipo === 'confirmada' ? CheckCircle2 : tipo === 'reabierta' ? RotateCcw : MessageSquare;
        return (
          <Aparecer como="li" orden={k} key={k} className={cls('rounded-xl p-3 text-sm ring-1',
            tipo === 'confirmada' ? 'bg-menta-50 ring-menta-200' : tipo === 'reabierta' ? 'bg-amber-50 ring-amber-200' : 'bg-white ring-tinta-100')}>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-tinta-600"><span className="sr-only">Mensaje: </span>
              <Icono className={cls('h-3.5 w-3.5 shrink-0', tipo === 'confirmada' ? 'text-menta-700' : tipo === 'reabierta' ? 'text-amber-700' : 'text-tinta-400')} aria-hidden />
              <b className="text-tinta-900">{s.actor}</b>
              {s.actor !== (s.lado === 'sucursal' ? 'Sucursal' : 'Lurima') && <span>{s.lado === 'sucursal' ? 'Sucursal' : 'Lurima'}</span>}
              <span>· {fechaHora(s.fecha)}</span>
              {tipo && <span className={cls('rounded-full px-2 py-0.5 font-semibold', tipo === 'confirmada' ? 'bg-menta-100 text-menta-800' : 'bg-amber-100 text-amber-900')}>
                {tipo === 'confirmada' ? 'Solución confirmada' : 'Reabrió la incidencia'}</span>}
              {!tipo && cambioEstado(s) && <span className="text-tinta-500">· {cambioEstado(s)}</span>}
            </p>
            {s.comentario && <p className="mt-1.5 whitespace-pre-line break-words text-tinta-800">{s.comentario}</p>}
            {!!s.adjuntos?.length && <div className="mt-2"><GaleriaEvidencias urls={s.adjuntos} titulo={`Adjuntos de ${s.actor}`} /></div>}
            {s.responsable && <p className="mt-1 text-xs text-tinta-500">Responsable: {s.responsable}</p>}
          </Aparecer>
        );
      })}
    </ol>
  );
}

/** Incidencia dentro de la solicitud: la tarjeta común, con lo que solo importa aquí (persona, evidencias, reposiciones). */
function IncidenciaDeSolicitud({ i }: { i: Incidencia }) {
  const persona = [i.empleado?.nombre, i.articulo && `${i.articulo.nombre} (${i.articulo.talla})`].filter(Boolean).join(' · ');
  return (
    <TarjetaIncidencia i={i} portal="sucursal" a={`/cuenta/incidencias/${i.id}`}
      contexto={<>{persona && <span>{persona}</span>}<span>Estado: {etiqueta(i.estado)}</span></>}>
      {!!i.evidencias?.length && <div className="mt-2"><GaleriaEvidencias urls={i.evidencias} titulo={`Evidencia de ${i.folio}`} /></div>}
      <ListaReposiciones paquetes={i.reposiciones} />
    </TarjetaIncidencia>
  );
}

// ---------------------------------------------------------------- vista principal

function ContactoWhatsApp({ folio }: { folio: string }) {
  const { whatsapp } = useConfig();
  if (!whatsapp.aprobador) return null;
  return <div className="flex justify-end"><BotonWhatsApp numero={whatsapp.aprobador} texto={`Hola, te escribo sobre la solicitud ${folio}.`} /></div>;
}

export default function DetalleSolicitud({ p }: { p: Pedido }) {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const avisar = useAviso();
  const celebrar = useCelebrar();
  const [recibir, setRecibir] = useState<Paquete | null>(null);
  const [entrega, setEntrega] = useState<EntregaIndividual | null>(null);
  const [conformidad, setConformidad] = useState<EntregaIndividual | null>(null);
  const [comprobante, setComprobante] = useState<number | null>(null);
  const [incidencia, setIncidencia] = useState(false);
  const [cancelar, setCancelar] = useState(false);
  const [motivo, setMotivo] = useState('');
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['pedido', String(p.id)] }); qc.invalidateQueries({ queryKey: ['resumen-sucursal'] }); qc.invalidateQueries({ queryKey: ['mis-borradores'] }); };
  const [confirmar, setConfirmar] = useState(false);
  const enviar = useMutation({ mutationFn: () => post(`/cuenta/pedidos-corporativos/${p.id}/enviar`), onSuccess: () => { refrescar(); setConfirmar(false); avisar(`Solicitud ${p.folio} enviada a revisión.`);
    celebrar({ titulo: `¡Solicitud ${p.folio} enviada!`, texto: 'Quedó en revisión con el aprobador corporativo. Te avisaremos de cada avance.' }); } });
  const cancelarM = useMutation({ mutationFn: () => post(`/cuenta/pedidos/${p.id}/cancelar`, { motivo }), onSuccess: () => { refrescar(); setCancelar(false); avisar(p.estado === 'borrador' ? 'Borrador descartado.' : 'Solicitud cancelada.'); } });

  const entregas = p.entregas_individuales || [];
  const empleados = [...new Map(p.detalles.filter((d) => d.empleado).map((d) => [d.empleado!.id, d.empleado!])).values()];
  const cancelable = p.estado === 'borrador';  // una solicitud enviada solo la cancela el distribuidor
  const cambiosGerente = p.historial.filter((h) => cambioDelGerente(h.motivo) !== null);
  const observacion = p.aprobaciones?.filter((a) => a.decision !== 'aprobado').slice(-1)[0];

  return (
    <div className="space-y-5">
      <Link to="/cuenta/pedidos" className="inline-flex min-h-8 items-center gap-1 text-sm font-semibold text-menta-700 hover:underline"><ChevronLeft className="h-4 w-4" aria-hidden />Mis solicitudes</Link>
      {params.get('nuevo') && p.estado !== 'borrador' && (
        <Aparecer>
          <div className="flex items-center gap-4 rounded-2xl bg-menta-500 p-5 text-white">
            <Palomita className="h-12 w-12 shrink-0 text-white" />
            <div><p className="font-display text-lg font-bold">Solicitud {p.folio} enviada</p>
              <p className="text-sm text-menta-50">Quedó en revisión: aún no está aprobada ni surtida. Te avisaremos cuando el Gerente de compras la revise.</p></div>
          </div>
        </Aparecer>
      )}

      <Tarjeta titulo={<span className="flex flex-wrap items-center gap-2">Solicitud {p.folio} <Estado valor={p.estado} /></span>}
        sub={`${fechaHora(p.creado)} · ${empleados.length} empleado(s) · ${p.articulos} artículo(s)`}
        accion={<div className="flex flex-wrap gap-2">
          {p.estado === 'borrador' && <>
            <Link to={`/cuenta/solicitudes/${p.id}/editar`} className="inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-semibold ring-1 ring-tinta-200"><PenLine className="h-3.5 w-3.5" />Editar</Link>
            <Boton tam="sm" icono={<Send className="h-3.5 w-3.5" />} cargando={enviar.isPending} disabled={!p.detalles.length} onClick={() => { enviar.reset(); setConfirmar(true); }}>Enviar a revisión</Boton></>}
          {p.estado === 'devuelto' && <Link to={`/cuenta/solicitudes/${p.id}/editar`} className="inline-flex h-8 items-center rounded-lg bg-sd-900 px-3 text-xs font-semibold text-white">Corregir y reenviar</Link>}
          {p.estado !== 'borrador' && <Boton tam="sm" variante="secundario" icono={<ShieldAlert className="h-3.5 w-3.5" />} onClick={() => setIncidencia(true)}>Reportar incidencia</Boton>}
          {cancelable && <Boton tam="sm" variante="fantasma" onClick={() => setCancelar(true)}>{p.estado === 'borrador' ? 'Descartar' : 'Cancelar'}</Boton>}
        </div>}>
        {/* Devuelta o rechazada: la observación se muestra en «Qué sigue»; aquí queda como antecedente en los demás estados. */}
        {observacion && !['devuelto', 'rechazado'].includes(p.estado) && <div className="mb-4"><Aviso tipo="alerta">{etiqueta(observacion.decision)} por el Gerente de compras: {observacion.motivo}</Aviso></div>}
        {cambiosGerente.map((h, i) => (
          <Aparecer key={i} orden={i}><div className="mb-3"><Aviso tipo="alerta"><b>Cambio del Gerente de compras</b> · {fechaHora(h.fecha)} · {h.actor}<br />{cambioDelGerente(h.motivo)}</Aviso></div></Aparecer>
        ))}
        {/* En móvil la línea se desplaza en horizontal: la región es enfocable para poder recorrerla con el teclado. */}
        {p.estado !== 'borrador' && <LineaTiempoSolicitud p={p} />}
        {p.notas && <p className="mt-4 rounded-lg bg-tinta-50 p-3 text-xs"><b>Notas:</b> {p.notas}</p>}
      </Tarjeta>

      <QueSigue s={proximoPaso(p)} incidencias={p.incidencias || []} />

      <section id="seccion-empleados" className="scroll-mt-24">
      <Tarjeta titulo="Artículos por empleado" sub="Lo solicitado, lo entregado y lo pendiente de cada persona">
        <div className="grid gap-3 md:grid-cols-2">
          {empleados.map((emp, i) => {
            const suyos = p.detalles.filter((d) => d.empleado?.id === emp.id);
            const susEntregas = entregas.filter((e) => e.empleado.id === emp.id);
            const pedidas = suyos.reduce((a, d) => a + d.cantidad - d.cantidad_cancelada, 0);
            const recibidas = suyos.reduce((a, d) => a + d.cantidad_entregada, 0);
            const firmadas = susEntregas.reduce((a, e) => a + e.detalles.reduce((s, d) => s + d.entregada, 0), 0);
            return (
              <Aparecer key={emp.id} orden={i}>
                <div className="h-full rounded-xl p-4 ring-1 ring-arena-200">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="font-semibold">{emp.nombre}</p><p className="text-xs text-tinta-400">{emp.puesto}</p></div>
                    <span className="text-right text-xs"><b className="font-display text-lg">{firmadas}</b><span className="text-tinta-400">/{pedidas} entregados</span></span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-arena-200"><div className="h-full origin-left animate-crecer rounded-full bg-menta-500" style={{ width: `${pedidas ? (firmadas / pedidas) * 100 : 0}%` }} /></div>
                  <ul className="mt-3 space-y-1 text-xs">
                    {suyos.map((d) => (
                      <li key={d.id} className="flex justify-between gap-2"><span>{d.cantidad}× {d.nombre} · {d.talla}{d.excepcion && <span className="ml-1 text-amber-700">(excepción)</span>}</span>
                        <span className="shrink-0 text-tinta-400">{d.cantidad_cancelada ? `${d.cantidad_cancelada} cancelada(s)` : recibidas && d.cantidad_entregada >= d.cantidad ? 'En sucursal' : ''}</span></li>
                    ))}
                  </ul>
                  {susEntregas.map((e) => (
                    <div key={e.id} className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-arena-200 pt-3 text-xs">
                      <span>Paquete {p.paquetes.find((pq) => pq.id === e.paquete_id)?.folio}: <Estado valor={e.estado} />
                        {e.registrado_por && <span className="block text-tinta-400">Entregó {e.registrado_por} · {fechaHora(e.entregado_en)}</span>}
                        {e.valoracion && <span className="block text-amber-500">{'★'.repeat(e.valoracion)}<span className="text-tinta-200">{'★'.repeat(5 - e.valoracion)}</span></span>}</span>
                      {e.estado === 'pendiente' ? (
                        p.paquetes.find((pq) => pq.id === e.paquete_id)?.recepcion
                          ? <Boton tam="sm" icono={<PenLine className="h-3.5 w-3.5" />} onClick={() => setEntrega(e)}>Registrar entrega</Boton>
                          : <span className="text-tinta-400">Recibe primero el paquete</span>
                      ) : (
                        <span className="flex flex-wrap gap-1.5">
                          <FirmaEnLinea entregaId={e.id} origen="cuenta" onAbrir={() => setComprobante(e.id)} />
                          {!e.conformidad_en && <Boton tam="sm" variante="menta" icono={<ClipboardCheck className="h-3.5 w-3.5" />} onClick={() => setConformidad(e)}>Conformidad</Boton>}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </Aparecer>
            );
          })}
        </div>
      </Tarjeta>
      </section>

      {p.paquetes.length > 0 && (
        <section id="seccion-paquetes" className="scroll-mt-24">
        <Tarjeta titulo="Paquetes" sub="Cada paquete tiene su propia guía y su propio estado">
          <div className="space-y-4">
            {p.paquetes.map((pq, i) => (
              <Aparecer key={pq.id} orden={i}>
                <div className={cls('rounded-xl p-4 ring-1', pq.reposicion ? 'bg-sky-50/50 ring-sky-200' : 'ring-arena-200')}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex min-w-0 flex-wrap items-center gap-2 font-semibold"><Package className="h-4 w-4 text-menta-600" />{pq.folio}
                      {pq.reposicion && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-800">Reposición de la incidencia {pq.reposicion.folio}</span>}
                      <span className="text-xs font-normal text-tinta-400">desde {pq.sucursal} · {fechaHora(pq.creado)}</span></p>
                    {pq.estado === 'entregado' && !pq.recepcion && <Boton tam="sm" icono={<ClipboardCheck className="h-3.5 w-3.5" />} onClick={() => setRecibir(pq)}>Registrar recepción</Boton>}
                  </div>
                  <div className="mt-4 overflow-x-auto rounded-lg pb-1" tabIndex={0} role="region" aria-label={`Avance del paquete ${pq.folio}`}><div className="min-w-[420px]"><LineaProceso compacta etapas={etapasPaquete(pq)} /></div></div>
                  {pq.envio && (
                    <div className="mt-3 rounded-lg bg-arena-50 p-3 text-xs">
                      <p className="flex flex-wrap items-center gap-2 font-semibold"><Truck className="h-3.5 w-3.5" />{pq.envio.paqueteria} · Guía {pq.envio.guia}
                        <span className={cls('rounded-full px-2 py-0.5 text-[10px] font-bold', pq.envio.rastreo_externo ? 'bg-emerald-100 text-emerald-800' : 'bg-tinta-100 text-tinta-600')}>
                          {pq.envio.rastreo_externo ? 'Rastreo de la paquetería' : 'Guía registrada manualmente'}</span></p>
                      <ul className="mt-2 space-y-1">{pq.envio.eventos.map((ev, k) => <li key={k}>{fechaHora(ev.fecha)} · <b>{etiqueta(ev.estado)}</b> — {ev.descripcion}</li>)}</ul>
                    </div>
                  )}
                  <ContenidoPorPersona pq={pq} />
                  {pq.recepcion && (
                    <div className={cls('mt-3 rounded-lg p-3 text-xs', pq.recepcion.estado === 'parcial' ? 'bg-amber-50 text-amber-900' : 'bg-menta-50 text-menta-800')}>
                      <p className="font-semibold">Recepción {etiqueta(pq.recepcion.estado).toLowerCase()} · {fechaHora(pq.recepcion.fecha)}</p>
                      {pq.recepcion.detalles.filter((x) => x.problema).map((x) => {
                        const c = pq.contenido.find((y) => y.pedido_detalle_id === x.pedido_detalle_id);
                        return (
                          <div key={x.pedido_detalle_id} className="mt-1">
                            <p><AlertTriangle className="mr-1 inline h-3 w-3" />{c?.nombre}{c?.empleado ? ` (${c.empleado})` : ''}: {PROBLEMAS_RECEPCION[x.problema!]} · en buen estado {x.recibida} de {x.esperada}{x.nota ? ` — ${x.nota}` : ''}</p>
                            {!!x.evidencias?.length && <div className="mt-1.5"><GaleriaEvidencias urls={x.evidencias} titulo={`Fotos de ${c?.nombre ?? 'el artículo'}`} /></div>}
                          </div>
                        );
                      })}
                      {pq.recepcion.diferencias && !pq.recepcion.detalles.length && <p>{pq.recepcion.diferencias}</p>}
                    </div>
                  )}
                </div>
              </Aparecer>
            ))}
          </div>
        </Tarjeta>
        </section>
      )}

      {p.estado !== 'borrador' && <Expediente pedidoId={p.id} folio={p.folio} origen="cuenta" onComprobante={setComprobante} />}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] [&>*]:min-w-0">
        <Tarjeta titulo="Incidencias" sub="Cada actualización queda en su historial">
          {!p.incidencias?.length ? <p className="text-sm text-tinta-400">Sin incidencias registradas.</p> : (
            <div className="space-y-2">{p.incidencias.map((i) => <IncidenciaDeSolicitud key={i.id} i={i} />)}</div>
          )}
        </Tarjeta>
        <Tarjeta titulo="Historial de la solicitud">
          <ol className="relative space-y-4 border-l-2 border-arena-200 pl-5">
            {p.historial.map((h, i) => (
              <Aparecer como="li" orden={i} key={i} className="relative">
                <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full bg-menta-500 ring-4 ring-white" />
                <p className="text-sm font-semibold">{etiqueta(h.nuevo)}</p>
                <p className="text-xs text-tinta-400">{fechaHora(h.fecha)} · {h.actor}</p>
                {h.motivo && <p className="text-xs text-tinta-500">{h.motivo}</p>}
              </Aparecer>
            ))}
          </ol>
        </Tarjeta>
      </div>

      {p.estado !== 'borrador' && (
        <div className="space-y-2">
          <ChatSolicitud pedidoId={p.id} tipo="sucursal" titulo="Conversación con el aprobador" />
          <ContactoWhatsApp folio={p.folio} />
        </div>
      )}

      <Modal abierto={!!recibir} titulo={`Recepción del paquete ${recibir?.folio || ''}`} onCerrar={() => setRecibir(null)} ancho="max-w-2xl">
        {recibir && <RecepcionPaquete pq={recibir} p={p} onCerrar={() => setRecibir(null)} />}
      </Modal>
      <Modal abierto={!!entrega} titulo="Entrega individual" onCerrar={() => setEntrega(null)} ancho="max-w-xl">
        {entrega && <EntregaConFirma e={entrega} p={p} onCerrar={() => setEntrega(null)} />}
      </Modal>
      <Modal abierto={!!conformidad} titulo={`Conformidad de ${conformidad?.empleado.nombre || ''}`} onCerrar={() => setConformidad(null)}>
        {conformidad && <Conformidad e={conformidad} p={p} onCerrar={() => setConformidad(null)} />}
      </Modal>
      <ComprobanteEntrega entregaId={comprobante} origen="cuenta" folio={p.folio} onCerrar={() => setComprobante(null)} />
      <ConfirmarEnvio abierto={confirmar} folio={p.folio} empleados={empleados.length} articulos={p.articulos} excepciones={p.detalles.filter((d) => d.excepcion).length}
        cargando={enviar.isPending} error={enviar.error} onConfirmar={() => enviar.mutate()} onCerrar={() => setConfirmar(false)} />
      <Modal abierto={incidencia} titulo="Reportar incidencia" onCerrar={() => setIncidencia(false)} ancho="max-w-xl">
        <NuevaIncidencia p={p} onCerrar={() => setIncidencia(false)} />
      </Modal>
      <Modal abierto={cancelar} titulo={p.estado === 'borrador' ? 'Descartar borrador' : 'Cancelar solicitud'} onCerrar={() => setCancelar(false)}>
        <Campo etiqueta="Motivo"><Texto value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
        <div className="mt-3"><ErrorCaja error={cancelarM.error} /></div>
        <div className="mt-4 flex justify-end gap-2"><Boton variante="secundario" onClick={() => setCancelar(false)}>Volver</Boton>
          <Boton variante="peligro" disabled={motivo.trim().length < 5} cargando={cancelarM.isPending} onClick={() => cancelarM.mutate()}>Confirmar</Boton></div>
      </Modal>
    </div>
  );
}
