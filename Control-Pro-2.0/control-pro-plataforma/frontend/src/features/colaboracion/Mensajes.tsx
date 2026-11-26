/**
 * Mensajes entre el aprobador corporativo y las sucursales o la distribuidora. La misma pantalla sirve a los tres lados:
 * cada uno solo ve sus conversaciones (el backend lo filtra). Se actualiza sola cada pocos segundos y ofrece, además,
 * un botón de WhatsApp (enlace wa.me) cuando hay número de contacto.
 */
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Building2, ChevronDown, Clock3, MessageCircle, MessagesSquare, Mic, Plus, Reply, Search, Send, Truck, X } from 'lucide-react';
import { BarraGrabacion, DocumentoEnBurbuja, duracionTexto, FotoEnBurbuja, MenuAdjuntar, NotaDeVoz, prepararFoto, puedeGrabar, SelectorEmoji, subirAdjuntoChat,
  useGrabadora, useUrlMedio, VisorFoto, VistaPreviaAdjunto, type Adjunto } from './PiezasChat';
import { get, post } from '../../api/cliente';
import type { Conversacion, MensajeChat, Pagina } from '../../api/tipos';
import type { CuentaSucursal } from '../admin/SucursalesCliente';
import { useAuth } from '../../app/auth';
import { enlaceWhatsApp, esAprobador, useBasePanel } from '../../app/panel';
import { Boton, Cargando, Entrada, ErrorCaja, Modal, Tarjeta, Vacio } from '../../components/ui';
import { cls } from '../../lib/formato';

/** Prefijo de la API según quién conversa: la sucursal usa /cuenta y el personal (aprobador o distribuidora) /admin. */
let ultimoApiChat: '/cuenta' | '/admin' | null = null;
export function useApiChat() {
  const { tipo } = useAuth();
  // Mientras la sesión se renueva el tipo puede faltar un instante: se conserva el último para no "recargar" el chat.
  if (tipo) ultimoApiChat = tipo === 'cliente' ? '/cuenta' : '/admin';
  return ultimoApiChat ?? (tipo === 'cliente' ? '/cuenta' : '/admin');
}

/** Total de mensajes sin leer (para el menú). */
export function useMensajesNoLeidos(activo = true) {
  const api = useApiChat();
  return useQuery({ queryKey: ['chat-no-leidos', api], queryFn: () => get<{ no_leidos: number }>(`${api}/conversaciones/no-leidos`),
    refetchInterval: 30_000, enabled: activo });
}

export function BotonWhatsApp({ numero, texto, className }: { numero: string | null | undefined; texto: string; className?: string }) {
  const url = enlaceWhatsApp(numero, texto);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className={cls('inline-flex min-h-10 items-center gap-2 rounded-full bg-[#25D366] px-4 text-sm font-bold text-[#073b1d] transition hover:brightness-95', className)}>
      <MessageCircle className="h-4 w-4" aria-hidden />WhatsApp
    </a>
  );
}

// ---------------------------------------------------------------- hilo de conversación (estilo mensajería)

type Hilo_ = { conversacion: Conversacion; items: MensajeChat[] };
type Cita = NonNullable<MensajeChat['responde_a']>;
type Pendiente = {
  tmp: number; texto: string; creado: string; error?: boolean; responde_a?: Cita | null;
  adjunto?: { archivo: File; local: string; tipo: Adjunto['tipo']; nombre?: string; duracion?: number; subida?: string };
};

