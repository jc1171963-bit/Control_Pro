import { ApiError } from '../api/cliente';
import { dinero, etiqueta, mensajeError } from '../lib/formato';

describe('formato', () => {
  it('formatea montos en MXN', () => {
    expect(dinero('1500.5')).toContain('1,500.50');
  });
  it('traduce estados', () => {
    expect(etiqueta('pago_en_revision')).toBe('Pago en revisión');
    expect(etiqueta('estado_nuevo')).toBe('estado nuevo');
  });
  it('explica faltantes de existencias', () => {
    const e = new ApiError(409, 'sin_existencias', 'No hay existencias suficientes.', {
      faltantes: [{ sku: 'BOT-001-N-27', solicitado: 4, disponible_total: 2 }],
    });
    expect(mensajeError(e)).toContain('BOT-001-N-27: pediste 4, hay 2');
  });
  it('lista errores de validación por campo', () => {
    const e = new ApiError(422, 'datos_invalidos', 'Revisa los datos enviados.', { cp: ['Código postal de 5 dígitos.'] });
    expect(mensajeError(e)).toContain('cp: Código postal de 5 dígitos.');
  });
});
