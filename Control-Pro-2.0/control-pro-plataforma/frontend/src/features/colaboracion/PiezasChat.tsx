/**
 * Piezas del chat tipo WhatsApp: notas de voz (grabar y reproducir), fotos y documentos, cita de respuesta y emojis.
 * Los adjuntos son privados: se descargan con la sesión (blob local). Lo que aún se está enviando usa la copia local.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, FileText, ImageIcon, Mic, Pause, Play, Send, Smile, Trash2, X } from 'lucide-react';
import { abrirPrivado, api } from '../../api/cliente';
import { urlPrivada } from '../../components/Archivos';
import { Modal, useAviso } from '../../components/ui';
import { cls, mensajeError } from '../../lib/formato';

export type Adjunto = { url: string; tipo: 'imagen' | 'audio' | 'archivo'; nombre?: string | null; duracion?: number | null };

/** Sube un adjunto del chat (foto, PDF o nota de voz) y devuelve su URL privada. */
export async function subirAdjuntoChat(archivo: File) {
  const form = new FormData();
  form.append('archivo', archivo);
  return (await api<{ url: string }>('/archivos/chat', { form })).url;
}

/** URL utilizable en <img>/<audio>: las locales (blob:) tal cual; las privadas se descargan con la sesión. */
export function useUrlMedio(url: string | null | undefined, cargar = true) {
  const [src, setSrc] = useState<string | null>(url && url.startsWith('blob:') ? url : null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!url || !cargar) return;
    if (url.startsWith('blob:')) { setSrc(url); return; }
    let vivo = true;
    urlPrivada(url).then((s) => vivo && setSrc(s)).catch(() => vivo && setError(true));
    return () => { vivo = false; };
  }, [url, cargar]);
  return { src, error };
}

export const duracionTexto = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Reduce fotos (≤ 1600 px, JPEG) antes de subir. */
export async function prepararFoto(archivo: File): Promise<File> {
  if (!archivo.type.startsWith('image/') || archivo.size < 350_000) return archivo;
  try {
    const bmp = await createImageBitmap(archivo);
    const f = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.84));
    return blob ? new File([blob], archivo.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : archivo;
  } catch { return archivo; }
}

// ---------------------------------------------------------------- notas de voz

const FORMATOS: [string, string][] = [['audio/webm;codecs=opus', 'webm'], ['audio/webm', 'webm'], ['audio/ogg;codecs=opus', 'ogg'], ['audio/mp4', 'm4a'], ['audio/mpeg', 'mp3']];
export const MAX_AUDIO = 180;
export const puedeGrabar = () => typeof window !== 'undefined' && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

