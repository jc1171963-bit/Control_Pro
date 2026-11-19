/**
 * Distintivo CNR de las sucursales que lo tienen. El logo lo sube una vez quien administra las sucursales
 * (aprobador o distribuidora); mientras no haya logo se muestra un sello de texto "CNR".
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, ImagePlus, Trash2 } from 'lucide-react';
import { api, del, get } from '../api/cliente';
import { cls } from '../lib/formato';
import { Boton, ErrorCaja, Modal, useAviso } from './ui';

export function useConfigPublica() {
  return useQuery({ queryKey: ['config-publica'], staleTime: 600_000, queryFn: () => get<{ cnr_logo: string | null }>('/config/publica') });
}

const TAMANOS = { sm: 'h-5 text-[10px] px-1.5', md: 'h-7 text-xs px-2', lg: 'h-10 text-sm px-3' };

export default function SelloCNR({ tam = 'sm', className }: { tam?: keyof typeof TAMANOS; className?: string }) {
  const logo = useConfigPublica().data?.cnr_logo;
  if (logo) {
    return <img src={logo} alt="Sucursal CNR" title="Sucursal CNR" className={cls('inline-block w-auto shrink-0 rounded bg-white object-contain p-0.5 ring-1 ring-tinta-100', TAMANOS[tam].split(' ')[0], className)} />;
  }
  return (
    <span title="Sucursal CNR" className={cls('inline-flex shrink-0 items-center gap-1 rounded-md bg-gradient-to-r from-[#0b4f6c] to-[#0e7490] font-display font-extrabold tracking-wider text-white', TAMANOS[tam], className)}>
      <BadgeCheck className={tam === 'lg' ? 'h-4 w-4' : 'h-3 w-3'} aria-hidden />CNR
    </span>
  );
}

/** Ventana para subir, cambiar o quitar el logo CNR (lo ven todas las sucursales marcadas como CNR). */
export function LogoCNR({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const entrada = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<unknown>(null);
  const logo = useConfigPublica().data?.cnr_logo;
  const listo = (texto: string) => { qc.invalidateQueries({ queryKey: ['config-publica'] }); avisar(texto); setError(null); };
  const subir = useMutation({
    mutationFn: (archivo: File) => { const form = new FormData(); form.append('archivo', archivo); return api('/admin/config/cnr-logo', { form }); },
    onSuccess: () => listo('Logo CNR actualizado en todas las sucursales CNR.'), onError: setError,
  });
  const quitar = useMutation({ mutationFn: () => del('/admin/config/cnr-logo'), onSuccess: () => listo('Se quitó el logo; se mostrará el sello de texto.'), onError: setError });
  return (
    <Modal abierto={abierto} titulo="Logo CNR" sub="Se muestra junto al nombre de las sucursales marcadas como CNR" onCerrar={onCerrar}
      pie={<>
        {logo && <Boton variante="fantasma" icono={<Trash2 className="h-4 w-4" />} cargando={quitar.isPending} onClick={() => quitar.mutate()}>Quitar logo</Boton>}
        <Boton icono={<ImagePlus className="h-4 w-4" />} cargando={subir.isPending} onClick={() => entrada.current?.click()}>{logo ? 'Cambiar logo' : 'Subir logo'}</Boton>
      </>}>
      <div className="grid place-items-center gap-3 rounded-2xl bg-tinta-50 p-6">
        {logo ? <img src={logo} alt="Logo CNR actual" className="max-h-28 max-w-full rounded-lg bg-white object-contain p-2" /> : <SelloCNR tam="lg" />}
        <p className="text-center text-xs text-tinta-500">{logo ? 'Logo actual.' : 'Aún no hay logo: se muestra este sello de texto.'} Usa un PNG con fondo transparente o un JPG/WebP (se recomienda horizontal, de al menos 200 px de alto).</p>
      </div>
      <div className="mt-4"><ErrorCaja error={error} /></div>
      <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" aria-label="Elegir logo CNR"
        onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ''; if (a) { if (a.size > 3_000_000) setError(new Error('El logo pesa más de 3 MB.')); else subir.mutate(a); } }} />
    </Modal>
  );
}
