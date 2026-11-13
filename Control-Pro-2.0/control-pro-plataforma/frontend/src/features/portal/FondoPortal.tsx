/**
 * Fondo animado del portal de sucursales: degradado menta/azul, esferas de luz, grano, íconos médicos que derivan y
 * partículas conectadas. Todo es decorativo (aria-hidden) y no recibe clics.
 * Con "reducir movimiento" o sin matchMedia (pruebas) las partículas no se animan; la regla global de index.css
 * detiene también las animaciones CSS. El lienzo se pausa cuando la pestaña no está visible.
 */
import { useEffect, useRef } from 'react';

const ESFERAS = [
  { color: '#43d9a7', pos: { top: '-23%', left: '-12%' }, dur: '18s', retraso: '0s' },
  { color: '#70b8e7', pos: { right: '-18%', top: '18%' }, dur: '23s', retraso: '-7s' },
  { color: '#6ce4c2', pos: { bottom: '-34%', left: '28%' }, dur: '20s', retraso: '-4s' },
];

const ICONOS: [string, React.CSSProperties, string, string][] = [
  ['🧪', { left: '4%', top: '17%' }, '19s', '0s'], ['🩺', { left: '28%', top: '7%' }, '23s', '-8s'],
  ['🧤', { left: '49%', top: '22%' }, '21s', '-4s'], ['💉', { right: '5%', top: '28%' }, '18s', '-11s'],
  ['🧫', { left: '12%', top: '69%' }, '22s', '-6s'], ['🩹', { left: '40%', top: '82%' }, '20s', '-13s'],
  ['⚕', { right: '27%', top: '12%' }, '24s', '-2s'], ['🧴', { right: '8%', top: '76%' }, '19s', '-9s'],
  ['🧪', { left: '67%', top: '68%' }, '26s', '-15s'], ['🩺', { left: '2%', top: '43%' }, '22s', '-5s'],
];

const GRANO = "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.2'/%3E%3C/svg%3E\")";

type Particula = { x: number; y: number; r: number; vx: number; vy: number; a: number };

function Particulas() {
  const lienzo = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = lienzo.current;
    if (!canvas || typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 0, h = 0, cuadro = 0, particulas: Particula[] = [];
    const ajustar = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particulas = Array.from({ length: Math.min(65, Math.floor((w * h) / 22000)) }, () => ({
        x: Math.random() * w, y: Math.random() * h, r: Math.random() * 2 + 0.6, vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22, a: Math.random() * 0.35 + 0.1,
      }));
    };
    const dibujar = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of particulas) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10; if (p.y < -10) p.y = h + 10; if (p.y > h + 10) p.y = -10;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = `rgba(255,255,255,${p.a})`; ctx.fill();
      }
      for (let i = 0; i < particulas.length; i++) {
        for (let j = i + 1; j < particulas.length; j++) {
          const a = particulas[i], b = particulas[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 115) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = `rgba(255,255,255,${0.075 * (1 - d / 115)})`; ctx.lineWidth = 0.7; ctx.stroke(); }
        }
      }
      cuadro = requestAnimationFrame(dibujar);
    };
    const visibilidad = () => { cancelAnimationFrame(cuadro); if (!document.hidden) cuadro = requestAnimationFrame(dibujar); };
    ajustar(); cuadro = requestAnimationFrame(dibujar);
    window.addEventListener('resize', ajustar);
    document.addEventListener('visibilitychange', visibilidad);
    return () => { cancelAnimationFrame(cuadro); window.removeEventListener('resize', ajustar); document.removeEventListener('visibilitychange', visibilidad); };
  }, []);
  return <canvas ref={lienzo} className="absolute inset-0 h-full w-full" />;
}

export default function FondoPortal() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,#e9f1f5,#a8d8ca_40%,#d6e9f4_72%,#b9eadb)]" />
      <Particulas />
      {ESFERAS.map((e) => (
        <div key={e.color} className="absolute h-[55vw] max-h-[760px] w-[55vw] max-w-[760px] animate-flotar rounded-full opacity-[.48] blur-[75px]"
          style={{ ...e.pos, background: `radial-gradient(circle, ${e.color}, transparent 68%)`, animationDuration: e.dur, animationDelay: e.retraso }} />
      ))}
      <div className="absolute inset-0 opacity-[.12]" style={{ backgroundImage: GRANO }} />
      <div className="absolute inset-0 [perspective:900px]">
        {ICONOS.map(([icono, pos, dur, retraso], i) => (
          <span key={i} className="absolute grid h-[58px] w-[58px] animate-deriva place-items-center rounded-[19px] border border-white/55 bg-gradient-to-br from-white/40 to-white/10 text-[27px] opacity-30 shadow-[0_12px_32px_rgba(30,105,91,.10),inset_0_1px_0_rgba(255,255,255,.55)] saturate-[.82] backdrop-blur-[7px]"
            style={{ ...pos, animationDuration: dur, animationDelay: retraso }}>{icono}</span>
        ))}
      </div>
    </div>
  );
}
