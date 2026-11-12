import { useEffect, useState } from 'react';

/** Indica si se cumple una media query y se actualiza al cambiar el tamaño de la ventana. Sin `matchMedia` (pruebas) vale false. */
export function useMediaQuery(consulta: string): boolean {
  const [cumple, setCumple] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(consulta).matches);
  useEffect(() => {
    const m = window.matchMedia?.(consulta);
    if (!m) return;
    const actualizar = () => setCumple(m.matches);
    actualizar();
    m.addEventListener('change', actualizar);
    return () => m.removeEventListener('change', actualizar);
  }, [consulta]);
  return cumple;
}
