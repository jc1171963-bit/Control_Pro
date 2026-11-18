# Pruebas sobre una base PostgreSQL desechable

La suite de backend borra y recrea su base al empezar. `backend/scripts/pytest_desechable.py` crea una base temporal propia, ejecuta pytest sobre ella y la elimina al terminar, sin tocar ninguna otra base del servidor.

## Requisitos previos

- El entorno de backend con sus dependencias instaladas (`pip install -r requirements-dev.txt`). No requiere paquetes nuevos.
- Un servidor PostgreSQL **local**, en `localhost`, `127.0.0.1` o `::1`, con un usuario que pueda crear bases (`CREATEDB` o superusuario).
- Se recomienda un servidor desechable independiente del de trabajo, por ejemplo:

  ```powershell
  docker run --rm -d --name cp-pruebas -e POSTGRES_PASSWORD=<clave> -p 127.0.0.1:55432:5432 postgres:16
  ```

## Configuración

Hay una sola variable, `ADMIN_DATABASE_URL`: la conexión administrativa a la base de mantenimiento `postgres` de ese servidor. Se define en la sesión de terminal y no se guarda en archivos.

```powershell
$env:ADMIN_DATABASE_URL = "postgresql://postgres:<clave>@127.0.0.1:55432/postgres"
```

El script no lee `DATABASE_URL`, la base de trabajo, ni acepta el nombre de la base que va a crear o eliminar. Al ejecutar pytest sustituye `TEST_DATABASE_URL` por la base temporal.

## Comandos (desde `backend/`)

```powershell
python scripts/pytest_desechable.py                                  # toda la suite
python scripts/pytest_desechable.py tests/test_flujos.py             # un archivo
python scripts/pytest_desechable.py tests/test_flujos.py -k corporativo -x   # cualquier argumento de pytest
```

## Código de salida

| Código | Significado |
|---|---|
| El de pytest (0, 1, 2, 4, 5…) | pytest se ejecutó; su código se conserva aunque la limpieza falle |
| 3 | Rechazado antes de ejecutar pytest: URL no válida, host no local, base distinta de `postgres`, servidor no disponible, nombre ya existente o identidad no comprobada |
| 130 | Interrumpido con Ctrl+C; la limpieza se intenta igualmente |

## Cómo funciona

1. **Valida `ADMIN_DATABASE_URL` sin conectarse.** Debe ser PostgreSQL, con host local y base `postgres`.
2. **Comprueba que el servidor responde.** Registra su hora de arranque (`pg_postmaster_start_time()`) como identidad.
3. **Genera un nombre** `cp_<12 hex aleatorios>_test`, comprueba que no exista y crea la base. El nombre se escapa con `psycopg.sql.Identifier`.
4. **Marca la base** con un comentario aleatorio de esta ejecución (`control-pro desechable <32 hex>`).
5. **Verifica la conexión de pruebas.** La guardia T1 (`motivo_rechazo_url`) acepta la URL, y al conectarse llega a la misma base, con la misma marca y el mismo servidor.
6. **Ejecuta pytest** con `TEST_DATABASE_URL` apuntando a esa base. La guardia T1 de `conftest.py` vuelve a validarla.
7. **Limpia** en un bloque `finally`, también si pytest falla o se interrumpe. Antes de eliminar vuelve a comprobar:
   - que el nombre tiene la forma generada;
   - que el servidor es el mismo, con la misma hora de arranque;
   - que la base conserva la marca de esta ejecución.

   Solo entonces cierra las conexiones a esa base, ejecuta `DROP DATABASE` y comprueba que ya no existe. Si cualquier comprobación falla, no elimina nada y lo informa como «LIMPIEZA NO COMPLETADA».

La contraseña solo se pasa por variables de entorno al proceso de pytest. En consola se muestra enmascarada (`***`).

## Recuperación si la limpieza no se completó

Puede pasar si se cierra la ventana o se mata el proceso, si el servidor se reinicia o si se pierde la conexión. La base queda en el servidor con su nombre y su marca. Para eliminarla:

1. Lista las bases desechables y su marca:

   ```sql
   select datname, shobj_description(oid, 'pg_database') as marca
   from pg_database where datname ~ '^cp_[0-9a-f]{12}_test$';
   ```

2. Elimina a mano **solo** las que tengan el nombre que informó el script y una marca que empiece por `control-pro desechable`:

   ```sql
   drop database "cp_xxxxxxxxxxxx_test";
   ```

Con un servidor desechable de Docker basta con detener el contenedor (`docker stop cp-pruebas`), porque `--rm` lo elimina junto con sus bases.

## Advertencias de seguridad

- Ejecútalo contra un servidor desechable. En el servidor de trabajo solo crearía y borraría su propia base `cp_…_test`, pero la carga de pruebas y las conexiones afectarían a quien lo esté usando.
- No reutiliza ni elimina bases que ya existían: ni `control_pro`, ni `control_pro_test`, ni ninguna otra. Tampoco las que tengan el mismo patrón de nombre sin su marca.
- No tiene opciones para forzar la limpieza ni para elegir la base a eliminar.
- La guardia T1 sigue activa: una base que no termine en `_test` o que no sea local aborta pytest antes de cualquier operación destructiva.
- Las pruebas del propio script (`tests/test_pytest_desechable.py`) crean y borran bases. Solo se ejecutan si existe `ADMIN_DATABASE_URL`, es decir, al lanzarlas a través del script; si no, se omiten.
