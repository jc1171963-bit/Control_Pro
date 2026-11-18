/**
 * Avatar de la cuenta: la foto de perfil si existe; si no, las iniciales sobre un degradado.
 * `useFotoPerfil` sube o quita la foto de quien inició sesión. La imagen se recorta al centro y se reduce a 320 px
 * en el navegador antes de enviarla (pesa pocos KB y carga al instante en cualquier conexión).
 */
import { useRef, useState } from 'react';
import { api, del } from '../api/cliente';
import type { Cliente, Usuario } from '../api/tipos';
import { useAuth } from '../app/auth';
import { cls, mensajeError } from '../lib/formato';
import { useAviso } from './ui';

export const iniciales = (s?: string | null) => (s ?? '').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '·';

export default function Avatar({ nombre, foto, className, degradado = 'from-[#0b3f57] to-[#5ec8d8]' }:
  { nombre?: string | null; foto?: string | null; className?: string; degradado?: string }) {
  return foto ? (
    <img src={foto} alt="" className={cls('shrink-0 rounded-full object-cover', className)} />
  ) : (
    <span className={cls('grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-bold text-white', degradado, className)} aria-hidden>{iniciales(nombre)}</span>
  );
}

const LADO = 320;

/** Recorta la imagen a un cuadrado centrado y la reduce a 320 px (JPEG). */
async function prepararFoto(archivo: File): Promise<File> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error('No se pudo leer la imagen. Usa un archivo JPG, PNG o WebP.'));
      i.src = url;
    });
    const lado = Math.min(img.naturalWidth, img.naturalHeight);
    const lienzo = document.createElement('canvas');
    lienzo.width = lienzo.height = LADO;
    const ctx = lienzo.getContext('2d');
    if (!ctx) return archivo;
    ctx.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, LADO, LADO);
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.86));
    return blob ? new File([blob], 'foto.jpg', { type: 'image/jpeg' }) : archivo;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function useFotoPerfil() {
  const { actualizarCuenta } = useAuth();
  const avisar = useAviso();
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const elegir = () => entrada.current?.click();
  const alElegir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(archivo.type)) { avisar('Usa una imagen JPG, PNG o WebP.', 'error'); return; }
    setSubiendo(true);
    try {
      const form = new FormData();
      form.append('archivo', await prepararFoto(archivo));
      const r = await api<{ cuenta: Usuario | Cliente }>('/auth/foto', { form });
      actualizarCuenta(r.cuenta);
      avisar('Foto actualizada.');
    } catch (err) { avisar(mensajeError(err), 'error'); } finally { setSubiendo(false); }
  };
  const quitar = async () => {
    try {
      const r = await del<{ cuenta: Usuario | Cliente }>('/auth/foto');
      actualizarCuenta(r.cuenta);
      avisar('Foto eliminada.');
    } catch (err) { avisar(mensajeError(err), 'error'); }
  };
  const input = <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={alElegir} aria-label="Elegir foto de perfil" />;
  return { elegir, quitar, subiendo, input };
}
