import { render } from '@testing-library/react';
import { ImagenProducto } from '../features/tienda/ProductoCard';
import { fotoIlustrativa } from '../lib/fotosIlustrativas';

describe('fotos ilustrativas', () => {
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
