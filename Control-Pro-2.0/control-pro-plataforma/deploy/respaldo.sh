#!/bin/sh
# Respaldo diario de PostgreSQL. Programar con cron: 15 2 * * * /ruta/deploy/respaldo.sh
set -eu
DESTINO=${DESTINO:-/var/backups/control-pro}
mkdir -p "$DESTINO"
pg_dump --format=custom --no-owner "$DATABASE_URL_PG" > "$DESTINO/control_pro_$(date +%Y%m%d_%H%M).dump"
find "$DESTINO" -name 'control_pro_*.dump' -mtime +30 -delete
# Restaurar en un servidor limpio: pg_restore --clean --no-owner -d "$DATABASE_URL_PG" archivo.dump
