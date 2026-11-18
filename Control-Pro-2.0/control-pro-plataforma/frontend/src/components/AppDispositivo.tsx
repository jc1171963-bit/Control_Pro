/**
 * Piezas visibles de la app instalable y los avisos push:
 * - `OpcionesAppMenu`: "Instalar app" y "Activar avisos" dentro del menú de usuario (solo aparecen si aplican).
 * - `AvisosDispositivo`: tarjeta en Notificaciones con el estado de este dispositivo, activar/desactivar y prueba.
 */
import { useState } from 'react';
import { BellOff, BellRing, Check, Download, Send, Share, Smartphone } from 'lucide-react';
import { usePush, useInstalarApp } from '../app/pwa';
import { cls } from '../lib/formato';
import { Boton, useAviso } from './ui';

const MENSAJE_ACTIVAR = {
  denegado: 'Bloqueaste los avisos para este sitio. Permítelos desde el candado junto a la dirección y vuelve a intentarlo.',
  error: 'No se pudieron activar los avisos en este dispositivo. Intenta de nuevo en un momento.',
} as const;

export function OpcionesAppMenu({ claseOpcion, alTerminar }: { claseOpcion: string; alTerminar?: () => void }) {
  const push = usePush();
  const app = useInstalarApp();
  const avisar = useAviso();
  const verAvisos = push.soportado && !push.activo && push.permiso !== 'denied';
  if (!app.disponible && !verAvisos) return null;
  return (
    <>
      {app.disponible && (
        <button type="button" className={cls(claseOpcion, 'gap-2')} onClick={async () => { alTerminar?.(); if (await app.instalar()) avisar('La app LURIMA quedó instalada en este dispositivo.'); }}>
          <Download className="h-4 w-4" aria-hidden />Instalar app</button>
      )}
      {verAvisos && (
        <button type="button" disabled={push.ocupado} className={cls(claseOpcion, 'gap-2 disabled:opacity-60')} onClick={async () => {
          const r = await push.activar();
          alTerminar?.();
          if (r === 'ok') avisar('Listo: recibirás los avisos aunque la app esté cerrada.');
          else avisar(MENSAJE_ACTIVAR[r], 'error');
        }}>
          <BellRing className="h-4 w-4" aria-hidden />{push.ocupado ? 'Activando…' : 'Activar avisos'}</button>
      )}
    </>
  );
}

export function AvisosDispositivo() {
  const push = usePush();
  const app = useInstalarApp();
  const avisar = useAviso();
  const [probando, setProbando] = useState(false);
  if (!push.soportado && !push.requiereInstalar && !app.disponible) return null;

  const estado = push.activo
    ? { icono: <BellRing className="h-5 w-5" aria-hidden />, fondo: 'bg-menta-100 text-menta-700', titulo: 'Avisos activos en este dispositivo',
        texto: 'Te avisaremos al momento de cada novedad de tus solicitudes, aunque la app esté cerrada.' }
    : push.permiso === 'denied'
      ? { icono: <BellOff className="h-5 w-5" aria-hidden />, fondo: 'bg-coral-50 text-coral-600', titulo: 'Avisos bloqueados',
          texto: 'Este navegador tiene bloqueados los avisos de LURIMA. Permítelos desde el candado junto a la dirección del sitio.' }
      : push.requiereInstalar
        ? { icono: <Smartphone className="h-5 w-5" aria-hidden />, fondo: 'bg-tinta-50 text-tinta-600', titulo: 'Instala la app para recibir avisos',
            texto: 'En iPhone y iPad los avisos llegan a la app instalada en tu pantalla de inicio.' }
        : { icono: <BellRing className="h-5 w-5" aria-hidden />, fondo: 'bg-tinta-50 text-tinta-600', titulo: 'Recibe avisos al instante',
            texto: 'Activa los avisos y entérate de aprobaciones, envíos y mensajes sin tener la página abierta.' };

  return (
    <section aria-label="Avisos en este dispositivo" className="vidrio mb-5 flex flex-col gap-4 rounded-2xl bg-white p-4 sm:flex-row sm:items-center sm:p-5">
      <span className={cls('grid h-12 w-12 shrink-0 place-items-center rounded-full', estado.fondo)}>{estado.icono}</span>
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-2 font-display text-base font-bold">{estado.titulo}
          {push.activo && <span className="inline-flex items-center gap-1 rounded-full bg-menta-100 px-2 py-0.5 text-[11px] font-bold text-menta-700"><Check className="h-3 w-3" aria-hidden />Activo</span>}</h2>
        <p className="text-sm text-tinta-600">{estado.texto}</p>
        {push.requiereInstalar && (
          <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-tinta-500">Toca <Share className="h-3.5 w-3.5" aria-label="Compartir" /> y elige <b>“Agregar a inicio”</b>; luego abre LURIMA desde el ícono.</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {app.disponible && <Boton tam="sm" variante="secundario" icono={<Download className="h-4 w-4" />} onClick={() => app.instalar()}>Instalar app</Boton>}
        {push.soportado && !push.activo && push.permiso !== 'denied' && (
          <Boton tam="sm" cargando={push.ocupado} icono={<BellRing className="h-4 w-4" />} onClick={async () => {
            const r = await push.activar();
            if (r === 'ok') avisar('Listo: recibirás los avisos aunque la app esté cerrada.');
            else avisar(MENSAJE_ACTIVAR[r], 'error');
          }}>Activar avisos</Boton>
        )}
        {push.activo && (
          <>
            <Boton tam="sm" variante="secundario" cargando={probando} icono={<Send className="h-4 w-4" />} onClick={async () => {
              setProbando(true);
              try { await push.probar(); avisar('Enviamos un aviso de prueba a tus dispositivos.'); }
              catch { avisar('No se pudo enviar la prueba.', 'error'); }
              finally { setProbando(false); }
            }}>Enviar prueba</Boton>
            <Boton tam="sm" variante="fantasma" disabled={push.ocupado} onClick={() => push.desactivar()}>Desactivar</Boton>
          </>
        )}
      </div>
    </section>
  );
}
