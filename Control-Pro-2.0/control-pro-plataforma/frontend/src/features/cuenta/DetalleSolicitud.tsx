/**
 * Detalle de una solicitud de sucursal con trazabilidad completa. Cada proceso conserva su propio estado:
 * revisión, surtido, envío (por paquete), recepción en sucursal, entrega individual y conformidad.
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronRight, ClipboardCheck, FileSignature, Package, PenLine, Send, ShieldAlert, Star, Truck } from 'lucide-react';
import { post } from '../../api/cliente';
import type { EntregaIndividual, Incidencia, Paquete, Pedido } from '../../api/tipos';
import { Aviso, Boton, Campo, Entrada, ErrorCaja, Estado, Firma, Modal, Selector, Tarjeta, Texto, useAviso } from '../../components/ui';
import { Aparecer, Etapa, LineaProceso, Palomita } from '../../components/movimiento';
import ComprobanteEntrega from './ComprobanteEntrega';
import { cls, etiqueta, fechaHora, PROBLEMAS_CONFORMIDAD, PROBLEMAS_RECEPCION, tipoIncidencia, TIPOS_INCIDENCIA } from '../../lib/formato';

const LOGISTICA = ['confirmado', 'en_preparacion', 'parcialmente_enviado', 'enviado', 'parcialmente_entregado', 'entregado', 'cerrado'];
const nivel = (estado: string) => LOGISTICA.indexOf(estado);

function etapasSolicitud(p: Pedido): Etapa[] {
  const n = nivel(p.estado);
  const paquetes = p.paquetes.length;
  const enRuta = p.paquetes.filter((x) => ['despachado', 'en_transito', 'entregado'].includes(x.estado)).length;
  const llegados = p.paquetes.filter((x) => x.estado === 'entregado').length;
  const recibidos = p.paquetes.filter((x) => x.recepcion).length;
  const entregas = p.entregas_individuales || [];
  const entregadas = entregas.filter((e) => e.estado !== 'pendiente').length;
  const conformes = entregas.filter((e) => e.conformidad_en).length;
  const rechazada = ['rechazado', 'cancelado'].includes(p.estado);
  return [
    { clave: 'sol', titulo: 'Solicitud', detalle: p.estado === 'borrador' ? 'Borrador' : 'Enviada', estado: p.estado === 'borrador' ? 'actual' : 'hecha' },
    { clave: 'rev', titulo: 'Revisión', detalle: rechazada ? etiqueta(p.estado) : p.estado === 'devuelto' ? 'Requiere corrección' : n >= 0 ? 'Aprobada' : p.estado === 'en_revision' ? 'En revisión' : '',
      estado: rechazada || p.estado === 'devuelto' ? 'alerta' : n >= 0 ? 'hecha' : p.estado === 'en_revision' ? 'actual' : 'pendiente' },
    { clave: 'sur', titulo: 'Surtido', detalle: n === 0 ? 'Pendiente de surtir' : n === 1 ? 'En preparación' : n > 1 ? 'Preparado' : '',
      estado: n > 1 ? 'hecha' : n >= 0 ? 'actual' : 'pendiente' },
    { clave: 'env', titulo: 'Envío', detalle: paquetes ? `${enRuta} de ${paquetes} paquete(s)` : '', estado: paquetes && enRuta === paquetes ? 'hecha' : enRuta ? 'actual' : 'pendiente' },
    { clave: 'rec', titulo: 'Recepción', detalle: llegados ? `${recibidos} de ${paquetes} recibido(s)` : '', estado: paquetes && recibidos === paquetes ? 'hecha' : llegados ? 'actual' : 'pendiente' },
    { clave: 'ent', titulo: 'Entrega', detalle: entregas.length ? `${entregadas} de ${entregas.length}` : '', estado: entregas.length && entregadas === entregas.length ? 'hecha' : entregadas || recibidos ? 'actual' : 'pendiente' },
    { clave: 'con', titulo: 'Conformidad', detalle: entregadas ? `${conformes} de ${entregadas}` : '', estado: entregadas && conformes === entregas.length ? 'hecha' : conformes ? 'actual' : 'pendiente' },
  ];
}

function etapasPaquete(pq: Paquete): Etapa[] {
  const orden = ['preparado', 'despachado', 'en_transito', 'entregado'];
  const i = pq.estado === 'incidencia' ? 2 : orden.indexOf(pq.estado);
  const paso = (k: number, clave: string, titulo: string): Etapa => ({ clave, titulo, estado: i > k ? 'hecha' : i === k ? (pq.estado === 'incidencia' ? 'alerta' : 'actual') : 'pendiente' });
  return [paso(0, 'pre', 'Preparado'), paso(1, 'env', 'Enviado'), paso(2, 'tra', 'En tránsito'),
    { clave: 'lle', titulo: 'Entregado', estado: pq.estado === 'entregado' ? (pq.recepcion ? 'hecha' : 'actual') : 'pendiente' },
    { clave: 'rec', titulo: 'Recibido en sucursal', estado: pq.recepcion ? (pq.recepcion.estado === 'parcial' ? 'alerta' : 'hecha') : 'pendiente' }];
}

// ---------------------------------------------------------------- recepción del paquete

function RecepcionPaquete({ pq, p, onCerrar }: { pq: Paquete; p: Pedido; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const filas = pq.contenido;
  const [recibida, setRecibida] = useState<Record<number, number>>(Object.fromEntries(filas.map((c) => [c.pedido_detalle_id, c.cantidad])));
  const [problema, setProblema] = useState<Record<number, string>>({});
  const [nota, setNota] = useState<Record<number, string>>({});
  const [obs, setObs] = useState('');
  const m = useMutation({
    mutationFn: () => post(`/cuenta/paquetes/${pq.id}/recepcion`, {
      completa: true, diferencias: obs || null,
      partidas: filas.map((c) => ({ pedido_detalle_id: c.pedido_detalle_id, recibida: recibida[c.pedido_detalle_id], problema: problema[c.pedido_detalle_id] || null, nota: nota[c.pedido_detalle_id] || null })),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pedido', String(p.id)] }); qc.invalidateQueries({ queryKey: ['resumen-sucursal'] }); avisar(`Recepción del paquete ${pq.folio} registrada.`); onCerrar(); },
  });
  const conDiferencias = filas.some((c) => recibida[c.pedido_detalle_id] < c.cantidad || problema[c.pedido_detalle_id]);
  return (
    <div className="space-y-4">
      <Aviso>Registra lo que llegó físicamente en el paquete. Recibir el paquete <b>no</b> equivale a entregar los artículos a cada empleado.</Aviso>
      <ul className="space-y-2">
        {filas.map((c) => (
          <li key={c.pedido_detalle_id} className={cls('rounded-xl p-3 ring-1 text-sm', recibida[c.pedido_detalle_id] < c.cantidad || problema[c.pedido_detalle_id] ? 'bg-amber-50/60 ring-amber-200' : 'ring-arena-200')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span><b>{c.nombre}</b> · {c.talla}<span className="block text-xs text-tinta-400">{c.empleado || 'Sin empleado'}</span></span>
              <label className="flex items-center gap-2 text-xs">Recibidas
                <Selector className="w-20" value={recibida[c.pedido_detalle_id]} onChange={(e) => setRecibida({ ...recibida, [c.pedido_detalle_id]: Number(e.target.value) })}>
                  {Array.from({ length: c.cantidad + 1 }, (_, i) => <option key={i} value={i}>{i}</option>)}</Selector> de {c.cantidad}</label>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-[180px_1fr]">
              <Selector value={problema[c.pedido_detalle_id] || ''} onChange={(e) => setProblema({ ...problema, [c.pedido_detalle_id]: e.target.value })} aria-label={`Problema con ${c.nombre}`}>
                <option value="">{recibida[c.pedido_detalle_id] < c.cantidad ? 'Faltante' : 'Sin problema'}</option>
                {Object.entries(PROBLEMAS_RECEPCION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Selector>
              {(recibida[c.pedido_detalle_id] < c.cantidad || problema[c.pedido_detalle_id]) && <Entrada placeholder="Nota (opcional)" value={nota[c.pedido_detalle_id] || ''} onChange={(e) => setNota({ ...nota, [c.pedido_detalle_id]: e.target.value })} />}
            </div>
          </li>
        ))}
      </ul>
      <Campo etiqueta="Observaciones generales (opcional)"><Texto value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
      {conDiferencias && <Aviso tipo="alerta">Se registrará como recepción parcial y se abrirá una incidencia para darle seguimiento.</Aviso>}
      <ErrorCaja error={m.error} />
      <div className="flex justify-end gap-2"><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton cargando={m.isPending} onClick={() => m.mutate()}>Confirmar recepción</Boton></div>
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
      <div><p className="mb-1 text-sm font-semibold">Firma de {e.empleado.nombre}</p><Firma onCambio={setFirma} /></div>
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
  const empleados = [...new Map(p.detalles.filter((d) => d.empleado).map((d) => [d.empleado!.id, d.empleado!])).values()];
  const m = useMutation({
    mutationFn: () => post(`/cuenta/pedidos/${p.id}/incidencias`, { tipo, descripcion: desc, prioridad: 'media',
      empleado_id: empleado || null, pedido_detalle_id: articulo || null, paquete_id: paquete || null }),
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
      <ErrorCaja error={m.error} />
      <div className="flex justify-end gap-2"><Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton><Boton cargando={m.isPending} disabled={desc.trim().length < 10} onClick={() => m.mutate()}>Registrar incidencia</Boton></div>
    </div>
  );
}

export function HistorialIncidencia({ i }: { i: Incidencia }) {
  return (
    <ol className="relative mt-2 space-y-2 border-l-2 border-arena-200 pl-4">
      {i.seguimiento.map((s, k) => (
        <Aparecer como="li" orden={k} key={k} className="relative text-xs">
          <span className={cls('absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-white', s.nuevo === 'resuelta' || s.nuevo === 'cerrada' ? 'bg-emerald-500' : 'bg-amber-400')} />
          <p><b>{s.anterior && s.anterior !== s.nuevo ? `${etiqueta(s.anterior)} → ${etiqueta(s.nuevo)}` : etiqueta(s.nuevo)}</b> · {fechaHora(s.fecha)} · {s.actor}</p>
          {s.comentario && <p className="text-tinta-500">{s.comentario}</p>}
          {s.responsable && <p className="text-tinta-400">Responsable: {s.responsable}</p>}
        </Aparecer>
      ))}
    </ol>
  );
}

function TarjetaIncidencia({ i }: { i: Incidencia }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <div className={cls('rounded-xl p-3 text-sm ring-1', i.estado === 'abierta' ? 'animate-sacudir ring-coral-200' : 'ring-arena-200')}>
      <button type="button" onClick={() => setAbierta(!abierta)} className="flex w-full items-start justify-between gap-2 text-left">
        <span><b>{i.folio}</b> · {tipoIncidencia(i.tipo)}
          {(i.empleado || i.articulo) && <span className="block text-xs text-tinta-500">{[i.empleado?.nombre, i.articulo && `${i.articulo.nombre} (${i.articulo.talla})`].filter(Boolean).join(' · ')}</span>}</span>
        <span className="flex items-center gap-2"><Estado valor={i.estado} />{abierta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
      </button>
      <p className="mt-1 text-xs text-tinta-600">{i.descripcion}</p>
      {abierta && <HistorialIncidencia i={i} />}
    </div>
  );
}

// ---------------------------------------------------------------- vista principal

export default function DetalleSolicitud({ p }: { p: Pedido }) {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const avisar = useAviso();
  const [recibir, setRecibir] = useState<Paquete | null>(null);
  const [entrega, setEntrega] = useState<EntregaIndividual | null>(null);
  const [conformidad, setConformidad] = useState<EntregaIndividual | null>(null);
  const [comprobante, setComprobante] = useState<number | null>(null);
  const [incidencia, setIncidencia] = useState(false);
  const [cancelar, setCancelar] = useState(false);
  const [motivo, setMotivo] = useState('');
  const refrescar = () => { qc.invalidateQueries({ queryKey: ['pedido', String(p.id)] }); qc.invalidateQueries({ queryKey: ['resumen-sucursal'] }); qc.invalidateQueries({ queryKey: ['mis-borradores'] }); };
  const enviar = useMutation({ mutationFn: () => post(`/cuenta/pedidos-corporativos/${p.id}/enviar`), onSuccess: () => { refrescar(); avisar(`Solicitud ${p.folio} enviada a revisión.`); } });
  const cancelarM = useMutation({ mutationFn: () => post(`/cuenta/pedidos/${p.id}/cancelar`, { motivo }), onSuccess: () => { refrescar(); setCancelar(false); avisar(p.estado === 'borrador' ? 'Borrador descartado.' : 'Solicitud cancelada.'); } });

  const entregas = p.entregas_individuales || [];
  const empleados = [...new Map(p.detalles.filter((d) => d.empleado).map((d) => [d.empleado!.id, d.empleado!])).values()];
  const cancelable = p.estado === 'borrador';  // una solicitud enviada solo la cancela el distribuidor
  const cambiosDistribuidor = p.historial.filter((h) => h.motivo?.startsWith('Modificada por el distribuidor'));
  const observacion = p.aprobaciones?.filter((a) => a.decision !== 'aprobado').slice(-1)[0];

  return (
    <div className="space-y-5">
      {params.get('nuevo') && p.estado !== 'borrador' && (
        <Aparecer>
          <div className="flex items-center gap-4 rounded-2xl bg-menta-500 p-5 text-white">
            <Palomita className="h-12 w-12 shrink-0 text-white" />
            <div><p className="font-display text-lg font-bold">Solicitud {p.folio} enviada</p>
              <p className="text-sm text-menta-50">Quedó en revisión: aún no está aprobada ni surtida. Te avisaremos cuando el distribuidor la revise.</p></div>
          </div>
        </Aparecer>
      )}

      <Tarjeta titulo={<span className="flex flex-wrap items-center gap-2">Solicitud {p.folio} <Estado valor={p.estado} /></span>}
        sub={`${fechaHora(p.creado)} · ${empleados.length} empleado(s) · ${p.articulos} artículo(s)`}
        accion={<div className="flex flex-wrap gap-2">
          {p.estado === 'borrador' && <>
            <Link to={`/cuenta/solicitudes/${p.id}/editar`} className="inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-semibold ring-1 ring-tinta-200"><PenLine className="h-3.5 w-3.5" />Editar</Link>
            <Boton tam="sm" icono={<Send className="h-3.5 w-3.5" />} cargando={enviar.isPending} disabled={!p.detalles.length} onClick={() => enviar.mutate()}>Enviar a revisión</Boton></>}
          {p.estado === 'devuelto' && <Link to={`/cuenta/solicitudes/${p.id}/editar`} className="inline-flex h-8 items-center rounded-lg bg-tinta-900 px-3 text-xs font-semibold text-white">Corregir y reenviar</Link>}
          {p.estado !== 'borrador' && <Boton tam="sm" variante="secundario" icono={<ShieldAlert className="h-3.5 w-3.5" />} onClick={() => setIncidencia(true)}>Reportar incidencia</Boton>}
          {cancelable && <Boton tam="sm" variante="fantasma" onClick={() => setCancelar(true)}>{p.estado === 'borrador' ? 'Descartar' : 'Cancelar'}</Boton>}
        </div>}>
        <ErrorCaja error={enviar.error} />
        {observacion && <div className="mb-4"><Aviso tipo="alerta">{etiqueta(observacion.decision)} por el distribuidor: {observacion.motivo}</Aviso></div>}
        {cambiosDistribuidor.map((h, i) => (
          <Aparecer key={i} orden={i}><div className="mb-3"><Aviso tipo="alerta"><b>Cambio del distribuidor</b> · {fechaHora(h.fecha)} · {h.actor}<br />{h.motivo!.replace('Modificada por el distribuidor: ', '')}</Aviso></div></Aparecer>
        ))}
        {!['borrador', 'cancelado'].includes(p.estado) && <div className="overflow-x-auto pb-1"><div className="min-w-[560px]"><LineaProceso etapas={etapasSolicitud(p)} /></div></div>}
        {p.notas && <p className="mt-4 rounded-lg bg-tinta-50 p-3 text-xs"><b>Notas:</b> {p.notas}</p>}
      </Tarjeta>

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
                          <Boton tam="sm" variante="secundario" icono={<FileSignature className="h-3.5 w-3.5" />} onClick={() => setComprobante(e.id)}>Ver firma</Boton>
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

      {p.paquetes.length > 0 && (
        <Tarjeta titulo="Paquetes" sub="Cada paquete tiene su propia guía y su propio estado">
          <div className="space-y-4">
            {p.paquetes.map((pq, i) => (
              <Aparecer key={pq.id} orden={i}>
                <div className="rounded-xl p-4 ring-1 ring-arena-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 font-semibold"><Package className="h-4 w-4 text-menta-600" />{pq.folio}<span className="text-xs font-normal text-tinta-400">desde {pq.sucursal} · {fechaHora(pq.creado)}</span></p>
                    {pq.estado === 'entregado' && !pq.recepcion && <Boton tam="sm" icono={<ClipboardCheck className="h-3.5 w-3.5" />} onClick={() => setRecibir(pq)}>Registrar recepción</Boton>}
                  </div>
                  <div className="mt-4 overflow-x-auto pb-1"><div className="min-w-[420px]"><LineaProceso compacta etapas={etapasPaquete(pq)} /></div></div>
                  {pq.envio && (
                    <div className="mt-3 rounded-lg bg-arena-50 p-3 text-xs">
                      <p className="flex flex-wrap items-center gap-2 font-semibold"><Truck className="h-3.5 w-3.5" />{pq.envio.paqueteria} · Guía {pq.envio.guia}
                        <span className={cls('rounded-full px-2 py-0.5 text-[10px] font-bold', pq.envio.rastreo_externo ? 'bg-emerald-100 text-emerald-800' : 'bg-tinta-100 text-tinta-600')}>
                          {pq.envio.rastreo_externo ? 'Rastreo de la paquetería' : 'Guía registrada manualmente'}</span></p>
                      <ul className="mt-2 space-y-1">{pq.envio.eventos.map((ev, k) => <li key={k}>{fechaHora(ev.fecha)} · <b>{etiqueta(ev.estado)}</b> — {ev.descripcion}</li>)}</ul>
                    </div>
                  )}
                  <p className="mt-3 text-xs text-tinta-500">{pq.contenido.map((c) => `${c.cantidad}× ${c.nombre} (${c.talla})${c.empleado ? ` → ${c.empleado}` : ''}`).join(' · ')}</p>
                  {pq.recepcion && (
                    <div className={cls('mt-3 rounded-lg p-3 text-xs', pq.recepcion.estado === 'parcial' ? 'bg-amber-50 text-amber-900' : 'bg-menta-50 text-menta-800')}>
                      <p className="font-semibold">Recepción {etiqueta(pq.recepcion.estado).toLowerCase()} · {fechaHora(pq.recepcion.fecha)}</p>
                      {pq.recepcion.detalles.filter((x) => x.problema).map((x) => {
                        const c = pq.contenido.find((y) => y.pedido_detalle_id === x.pedido_detalle_id);
                        return <p key={x.pedido_detalle_id}><AlertTriangle className="mr-1 inline h-3 w-3" />{c?.nombre}: {PROBLEMAS_RECEPCION[x.problema!]} · recibidas {x.recibida} de {x.esperada}{x.nota ? ` — ${x.nota}` : ''}</p>;
                      })}
                      {pq.recepcion.diferencias && !pq.recepcion.detalles.length && <p>{pq.recepcion.diferencias}</p>}
                    </div>
                  )}
                </div>
              </Aparecer>
            ))}
          </div>
        </Tarjeta>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Tarjeta titulo="Incidencias" sub="Cada actualización queda en su historial">
          {!p.incidencias?.length ? <p className="text-sm text-tinta-400">Sin incidencias registradas.</p> : (
            <div className="space-y-2">{p.incidencias.map((i) => <TarjetaIncidencia key={i.id} i={i} />)}</div>
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