/** Grabadora: micrófono → MediaRecorder; niveles en vivo para la onda; corta sola a los 3 minutos. */
export function useGrabadora(alTerminar: (archivo: File, duracion: number) => void) {
  const [estado, setEstado] = useState<'inactivo' | 'grabando'>('inactivo');
  const [segundos, setSegundos] = useState(0);
  const [niveles, setNiveles] = useState<number[]>([]);
  const r = useRef<{ rec?: MediaRecorder; stream?: MediaStream; ctx?: AudioContext; partes: Blob[]; inicio: number; enviar: boolean; cuadro?: number; reloj?: number; ext: string }>({ partes: [], inicio: 0, enviar: false, ext: 'webm' });
  const avisar = useAviso();
  const limpiar = () => {
    const x = r.current;
    if (x.cuadro) cancelAnimationFrame(x.cuadro);
    if (x.reloj) window.clearInterval(x.reloj);
    x.stream?.getTracks().forEach((t) => t.stop());
    x.ctx?.close().catch(() => undefined);
    setEstado('inactivo'); setSegundos(0); setNiveles([]);
  };
  const detener = (enviar: boolean) => {
    const x = r.current;
    x.enviar = enviar;
    if (x.rec && x.rec.state !== 'inactive') x.rec.stop(); else limpiar();
  };
  const iniciar = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const [mime, ext] = FORMATOS.find(([m]) => MediaRecorder.isTypeSupported?.(m)) ?? ['', 'webm'];
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48_000 } : undefined);
      const x = r.current;
      Object.assign(x, { rec, stream, partes: [], inicio: Date.now(), enviar: false, ext: mime ? ext : (rec.mimeType.includes('mp4') ? 'm4a' : 'webm') });
      rec.ondataavailable = (e) => { if (e.data.size) x.partes.push(e.data); };
      rec.onstop = () => {
        const dur = Math.max(1, Math.round((Date.now() - x.inicio) / 1000));
        const tipo = rec.mimeType || mime || 'audio/webm';
        if (x.enviar && x.partes.length) alTerminar(new File(x.partes, `nota-de-voz.${x.ext}`, { type: tipo.split(';')[0] }), dur);
        limpiar();
      };
      // Onda en vivo
      const ctx = new AudioContext();
      const analizador = ctx.createAnalyser(); analizador.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analizador);
      x.ctx = ctx;
      const datos = new Uint8Array(analizador.frequencyBinCount);
      let ultimo = 0;
      const medir = (t: number) => {
        analizador.getByteTimeDomainData(datos);
        if (t - ultimo > 90) {
          ultimo = t;
          let pico = 0; for (const v of datos) pico = Math.max(pico, Math.abs(v - 128));
          setNiveles((n) => [...n.slice(-39), Math.min(1, pico / 64)]);
        }
        x.cuadro = requestAnimationFrame(medir);
      };
      x.cuadro = requestAnimationFrame(medir);
      x.reloj = window.setInterval(() => {
        const s = Math.floor((Date.now() - x.inicio) / 1000);
        setSegundos(s);
        if (s >= MAX_AUDIO) detener(true);
      }, 250);
      rec.start(250);
      setEstado('grabando');
    } catch (e) {
      limpiar();
      avisar((e as Error)?.name === 'NotAllowedError' ? 'Permite el uso del micrófono para grabar notas de voz.' : 'No se pudo usar el micrófono de este dispositivo.', 'error');
    }
  };
  useEffect(() => () => { r.current.enviar = false; r.current.rec?.state === 'recording' && r.current.rec.stop(); }, []);
  return { estado, segundos, niveles, iniciar, detener };
}

