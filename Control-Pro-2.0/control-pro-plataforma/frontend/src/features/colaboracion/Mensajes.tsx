/**
 * Mensajes entre el aprobador corporativo y las sucursales o la distribuidora. La misma pantalla sirve a los tres lados:
 * cada uno solo ve sus conversaciones (el backend lo filtra). Se actualiza sola cada pocos segundos y ofrece, además,
 * un botón de WhatsApp (enlace wa.me) cuando hay número de contacto.
 */
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, MessageCircle, MessagesSquare, Plus, Search, Send, Truck } from 'lucide-react';
import { get, post } from '../../api/cliente';
import type { Conversacion, MensajeChat, Pagina } from '../../api/tipos';
import type { CuentaSucursal } from '../admin/SucursalesCliente';
import { useAuth } from '../../app/auth';
import { enlaceWhatsApp, esAprobador, useBasePanel } from '../../app/panel';
import { Boton, Cargando, Entrada, ErrorCaja, Modal, Tarjeta, useAviso, Vacio } from '../../components/ui';
import { cls, fechaHora, mensajeError } from '../../lib/formato';

/** Prefijo de la API según quién conversa: la sucursal usa /cuenta y el personal (aprobador o distribuidora) /admin. */
export function useApiChat() {
  const { tipo } = useAuth();
  return tipo === 'cliente' ? '/cuenta' : '/admin';
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

/** Hilo de una conversación: mensajes y caja para escribir. */
export function Hilo({ conversacionId, alto = 'h-[55vh]' }: { conversacionId: number; alto?: string }) {
  const api = useApiChat();
  const qc = useQueryClient();
  const avisar = useAviso();
  const [texto, setTexto] = useState('');
  const fin = useRef<HTMLDivElement>(null);
  const q = useQuery({
    queryKey: ['chat-mensajes', api, conversacionId],
    queryFn: () => get<{ conversacion: Conversacion; items: MensajeChat[] }>(`${api}/conversaciones/${conversacionId}/mensajes`),
    refetchInterval: 8_000,
  });
  const total = q.data?.items.length ?? 0;
  useEffect(() => {
    fin.current?.scrollIntoView({ block: 'end' });
    qc.invalidateQueries({ queryKey: ['chat-no-leidos'] });
    qc.invalidateQueries({ queryKey: ['chat-conversaciones'] });
  }, [total, qc]);
  const enviar = useMutation({
    mutationFn: () => post<MensajeChat>(`${api}/conversaciones/${conversacionId}/mensajes`, { texto: texto.trim() }),
    onSuccess: (m) => {
      setTexto('');
      qc.setQueryData<{ conversacion: Conversacion; items: MensajeChat[] }>(['chat-mensajes', api, conversacionId],
        (d) => (d ? { ...d, items: [...d.items, m] } : d));
    },
    onError: (e) => avisar(mensajeError(e), 'error'),
  });
  const mandar = (e?: FormEvent) => { e?.preventDefault(); if (texto.trim() && !enviar.isPending) enviar.mutate(); };
  const tecla = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); mandar(); } };
  const c = q.data?.conversacion;
  return (
    <div className="flex min-h-0 flex-col">
      {c && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-tinta-100 pb-3">
          <div className="min-w-0">
            <p className="truncate font-display font-bold">{c.con}</p>
            <p className="text-xs text-tinta-500">{c.asunto}{c.pedido && <> · <Estadito estado={c.pedido.estado} /></>}</p>
          </div>
          <BotonWhatsApp numero={c.whatsapp} texto={`Hola, te escribo por Control Pro sobre: ${c.asunto}.`} />
        </div>
      )}
      <div className={cls('min-h-0 flex-1 space-y-2 overflow-y-auto pr-1', alto)} aria-live="polite">
        {q.isLoading ? <Cargando /> : q.error ? <ErrorCaja error={q.error} /> : !total ? (
          <p className="py-10 text-center text-sm text-tinta-500">Aún no hay mensajes. Escribe el primero.</p>
        ) : q.data!.items.map((m) => (
          <div key={m.id} className={cls('flex', m.propio ? 'justify-end' : 'justify-start')}>
            <div className={cls('max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm', m.propio ? 'rounded-br-md bg-sd-900 text-white' : 'rounded-bl-md bg-white ring-1 ring-tinta-100')}>
              {!m.propio && <p className="text-[11px] font-bold text-menta-700">{m.autor} · {m.rol}</p>}
              <p className="whitespace-pre-wrap break-words">{m.texto}</p>
              <p className={cls('mt-0.5 text-right text-[10px]', m.propio ? 'text-white/70' : 'text-tinta-400')}>{fechaHora(m.creado)}</p>
            </div>
          </div>
        ))}
        <div ref={fin} />
      </div>
      <form onSubmit={mandar} className="mt-3 flex items-end gap-2">
        <label className="sr-only" htmlFor={`msg-${conversacionId}`}>Escribe un mensaje</label>
        <textarea id={`msg-${conversacionId}`} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={tecla} rows={2} maxLength={2000}
          placeholder="Escribe un mensaje… (Enter envía, Shift + Enter salta de línea)"
          className="min-h-11 flex-1 resize-none rounded-2xl border-0 bg-white px-4 py-2.5 text-sm ring-1 ring-tinta-200 focus:ring-2 focus:ring-menta-500" />
        <Boton type="submit" cargando={enviar.isPending} disabled={!texto.trim()} icono={<Send className="h-4 w-4" />} aria-label="Enviar mensaje">Enviar</Boton>
      </form>
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
                      <span className="flex items-center gap-2"><span className="truncate text-sm font-bold">{c.con}</span>
                        {c.no_leidos > 0 && <span className="ml-auto rounded-full bg-coral-500 px-1.5 text-[11px] font-bold text-white">{c.no_leidos}</span>}</span>
                      <span className="block truncate text-xs text-tinta-500">{c.asunto}</span>
                      <span className="block text-[11px] text-tinta-400">{c.ultimo_mensaje_en ? fechaHora(c.ultimo_mensaje_en) : 'Sin mensajes'}</span>
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
