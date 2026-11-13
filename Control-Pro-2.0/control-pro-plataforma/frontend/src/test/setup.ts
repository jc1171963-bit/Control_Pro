import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// Con toda la suite en paralelo, algunas cargas tardan más de 1 s (valor por defecto) y las pruebas fallaban de forma
// intermitente. Solo amplía la espera de findBy*/waitFor; no cambia ninguna aserción.
configure({ asyncUtilTimeout: 3000 });
