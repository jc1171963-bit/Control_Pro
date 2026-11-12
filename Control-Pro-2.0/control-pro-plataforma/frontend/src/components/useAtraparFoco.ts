import { RefObject, useEffect, useRef } from 'react';

const FOCALIZABLES = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Mientras `activo`, mantiene el foco del teclado dentro de `ref` (Tab y Mayús+Tab dan la vuelta), cierra con Escape y,
 * al terminar, devuelve el foco a `devolverA` (o, si no se indica, al elemento que lo tenía antes). Safari no enfoca un botón
 * al hacer clic, por eso conviene indicar el destino. Pensado para paneles tipo drawer.
 */
export function useAtraparFoco(ref: RefObject<HTMLElement>, activo: boolean, onCerrar: () => void, devolverA?: RefObject<HTMLElement>) {
  // El callback puede cambiar en cada render sin reiniciar el efecto (que volvería a mover el foco).
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;

  useEffect(() => {
    const contenedor = ref.current;
    if (!activo || !contenedor) return;
    const previo = document.activeElement as HTMLElement | null;
    // Se ignoran los elementos ocultos con CSS (display:none o visibility:hidden en ellos o en sus ancestros): no reciben foco.
    const visible = (el: HTMLElement) => {
      for (let n: HTMLElement | null = el; n && n !== contenedor.parentElement; n = n.parentElement) {
        const e = getComputedStyle(n);
        if (e.display === 'none' || e.visibility === 'hidden') return false;
      }
      return true;
    };
    const focalizables = () => [...contenedor.querySelectorAll<HTMLElement>(FOCALIZABLES)].filter(visible);
    focalizables()[0]?.focus();

    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { cerrar.current(); return; }
      if (e.key !== 'Tab') return;
      const lista = focalizables();
      if (!lista.length) return;
      const primero = lista[0], ultimo = lista[lista.length - 1], actual = document.activeElement;
      const dentro = contenedor.contains(actual);
      if (e.shiftKey && (!dentro || actual === primero)) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && (!dentro || actual === ultimo)) { e.preventDefault(); primero.focus(); }
    };
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('keydown', tecla); (devolverA?.current ?? previo)?.focus?.(); };
  }, [activo, ref, devolverA]);
}