/** Palomitas de un mensaje propio: reloj (enviando), una (enviado), dos grises (entregado), dos azules (leído). */
export function Palomitas({ estado, className }: { estado?: MensajeChat['estado'] | 'pendiente' | 'error'; className?: string }) {
  if (!estado) return null;
  if (estado === 'pendiente') return <Clock3 className={cls('h-3.5 w-3.5 opacity-70', className)} aria-label="Enviando" />;
  if (estado === 'error') return <AlertCircle className={cls('h-3.5 w-3.5 text-coral-600', className)} aria-label="No se envió" />;
  const doble = estado !== 'enviado';
  return (
    <svg viewBox="0 0 18 12" className={cls('h-3 w-[18px] shrink-0', estado === 'leido' ? 'palomita-leida' : 'opacity-60', className)} fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" role="img"
      aria-label={estado === 'leido' ? 'Leído' : estado === 'entregado' ? 'Entregado' : 'Enviado'}>
      {doble ? <><path d="M1.2 6.6 4.3 9.7 10.6 2.3" /><path d="M7.3 9.2l.6.6 6.3-7.5" /></> : <path d="M3.2 6.6l3.1 3.1 6.3-7.4" />}
    </svg>
  );
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
function diaLegible(iso: string) {
  const d = new Date(iso), hoy = new Date();
  const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return 'Hoy';
  if (d.toDateString() === ayer.toDateString()) return 'Ayer';
  const misma = d.getFullYear() === hoy.getFullYear();
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', ...(misma ? {} : { year: 'numeric' }) });
}
/** Hora corta para la lista: hoy la hora, ayer "Ayer", esta semana el día y antes la fecha. */
export function cuandoCorto(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso), dias = (Date.now() - d.getTime()) / 86_400_000;
  if (d.toDateString() === new Date().toDateString()) return hora(iso);
  if (dias < 2 && new Date(Date.now() - 86_400_000).toDateString() === d.toDateString()) return 'Ayer';
  if (dias < 7) return d.toLocaleDateString('es-MX', { weekday: 'short' });
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
const COLORES_AUTOR = 6;
const colorAutor = (id = '') => [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORES_AUTOR;

/** Texto con enlaces clicables (sin interpretar HTML). */
function ConEnlaces({ texto }: { texto: string }) {
  const partes = texto.split(/(https?:\/\/[^\s]+)/g);
  return <>{partes.map((p, i) => (/^https?:\/\//.test(p)
    ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="break-all font-medium underline decoration-1 underline-offset-2">{p}</a> : p))}</>;
}

/** Mensaje citado (arriba de la burbuja o sobre la caja de texto al responder). */
function CitaMensaje({ cita, onClick, onQuitar, enCaja }: { cita: Cita; onClick?: () => void; onQuitar?: () => void; enCaja?: boolean }) {
  const { src } = useUrlMedio(cita.adjunto_url ?? null);
  const autor = cita.propio ? 'Tú' : cita.autor;
  return (
    <div className={cls('flex items-stretch overflow-hidden rounded-lg', enCaja ? 'bg-tinta-50' : 'cita-burbuja mb-1 -mx-1')}>
      <button type="button" onClick={onClick} disabled={!onClick} className="flex min-w-0 flex-1 items-stretch text-left">
        <span className={cls('w-1 shrink-0', cita.propio ? 'bg-menta-500' : 'bg-[#53bdeb]')} aria-hidden />
        <span className="min-w-0 flex-1 px-2.5 py-1.5">
          <span className={cls('block truncate text-[12.5px] font-bold', cita.propio ? 'text-menta-700' : 'text-[#1f7aa8]')}>{enCaja ? `Respondiendo a ${autor}` : autor}</span>
          <span className="line-clamp-2 text-[12.5px] opacity-80">{cita.texto}</span>
        </span>
        {src && <img src={src} alt="" className="h-12 w-12 shrink-0 object-cover" />}
      </button>
      {onQuitar && <button type="button" onClick={onQuitar} className="grid w-10 shrink-0 place-items-center text-tinta-500 hover:bg-tinta-100" aria-label="Cancelar respuesta"><X className="h-4 w-4" /></button>}
    </div>
  );
}

type DatosBurbuja = {
  id?: number; texto: string; creado: string; propio: boolean; autor?: string; rol?: string; autor_id?: string;
  estado?: MensajeChat['estado'] | 'pendiente' | 'error'; leido_en?: string | null; entregado_en?: string | null;
  adjunto?: Adjunto | null; responde_a?: Cita | null;
};

function Burbuja({ m, primera, ultima, domId, onReintentar, onResponder, onIrA, onVerFoto }: {
  m: DatosBurbuja; primera: boolean; ultima: boolean; domId?: string;
  onReintentar?: () => void; onResponder?: () => void; onIrA?: (id: number) => void; onVerFoto?: (url: string) => void;
}) {
  const [dx, setDx] = useState(0);
  const toque = useRef<{ x: number; y: number } | null>(null);
  const info = m.propio && m.estado ? [m.entregado_en && `Entregado ${diaLegible(m.entregado_en).toLowerCase()} ${hora(m.entregado_en)}`,
    m.leido_en && `Leído ${diaLegible(m.leido_en).toLowerCase()} ${hora(m.leido_en)}`].filter(Boolean).join(' · ') : '';
  const soloMedio = !m.texto && m.adjunto?.tipo === 'imagen';
  // Deslizar a la derecha (en pantallas táctiles) para responder, como en WhatsApp
  const tactil = onResponder ? {
    onPointerDown: (e: React.PointerEvent) => { if (e.pointerType === 'touch') toque.current = { x: e.clientX, y: e.clientY }; },
    onPointerMove: (e: React.PointerEvent) => {
      const t = toque.current; if (!t) return;
      const ddx = e.clientX - t.x, ddy = e.clientY - t.y;
      if (dx === 0 && Math.abs(ddy) > Math.abs(ddx)) { toque.current = null; return; }
      setDx(Math.max(0, Math.min(84, ddx)));
    },
    onPointerUp: () => { if (dx > 56) { navigator.vibrate?.(12); onResponder(); } setDx(0); toque.current = null; },
    onPointerCancel: () => { setDx(0); toque.current = null; },
  } : {};
  return (
    <div id={domId} className={cls('group relative flex items-center gap-1.5', m.propio ? 'justify-end' : 'justify-start', primera ? 'mt-2.5' : 'mt-0.5')} style={{ touchAction: 'pan-y' }} {...tactil}>
      {onResponder && dx > 0 && <span className="absolute left-0 grid h-8 w-8 place-items-center rounded-full bg-black/10" style={{ opacity: Math.min(1, dx / 56) }} aria-hidden><Reply className="h-4 w-4" /></span>}
      {m.propio && onResponder && <BotonResponder onClick={onResponder} />}
      <div className={cls('burbuja relative max-w-[min(82%,560px)] px-2.5 pb-1.5 pt-1.5 text-[14.5px] leading-[1.35] shadow-[0_1px_.5px_rgba(11,20,26,.13)]',
        m.propio ? 'burbuja-propia' : 'burbuja-otra', primera && (m.propio ? 'con-cola-propia' : 'con-cola-otra'),
        'rounded-[10px]', primera && (m.propio ? 'rounded-tr-none' : 'rounded-tl-none'))}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? 'none' : 'transform .2s ease-out' }}
        title={info || new Date(m.creado).toLocaleString('es-MX')}>
        {!m.propio && primera && m.autor && (
          <p className={cls('mb-0.5 truncate text-[12.5px] font-bold', `autor-${colorAutor(m.autor_id)}`)}>{m.autor}<span className="ml-1.5 font-medium opacity-70">· {m.rol}</span></p>
        )}
        {m.responde_a && <CitaMensaje cita={m.responde_a} onClick={onIrA ? () => onIrA(m.responde_a!.id) : undefined} />}
        {m.adjunto?.tipo === 'imagen' && <FotoEnBurbuja url={m.adjunto.url} onAbrir={() => onVerFoto?.(m.adjunto!.url)} />}
        {m.adjunto?.tipo === 'audio' && <NotaDeVoz url={m.adjunto.url} duracion={m.adjunto.duracion} propio={m.propio} />}
        {m.adjunto?.tipo === 'archivo' && <DocumentoEnBurbuja url={m.adjunto.url} nombre={m.adjunto.nombre} />}
        {m.texto && <span className="whitespace-pre-wrap break-words"><ConEnlaces texto={m.texto} /></span>}
        {/* Espacio reservado para que la hora y las palomitas no tapen el final del texto */}
        {m.adjunto?.tipo !== 'audio' && !soloMedio && <span className={cls('inline-block', m.propio ? 'w-[74px]' : 'w-[52px]')} aria-hidden />}
        {soloMedio && <span className="block h-3" aria-hidden />}
        <span className="absolute bottom-1 right-2 flex items-center gap-1 text-[11px] leading-none opacity-75">
          {hora(m.creado)}{m.propio && <Palomitas estado={m.estado} />}
        </span>
        {m.estado === 'error' && onReintentar && (
          <button type="button" onClick={onReintentar} className="mt-1 block text-[12px] font-bold text-coral-600 hover:underline">No se envió · Reintentar</button>
        )}
      </div>
      {!m.propio && onResponder && <BotonResponder onClick={onResponder} />}
      {ultima && <span className="sr-only">{m.propio ? `Tu mensaje, ${m.estado === 'leido' ? 'leído' : m.estado === 'entregado' ? 'entregado' : 'enviado'}` : `Mensaje de ${m.autor}`}</span>}
    </div>
  );
}

