/**
 * Archivos privados (evidencias, documentos del expediente): requieren sesión, así que se descargan con el token y se
 * muestran desde un blob local.
 *
 * - `ImagenPrivada`: miniatura de una imagen privada (o un ícono si es PDF).
 * - `GaleriaEvidencias`: miniaturas que abren un visor grande con opción de abrir el original.
 * - `AdjuntarEvidencias`: tomar foto con la cámara o elegir de la galería (o un PDF). Las fotos se reducen antes de
 *   subirse (≤ 1600 px, JPEG) para que la carga sea rápida con datos móviles.
 */
import { useEffect, useRef, useState } from 'react';
import { Camera, ExternalLink, FileText, ImagePlus, Loader2, X } from 'lucide-react';
import { abrirPrivado, api, subirArchivo } from '../api/cliente';
import { cls, mensajeError } from '../lib/formato';
import { Modal, useAviso } from './ui';

const esPdf = (url: string) => /\.pdf($|\?)/i.test(url);
const cache = new Map<string, Promise<string>>();

/** Descarga (una sola vez por sesión de página) un archivo privado y devuelve un enlace local. */
export function urlPrivada(url: string) {
  if (!cache.has(url)) {
    cache.set(url, api<Response>(url.replace(/^\/api/, ''), { crudo: true }).then((r) => r.blob()).then((b) => URL.createObjectURL(b))
      .catch((e) => { cache.delete(url); throw e; }));
  }
  return cache.get(url)!;
}

export function ImagenPrivada({ url, alt, className }: { url: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (esPdf(url)) return;
    let vivo = true;
    urlPrivada(url).then((s) => vivo && setSrc(s)).catch(() => vivo && setError(true));
    return () => { vivo = false; };
  }, [url]);
  if (esPdf(url)) return <span className={cls('grid place-items-center bg-coral-50 text-coral-600', className)}><FileText className="h-7 w-7" aria-label="PDF" /></span>;
  if (error) return <span className={cls('grid place-items-center bg-tinta-50 text-[10px] font-semibold text-tinta-400', className)}>No disponible</span>;
  if (!src) return <span className={cls('esqueleto animate-brillo block', className)} aria-label="Cargando imagen" role="img" />;
  return <img src={src} alt={alt} className={cls('object-cover', className)} />;
}

export function GaleriaEvidencias({ urls, titulo = 'Evidencia' }: { urls: string[]; titulo?: string }) {
  const [abierta, setAbierta] = useState<number | null>(null);
  const avisar = useAviso();
  if (!urls?.length) return null;
  const actual = abierta != null ? urls[abierta] : null;
  return (
    <>
      <ul className="flex flex-wrap gap-2" aria-label={titulo}>
        {urls.map((u, i) => (
          <li key={u}>
            <button type="button" onClick={() => (esPdf(u) ? abrirPrivado(u).catch((e) => avisar(mensajeError(e), 'error')) : setAbierta(i))}
              className="group relative block h-16 w-16 overflow-hidden rounded-xl ring-1 ring-tinta-100 transition hover:ring-2 hover:ring-menta-500" aria-label={`${titulo} ${i + 1}`}>
              <ImagenPrivada url={u} alt={`${titulo} ${i + 1}`} className="h-full w-full" />
            </button>
          </li>
        ))}
      </ul>
      <Modal abierto={actual != null} titulo={`${titulo} ${abierta != null ? abierta + 1 : ''} de ${urls.length}`} onCerrar={() => setAbierta(null)} ancho="max-w-3xl"
        pie={<>
          {urls.length > 1 && <button type="button" className="min-h-10 rounded-full px-4 text-sm font-semibold text-tinta-700 hover:bg-tinta-100" onClick={() => setAbierta(((abierta ?? 0) - 1 + urls.length) % urls.length)}>Anterior</button>}
          {urls.length > 1 && <button type="button" className="min-h-10 rounded-full px-4 text-sm font-semibold text-tinta-700 hover:bg-tinta-100" onClick={() => setAbierta(((abierta ?? 0) + 1) % urls.length)}>Siguiente</button>}
          {actual && <button type="button" className="flex min-h-10 items-center gap-1.5 rounded-full bg-tinta-900 px-4 text-sm font-semibold text-white" onClick={() => abrirPrivado(actual)}><ExternalLink className="h-4 w-4" aria-hidden />Abrir original</button>}
        </>}>
        {actual && <ImagenPrivada url={actual} alt={titulo} className="mx-auto max-h-[62vh] w-auto rounded-xl !object-contain" />}
      </Modal>
    </>
  );
}

