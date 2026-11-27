/**
 * Modo presentación: solo para la cuenta temporal de presentación (el servidor la marca en `usuario.presentacion`).
 *
 * - Marca de agua en mosaico sobre TODA la pantalla con el nombre, el correo, la fecha y la hora de quien mira. Se
 *   vuelve a poner sola si alguien la quita o la oculta desde las herramientas del navegador.
 * - Bloquea copiar, cortar, seleccionar, arrastrar, clic derecho, imprimir/guardar y los atajos de herramientas de
 *   desarrollador. Al detectar Imprimir Pantalla borra el portapapeles y tapa la pantalla un momento.
 * - Vela el contenido cuando la ventana pierde el foco o se abren las herramientas de desarrollador (dificulta las
 *   capturas con otras aplicaciones).
 * - Registra en la bitácora cada pantalla que abre y cada intento de captura, impresión o copia.
 * - Muestra cuánto falta para que termine el acceso y cierra la sesión al llegar la hora (antes confirma con el
 *   servidor, por si el horario se extendió).
 *
 * Nada de esto impide una foto con otro dispositivo: por eso la marca de agua lleva la identidad de quien mira.
 */
import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { post, renovar, ultimaRenovacion } from '../api/cliente';
import type { Usuario } from '../api/tipos';
import { useAuth } from '../app/auth';
import { router } from '../app/router';

type Presentacion = { nombre: string; correo: string; empresa: string; desde: string; hasta: string; solo_lectura: boolean };

const ID_MARCA = 'marca-presentacion';
const ID_VELO = 'velo-presentacion';

