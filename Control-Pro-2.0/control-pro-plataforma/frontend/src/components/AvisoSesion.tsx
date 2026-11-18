import { useEffect, useState } from 'react';
import { continuar, reanudar, restanteMs, useFaseSesion } from '../app/actividad';
import { Boton, Modal } from './ui';

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Aviso de inactividad (minuto 28, confirmado por el servidor) y pantalla de pausa local sin conexión. */
export function AvisoSesion({ onCerrarSesion }: { onCerrarSesion: () => void }) {
  const fase = useFaseSesion();
  const [, setTic] = useState(0);
  const [reintentando, setReintentando] = useState(false);
  const [sinRed, setSinRed] = useState(false);

  useEffect(() => {
    if (fase !== 'aviso') return;
    const t = setInterval(() => setTic((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [fase]);
  useEffect(() => setSinRed(false), [fase]);

  if (fase === 'aviso') {
    return (
      <Modal abierto titulo="Tu sesión está por cerrarse" onCerrar={continuar}>
        <p className="text-sm text-tinta-600">No detectamos actividad. Por seguridad, la sesión se cerrará en
          {' '}<strong aria-live="polite">{mmss(restanteMs())}</strong>.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Boton variante="secundario" onClick={onCerrarSesion}>Cerrar sesión</Boton>
          <Boton onClick={continuar}>Continuar</Boton>
        </div>
      </Modal>
    );
  }
  if (fase === 'pausada') {
    const reintentar = async () => {
      setReintentando(true);
      const r = await reanudar();
      setReintentando(false);
      setSinRed(r === 'red');
    };
    return (
      <Modal abierto titulo="Sesión en pausa en esta pestaña" onCerrar={() => undefined}>
        <p className="text-sm text-tinta-600">No pudimos confirmar tu sesión con el servidor. Esta pestaña quedó en pausa
          para proteger tu información; tus otras pestañas no se ven afectadas.</p>
        {sinRed && <p className="mt-3 text-sm font-semibold text-coral-600" role="alert">Seguimos sin conexión. Intenta de nuevo en un momento.</p>}
        <div className="mt-5 flex justify-end">
          <Boton cargando={reintentando} onClick={reintentar}>Reintentar</Boton>
        </div>
      </Modal>
    );
  }
  return null;
}
