import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// Con toda la suite en paralelo, algunas cargas tardan más de 1 s (valor por defecto) y las pruebas fallaban de forma
// intermitente. Solo amplía la espera de findBy*/waitFor; no cambia ninguna aserción.
configure({ asyncUtilTimeout: 3000 });

// React Router crea un `Request` con `signal` en cada navegación. En el entorno de pruebas, `AbortSignal` es el de jsdom
// y el `Request` nativo de Node lo rechaza («Expected signal to be an instance of AbortSignal»): la navegación se
// cancelaba y fallaban todas las pruebas que cambian de pantalla. En pruebas no hace falta cancelar navegaciones, así
// que se omite la señal. (No se puede distinguir por clase: el Request nativo arma su señal interna con el
// AbortController global, que aquí también es el de jsdom.) En el navegador real no ocurre.
const RequestNativo = globalThis.Request;
class RequestCompatible extends RequestNativo {
  constructor(entrada: RequestInfo | URL, init?: RequestInit) {
    if (init?.signal) {
      const { signal: _omitida, ...resto } = init;
      super(entrada, resto);
    } else {
      super(entrada, init);
    }
  }
}
globalThis.Request = RequestCompatible as typeof Request;
