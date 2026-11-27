/**
 * Presentación en vivo: lo que hace la cuenta de presentación, al momento (se actualiza cada 2 s).
 *
 * - Estado: si está en línea con la pestaña visible, en qué pantalla está, desde qué dispositivo entró y cuánto falta.
 * - Actividad: cada pantalla que abre, sus acciones y decisiones, y los intentos de capturar, copiar o imprimir
 *   (resaltados y con aviso emergente al momento). Las consultas automáticas al servidor se muestran solo si se piden.
 * - Controles (quien gestiona usuarios): extender 30 min sin cambiar la contraseña y terminar la presentación ya.
 */
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AppWindow, Camera, CircleCheck, CircleHelp, CircleX, Copy, Eye, EyeOff, Gavel, Hourglass, LogIn, LogOut, Monitor,
  MousePointer2, MousePointerClick, OctagonAlert, Power, Printer, Save, Server, Settings2, ShieldAlert, Smartphone,
  SquareTerminal, TimerReset, Undo2,
} from 'lucide-react';
import { get, post } from '../../api/cliente';
import { useAuth } from '../../app/auth';
import { Boton, Cargando, Cifra, ErrorCaja, Modal, Tarjeta, Vacio, useAviso } from '../../components/ui';
import { cls } from '../../lib/formato';
import { Encabezado } from './AdminLayout';

export type FilaEnVivo = {
  clave: string; fecha: string; accion: string; entidad: string | null; entidad_id: number | null;
  detalle: Record<string, unknown> | null; ip: string | null; sistema: boolean;
};
export type EnVivo = {
  configurada: boolean; ahora: string;
  persona?: { nombre: string; correo: string; empresa: string; solo_lectura: boolean };
  cuenta_activa?: boolean;
  horario?: { desde: string; hasta: string };
  prueba?: { desde: string; hasta: string } | null;
  ventana?: { tipo: 'prueba' | 'acordada'; desde: string; hasta: string } | null;
  sesion?: { inicio: string | null; actividad_en: string | null; agente: string | null; ip: string | null } | null;
  ultimo_pulso?: string | null;
  conteos?: { pantallas: number; acciones: number; alertas: number; salidas: number; decisiones: number };
  conteo_desde?: string | null;
  actividad?: FilaEnVivo[];
  folios?: Record<string, string>;
};

type Tipo = 'pantalla' | 'accion' | 'alerta' | 'consulta' | 'sistema';
type Tono = 'verde' | 'ambar' | 'coral' | 'neutro';
type Linea = { clave: string; fecha: string; tipo: Tipo; tono: Tono; icono: ReactNode; texto: string; sub?: string; prueba: boolean };
type Folios = Record<string, string>;

const TONO: Record<Tono, string> = {
  verde: 'bg-menta-50 text-menta-700', ambar: 'bg-amber-50 text-amber-700', coral: 'bg-coral-50 text-coral-700',
  neutro: 'bg-tinta-50 text-tinta-600',
};
const PUNTO: Record<Tono, string> = { verde: 'bg-menta-500', ambar: 'bg-amber-500', coral: 'bg-coral-500', neutro: 'bg-tinta-300' };
const I = 'h-4 w-4';
const SIN_PULSO_MS = 8000; // la pestaña visible manda un pulso cada 2 s

// ---------------------------------------------------------------- formato
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
const horaSeg = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
function dia(iso: string, ahora: number) {
  const d = new Date(iso).toDateString();
  if (d === new Date(ahora).toDateString()) return 'Hoy';
  if (d === new Date(ahora + 86_400_000).toDateString()) return 'Mañana';
  return new Date(iso).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
}
const rango = (a: string, b: string, ahora: number) => `${dia(a, ahora)}, ${hora(a)} a ${hora(b)}`;
function duracion(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
}
function hace(ms: number) {
  if (ms < 5000) return 'ahora mismo';
  if (ms < 60_000) return `hace ${Math.round(ms / 1000)} s`;
  if (ms < 3_600_000) return `hace ${Math.round(ms / 60_000)} min`;
  return `hace ${Math.floor(ms / 3_600_000)} h`;
}

