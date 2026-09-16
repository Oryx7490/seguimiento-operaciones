#!/usr/bin/env bash
# Restaura PostgreSQL y MinIO desde el respaldo más reciente o desde rutas dadas.
# Uso: ./restore.sh [pg_dump.dump] [dir_minio]
# PRECAUCIÓN: sobrescribe los datos actuales.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NETWORK="seguimiento-operaciones_default"

if [[ ! -f "$ROOT/.env" ]]; then
  echo "ERROR: faltan $ROOT/.env" >&2
  exit 1
fi
set -a; source "$ROOT/.env"; set +a

PG_DUMP="${1:-$(ls -1t "$ROOT"/db/backup/pg_*.dump 2>/dev/null | head -1)}"
MINIO_DIR="${2:-$(ls -1dt "$ROOT"/db/backup/minio_* 2>/dev/null | head -1)}"

if [[ -z "$PG_DUMP" || -z "$MINIO_DIR" ]]; then
  echo "ERROR: no hay respaldos en $ROOT/db/backup. Pasa rutas explícitas." >&2
  exit 1
fi

echo "==> Restaurando PostgreSQL ($PG_DUMP)..."
echo "    (esto detiene escrituras; confirma antes de ejecutar en producción)"
docker compose --project-directory "$ROOT" exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists "$PG_DUMP"

if [[ -d "$MINIO_DIR" ]]; then
  echo "==> Restaurando MinIO ($MINIO_DIR)..."
  docker run --rm --network "$NETWORK" \
    -v "$MINIO_DIR":/backup:ro \
    -e "MC_HOST_local=http://$S3_ACCESS_KEY:$S3_SECRET_KEY@minio:9000" \
    quay.io/minio/mc mirror --overwrite "/backup" "local/$S3_BUCKET"
fi

echo "OK — restauración completada."