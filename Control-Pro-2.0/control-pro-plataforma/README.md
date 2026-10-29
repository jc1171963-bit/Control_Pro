# Control Pro 2.0 — Plataforma de comercio y trazabilidad de uniformes con 3 sucursales

Tienda en línea propia con canal corporativo y administración central de tres sucursales: Toluca, Querétaro y Puebla. Cada sucursal tiene su propio inventario. Todos los pedidos son trazables, desde la compra hasta la entrega y la devolución, y los permisos se controlan por rol y por sucursal.

| Capa | Tecnología |
| --- | --- |
| Frontend | React 18 · TypeScript · Vite 5 · Tailwind CSS 3 · TanStack Query · React Router |
| API | Python 3.12+ · Flask 3 · REST/JSON |
| Datos | PostgreSQL 16 · Flask-SQLAlchemy 3 (SQLAlchemy 2) · Flask-Migrate/Alembic |
| Seguridad | Flask-JWT-Extended (access 15 min + refresh rotativo en cookie HttpOnly con CSRF) · bcrypt · Flask-CORS |
| Reportes | openpyxl (Excel) · CSV · ReportLab (PDF) |

## Estructura

```
backend/   API Flask: app/{models,schemas,services,api,security,integrations}, migrations/, seeds/, tests/
frontend/  React: src/{api,app,components,lib,features/{tienda,cuenta,admin}}, e2e/
legacy/    Prototipo original (solo referencia; ya no se usa)
docs/      Reglas de negocio, API y estado de implementación
deploy/    Respaldo y scripts de base de datos
```

## Instalación en desarrollo (Windows 11, macOS o Linux)

Requisitos: Python 3.12 o superior, Node.js 20 o superior y PostgreSQL 16. Si tienes Docker, `docker compose up -d db` levanta la base.

```bash
# 1) Base de datos (si no usas Docker)
psql -U postgres -c "create user control_pro with password 'control_pro_dev'"
psql -U postgres -c "create database control_pro owner control_pro"
psql -U postgres -c "create database control_pro_test owner control_pro"

# 2) Backend
cd backend
python -m venv .venv && .venv\Scripts\activate        # Windows  (Linux/macOS: source .venv/bin/activate)
pip install -r requirements-dev.txt
copy .env.example .env                                # Linux/macOS: cp .env.example .env  (ajusta DATABASE_URL)
flask --app wsgi db upgrade                           # crea el esquema (migración Alembic)
flask --app wsgi seed-demo                            # datos de PRUEBA (omítelo en producción)
flask --app wsgi run --port 5000

# 3) Frontend (otra terminal)
cd frontend
npm install
npm run dev                                           # http://localhost:5173 (proxy /api → :5000)
```

Para producción usa `flask --app wsgi crear-admin` en lugar de `seed-demo`.

### Cuentas de prueba (solo con `seed-demo`; contraseña `ControlPro2026`)

| Cuenta | Rol / alcance |
| --- | --- |
| admin@controlpro.mx | Administrador general, todas las sucursales |
| finanzas@controlpro.mx | Valida pagos y registra reembolsos |
| atencion@controlpro.mx | Devoluciones, incidencias, cancelación y cierre |
| aprobador@controlpro.mx | Aprueba pedidos corporativos |
| auditor@controlpro.mx | Solo lectura y auditoría |
| encargado.tol@controlpro.mx · .qro · .pue | Encargado de su sucursal |
| almacen.tol@controlpro.mx · .qro · .pue | Personal de inventario de su sucursal |
| cliente@demo.mx | Cliente persona (tienda) |
| empresa@demo.mx | Cuenta corporativa con 8 empleados |

El panel interno está en `/admin/entrar`.

## Pruebas

```bash
cd backend && python -m pytest --cov=app/services      # 37 pruebas contra PostgreSQL real (base control_pro_test)
cd frontend && npm test && npm run typecheck           # pruebas unitarias y verificación de tipos
# E2E en navegador (backend en :5000 y `npm run build && npx vite preview` en :4173, base recién sembrada):
node frontend/e2e/flujo-completo.cjs /carpeta/capturas  # requiere Playwright
flask --app wsgi conciliar-inventario                  # verifica que el kardex cuadre con las existencias
```

Las pruebas cubren las siguientes áreas:

- **Seguridad:** bloqueo tras 5 intentos, recuperación de un solo uso, tokens revocados, acceso cruzado entre sucursales (responde 404) y bitácoras inmutables.
- **Concurrencia:** 20 compras simultáneas sobre 5 unidades dan exactamente 5 pedidos y ninguna sobreventa.
- **Idempotencia:** reintentar una operación con la misma clave no la duplica.
- **Flujos completos:**
  - tienda con envío;
  - recoger y pagar en efectivo con promoción local;
  - faltantes al surtir, con incidencia y reembolso;
  - devolución con reingreso o merma;
  - canal corporativo con devolución para corrección, excepciones por puesto, recepción, entregas individuales con firma y cierre;
  - transferencias completas y parciales.
- **Reportes:** coinciden con los datos de la base y respetan el alcance por sucursal.

## Tareas programadas

- `flask --app wsgi expirar-reservas`: cada 15 minutos. Libera las reservas de pedidos sin pago dentro del plazo (`RESERVA_HORAS`).
- `deploy/respaldo.sh`: respaldo diario con `pg_dump` y retención de 30 días.

## Despliegue de referencia

`docker-compose.prod.yml` levanta PostgreSQL, el backend con Gunicorn (aplica migraciones al arrancar) y Nginx con el frontend compilado y el proxy de `/api`. Antes de usarlo:

1. Crea `.env.prod` con `SECRET_KEY`, `JWT_SECRET_KEY` (32 caracteres o más), `DATABASE_URL`, `POSTGRES_*` y `CORS_ORIGINS`.
2. Pon delante un proxy con TLS. Las cookies de sesión son `Secure` en producción y requieren HTTPS.

Los Dockerfiles no se probaron en este entorno porque no había Docker disponible.

## Implementado frente a pendiente de servicios externos

Ver `docs/estado-implementacion.md`. Resumen de lo que falta, que el sistema muestra como limitación en lugar de simularlo:

- pasarela de pago (hoy hay pagos manuales validados por Finanzas);
- API de paqueterías (hoy guía manual con eventos marcados como internos);
- facturación CFDI (requiere un PAC);
- SMTP (hoy el correo se escribe en el log);
- almacenamiento de objetos para imágenes;
- lector biométrico.