/** Barra de grabación que sustituye la caja de texto mientras se graba. */
export function BarraGrabacion({ segundos, niveles, onCancelar, onEnviar }: { segundos: number; niveles: number[]; onCancelar: () => void; onEnviar: () => void }) {
  return (
    <div className="flex flex-1 items-center gap-2 rounded-3xl bg-white px-2 py-1.5 shadow-sm ring-1 ring-tinta-200" role="status" aria-label={`Grabando nota de voz, ${duracionTexto(segundos)}`}>
      <button type="button" onClick={onCancelar} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-coral-600 hover:bg-coral-50" aria-label="Descartar nota de voz"><Trash2 className="h-5 w-5" /></button>
      <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-[#e43e43]" aria-hidden />
      <span className="w-12 shrink-0 text-sm font-semibold tabular-nums">{duracionTexto(segundos)}</span>
      <span className="flex h-8 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden" aria-hidden>
        {niveles.map((n, i) => <span key={i} className="w-[3px] shrink-0 rounded-full bg-menta-500" style={{ height: `${Math.max(3, n * 30)}px` }} />)}
      </span>
      <span className="hidden text-[11px] text-tinta-400 sm:inline">máx. {MAX_AUDIO / 60} min</span>
      <button type="button" onClick={onEnviar} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-menta-500 text-white shadow-md hover:bg-menta-600" aria-label="Enviar nota de voz"><Send className="h-5 w-5 translate-x-[1px]" /></button>
    </div>
  );
}

/** Reproductor de nota de voz con onda (se descarga al darle play), avance arrastrable y velocidad 1× / 1.5× / 2×. */
export function NotaDeVoz({ url, duracion, propio }: { url: string; duracion?: number | null; propio: boolean }) {
  const [pedir, setPedir] = useState(url.startsWith('blob:'));
  const { src, error } = useUrlMedio(url, pedir);
  const audio = useRef<HTMLAudioElement>(null);
  const [sonando, setSonando] = useState(false);
  const [avance, setAvance] = useState(0);
  const [actual, setActual] = useState(0);
  const [velocidad, setVelocidad] = useState(1);
  const total = duracion || 0;
  // Onda fija y propia de cada nota (a partir de su URL), como en las apps de mensajería
  const barras = useMemo(() => { let h = 0; for (const ch of url) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return Array.from({ length: 34 }, (_, i) => { h = (h * 1103515245 + 12345) >>> 0; return 0.25 + ((h >>> 16) % 1000) / 1000 * 0.75 * (0.6 + 0.4 * Math.sin(i / 3)); }); }, [url]);
  useEffect(() => { if (src && pedir && audio.current && !sonando) audio.current.play().then(() => setSonando(true)).catch(() => undefined); /* eslint-disable-next-line */ }, [src]);
  const alternar = () => {
    if (!src) { setPedir(true); return; }
    const a = audio.current!;
    if (a.paused) a.play().then(() => setSonando(true)).catch(() => undefined); else { a.pause(); setSonando(false); }
  };
  const buscar = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = audio.current; if (!a || !src) return;
    const r = e.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const dur = Number.isFinite(a.duration) ? a.duration : total;
    if (dur) { a.currentTime = f * dur; setAvance(f); }
  };
  return (
    <div className="flex w-[min(62vw,280px)] max-w-full items-center gap-2 py-1">
      <span className={cls('relative hidden h-11 w-11 shrink-0 place-items-center rounded-full min-[400px]:grid', propio ? 'bg-black/10' : 'bg-menta-50 text-menta-700')}>
        <Mic className="h-5 w-5" aria-hidden />
      </span>
      <button type="button" onClick={alternar} disabled={error} aria-label={sonando ? 'Pausar nota de voz' : 'Reproducir nota de voz'}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-current hover:bg-black/5 disabled:opacity-40">
        {sonando ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 translate-x-[1px] fill-current" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex h-7 cursor-pointer items-center gap-[2px]" onPointerDown={buscar} role="slider" aria-label="Avance de la nota de voz"
          aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.round(actual)}>
          {barras.map((b, i) => <span key={i} className={cls('w-[3px] shrink-0 rounded-full transition-colors', i / barras.length <= avance ? 'bg-menta-500' : 'bg-current opacity-30')} style={{ height: `${b * 26}px` }} />)}
        </div>
        <p className="mt-0.5 flex items-center justify-between text-[11px] opacity-70">
          <span className="tabular-nums">{duracionTexto(sonando || actual ? actual : total)}</span>
          {sonando && <button type="button" onClick={() => { const v = velocidad === 1 ? 1.5 : velocidad === 1.5 ? 2 : 1; setVelocidad(v); if (audio.current) audio.current.playbackRate = v; }}
            className="rounded-full bg-black/10 px-1.5 text-[10px] font-bold" aria-label="Cambiar velocidad">{velocidad}×</button>}
        </p>
      </div>
      {src && <audio ref={audio} src={src} preload="metadata"
        onTimeUpdate={(e) => { const a = e.currentTarget; const d = Number.isFinite(a.duration) && a.duration ? a.duration : total || 1; setActual(a.currentTime); setAvance(a.currentTime / d); }}
        onEnded={() => { setSonando(false); setAvance(0); setActual(0); }} onPause={() => setSonando(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------- fotos y documentos

export function FotoEnBurbuja({ url, onAbrir }: { url: string; onAbrir: () => void }) {
  const { src, error } = useUrlMedio(url);
  return (
    <button type="button" onClick={onAbrir} className="-mx-1 -mt-0.5 mb-1 block overflow-hidden rounded-lg" aria-label="Ver foto">
      {src ? <img src={src} alt="Foto enviada" className="max-h-[320px] w-[min(60vw,300px)] max-w-full object-cover" />
        : <span className={cls('block h-48 w-60', error ? 'grid place-items-center bg-black/5 text-xs' : 'esqueleto animate-brillo')}>{error ? 'Foto no disponible' : ''}</span>}
    </button>
  );
}

export function DocumentoEnBurbuja({ url, nombre }: { url: string; nombre?: string | null }) {
  const avisar = useAviso();
  const abrir = () => (url.startsWith('blob:') ? window.open(url, '_blank', 'noopener') : abrirPrivado(url).catch((e) => avisar(mensajeError(e), 'error')));
  return (
    <button type="button" onClick={abrir} className="-mx-1 mb-1 flex w-[min(62vw,280px)] max-w-full items-center gap-3 rounded-lg bg-black/5 p-2.5 text-left hover:bg-black/10">
      <span className="grid h-10 w-9 shrink-0 place-items-center rounded-md bg-coral-500 text-[10px] font-extrabold text-white">PDF</span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{nombre || 'Documento'}</span><span className="text-[11px] opacity-70">Toca para abrir</span></span>
      <FileText className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
    </button>
  );
}

export function VisorFoto({ url, onCerrar }: { url: string | null; onCerrar: () => void }) {
  const { src } = useUrlMedio(url);
  return (
    <Modal abierto={!!url} titulo="Foto" onCerrar={onCerrar} ancho="max-w-4xl"
      pie={url && <button type="button" onClick={() => (url.startsWith('blob:') ? window.open(url) : abrirPrivado(url))} className="min-h-10 rounded-full bg-tinta-900 px-4 text-sm font-semibold text-white">Abrir original</button>}>
      {src ? <img src={src} alt="Foto" className="mx-auto max-h-[70vh] w-auto rounded-xl object-contain" /> : <span className="esqueleto animate-brillo mx-auto block h-72 w-full rounded-xl" />}
    </Modal>
  );
}

/** Vista previa antes de enviar una foto o documento, con pie de foto opcional. */
export function VistaPreviaAdjunto({ archivo, onCancelar, onEnviar }: { archivo: File | null; onCancelar: () => void; onEnviar: (pie: string) => void }) {
  const [pie, setPie] = useState('');
  const local = useMemo(() => (archivo && archivo.type.startsWith('image/') ? URL.createObjectURL(archivo) : null), [archivo]);
  useEffect(() => () => { if (local) URL.revokeObjectURL(local); }, [local]);
  useEffect(() => { setPie(''); }, [archivo]);
  const enviar = () => onEnviar(pie.trim());
  return (
    <Modal abierto={!!archivo} titulo={local ? 'Enviar foto' : 'Enviar documento'} onCerrar={onCancelar} ancho="max-w-xl"
      pie={<>
        <input value={pie} onChange={(e) => setPie(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); enviar(); } }} maxLength={2000}
          placeholder="Añade un comentario…" aria-label="Comentario" className="min-h-11 min-w-0 flex-1 rounded-full border-0 bg-white px-4 text-sm ring-1 ring-tinta-200 focus:ring-2 focus:ring-menta-500" />
        <button type="button" onClick={enviar} aria-label="Enviar" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-menta-500 text-white shadow-md hover:bg-menta-600"><Send className="h-5 w-5 translate-x-[1px]" /></button>
      </>}>
      {local ? <img src={local} alt="Vista previa" className="mx-auto max-h-[55vh] w-auto rounded-xl object-contain" />
        : archivo && <div className="flex items-center gap-3 rounded-xl bg-tinta-50 p-4"><span className="grid h-12 w-10 place-items-center rounded-md bg-coral-500 text-[11px] font-extrabold text-white">PDF</span>
          <span className="min-w-0"><span className="block truncate font-semibold">{archivo.name}</span><span className="text-xs text-tinta-500">{(archivo.size / 1024 / 1024).toFixed(2)} MB</span></span></div>}
    </Modal>
  );
}

/** Menú de adjuntar: cámara (celular), fotos de la galería o documento PDF. */
export function MenuAdjuntar({ onArchivo }: { onArchivo: (f: File) => void }) {
  const [abierto, setAbierto] = useState(false);
  const fotos = useRef<HTMLInputElement>(null), camara = useRef<HTMLInputElement>(null), doc = useRef<HTMLInputElement>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const avisar = useAviso();
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('mousedown', fuera); window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuera); window.removeEventListener('keydown', esc); };
  }, [abierto]);
  const elegido = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''; setAbierto(false);
    if (!f) return;
    if (!/^(image\/(png|jpe?g|webp)|application\/pdf)$/.test(f.type)) { avisar('Usa una foto JPG, PNG o WebP, o un PDF.', 'error'); return; }
    if (f.type === 'application/pdf' && f.size > 4_800_000) { avisar('El PDF pesa más de 4.8 MB.', 'error'); return; }
    onArchivo(f);
  };
  const op = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-tinta-50';
  return (
    <div ref={raiz} className="relative">
      <button type="button" onClick={() => setAbierto(!abierto)} aria-label="Adjuntar foto o documento" aria-expanded={abierto}
        className={cls('grid h-11 w-11 place-items-center rounded-full text-tinta-500 transition hover:bg-tinta-50 hover:text-tinta-800', abierto && 'rotate-45 bg-tinta-50')}>
        <span className="text-2xl leading-none">+</span></button>
      {abierto && (
        <div className="absolute bottom-14 left-0 z-20 w-56 rounded-2xl bg-white p-1.5 shadow-[0_18px_50px_rgba(8,30,40,.22)] ring-1 ring-tinta-100 animate-emerger">
          <button type="button" className={cls(op, 'sm:hidden')} onClick={() => camara.current?.click()}><span className="grid h-9 w-9 place-items-center rounded-full bg-[#ff2e74] text-white"><Camera className="h-4 w-4" /></span>Cámara</button>
          <button type="button" className={op} onClick={() => fotos.current?.click()}><span className="grid h-9 w-9 place-items-center rounded-full bg-[#007bfc] text-white"><ImageIcon className="h-4 w-4" /></span>Fotos</button>
          <button type="button" className={op} onClick={() => doc.current?.click()}><span className="grid h-9 w-9 place-items-center rounded-full bg-[#7f66ff] text-white"><FileText className="h-4 w-4" /></span>Documento PDF</button>
        </div>
      )}
      <input ref={fotos} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={elegido} aria-label="Elegir foto" />
      <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden" onChange={elegido} aria-label="Tomar foto" />
      <input ref={doc} type="file" accept="application/pdf" className="hidden" onChange={elegido} aria-label="Elegir documento" />
    </div>
  );
}