/** «Chrome en Windows», «Safari en iPhone»… a partir del agente del navegador. */
export function dispositivo(ua?: string | null) {
  if (!ua) return null;
  const nav = /Edg(e|A|iOS)?\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /CriOS|Chrome\//.test(ua) ? 'Chrome'
    : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const so = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : null;
  return { texto: so ? `${nav} en ${so}` : nav, movil: /iPhone|iPad|Android/.test(ua) };
}

// ---------------------------------------------------------------- qué hizo, en palabras
const PANTALLAS: [RegExp, string, string][] = [
  [/^\/aprobador\/?$/, 'Inicio', 'el inicio'],
  [/^\/aprobador\/solicitudes/, 'Solicitudes por revisar', 'las solicitudes por revisar'],
  [/^\/aprobador\/seguimiento/, 'Seguimiento de solicitudes', 'el seguimiento de solicitudes'],
  [/^\/aprobador\/sucursales-cliente\/\d+/, 'Detalle de una sucursal', 'el detalle de una sucursal'],
  [/^\/aprobador\/sucursales-cliente/, 'Sucursales', 'las sucursales'],
  [/^\/aprobador\/organizacion/, 'Divisiones y zonas', 'las divisiones y zonas'],
  [/^\/aprobador\/permisos/, 'Permisos de padrón', 'los permisos de padrón'],
  [/^\/aprobador\/mensajes/, 'Mensajes', 'los mensajes'],
  [/^\/aprobador\/notificaciones/, 'Notificaciones', 'las notificaciones'],
  [/^\/aprobador\/perfil/, 'Su perfil', 'su perfil'],
];
const folio = (folios: Folios, id: unknown) => (id != null && folios[String(id)]) || `#${String(id ?? '')}`;

export function pantalla(ruta: string, folios: Folios, conArticulo = false) {
  const [camino, query = ''] = ruta.split('?');
  const ver = new URLSearchParams(query).get('ver');
  const extra = ver ? ` (${ver.replace(/[-_]/g, ' ')})` : '';
  const m = camino.match(/^\/aprobador\/pedidos\/(\d+)/);
  if (m) return `${conArticulo ? 'la solicitud' : 'Solicitud'} ${folio(folios, m[1])}${extra}`;
  const p = PANTALLAS.find(([re]) => re.test(camino));
  return (p ? (conArticulo ? p[2] : p[1]) : camino) + extra;
}

function objetoConsultado(ruta: string, folios: Folios) {
  const camino = ruta.split('?')[0];
  const m = camino.match(/\/pedidos\/(\d+)/);
  if (m) return `la solicitud ${folio(folios, m[1])}`;
  if (/\/pedidos|\/solicitudes/.test(camino)) return 'la lista de solicitudes';
  if (/seguimiento|tablero/.test(camino)) return 'el seguimiento';
  if (/notificaciones/.test(camino)) return 'sus notificaciones';
  if (/conversaciones|mensajes|chat/.test(camino)) return 'los mensajes';
  if (/permisos/.test(camino)) return 'los permisos de padrón';
  if (/sucursales|clientes|organizacion|divisiones|zonas/.test(camino)) return 'las sucursales';
  return camino.replace(/^\/api/, '');
}

function describirPeticion(d: Record<string, unknown>, folios: Folios): Omit<Linea, 'clave' | 'fecha' | 'prueba'> | null {
  const metodo = String(d.metodo ?? 'GET');
  const ruta = String(d.ruta ?? '');
  const estado = Number(d.estado ?? 0);
  const rechazo = estado >= 400 ? `El sistema no lo permitió (código ${estado})` : undefined;
  if (metodo === 'GET') {
    return { tipo: 'consulta', tono: 'neutro', icono: <Server className={I} />, texto: `Consultó ${objetoConsultado(ruta, folios)}`, sub: rechazo ?? ruta };
  }
  const camino = ruta.split('?')[0];
  if (camino.startsWith('/api/auth/')) {
    // Entrar ya aparece como «Entró al sistema»; salir sí se muestra.
    return /logout/.test(camino) ? { tipo: 'sistema', tono: 'neutro', icono: <LogOut className={I} />, texto: 'Cerró sesión' } : null;
  }
  const enPedido = camino.match(/\/pedidos\/(\d+)/);
  if (/\/decision$/.test(camino)) {
    if (!rechazo) return null; // la decisión aparece aparte, con su resultado
    return { tipo: 'accion', tono: 'ambar', icono: <Gavel className={I} />, texto: `Intentó decidir sobre la solicitud ${folio(folios, enPedido?.[1])}`, sub: rechazo };
  }
  let texto = `${metodo} ${camino.replace(/^\/api/, '')}`;
  if (/mensajes|conversaciones/.test(camino) && metodo === 'POST') texto = 'Envió un mensaje';
  else if (/password|contrasena/.test(camino)) texto = 'Cambió su contraseña';
  else if (/perfil|\/auth\/cuenta/.test(camino)) texto = 'Editó su perfil';
  else if (/notificaciones/.test(camino)) texto = 'Marcó notificaciones como leídas';
  else if (enPedido) texto = `Modificó la solicitud ${folio(folios, enPedido[1])}`;
  return { tipo: 'accion', tono: rechazo ? 'ambar' : 'verde', icono: <MousePointerClick className={I} />, texto, sub: rechazo ?? `${metodo} ${camino}` };
}

