/**
 * Formulario público de contacto (POST /api/tienda/contacto). La confirmación solo se muestra si el servidor
 * respondió que el mensaje se envió; si el correo no está configurado, el servidor responde 503 y se muestra el error.
 */
import { FormEvent, ReactNode, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { CheckCircle2, Mail, MessageSquareText, Phone, Send, Tag, User } from 'lucide-react';
import { ApiError, post } from '../../api/cliente';
import { Boton, Campo, Entrada, ErrorCaja, Texto } from '../../components/ui';
import { cls } from '../../lib/formato';

// Mismas reglas que ContactoSchema en el backend.
const esquema = z.object({
  nombre: z.string().trim().min(3, 'Escribe tu nombre completo.').max(120, 'Máximo 120 caracteres.'),
  correo: z.string().trim().email('Escribe un correo válido, por ejemplo nombre@empresa.com.').max(160),
  telefono: z.string().trim().regex(/^[0-9+\-\s()]{8,20}$/, 'Teléfono de 8 a 20 dígitos.').optional().or(z.literal('')),
  asunto: z.string().trim().min(3, 'Escribe el asunto (mínimo 3 caracteres).').max(120, 'Máximo 120 caracteres.'),
  mensaje: z.string().trim().min(10, 'Cuéntanos un poco más (mínimo 10 caracteres).').max(3000, 'Máximo 3000 caracteres.'),
});
type Campos = keyof z.infer<typeof esquema>;

function ConIcono({ icono, children }: { icono: ReactNode; children: ReactNode }) {
  return (
    <span className="relative block">
      <span className="pointer-events-none absolute left-3 top-3 text-lurima-400" aria-hidden>{icono}</span>
      {children}
    </span>
  );
}

const control = 'h-12 rounded-xl pl-10 ring-lurima-200 focus:ring-lurima-600';

export default function FormularioContacto() {
  const [errores, setErrores] = useState<Partial<Record<Campos, string>>>({});
  const [mensaje, setMensaje] = useState('');
  const envio = useMutation({
    mutationFn: (datos: Record<string, string | null>) => post<{ mensaje: string }>('/tienda/contacto', datos),
    onError: (e) => {
      // 422 del servidor: se muestran los errores en su campo.
      if (e instanceof ApiError && e.detalles && typeof e.detalles === 'object') {
        setErrores(Object.fromEntries(Object.entries(e.detalles as Record<string, string[]>).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v)])));
      }
    },
  });

  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const r = esquema.safeParse(f);
    if (!r.success) {
      const errs = Object.fromEntries(r.error.issues.map((i) => [i.path[0], i.message]));
      setErrores(errs);
      e.currentTarget.querySelector<HTMLElement>(`[name="${r.error.issues[0].path[0]}"]`)?.focus();
      return;
    }
    setErrores({});
    envio.mutate({ ...r.data, telefono: r.data.telefono || null, sitio_web: f.sitio_web ?? '' });
  };

  if (envio.isSuccess) {
    return (
      <div role="status" className="flex h-full flex-col items-center justify-center rounded-[2rem] bg-white p-8 text-center shadow-suave ring-1 ring-lurima-100 sm:p-12">
        <span className="grid h-16 w-16 animate-sello place-items-center rounded-full bg-bienestar-50 text-bienestar-600"><CheckCircle2 className="h-9 w-9" aria-hidden /></span>
        <h2 className="mt-5 font-display text-2xl font-extrabold text-lurima-900">¡Mensaje enviado!</h2>
        <p className="mt-2 max-w-sm text-tinta-600">{envio.data.mensaje}</p>
        <Boton variante="secundario" className="mt-6" onClick={() => { envio.reset(); setMensaje(''); }}>Enviar otro mensaje</Boton>
      </div>
    );
  }

  const err = (k: Campos) => errores[k];
  return (
    <form onSubmit={enviar} noValidate className="relative rounded-[2rem] bg-white p-6 shadow-suave ring-1 ring-lurima-100 sm:p-8" aria-labelledby="t-formulario">
      <h2 id="t-formulario" className="font-display text-2xl font-extrabold tracking-tight text-lurima-900">Escríbenos</h2>
      <p className="mt-1 text-sm text-tinta-600">Te respondemos al correo que nos dejes. Los campos marcados con * son obligatorios.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre completo *" error={err('nombre')} className="sm:col-span-2">
          <ConIcono icono={<User className="h-5 w-5" />}><Entrada name="nombre" autoComplete="name" maxLength={120} aria-invalid={!!err('nombre')} className={control} /></ConIcono>
        </Campo>
        <Campo etiqueta="Correo electrónico *" error={err('correo')}>
          <ConIcono icono={<Mail className="h-5 w-5" />}><Entrada name="correo" type="email" autoComplete="email" maxLength={160} aria-invalid={!!err('correo')} className={control} /></ConIcono>
        </Campo>
        <Campo etiqueta="Teléfono (opcional)" error={err('telefono')}>
          <ConIcono icono={<Phone className="h-5 w-5" />}><Entrada name="telefono" type="tel" autoComplete="tel" maxLength={20} aria-invalid={!!err('telefono')} className={control} /></ConIcono>
        </Campo>
        <Campo etiqueta="Asunto *" error={err('asunto')} className="sm:col-span-2">
          <ConIcono icono={<Tag className="h-5 w-5" />}><Entrada name="asunto" maxLength={120} aria-invalid={!!err('asunto')} className={control} /></ConIcono>
        </Campo>
        <Campo etiqueta="Mensaje *" error={err('mensaje')} className="sm:col-span-2">
          <ConIcono icono={<MessageSquareText className="h-5 w-5" />}>
            <Texto name="mensaje" rows={5} maxLength={3000} value={mensaje} onChange={(e) => setMensaje(e.target.value)} aria-invalid={!!err('mensaje')} className="rounded-xl pl-10 pt-3 ring-lurima-200 focus:ring-lurima-600" />
          </ConIcono>
          <span className={cls('mt-1 block text-right text-xs', mensaje.length > 2900 ? 'text-coral-600' : 'text-tinta-500')}>{mensaje.length}/3000</span>
        </Campo>
        {/* Campo trampa contra robots: oculto para personas y lectores de pantalla. */}
        <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden>
          <label>No llenar<input name="sitio_web" tabIndex={-1} autoComplete="off" defaultValue="" /></label>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {envio.error && !(envio.error instanceof ApiError && envio.error.status === 422) && <ErrorCaja error={envio.error} />}
        <Boton type="submit" tam="lg" className="w-full rounded-xl sm:w-auto" cargando={envio.isPending} icono={<Send className="h-4 w-4" aria-hidden />}>
          {envio.isPending ? 'Enviando…' : 'Enviar mensaje'}
        </Boton>
      </div>
    </form>
  );
}
