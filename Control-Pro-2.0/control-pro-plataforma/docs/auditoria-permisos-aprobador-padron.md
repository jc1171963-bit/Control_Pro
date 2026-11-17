# Auditoría: el aprobador no puede gestionar los permisos de padrón

Fecha: 17-nov-2026 · Rama: `fix/permisos-aprobador-padron` (desde `main` en `6797074`) · Entorno: desarrollo local
(`localhost:5432/control_pro`, contenedor Docker `control-pro-plataforma-db-1`).

## 1. Diagnóstico

Una sucursal solicita permiso para modificar su padrón y el aprobador recibe la notificación. Al abrir **Permisos de
padrón** o al aprobar o rechazar, el backend responde 403: *"No tienes permiso para realizar esta operación. Requiere
permiso: permiso_padron.gestionar"*.

## 2. Causa raíz

**La base de datos no estaba sincronizada con el catálogo de permisos del código.**

- El commit `6797074` (16-nov, "Rediseño") agregó `permiso_padron.gestionar` en `backend/app/security/permisos.py` y se
  lo asignó al rol `aprobador`. También agregó `cliente.gestionar` y `orden.recibir`.
- Los permisos y sus relaciones con los roles (`permiso` y `rol_permiso`) **no los crea ninguna migración**. Solo los
  escribe `sincronizar_roles()`, que se ejecuta con `flask seed-roles`, o con `flask seed-demo` únicamente si la base
  está vacía.
- La base local tenía aplicada la migración `f1a3c5e7b9d2` (tablas `permiso_padron` y de mensajes), pero no se ejecutó
  `seed-roles`. Por eso existía la funcionalidad, pero el rol no tenía el permiso.
- `requiere_usuario()` (`app/security/auth.py:87`) compara con `usuario.codigos_permiso`
  (`app/models/seguridad.py:102`), que lee `rol.permisos` **de la base en cada petición**. No es un problema de token ni
  de sesión: el usuario simplemente no tenía el permiso en la base.

Hipótesis descartadas con evidencia:

| Hipótesis | Resultado |
|---|---|
| Rol incorrecto del usuario | Descartada: el único usuario con rol `aprobador` es el id 4, activo, con `alcance_global = true`. |
| Token o sesión desactualizados | Descartada: los permisos se leen de la base en cada petición, no del JWT. |
| Endpoint con permiso equivocado | Descartada: `GET /api/admin/permisos-padron` y `POST …/{id}/decision` exigen `permiso_padron.gestionar`, igual que el catálogo. |
| Código del permiso distinto | Descartada: el texto es idéntico en el decorador, el catálogo y el rol. |
| Segunda validación que bloquea | Descartada: `resolver_permiso` no vuelve a validar el rol. Las sucursales usan otro guardia (`exigir_permiso_padron`, código `permiso_padron_requerido`). |
| El frontend oculta la operación | Descartada: el panel del aprobador no filtra por permisos, llama a los endpoints y muestra el 403 del backend. |

## 3. Evidencia

Consultas de solo lectura en la base local, antes de corregir:

- `permiso`: 26 registros; el código define 29. Faltaban `cliente.gestionar`, `permiso_padron.gestionar` y `orden.recibir`.
- Permisos del rol `aprobador` en la base: `cliente.ver`, `inventario.ver`, `pedido.aprobar`, `pedido.ver`, `sucursal.ver`.
- Permisos que el código asigna al aprobador: `sucursal.ver`, `cliente.ver`, `cliente.gestionar`, `pedido.ver`, `pedido.aprobar`,
  `pedido.cancelar`, `permiso_padron.gestionar`.
- `alembic_version = f1a3c5e7b9d2` (migración de padrón aplicada). `permiso_padron`: 1 solicitud `pendiente`.
- Historial: `git log -S"permiso_padron.gestionar"` devuelve solo `6797074`. Las migraciones no insertan filas en `permiso`.

Endpoints revisados:

| Endpoint | Guardia | Quién |
|---|---|---|
| `GET /api/admin/permisos-padron` | `requiere_usuario("permiso_padron.gestionar")` | Aprobador |
| `POST /api/admin/permisos-padron/{id}/decision` (aprobar, rechazar, revocar) | `requiere_usuario("permiso_padron.gestionar")` | Aprobador |
| `GET /api/admin/cuentas-sucursal/{id}/permiso-padron` | `requiere_usuario("cliente.ver")` | Aprobador |
| `GET` y `POST /api/cuenta/permiso-padron`, `POST …/{id}/cerrar` | `requiere_cliente(empresa=True)` | Sucursal |
| `POST` y `PUT /api/cuenta/empleados` | `requiere_cliente` + `exigir_permiso_padron` | Sucursal con permiso vigente |