const EVENTOS: Record<string, [string, Tono, ReactNode]> = {
  captura: ['Intentó tomar una captura de pantalla', 'coral', <Camera className={I} />],
  imprimir: ['Intentó imprimir', 'coral', <Printer className={I} />],
  guardar: ['Intentó guardar la página', 'coral', <Save className={I} />],
  copiar: ['Intentó copiar contenido', 'coral', <Copy className={I} />],
  herramientas: ['Intentó abrir las herramientas del navegador', 'coral', <SquareTerminal className={I} />],
  clic_derecho: ['Usó el clic derecho (bloqueado)', 'ambar', <MousePointer2 className={I} />],
  otro: ['Evento no reconocido', 'ambar', <CircleHelp className={I} />],
};

export function describir(f: FilaEnVivo, folios: Folios): Linea | null {
  const d = (f.detalle ?? {}) as Record<string, any>;
  const base = { clave: f.clave, fecha: f.fecha, prueba: d.prueba === true && !f.sistema };
  const conEquipo = () => [dispositivo(d.agente)?.texto, f.ip && `IP ${f.ip}`].filter(Boolean).join(' · ') || undefined;

  if (f.sistema) {
    const pruebaVigente = d.prueba?.hasta && Date.parse(d.prueba.hasta) > Date.parse(f.fecha);
    const textos: Record<string, [string, string | undefined]> = {
      'presentacion.crear': ['Se creó la presentación', undefined],
      'presentacion.ajustar': ['Se ajustó la presentación', undefined],
      'presentacion.prueba': d.prueba ? ['Se abrió una ventana de pruebas', `Hasta las ${hora(d.prueba.hasta)}`] : ['Terminó la ventana de pruebas', undefined],
      'presentacion.extender': ['Se extendió el horario', `Ahora termina a las ${hora(pruebaVigente ? d.prueba.hasta : d.hasta)}`],
      'presentacion.cerrar': ['Se terminó la presentación', 'La cuenta quedó desactivada'],
    };
    const [texto, sub] = textos[f.accion] ?? [f.accion, undefined];
    return { ...base, tipo: 'sistema', tono: f.accion === 'presentacion.cerrar' ? 'coral' : 'neutro', icono: <Settings2 className={I} />, texto, sub };
  }
  if (f.accion === 'presentacion.entrada') {
    return { ...base, tipo: 'sistema', tono: 'verde', icono: <LogIn className={I} />, texto: 'Entró al sistema', sub: conEquipo() };
  }
  if (f.accion === 'presentacion.intento_fuera_de_horario') {
    return { ...base, tipo: 'alerta', tono: 'coral', icono: <Hourglass className={I} />, texto: 'Intentó entrar fuera del horario', sub: conEquipo() };
  }
  if (f.accion === 'presentacion.vista') {
    const ruta = String(d.ruta ?? '');
    const camino = ruta.split('?')[0];
    if (camino === '' || camino === '/' || /^\/(entrar|cuenta)(\/|$)/.test(camino)) return null; // pasos automáticos al entrar
    if (/^\/admin(\/|$)/.test(camino)) {
      return { ...base, tipo: 'alerta', tono: 'ambar', icono: <ShieldAlert className={I} />, texto: 'Intentó abrir el panel de la distribuidora', sub: ruta };
    }
    return { ...base, tipo: 'pantalla', tono: 'neutro', icono: <AppWindow className={I} />, texto: `Abrió ${pantalla(ruta, folios, true)}` };
  }
  if (f.accion === 'presentacion.decision') {
    const fo = folio(folios, f.entidad_id);
    const [texto, tono, icono]: [string, Tono, ReactNode] = d.decision === 'aprobado' ? [`Aprobó la solicitud ${fo}`, 'verde', <CircleCheck className={I} />]
      : d.decision === 'rechazado' ? [`Rechazó la solicitud ${fo}`, 'coral', <CircleX className={I} />]
        : [`Devolvió la solicitud ${fo} para cambios`, 'ambar', <Undo2 className={I} />];
    return { ...base, tipo: 'accion', tono, icono, texto, sub: d.motivo ? `Motivo: ${d.motivo}` : undefined };
  }
  if (f.accion.startsWith('presentacion.evento.')) {
    const evento = f.accion.slice('presentacion.evento.'.length);
    const det = String(d.detalle ?? '');
    if (evento === 'fuera_de_ventana') {
      const segundos = det.match(/(\d+) s/);
      return det.startsWith('Volvió')
        ? { ...base, tipo: 'alerta', tono: 'neutro', icono: <Eye className={I} />, texto: `Regresó al sistema${segundos ? ` tras ${duracion(Number(segundos[1]) * 1000)} fuera` : ''}` }
        : { ...base, tipo: 'alerta', tono: 'ambar', icono: <EyeOff className={I} />, texto: 'Salió de la ventana del sistema', sub: 'Cambió de pestaña o de aplicación' };
    }
    const [texto, tono, icono] = EVENTOS[evento] ?? EVENTOS.otro;
    return { ...base, tipo: 'alerta', tono, icono, texto, sub: det || undefined };
  }
  if (f.accion === 'presentacion.peticion') {
    const r = describirPeticion(d, folios);
    return r && { ...base, ...r };
  }
  if (!f.accion.startsWith('presentacion.')) {
    if (f.accion === 'pedido.aprobado') return null; // ya aparece como decisión
    const sobre = f.entidad === 'pedido' ? `solicitud ${folio(folios, f.entidad_id)}` : f.entidad ? `${f.entidad} #${f.entidad_id ?? ''}` : undefined;
    return { ...base, tipo: 'accion', tono: 'neutro', icono: <MousePointerClick className={I} />, texto: `Registro: ${f.accion}`, sub: sobre };
  }
  return { ...base, tipo: 'sistema', tono: 'neutro', icono: <Activity className={I} />, texto: f.accion };
}

