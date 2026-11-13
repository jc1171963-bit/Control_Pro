import { render } from '@testing-library/react';
import { ImagenProducto } from '../features/tienda/ProductoCard';
import { FOTOS_ILUSTRATIVAS, fotoIlustrativa } from '../lib/fotosIlustrativas';
import catalogoSeed from '../../../backend/seeds/catalogo.py?raw';

const ARCHIVOS = Object.keys(import.meta.glob('../../public/assets/products/*.webp')).map((r) => r.split('/').pop());

/** Mismo slug que genera backend/seeds/demo.py a partir del nombre del producto. */
const slugSeed = (nombre: string) =>
  nombre.toLowerCase().replace(/[áéíóúñ]/g, (c) => 'aeioun'['áéíóúñ'.indexOf(c)]).split(/\s+/).filter(Boolean).join('-');
const SLUGS_CATALOGO = new Set([...catalogoSeed.matchAll(/\("[A-Z]{3}-\d{3}", "([^"]+)"/g)].map((m) => slugSeed(m[1])));

describe('fotos ilustrativas', () => {
  it('cada foto existe en public/ y cada producto asociado existe en el catálogo del seed', () => {
    expect(SLUGS_CATALOGO.size).toBe(50);
    for (const f of FOTOS_ILUSTRATIVAS) {
      expect(ARCHIVOS).toContain(`${f.slug}.webp`);
      for (const p of f.productos ?? []) expect(SLUGS_CATALOGO, p).toContain(p);
    }
  });

  it('el catálogo actual muestra las fotos aprobadas y el giro 360° sigue usando sus cuadros', () => {
    expect(fotoIlustrativa('/api/archivos/publicos/bata-caballero-0.svg')).toBe('/assets/products/bata-clinica-clasica.webp');
    expect(fotoIlustrativa('/api/archivos/publicos/playera-polo-verde-0.svg')).toBe('/assets/products/polo-corporativa-pique.webp');
    expect(fotoIlustrativa('/api/archivos/publicos/bata-caballero-0-giro-03.svg')).toBeNull();
    expect(fotoIlustrativa('/api/archivos/publicos/pantalon-cargo-negro-0.svg')).toBeNull();
  });

  it('sustituye solo la ilustración SVG del seed de un producto con foto de stock', () => {
    expect(fotoIlustrativa('/api/archivos/publicos/polo-corporativa-pique-2.svg')).toBe('/assets/products/polo-corporativa-pique.webp');
    // Una foto real subida siempre gana.
    expect(fotoIlustrativa('/api/archivos/publicos/polo-corporativa-pique-0.webp')).toBeNull();
    // Sin foto de stock adecuada: conserva su imagen.
    expect(fotoIlustrativa('/api/archivos/publicos/zapato-clinico-antiderrapante-0.svg')).toBeNull();
    expect(fotoIlustrativa(null)).toBeNull();
  });

  it('ImagenProducto muestra la foto ilustrativa con dimensiones reservadas y carga diferida', () => {
    const { container, rerender } = render(<ImagenProducto src="/api/archivos/publicos/gorra-de-trabajo-0.svg" alt="Gorra" />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/assets/products/gorra-de-trabajo.webp');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('width', '800');
    rerender(<ImagenProducto src={null} alt="Sin" />);
    expect(container.textContent).toContain('Sin imagen');
  });
});