// ---------------------------------------------------------------- emojis (solo los formales)

const EMOJIS: [string, string[]][] = [
  ['Frecuentes', ['👍', '👌', '🙏', '✅', '👏', '🤝', '🙂', '😊', '👋', '💪']],
  ['Trabajo', ['📦', '🚚', '📋', '📝', '📌', '📎', '📅', '⏰', '📞', '✉️', '💼', '🏢', '🏥', '🧾', '👕', '🥼']],
  ['Estado', ['✔️', '❌', '⚠️', '❗', '❓', '🔔', '⭐', '💡', '🎉', '⏳', '🔄', '📍']],
];

export function SelectorEmoji({ onElegir }: { onElegir: (e: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('mousedown', fuera); window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuera); window.removeEventListener('keydown', esc); };
  }, [abierto]);
  return (
    <div ref={raiz} className="relative">
      <button type="button" onClick={() => setAbierto(!abierto)} aria-label="Emojis" aria-expanded={abierto}
        className={cls('grid h-11 w-11 place-items-center rounded-full text-tinta-500 transition hover:bg-tinta-50 hover:text-tinta-800', abierto && 'bg-tinta-50 text-menta-700')}>
        <Smile className="h-6 w-6" /></button>
      {abierto && (
        <div className="absolute bottom-14 left-0 z-20 w-[min(86vw,320px)] rounded-2xl bg-white p-3 shadow-[0_18px_50px_rgba(8,30,40,.22)] ring-1 ring-tinta-100 animate-emerger" role="dialog" aria-label="Emojis">
          <div className="mb-1 flex justify-end"><button type="button" onClick={() => setAbierto(false)} className="grid h-7 w-7 place-items-center rounded-full text-tinta-400 hover:bg-tinta-50" aria-label="Cerrar"><X className="h-4 w-4" /></button></div>
          {EMOJIS.map(([grupo, lista]) => (
            <div key={grupo} className="mb-2 last:mb-0">
              <p className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wide text-tinta-400">{grupo}</p>
              <div className="grid grid-cols-8 gap-0.5">
                {lista.map((e) => <button key={e} type="button" onClick={() => onElegir(e)} className="grid h-9 place-items-center rounded-lg text-xl transition hover:scale-110 hover:bg-tinta-50" aria-label={`Insertar ${e}`}>{e}</button>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