La notificación `permiso_padron_solicitado` enlaza a `/aprobador/permisos`, ruta existente en `app/router.tsx`.

## 4. Permisos: antes y después

| Rol | Antes (base) → después (= código) |
|---|---|
| `aprobador` | + `permiso_padron.gestionar`, + `cliente.gestionar`, + `pedido.cancelar`, − `inventario.ver` |
| `admin` | + `cliente.gestionar`, + `orden.recibir`, + `permiso_padron.gestionar` |
| `encargado`, `finanzas`, `atencion` | + `orden.recibir` |
| `inventario`, `auditor` | Sin cambios |

Después de la corrección: 29 permisos, ninguno duplicado, y los 7 roles iguales al código.

## 5. Usuario y rol

- El rol `aprobador` (global) tiene un usuario: id 4, activo. No se cambió el rol de ningún usuario.
- La corrección se aplica a todo el rol. Si se crean más aprobadores, recibirán los mismos permisos.

## 6. Correcciones

- **Datos (base local):** `flask --app wsgi seed-roles`, el mecanismo oficial que definen `app/cli.py` y `permisos.py`.
  Solo modifica `permiso`, `rol` y `rol_permiso`. No toca usuarios, contraseñas, solicitudes, empleados ni historial.
  Antes de ejecutarlo se respaldaron esas tres tablas con `pg_dump --data-only`.
- **README.md:** se agrega el paso `db upgrade` + `seed-roles` después de cada `git pull`, para que otros entornos no
  repitan el problema.
- **backend/tests/test_colaboracion.py:** se agrega una prueba de regresión para la causa raíz (autorizada el 17-nov).
- No se modificó código de producción del backend ni del frontend: el código ya era correcto.

## 7. Pruebas

| Prueba | Cómo | Resultado |
|---|---|---|
| Suite completa del backend (56 pruebas) | `pytest` contra un PostgreSQL desechable (puerto 55432), no la base local | 56 aprobadas |
| Regresión de la causa raíz | `test_rol_desincronizado_se_repara_con_seed_roles` (`tests/test_colaboracion.py`): quita el permiso del rol → 403; `sincronizar_roles()` → 200 con el mismo token; el aprobador sigue con 403 en `/api/admin/usuarios` y la sucursal con 403 al decidir | Aprobada |
| 1. El aprobador consulta solicitudes | Base local real: login por `/api/auth/portal/login` y `GET /api/admin/permisos-padron?estado=pendiente` | 200, 1 pendiente |
| 2. Autorizar | `test_permiso_de_padron_completo` y `con_permiso_padron` (base aislada) | Aprobada |
| 3. Rechazar con motivo (sin motivo → 400) | `test_permiso_de_padron_completo` | Aprobada |
| 4. Permiso vigente, duración, vencimiento y revocación | `test_permiso_de_padron_completo`, `test_sucursal_solo_administra_empleados` | Aprobada |
| 5. Seguridad: sin permiso → 403 | Auditor → 403 (prueba existente); aprobador en base local: `/api/admin/usuarios` → 403, alta de sucursal → 403 | Correcto |
| 6. Persistencia y sesión | Login nuevo sobre la base corregida; los permisos se leen de la base, sin caché | Correcto |

No se aprobó ni rechazó la solicitud pendiente real de la base local, para no alterar datos. Esos flujos se probaron en
la base aislada.

## 8. Seguridad

- El aprobador no recibió permisos fuera de su definición en el código. Perdió `inventario.ver`, que el código no le asigna.
- Sigue sin acceso a funciones de administración (`usuario.gestionar`, `sucursal.gestionar`, inventario, pagos), comprobado con 403.
- Una cuenta de sucursal no puede decidir permisos: los endpoints `/api/admin/*` exigen sesión de personal interno
  (`_cargar_usuario`, `tipo == "usuario"`).
- No se crearon usuarios, no se cambiaron contraseñas y no se borraron solicitudes ni historial.

## 9. Pendientes

- **Sesión abierta en el navegador:** el panel del aprobador funciona de inmediato. El enlace "Ir a permisos" de
  `SucursalesCliente.tsx` usa la lista de permisos cargada al iniciar sesión y aparece después de recargar la página.
- **Otros entornos** (el de tu compañero o producción): necesitan `flask --app wsgi seed-roles`. No se ejecutó fuera de la
  base local.
- No se probó el flujo en el navegador. Se verificó a nivel de API.

## 10. Conclusión

El aprobador ya puede consultar, aprobar, rechazar y revocar permisos de padrón en la base local. La causa era una base
sin sincronizar con el catálogo de permisos, no un error de código. La corrección queda guardada en la base y el README
documenta el paso para que no se repita en otros entornos.