function svgMarca(p: Presentacion, momento: string) {
  const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  const lineas = [`CONFIDENCIAL · PROPIEDAD DE ${p.empresa.toUpperCase()}`, `${p.nombre} · ${p.correo}`, momento];
  const texto = lineas.map((l, i) => `<text x="0" y="${i * 22}" font-family="Arial, sans-serif" font-size="${i === 0 ? 15 : 14}" font-weight="${i === 0 ? 700 : 600}">${esc(l)}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="230"><g transform="translate(24 150) rotate(-24)" fill="rgb(120,132,148)" fill-opacity="0.24">${texto}</g></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

function aplicarMarca(p: Presentacion) {
  const momento = new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  let el = document.getElementById(ID_MARCA);
  if (!el) {
    el = document.createElement('div');
    el.id = ID_MARCA;
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  // Estilos en línea con !important: no dependen de una hoja que se pueda desactivar.
  el.setAttribute('style', [
    'position:fixed !important', 'inset:0 !important', 'z-index:2147483646 !important', 'pointer-events:none !important',
    'display:block !important', 'visibility:visible !important', 'opacity:1 !important', 'mix-blend-mode:normal !important',
    `background-image:${svgMarca(p, momento)} !important`, 'background-repeat:repeat !important', 'filter:none !important',
  ].join(';'));
}

function avisar(tipo: string, detalle = '') {
  void post('/presentacion/evento', { tipo, detalle }).catch(() => undefined);
}

function velar(motivo: string, ms?: number) {
  document.documentElement.classList.add('presentacion-velada');
  let v = document.getElementById(ID_VELO);
  if (!v) {
    v = document.createElement('div');
    v.id = ID_VELO;
    document.body.appendChild(v);
  }
  v.textContent = motivo;
  if (ms) window.setTimeout(desvelar, ms);
}
function desvelar() {
  document.documentElement.classList.remove('presentacion-velada');
  document.getElementById(ID_VELO)?.remove();
}

export default function ModoPresentacion() {
  const { usuario, salir, actualizarCuenta } = useAuth();
  const p: Presentacion | null = usuario?.presentacion ?? null;
  const [restante, setRestante] = useState('');

  useEffect(() => {
    if (!p) return;
    const html = document.documentElement;
    html.classList.add('modo-presentacion');
    aplicarMarca(p);

    // La marca se repone si la quitan, la ocultan o le cambian el estilo; y se actualiza la hora cada minuto.
    const vigilante = new MutationObserver(() => {
      const el = document.getElementById(ID_MARCA);
      if (!el || !el.getAttribute('style')?.includes('2147483646')) aplicarMarca(p);
      if (!html.classList.contains('modo-presentacion')) html.classList.add('modo-presentacion');
    });
    vigilante.observe(document.body, { childList: true, attributes: true, subtree: false, attributeFilter: ['style', 'class'] });
    vigilante.observe(html, { attributes: true, attributeFilter: ['class', 'style'] });
    let verificando = false;
    const reloj = window.setInterval(() => {
      aplicarMarca(p);
      // Si se extendió el horario (presentacion-ajustar), la siguiente renovación del acceso lo trae: se adopta.
      const renovada = ultimaRenovacion?.cuenta as Usuario | undefined;
      const nueva = renovada?.presentacion;
      if (renovada && nueva && nueva.correo === p.correo && new Date(nueva.hasta) > new Date(p.hasta)) {
        actualizarCuenta(renovada);
        return;
      }
      const ms = new Date(p.hasta).getTime() - Date.now();
      if (ms <= 0) {
        // Antes de cerrar se pregunta al servidor: el horario pudo extenderse. Si ya terminó, se cierra la sesión.
        if (!verificando) {
          verificando = true;
          void renovar().then((ok) => {
            const c = ok ? (ultimaRenovacion?.cuenta as Usuario | undefined) : undefined;
            if (c?.presentacion && new Date(c.presentacion.hasta).getTime() > Date.now()) actualizarCuenta(c);
            else void salir();
          }).finally(() => { verificando = false; });
        }
        return;
      }
      const min = Math.ceil(ms / 60000);
      setRestante(min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);
      // Herramientas de desarrollador abiertas (el área visible se reduce mucho respecto a la ventana).
      const abiertas = window.outerWidth - window.innerWidth > 200 || window.outerHeight - window.innerHeight > 240;
      if (abiertas && !html.classList.contains('presentacion-velada')) { velar('Cierra las herramientas del navegador para continuar.'); avisar('herramientas'); }
      else if (!abiertas && document.getElementById(ID_VELO)?.textContent?.startsWith('Cierra las herramientas')) desvelar();
    }, 1500);

    const bloquear = (tipo: string) => (e: Event) => {
      const t = e.target as HTMLElement | null;
      const editable = t && (t.closest('input, textarea, [contenteditable="true"]'));
      if (tipo === 'copiar' || tipo === 'clic_derecho' || !editable) { e.preventDefault(); if (tipo !== 'seleccion') avisar(tipo); }
    };
    const alCopiar = bloquear('copiar');
    const alMenu = bloquear('clic_derecho');
    const alSeleccionar = bloquear('seleccion');
    const alArrastrar = (e: Event) => e.preventDefault();
    const alTeclear = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      const devtools = e.key === 'F12' || (ctrl && e.shiftKey && ['i', 'j', 'c', 'k'].includes(k)) || (ctrl && k === 'u');
      const imprimir = ctrl && (k === 'p' || k === 's');
      if (devtools || imprimir) {
        e.preventDefault(); e.stopPropagation();
        avisar(devtools ? 'herramientas' : k === 'p' ? 'imprimir' : 'guardar', `${ctrl ? 'Ctrl+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.key}`);
      }
      if (e.key === 'PrintScreen') { velar('Captura de pantalla no permitida.', 1500); void navigator.clipboard?.writeText?.('').catch(() => undefined); avisar('captura', 'Tecla Imprimir Pantalla'); }
    };
    const alSoltar = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') { void navigator.clipboard?.writeText?.('').catch(() => undefined); velar('Captura de pantalla no permitida.', 1500); avisar('captura', 'Tecla Imprimir Pantalla'); }
    };
    const alImprimir = () => avisar('imprimir', 'Menú del navegador');
    // Salir de la ventana (otra pestaña u otra aplicación, p. ej. para capturar con otro programa) se avisa al momento
    // y, al volver, cuánto tiempo estuvo fuera. Lo ve quien vigila en «Presentación en vivo».
    let salioEn = 0;
    const alSalir = () => {
      velar('La vista se oculta mientras la ventana no está activa.');
      if (!salioEn) { salioEn = Date.now(); avisar('fuera_de_ventana', 'Salió de la ventana'); }
    };
    const alVolver = () => {
      if (!document.getElementById(ID_VELO)?.textContent?.startsWith('Cierra las herramientas')) desvelar();
      if (salioEn) { avisar('fuera_de_ventana', `Volvió tras ${Math.round((Date.now() - salioEn) / 1000)} s`); salioEn = 0; }
    };
    const alCambiarVisibilidad = () => (document.visibilityState === 'hidden' ? alSalir() : alVolver());

    document.addEventListener('copy', alCopiar, true);
    document.addEventListener('cut', alCopiar, true);
    document.addEventListener('contextmenu', alMenu, true);
    document.addEventListener('selectstart', alSeleccionar, true);
    document.addEventListener('dragstart', alArrastrar, true);
    window.addEventListener('keydown', alTeclear, true);
    window.addEventListener('keyup', alSoltar, true);
    window.addEventListener('beforeprint', alImprimir);
    window.addEventListener('blur', alSalir);
    window.addEventListener('focus', alVolver);
    document.addEventListener('visibilitychange', alCambiarVisibilidad);

    // Bitácora: cada pantalla que abre.
    let ultima = '';
    const registrar = (ruta: string) => { if (ruta !== ultima) { ultima = ruta; void post('/presentacion/vista', { ruta }).catch(() => undefined); } };
    registrar(window.location.pathname + window.location.search);
    const dejar = router.subscribe((s) => registrar(s.location.pathname + s.location.search));

    return () => {
      vigilante.disconnect(); window.clearInterval(reloj); dejar();
      document.removeEventListener('copy', alCopiar, true); document.removeEventListener('cut', alCopiar, true);
      document.removeEventListener('contextmenu', alMenu, true); document.removeEventListener('selectstart', alSeleccionar, true);
      document.removeEventListener('dragstart', alArrastrar, true); window.removeEventListener('keydown', alTeclear, true);
      window.removeEventListener('keyup', alSoltar, true); window.removeEventListener('beforeprint', alImprimir);
      window.removeEventListener('blur', alSalir); window.removeEventListener('focus', alVolver);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      html.classList.remove('modo-presentacion'); desvelar(); document.getElementById(ID_MARCA)?.remove();
    };
  }, [p?.correo, p?.hasta]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) return null;
  return (
    <div className="pointer-events-none fixed bottom-3 left-3 z-[2147483647] flex items-center gap-2 rounded-full bg-[#0f2238]/90 px-3 py-1.5 text-[11px] font-semibold text-[#f2f5f9] shadow-lg backdrop-blur"
      role="status">
      <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
      Sesión de presentación confidencial{p.solo_lectura ? ' · solo consulta' : ''}{restante ? ` · termina en ${restante}` : ''}
    </div>
  );
}