/** Reduce una foto a ≤ 1600 px por lado (JPEG 0.82). Los PDF y las imágenes pequeñas se suben tal cual. */
async function prepararEvidencia(archivo: File): Promise<File> {
  if (!archivo.type.startsWith('image/') || archivo.size < 400_000) return archivo;
  try {
    const bmp = await createImageBitmap(archivo);
    const f = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.82));
    return blob ? new File([blob], archivo.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : archivo;
  } catch { return archivo; }
}

export function AdjuntarEvidencias({ valor, onCambio, max = 4, pdf = true }: { valor: string[]; onCambio: (urls: string[]) => void; max?: number; pdf?: boolean }) {
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(0);
  const avisar = useAviso();
  const restantes = max - valor.length - subiendo;
  const alElegir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivos = [...(e.target.files ?? [])].slice(0, Math.max(0, restantes));
    e.target.value = '';
    if (!archivos.length) return;
    setSubiendo((n) => n + archivos.length);
    const nuevas: string[] = [];
    for (const a of archivos) {
      try {
        if (!/^(image\/(png|jpe?g|webp)|application\/pdf)$/.test(a.type)) throw new Error('Usa fotos JPG, PNG o WebP, o un PDF.');
        if (a.size > 10_000_000) throw new Error('El archivo pesa más de 10 MB.');
        nuevas.push(await subirArchivo(await prepararEvidencia(a)));
      } catch (err) { avisar(mensajeError(err), 'error'); } finally { setSubiendo((n) => n - 1); }
    }
    if (nuevas.length) onCambio([...valor, ...nuevas]);
  };
  const boton = 'flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold ring-1 ring-inset ring-tinta-200 transition hover:bg-tinta-50 disabled:opacity-50';
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {valor.map((u, i) => (
          <span key={u} className="relative h-16 w-16 overflow-hidden rounded-xl ring-1 ring-tinta-100">
            <ImagenPrivada url={u} alt={`Evidencia ${i + 1}`} className="h-full w-full" />
            <button type="button" onClick={() => onCambio(valor.filter((x) => x !== u))} aria-label={`Quitar evidencia ${i + 1}`}
              className="absolute right-0.5 top-0.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white"><X className="h-3.5 w-3.5" /></button>
          </span>
        ))}
        {Array.from({ length: subiendo }, (_, i) => <span key={i} className="grid h-16 w-16 place-items-center rounded-xl bg-tinta-50"><Loader2 className="h-5 w-5 animate-spin text-tinta-400" aria-label="Subiendo" /></span>)}
        {restantes > 0 && <>
          <button type="button" className={cls(boton, 'sm:hidden')} onClick={() => camara.current?.click()}><Camera className="h-4 w-4" aria-hidden />Tomar foto</button>
          <button type="button" className={boton} onClick={() => galeria.current?.click()}><ImagePlus className="h-4 w-4" aria-hidden />{valor.length ? 'Agregar otra' : pdf ? 'Adjuntar foto o PDF' : 'Adjuntar foto'}</button>
        </>}
      </div>
      <p className="mt-1 text-xs text-tinta-400">Hasta {max} archivo(s). Las fotos se reducen automáticamente para subir más rápido.</p>
      <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden" onChange={alElegir} aria-label="Tomar foto de evidencia" />
      <input ref={galeria} type="file" accept={pdf ? 'image/png,image/jpeg,image/webp,application/pdf' : 'image/png,image/jpeg,image/webp'} multiple className="hidden" onChange={alElegir} aria-label="Elegir archivos de evidencia" />
    </div>
  );
}
