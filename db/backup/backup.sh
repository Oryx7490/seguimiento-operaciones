#!/usr/bin/env bash
# Respaldo local de seguimiento-operaciones: PostgreSQL (custom dump) + MinIO (mc mirror).
# Uso: ./backup.sh [directorio_destino]
# Para automatizar: añadir a cron, por ejemplo
#   15 0 * * * /home/saruman/seguimiento-operaciones/db/backup/backup.sh /ruta/respaldo >> /var/log/seguimiento-backup.log 2>&1
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEST="${1:-$ROOT/db/backup}"
STAMP="$(date +%Y%m%d_%H%M%S)"
NETWORK="seguimiento-operaciones_default"

if [[ ! -f "$ROOT/.env" ]]; then
  echo "ERROR: faltan $ROOT/.env" >&2
  exit 1
fi
set -a; source "$ROOT/.env"; set +a

mkdir -p "$DEST"
PG_DUMP="$DEST/pg_$STAMP.dump"
echo "==> PostgreSQL → $PG_DUMP"
docker compose --project-directory "$ROOT" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$PG_DUMP"

echo "==> MinIO ($S3_BUCKET) → $DEST/minio_$STAMP/"
docker run --rm --network "$NETWORK" \
  -v "$DEST:/backup" \
  -e "MC_HOST_local=http://$S3_ACCESS_KEY:$S3_SECRET_KEY@minio:9000" \
  quay.io/minio/mc mirror --overwrite "local/$S3_BUCKET" "/backup/minio_$STAMP"

size="$(du -h "$PG_DUMP" | cut -f1)"
echo "OK — respaldo completado ($size). Conserva también una copia en un segundo dispositivo."