function BotonResponder({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Responder a este mensaje" title="Responder"
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/80 text-tinta-500 opacity-0 shadow-sm ring-1 ring-tinta-100 transition hover:text-menta-700 focus:opacity-100 group-hover:opacity-100 max-md:hidden [@media(hover:none)]:hidden">
      <Reply className="h-4 w-4" /></button>
  );
}

/** Hilo de una conversación: mensajes, notas de voz, fotos, respuestas, "escribiendo…" y caja para escribir. */
export function Hilo({ conversacionId, alto = 'alto-chat' }: { conversacionId: number; alto?: string }) {
  const api = useApiChat();
  const qc = useQueryClient();
  const clave = ['chat-mensajes', api, conversacionId];
  const [texto, setTexto] = useState('');
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [nuevos, setNuevos] = useState(0);
  const [respondiendo, setRespondiendo] = useState<Cita | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [verFoto, setVerFoto] = useState<string | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLTextAreaElement>(null);
  const pegado = useRef(true);
  const ultimoAviso = useRef(0);
  const q = useQuery({ queryKey: clave, queryFn: () => get<Hilo_>(`${api}/conversaciones/${conversacionId}/mensajes`), refetchInterval: 4_000 });
  const items = q.data?.items ?? [];
  const c = q.data?.conversacion;
  const ultimoId = items[items.length - 1]?.id;
  const domId = (id: number) => `msg-${conversacionId}-${id}`;

  const alFondo = (suave = true) => { const el = caja.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: suave ? 'smooth' : 'auto' }); setNuevos(0); };
  const visto = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (ultimoId === undefined) return;
    const primera = visto.current === undefined;
    const llegaron = primera ? 0 : items.filter((m) => m.id > (visto.current ?? 0) && !m.propio).length;
    visto.current = ultimoId;
    if (primera || pegado.current || items[items.length - 1]?.propio) requestAnimationFrame(() => alFondo(!primera));
    else if (llegaron) setNuevos((n) => n + llegaron);
    qc.invalidateQueries({ queryKey: ['chat-no-leidos'] });
    qc.invalidateQueries({ queryKey: ['chat-conversaciones'] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultimoId]);
  useEffect(() => { if (pendientes.length) requestAnimationFrame(() => alFondo()); }, [pendientes.length]);

  const enviar = useMutation({
    mutationFn: async (p: Pendiente) => {
      let adjunto: Adjunto | undefined;
      if (p.adjunto) {
        const url = p.adjunto.subida ?? await subirAdjuntoChat(p.adjunto.archivo);
        p.adjunto.subida = url; // al reintentar no se vuelve a subir
        adjunto = { url, tipo: p.adjunto.tipo, nombre: p.adjunto.nombre ?? null, duracion: p.adjunto.duracion ?? null };
      }
      return post<MensajeChat>(`${api}/conversaciones/${conversacionId}/mensajes`, { texto: p.texto, adjunto: adjunto ?? null, responde_a: p.responde_a?.id ?? null });
    },
    onSuccess: (m, p) => {
      setPendientes((l) => l.filter((x) => x.tmp !== p.tmp));
      qc.setQueryData<Hilo_>(clave, (d) => (d ? { ...d, items: [...d.items.filter((x) => x.id !== m.id), m] } : d));
    },
    onError: (_e, p) => setPendientes((l) => l.map((x) => (x.tmp === p.tmp ? { ...x, error: true } : x))),
  });
  // Los envíos salen uno tras otro, en el orden en que se hicieron (una nota de voz que tarda en subir no se adelanta).
  const cola = useRef<Promise<unknown>>(Promise.resolve());
  const despachar = (p: Pendiente) => { cola.current = cola.current.then(() => enviar.mutateAsync(p).catch(() => undefined)); };
  const encolar = (p: Omit<Pendiente, 'tmp' | 'creado'>) => {
    const nuevo: Pendiente = { ...p, tmp: Date.now() + Math.random(), creado: new Date().toISOString(), responde_a: respondiendo };
    setPendientes((l) => [...l, nuevo]);
    setRespondiendo(null);
    pegado.current = true;
    despachar(nuevo);
  };
  const mandar = (e?: FormEvent) => {
    e?.preventDefault();
    const t = texto.trim();
    if (!t) return;
    setTexto('');
    encolar({ texto: t });
    entrada.current?.focus();
  };
  const reintentar = (p: Pendiente) => { setPendientes((l) => l.map((x) => (x.tmp === p.tmp ? { ...x, error: false } : x))); despachar(p); };
  const grabadora = useGrabadora((f, duracion) => encolar({ texto: '', adjunto: { archivo: f, local: URL.createObjectURL(f), tipo: 'audio', duracion } }));
  const enviarArchivo = async (pie: string) => {
    if (!archivo) return;
    const f = archivo.type.startsWith('image/') ? await prepararFoto(archivo) : archivo;
    const tipo: Adjunto['tipo'] = f.type.startsWith('image/') ? 'imagen' : 'archivo';
    setArchivo(null);
    encolar({ texto: pie, adjunto: { archivo: f, local: URL.createObjectURL(f), tipo, nombre: tipo === 'archivo' ? f.name : undefined } });
  };
  const tecla = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); mandar(); } };
  const alEscribir = (v: string) => {
    setTexto(v);
    if (v.trim() && Date.now() - ultimoAviso.current > 3000) {
      ultimoAviso.current = Date.now();
      post(`${api}/conversaciones/${conversacionId}/escribiendo`).catch(() => undefined);
    }
  };
  const insertarEmoji = (emoji: string) => {
    const el = entrada.current;
    const ini = el?.selectionStart ?? texto.length, fin = el?.selectionEnd ?? texto.length;
    const nuevo = texto.slice(0, ini) + emoji + texto.slice(fin);
    setTexto(nuevo);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(ini + emoji.length, ini + emoji.length); });
  };
  const responder = (m: MensajeChat) => {
    setRespondiendo({ id: m.id, propio: m.propio, autor: m.autor, tipo: m.tipo ?? 'texto', adjunto_url: m.adjunto?.tipo === 'imagen' ? m.adjunto.url : null,
      texto: m.texto || (m.adjunto?.tipo === 'audio' ? `🎤 Mensaje de voz${m.adjunto.duracion ? ` (${duracionTexto(m.adjunto.duracion)})` : ''}` : m.adjunto?.tipo === 'imagen' ? '📷 Foto' : `📄 ${m.adjunto?.nombre || 'Documento'}`) });
    requestAnimationFrame(() => entrada.current?.focus());
  };
  const irA = (id: number) => {
    const el = document.getElementById(domId(id));
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('mensaje-resaltado'); void el.offsetWidth; el.classList.add('mensaje-resaltado');
  };
  useEffect(() => { const el = entrada.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 150)}px`; } }, [texto]);

  type Fila = { tipo: 'dia'; dia: string } | { tipo: 'msg'; m: MensajeChat; primera: boolean; ultima: boolean };
  const filas: Fila[] = [];
  items.forEach((m, i) => {
    const prev = items[i - 1], sig = items[i + 1];
    const dia = new Date(m.creado).toDateString();
    if (!prev || new Date(prev.creado).toDateString() !== dia) filas.push({ tipo: 'dia', dia: diaLegible(m.creado) });
    const mismo = (a?: MensajeChat, b?: MensajeChat) => !!a && !!b && a.propio === b.propio && a.autor_id === b.autor_id
      && new Date(a.creado).toDateString() === new Date(b.creado).toDateString() && Math.abs(+new Date(b.creado) - +new Date(a.creado)) < 300_000;
    filas.push({ tipo: 'msg', m, primera: !mismo(prev, m), ultima: !mismo(m, sig) });
  });
  const grabando = grabadora.estado === 'grabando';

  return (
    <div className="flex min-h-0 flex-col">
      {c && (
        <div className="mb-3 flex items-center gap-3 border-b border-tinta-100 pb-3">
          <span className={cls('grid h-11 w-11 shrink-0 place-items-center rounded-full', c.tipo === 'distribuidora' ? 'bg-[#b5d9ff] text-[#0b4f86]' : 'bg-[#6be5b8a8] text-[#00664a]')} aria-hidden>
            {c.tipo === 'distribuidora' ? <Truck className="h-5 w-5" /> : <Building2 className="h-5 w-5" />}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display font-bold leading-tight">{c.con}</p>
            {c.escribiendo
              ? <p className="text-xs font-semibold text-menta-700" aria-live="polite">escribiendo…</p>
              : <p className="truncate text-xs text-tinta-500">{c.asunto}{c.pedido && <> · <Estadito estado={c.pedido.estado} /></>}</p>}
          </div>
          <BotonWhatsApp numero={c.whatsapp} texto={c.tipo === 'distribuidora' && c.con === 'Distribuidora'
            ? `Hola, te escribe el aprobador corporativo para acordar la cotización y los precios de: ${c.asunto}.`
            : `Hola, te escribo sobre: ${c.asunto}.`} />
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <div ref={caja} onScroll={(e) => { const el = e.currentTarget; pegado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; if (pegado.current) setNuevos(0); }}
          className={cls('fondo-chat overflow-y-auto overflow-x-hidden overscroll-contain rounded-2xl px-3 py-2 sm:px-5', alto)} role="log" aria-live="polite" aria-label="Mensajes">
          {q.isLoading && !pendientes.length ? <Cargando texto="Cargando mensajes…" /> : q.error ? <ErrorCaja error={q.error} /> : !items.length && !pendientes.length ? (
            <div className="grid h-full place-items-center py-10 text-center">
              <div><span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-white/80 text-menta-700 shadow-sm"><MessagesSquare className="h-7 w-7" aria-hidden /></span>
                <p className="font-semibold">Aún no hay mensajes</p><p className="text-sm text-tinta-500">Escribe, manda una foto o una nota de voz: la verá al instante.</p></div>
            </div>
          ) : (
            <>
              {filas.map((f, i) => f.tipo === 'dia'
                ? <div key={`d${i}`} className="sticky top-1 z-[1] my-3 flex justify-center"><span className="separador-dia rounded-lg px-3 py-1 text-[12px] font-semibold capitalize shadow-sm">{f.dia}</span></div>
                : <Burbuja key={f.m.id} domId={domId(f.m.id)} m={f.m} primera={f.primera} ultima={f.ultima}
                    onResponder={() => responder(f.m)} onIrA={irA} onVerFoto={setVerFoto} />)}
              {pendientes.map((p, i) => (
                <Burbuja key={p.tmp} primera={i === 0 && items[items.length - 1]?.propio !== true} ultima onVerFoto={setVerFoto}
                  m={{ texto: p.texto, creado: p.creado, propio: true, estado: p.error ? 'error' : 'pendiente', responde_a: p.responde_a,
                    adjunto: p.adjunto ? { url: p.adjunto.local, tipo: p.adjunto.tipo, nombre: p.adjunto.nombre, duracion: p.adjunto.duracion } : null }}
                  onReintentar={() => reintentar(p)} />
              ))}
              {c?.escribiendo && (
                <div className="mt-2.5 flex justify-start" aria-label={`${c.con} está escribiendo`}>
                  <div className="burbuja-otra con-cola-otra relative flex items-center gap-1 rounded-[10px] rounded-tl-none px-3.5 py-3 shadow-sm">
                    {[0, 1, 2].map((k) => <span key={k} className="punto-escribiendo h-2 w-2 rounded-full" style={{ animationDelay: `${k * 0.18}s` }} />)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        {nuevos > 0 && (
          <button type="button" onClick={() => alFondo()} className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-menta-500 px-3.5 py-2 text-xs font-bold text-white shadow-lg animate-aparecer">
            <ChevronDown className="h-4 w-4" aria-hidden />{nuevos} {nuevos === 1 ? 'mensaje nuevo' : 'mensajes nuevos'}</button>
        )}
      </div>
      {respondiendo && <div className="mt-2 animate-aparecer"><CitaMensaje cita={respondiendo} enCaja onQuitar={() => setRespondiendo(null)} /></div>}
      <form onSubmit={mandar} className="mt-2 flex items-end gap-1 sm:gap-1.5">
        {grabando ? (
          <BarraGrabacion segundos={grabadora.segundos} niveles={grabadora.niveles} onCancelar={() => grabadora.detener(false)} onEnviar={() => grabadora.detener(true)} />
        ) : (
          <>
            <SelectorEmoji onElegir={insertarEmoji} />
            <MenuAdjuntar onArchivo={setArchivo} />
            <label className="sr-only" htmlFor={`msg-${conversacionId}`}>Escribe un mensaje</label>
            <textarea ref={entrada} id={`msg-${conversacionId}`} value={texto} onChange={(e) => alEscribir(e.target.value)} onKeyDown={tecla} rows={1} maxLength={2000}
              placeholder="Escribe un mensaje"
              className="max-h-[150px] min-h-12 min-w-0 flex-1 resize-none rounded-3xl border-0 bg-white px-4 py-3 text-[15px] leading-6 shadow-sm ring-1 ring-tinta-200 focus:ring-2 focus:ring-menta-500 sm:px-5" />
            {texto.trim() || !puedeGrabar() ? (
              <button type="submit" disabled={!texto.trim()} aria-label="Enviar mensaje"
                className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-menta-500 text-white shadow-md transition hover:bg-menta-600 enabled:active:scale-95 disabled:opacity-40">
                <Send className="h-5 w-5 translate-x-[1px]" aria-hidden /></button>
            ) : (
              <button type="button" onClick={grabadora.iniciar} aria-label="Grabar nota de voz" title="Grabar nota de voz"
                className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-menta-500 text-white shadow-md transition hover:bg-menta-600 active:scale-95">
                <Mic className="h-5 w-5" aria-hidden /></button>
            )}
          </>
        )}
      </form>
      <p className="mt-1 px-2 text-[11px] text-tinta-400">{grabando ? 'Grabando… toca enviar al terminar o el bote para descartar' : `Enter envía · Shift + Enter salta de línea${texto.length > 1800 ? ` · ${2000 - texto.length} caracteres restantes` : ''}`}</p>
      <VistaPreviaAdjunto archivo={archivo} onCancelar={() => setArchivo(null)} onEnviar={enviarArchivo} />
      <VisorFoto url={verFoto} onCerrar={() => setVerFoto(null)} />
    </div>
  );
}

function Estadito({ estado }: { estado: string }) {
  return <span className="capitalize">{estado.replace(/_/g, ' ')}</span>;
}

/**
 * Conversación de una solicitud, dentro de su detalle. `tipo` indica con quién: el aprobador puede hablar con la
 * sucursal o con la distribuidora; la sucursal y la distribuidora, solo con el aprobador.
 */
export function ChatSolicitud({ pedidoId, tipo, titulo }: { pedidoId: number; tipo: 'sucursal' | 'distribuidora'; titulo: string }) {
  const api = useApiChat();
  const [abierta, setAbierta] = useState<number | null>(null);
  const abrir = useMutation({
    mutationFn: () => post<Conversacion>(`${api}/conversaciones`, api === '/cuenta' ? { pedido_id: pedidoId } : { tipo, pedido_id: pedidoId }),
    onSuccess: (c) => setAbierta(c.id),
  });
  return (
    <Tarjeta titulo={titulo} sub="Los mensajes quedan guardados en el historial de la solicitud">
      {abierta ? <Hilo conversacionId={abierta} alto="h-72" /> : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-tinta-500">Abre la conversación para resolver dudas, negociar cambios o coordinar la entrega.</p>
          <ErrorCaja error={abrir.error} />
          <Boton variante="secundario" icono={<MessagesSquare className="h-4 w-4" />} cargando={abrir.isPending} onClick={() => abrir.mutate()}>Abrir conversación</Boton>
        </div>
      )}
    </Tarjeta>
  );
}

function NuevaConversacion({ abierto, onCerrar, onCreada }: { abierto: boolean; onCerrar: () => void; onCreada: (id: number) => void }) {
  const [busca, setBusca] = useState('');
  const sucursales = useQuery({ queryKey: ['chat-buscar-sucursal', busca], enabled: abierto && busca.trim().length >= 2,
    queryFn: () => get<Pagina<CuentaSucursal>>(`/admin/cuentas-sucursal?q=${encodeURIComponent(busca.trim())}&por_pagina=8`) });
  const crear = useMutation({ mutationFn: (cuerpo: object) => post<Conversacion>('/admin/conversaciones', cuerpo), onSuccess: (c) => onCreada(c.id) });
  return (
    <Modal abierto={abierto} titulo="Nueva conversación" onCerrar={onCerrar}>
      <div className="space-y-4">
        <Boton variante="secundario" className="w-full" icono={<Truck className="h-4 w-4" />} cargando={crear.isPending} onClick={() => crear.mutate({ tipo: 'distribuidora' })}>
          Con la distribuidora (conversación general)</Boton>
        <div>
          <p className="mb-1 text-sm font-semibold">O con una sucursal</p>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tinta-400" aria-hidden />
            <Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Busca por nombre o correo" className="pl-9" aria-label="Buscar sucursal" /></div>
          <ul className="mt-2 max-h-64 divide-y divide-tinta-100 overflow-y-auto">
            {sucursales.data?.items.map((s) => (
              <li key={s.id}><button type="button" onClick={() => crear.mutate({ tipo: 'sucursal', cliente_id: s.id })}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-sm hover:bg-sd-50">
                <Building2 className="h-4 w-4 text-menta-700" aria-hidden /><span className="font-semibold">{s.razon_social || s.nombre}</span>
                <span className="ml-auto text-xs text-tinta-400">{s.zona?.nombre}</span></button></li>
            ))}
          </ul>
        </div>
        <ErrorCaja error={crear.error} />
      </div>
    </Modal>
  );
}

/** Página de mensajes: lista de conversaciones y el hilo elegido (?c=id). */
export default function Mensajes() {
  const api = useApiChat();
  const { usuario } = useAuth();
  const base = useBasePanel();
  const aprobador = esAprobador(usuario);
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const elegida = Number(params.get('c')) || null;
  const [filtro, setFiltro] = useState<'' | 'sucursal' | 'distribuidora'>('');
  const [nueva, setNueva] = useState(false);
  const lista = useQuery({ queryKey: ['chat-conversaciones', api], queryFn: () => get<{ items: Conversacion[]; no_leidos: number }>(`${api}/conversaciones`),
    refetchInterval: 15_000 });
  const general = useMutation({
    mutationFn: () => post<Conversacion>(`${api}/conversaciones`, api === '/cuenta' ? {} : { tipo: 'distribuidora' }),
    onSuccess: (c) => elegir(c.id),
  });
  const elegir = (id: number | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set('c', String(id)); else p.delete('c');
    setParams(p);
    qc.invalidateQueries({ queryKey: ['chat-conversaciones', api] });
  };
  const items = (lista.data?.items || []).filter((c) => !filtro || c.tipo === filtro);
  const contraparte = api === '/cuenta' ? 'el aprobador' : aprobador ? 'sucursales y distribuidora' : 'el aprobador';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-display text-2xl font-extrabold tracking-tight">Mensajes</h1>
          <p className="text-sm text-tinta-500">Contacto directo con {contraparte}. Cada conversación puede referirse a una solicitud.</p></div>
        {aprobador ? <Boton icono={<Plus className="h-4 w-4" />} onClick={() => setNueva(true)}>Nueva conversación</Boton>
          : <Boton icono={<Plus className="h-4 w-4" />} cargando={general.isPending} onClick={() => general.mutate()}>Escribir al aprobador</Boton>}
      </div>
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Tarjeta className={cls('min-w-0', !!elegida && 'max-lg:hidden')}>
          {aprobador && (
            <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar conversaciones">
              {([['', 'Todas'], ['sucursal', 'Sucursales'], ['distribuidora', 'Distribuidora']] as const).map(([v, n]) => (
                <button key={v} type="button" onClick={() => setFiltro(v)} aria-pressed={filtro === v}
                  className={cls('rounded-full px-3 py-1 text-xs font-semibold ring-1 transition', filtro === v ? 'bg-sd-900 text-white ring-sd-900' : 'ring-tinta-200 hover:bg-white')}>{n}</button>
              ))}
            </div>
          )}
          <ErrorCaja error={lista.error} />
          {lista.isLoading ? <Cargando /> : !items.length ? <Vacio titulo="Sin conversaciones" texto="Abre una desde aquí o desde el detalle de una solicitud." /> : (
            <ul className="-mx-1 max-h-[65vh] space-y-1 overflow-y-auto">
              {items.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => elegir(c.id)} aria-current={elegida === c.id ? 'true' : undefined}
                    className={cls('flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition', elegida === c.id ? 'bg-white shadow-sm ring-1 ring-menta-300' : 'hover:bg-white/70')}>
                    <span className={cls('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full', c.tipo === 'distribuidora' ? 'bg-[#b5d9ff] text-[#0b4f86]' : 'bg-[#6be5b8a8] text-[#00664a]')} aria-hidden>
                      {c.tipo === 'distribuidora' ? <Truck className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className={cls('truncate text-sm', c.no_leidos ? 'font-extrabold' : 'font-bold')}>{c.con}</span>
                        <span className={cls('ml-auto shrink-0 text-[11px]', c.no_leidos ? 'font-bold text-menta-700' : 'text-tinta-400')}>{cuandoCorto(c.ultimo_mensaje_en)}</span>
                      </span>
                      <span className="block truncate text-[11px] font-semibold text-tinta-500">{c.asunto}</span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        {c.escribiendo ? <span className="truncate text-xs font-semibold italic text-menta-700">escribiendo…</span>
                          : c.ultimo ? <span className={cls('flex min-w-0 items-center gap-1 text-xs', c.no_leidos ? 'font-semibold text-tinta-800' : 'text-tinta-500')}>
                            {c.ultimo.propio && <Palomitas estado={c.ultimo.estado ?? undefined} />}<span className="truncate">{c.ultimo.texto}</span></span>
                            : <span className="text-xs italic text-tinta-400">Sin mensajes</span>}
                        {c.no_leidos > 0 && <span className="ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-menta-500 px-1.5 text-[11px] font-bold text-white">{c.no_leidos}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
        <Tarjeta className={cls('min-w-0', !elegida && 'max-lg:hidden')}>
          {elegida ? (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <button type="button" onClick={() => elegir(null)} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-menta-700 lg:hidden"><ArrowLeft className="h-4 w-4" />Conversaciones</button>
                {(() => { const c = lista.data?.items.find((x) => x.id === elegida); return c?.pedido && (
                  <Link to={api === '/cuenta' ? `/cuenta/pedidos/${c.pedido.id}` : `${base}/pedidos/${c.pedido.id}`} className="ml-auto text-xs font-semibold text-menta-700 hover:underline">Ver solicitud {c.pedido.folio} →</Link>); })()}
              </div>
              <Hilo key={elegida} conversacionId={elegida} />
            </>
          ) : <Vacio titulo="Elige una conversación" texto="Selecciona una conversación de la lista para ver sus mensajes." />}
        </Tarjeta>
      </div>
      {aprobador && <NuevaConversacion abierto={nueva} onCerrar={() => setNueva(false)} onCreada={(id) => { setNueva(false); elegir(id); }} />}
    </div>
  );
}
