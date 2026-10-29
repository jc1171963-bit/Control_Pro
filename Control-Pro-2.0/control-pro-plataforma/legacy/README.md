# Control Pro — Prototipo funcional

Aplicación de demostración para la gestión integral de pedidos de uniformes, inventario, paquetes, envíos, recepción, entregas individuales e incidencias.

## Incluye

- Dashboard con indicadores calculados desde los datos actuales.
- Navegación por módulos: pedidos, catálogo, empleados, sucursales, aprobaciones, inventario, paquetes, envíos, recepción, entregas, incidencias, conformidades, reportes, notificaciones, permisos, configuración y simulador.
- Datos de ejemplo de Toluca, Querétaro y Puebla.
- Crear pedidos y empleados; agregar productos al catálogo.
- Validación de productos por puesto y solicitud de excepción con justificación.
- Aprobar pedidos y generar una sola orden de inventario relacionada.
- Crear paquetes, registrar guías y avanzar eventos de seguimiento simulados.
- Confirmar recepción por separado de la entrega del transportista.
- Registrar entregas individuales con firma dibujada, valoración y observaciones.
- Registrar y resolver incidencias sin borrar el historial original.
- Exportación CSV en los reportes principales.
- Auditoría, notificaciones y persistencia local con `localStorage`.
- Selector de rol de demostración y restablecimiento de los datos iniciales.

## Ejecutar en Windows 11

Requisitos: Node.js LTS y npm.

1. Extrae la carpeta `control-pro`.
2. Abre una terminal dentro de esa carpeta.
3. Ejecuta:

   ```bash
   npm install
   npm run dev
   ```

4. Abre la URL local que muestre Vite, normalmente `http://localhost:5173`.

Para validar una compilación de producción:

```bash
npm run build
npm run preview
```

## Datos y seguridad

Los cambios se guardan en el navegador actual mediante `localStorage`; no se comparten entre usuarios ni equipos. Usa únicamente información ficticia. La autorización por rol es visual y demostrativa, no sustituye autorización en backend. Las guías, eventos de paquetería y firmas son de demostración. La firma dibujada no es una firma electrónica avanzada.

## Arquitectura

- `src/App.tsx`: composición de módulos, navegación, flujos operativos y acciones.
- `src/data/seed.ts`: datos iniciales ficticios.
- `src/types.ts`: modelos TypeScript.
- `src/styles.css`: estilos responsive.
- `src/main.tsx`: punto de entrada de React.

## Alcance de la primera versión

Este es un prototipo funcional local, no una instalación de producción. La persistencia multiusuario, autenticación real, API, PostgreSQL/Supabase, control de permisos del servidor, documentos PDF/XLSX, conexión real con transportistas y firma legal deben implementarse y probarse antes de producción.