// ---------------------------------------------------------------- pantalla
const FILTROS: [Exclude<Tipo, 'consulta' | 'sistema'> | 'todo', string][] = [
  ['todo', 'Todo'], ['pantalla', 'Pantallas'], ['accion', 'Acciones'], ['alerta', 'Alertas'],
];
const MAX_FILAS = 200;

function Pastilla({ tono, children }: { tono: Tono; children: ReactNode }) {
  return <span className={cls('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', TONO[tono])}>
    <span className={cls('h-1.5 w-1.5 rounded-full', PUNTO[tono])} />{children}</span>;
}

function Dato({ etiqueta, children, sub }: { etiqueta: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-tinta-400">{etiqueta}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold text-tinta-900">{children}</dd>
      {sub && <dd className="truncate text-xs text-tinta-500">{sub}</dd>}
    </div>
  );
}

export default function PresentacionEnVivo() {
  const aviso = useAviso();
  const qc = useQueryClient();
  const { puede } = useAuth();
  const q = useQuery({ queryKey: ['presentacion-en-vivo'], queryFn: () => get<EnVivo>('/admin/presentacion/en-vivo'), refetchInterval: 2000 });
  const d = q.data;

  // Reloj de la pantalla (cada segundo) alineado con la hora del servidor.
  const [, setTic] = useState(0);
  useEffect(() => { const id = window.setInterval(() => setTic((t) => t + 1), 1000); return () => window.clearInterval(id); }, []);
  const desfase = useRef(0);
  useEffect(() => { if (d?.ahora) desfase.current = Date.now() - Date.parse(d.ahora); }, [d?.ahora]);
  const ahora = Date.now() - desfase.current;

  const folios = d?.folios ?? {};
  const lineas = useMemo(() => (d?.actividad ?? []).map((f) => describir(f, d?.folios ?? {})).filter((l): l is Linea => !!l), [d?.actividad, d?.folios]);

  // Aviso emergente al momento: alertas graves y decisiones (solo lo nuevo, no lo que ya estaba al abrir la pantalla).
  const vistas = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!d?.actividad) return;
    if (!vistas.current) { vistas.current = new Set(d.actividad.map((f) => f.clave)); return; }
    for (const f of [...d.actividad].reverse()) {
      if (vistas.current.has(f.clave)) continue;
      vistas.current.add(f.clave);
      const l = describir(f, d.folios ?? {});
      if (l && l.tipo === 'alerta' && l.tono === 'coral') aviso(l.texto, 'error');
      else if (l && f.accion === 'presentacion.decision') aviso(l.texto);
    }
  }, [d?.actividad]); // eslint-disable-line react-hooks/exhaustive-deps

  const [filtro, setFiltro] = useState<(typeof FILTROS)[number][0]>('todo');
  const [consultas, setConsultas] = useState(false);
  const visibles = lineas.filter((l) => (l.tipo === 'consulta' ? consultas && filtro === 'todo' : filtro === 'todo' || l.tipo === filtro));

  const extender = useMutation({
    mutationFn: () => post<{ hasta: string | null }>('/admin/presentacion/extender', { minutos: 30 }),
    onSuccess: (r) => { aviso(r.hasta ? `Listo: ahora termina a las ${hora(r.hasta)}` : 'Horario extendido'); void qc.invalidateQueries({ queryKey: ['presentacion-en-vivo'] }); },
    onError: (e) => aviso((e as Error).message || 'No se pudo extender', 'error'),
  });
  const [confirmar, setConfirmar] = useState(false);
  const terminar = useMutation({
    mutationFn: () => post('/admin/presentacion/cerrar', {}),
    onSuccess: () => { setConfirmar(false); aviso('Presentación terminada: salió de todos sus dispositivos.'); void qc.invalidateQueries({ queryKey: ['presentacion-en-vivo'] }); },
    onError: (e) => aviso((e as Error).message || 'No se pudo terminar', 'error'),
  });

  const enVivo = (
    <span className={cls('inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-tinta-100', q.isError ? TONO.ambar : 'bg-white text-tinta-600')}>
      <span className="relative flex h-2 w-2">
        {!q.isError && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-menta-500 opacity-60" />}
        <span className={cls('relative inline-flex h-2 w-2 rounded-full', q.isError ? 'bg-amber-500' : 'bg-menta-500')} />
      </span>
      {q.isError ? 'Sin conexión, reintentando…' : `En vivo · ${q.dataUpdatedAt ? hace(Date.now() - q.dataUpdatedAt) : 'conectando'}`}
    </span>
  );
  const encabezado = <Encabezado titulo="Presentación en vivo" sub="Todo lo que hace la cuenta de presentación, al momento">{d?.configurada && enVivo}</Encabezado>;

  if (q.isLoading) return <>{encabezado}<Cargando forma="pagina" /></>;
  if (!d) return <>{encabezado}<ErrorCaja error={q.error} /></>;
  if (!d.configurada || !d.persona || !d.horario) {
    return <>{encabezado}<Tarjeta><Vacio titulo="No hay ninguna presentación configurada" texto="Cuando se cree una cuenta de presentación, aquí verás en tiempo real todo lo que hace." /></Tarjeta></>;
  }

  const p = d.persona;
  const pulsoMs = d.ultimo_pulso ? ahora - Date.parse(d.ultimo_pulso) : Infinity;
  const estado: { tono: Tono; texto: string; sub: string } = !d.cuenta_activa
    ? { tono: 'neutro', texto: 'Presentación terminada', sub: 'La cuenta está desactivada.' }
    : d.sesion && pulsoMs < SIN_PULSO_MS
      ? { tono: 'verde', texto: 'En línea, viendo el sistema', sub: d.sesion.actividad_en ? `Última interacción ${hace(ahora - Date.parse(d.sesion.actividad_en))}` : 'Con la pestaña visible' }
      : d.sesion
        ? { tono: 'ambar', texto: 'Sesión abierta, pero sin ver el sistema', sub: d.ultimo_pulso ? `Pestaña oculta, en otra ventana o cerrada · última señal ${hace(pulsoMs)}` : 'Aún sin señal de su pestaña' }
        : { tono: 'neutro', texto: 'Sin sesión abierta', sub: d.ventana ? 'Puede entrar en cualquier momento.' : 'Fuera de horario: no puede entrar.' };
  const v = d.ventana;
  const [etiquetaVentana, tonoVentana]: [string, Tono] = !d.cuenta_activa ? ['Cerrada', 'neutro'] : v?.tipo === 'prueba' ? ['Ventana de pruebas', 'ambar']
    : v ? ['En horario', 'verde'] : Date.parse(d.horario.desde) > ahora ? ['Aún no empieza', 'neutro'] : ['Horario terminado', 'neutro'];
  const ultimaVista = (d.actividad ?? []).find((f) => f.accion === 'presentacion.vista' && describir(f, folios)?.tipo === 'pantalla');
  const equipo = dispositivo(d.sesion?.agente);
  const iniciales = p.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
  const c = d.conteos ?? { pantallas: 0, acciones: 0, alertas: 0, salidas: 0, decisiones: 0 };
  const desde = d.conteo_desde ? `Desde las ${hora(d.conteo_desde)}` : undefined;
  const sePuedeExtender = !!v || Date.parse(d.horario.desde) <= ahora;

  return (
    <>
      {encabezado}
      <Tarjeta className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-lurima-900 font-display text-lg font-extrabold text-white">{iniciales}</span>
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-extrabold text-tinta-900">{p.nombre}</p>
              <p className="truncate text-sm text-tinta-500">{p.correo}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pastilla tono={tonoVentana}>{etiquetaVentana}</Pastilla>
            <Pastilla tono="neutro">{p.solo_lectura ? 'Solo consulta' : 'Puede aprobar'}</Pastilla>
          </div>
        </div>

        <div className={cls('mt-4 flex items-start gap-3 rounded-2xl p-3', TONO[estado.tono])} role="status">
          <span className="relative mt-1.5 flex h-2.5 w-2.5 shrink-0">
            {estado.tono === 'verde' && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-menta-500 opacity-60" />}
            <span className={cls('relative inline-flex h-2.5 w-2.5 rounded-full', PUNTO[estado.tono])} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold">{estado.texto}</p>
            <p className="text-xs opacity-80">{estado.sub}</p>
          </div>
        </div>

        <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Dato etiqueta="Pantalla actual" sub={ultimaVista ? hace(ahora - Date.parse(ultimaVista.fecha)) : undefined}>
            {ultimaVista ? pantalla(String((ultimaVista.detalle as any)?.ruta ?? ''), folios) : 'Todavía no abre ninguna'}
          </Dato>
          <Dato etiqueta="Dispositivo" sub={d.sesion?.ip ? `IP ${d.sesion.ip}` : undefined}>
            <span className="inline-flex items-center gap-1.5">
              {equipo ? (equipo.movil ? <Smartphone className="h-4 w-4 text-tinta-400" /> : <Monitor className="h-4 w-4 text-tinta-400" />) : null}
              {equipo?.texto ?? 'Sin sesión'}
            </span>
          </Dato>
          <Dato etiqueta="Sesión iniciada" sub={d.sesion?.inicio ? hace(ahora - Date.parse(d.sesion.inicio)) : undefined}>
            {d.sesion?.inicio ? hora(d.sesion.inicio) : '—'}
          </Dato>
          <Dato etiqueta={v ? (v.tipo === 'prueba' ? 'Ventana de pruebas' : 'Horario') : 'Horario acordado'}
            sub={v ? `Faltan ${duracion(Date.parse(v.hasta) - ahora)}` : undefined}>
            {v ? rango(v.desde, v.hasta, ahora) : rango(d.horario.desde, d.horario.hasta, ahora)}
          </Dato>
        </dl>

        {puede('usuario.gestionar') && d.cuenta_activa && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-tinta-100 pt-4">
            <Boton variante="secundario" tam="sm" icono={<TimerReset className="h-4 w-4" />} cargando={extender.isPending}
              disabled={!sePuedeExtender} title={sePuedeExtender ? undefined : 'La presentación todavía no empieza'} onClick={() => extender.mutate()}>
              Extender 30 min
            </Boton>
            <Boton variante="peligro" tam="sm" icono={<Power className="h-4 w-4" />} onClick={() => setConfirmar(true)}>Terminar presentación</Boton>
          </div>
        )}
      </Tarjeta>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra etiqueta="Pantallas vistas" valor={c.pantallas} detalle={desde} icono={<AppWindow className={I} />} />
        <Cifra etiqueta="Acciones" valor={c.acciones} detalle={desde} icono={<MousePointerClick className={I} />} />
        <Cifra etiqueta="Decisiones" valor={c.decisiones} detalle="Aprobar, rechazar o devolver" icono={<Gavel className={I} />} acento={c.decisiones ? TONO.verde : undefined} />
        <Cifra etiqueta="Alertas" valor={c.alertas} detalle={`${c.salidas} ${c.salidas === 1 ? 'salida' : 'salidas'} de la ventana`} icono={<OctagonAlert className={I} />}
          acento={c.alertas ? TONO.coral : c.salidas ? TONO.ambar : undefined} />
      </div>

      <Tarjeta titulo="Actividad" sub="Lo más reciente arriba">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar actividad">
            {FILTROS.map(([k, et]) => (
              <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(k)}
                className={cls('rounded-full px-3 py-1 text-xs font-semibold ring-1 transition', filtro === k ? 'bg-tinta-900 text-white ring-tinta-900' : 'bg-white text-tinta-600 ring-tinta-200 hover:bg-tinta-50')}>
                {et}
              </button>
            ))}
          </div>
          <label className={cls('inline-flex items-center gap-2 text-xs font-medium text-tinta-600', filtro !== 'todo' && 'opacity-50')}>
            <input type="checkbox" className="h-4 w-4 rounded border-tinta-300" checked={consultas} disabled={filtro !== 'todo'}
              onChange={(e) => setConsultas(e.target.checked)} />
            Mostrar consultas al servidor
          </label>
        </div>
        {visibles.length === 0 ? (
          <Vacio titulo={lineas.length ? 'Nada con este filtro' : 'Sin actividad todavía'}
            texto={lineas.length ? 'Prueba con «Todo».' : 'En cuanto entre, aquí aparecerá cada pantalla que abra.'} />
        ) : (
          <ol className="divide-y divide-tinta-100">
            {visibles.slice(0, MAX_FILAS).map((l) => {
              const nueva = ahora - Date.parse(l.fecha) < 6000;
              return (
                <li key={l.clave} className={cls('-mx-2 flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors', nueva && (l.tono === 'coral' ? 'bg-coral-50' : 'bg-menta-50'))}>
                  <span className={cls('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl', TONO[l.tono])}>{l.icono}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-tinta-900">
                      {l.texto}
                      {l.prueba && <span className="ml-2 rounded-full bg-tinta-50 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-tinta-500">prueba</span>}
                    </p>
                    {l.sub && <p className="truncate text-xs text-tinta-500">{l.sub}</p>}
                  </div>
                  <time className="shrink-0 pt-0.5 text-xs tabular-nums text-tinta-400" dateTime={l.fecha}
                    title={new Date(l.fecha).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'medium' })}>
                    {dia(l.fecha, ahora) === 'Hoy' ? horaSeg(l.fecha) : `${dia(l.fecha, ahora)} ${hora(l.fecha)}`}
                  </time>
                </li>
              );
            })}
          </ol>
        )}
        {visibles.length > MAX_FILAS && <p className="mt-3 text-center text-xs text-tinta-400">Se muestran los {MAX_FILAS} registros más recientes.</p>}
      </Tarjeta>

      <Modal abierto={confirmar} titulo="¿Terminar la presentación ahora?" onCerrar={() => setConfirmar(false)}
        pie={<>
          <Boton variante="secundario" onClick={() => setConfirmar(false)}>Cancelar</Boton>
          <Boton variante="peligro" icono={<Power className="h-4 w-4" />} cargando={terminar.isPending} onClick={() => terminar.mutate()}>Terminar ahora</Boton>
        </>}>
        <p className="text-sm text-tinta-600">
          {p.nombre} saldrá de inmediato de todos sus dispositivos y la cuenta quedará desactivada. Para volver a usarla habría
          que generar una contraseña nueva.
        </p>
      </Modal>
    </>
  );
}
