#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PG_DIR="${ROOT_DIR}/.local/postgres"
DATA_DIR="${PG_DIR}/data"
RUNTIME_DIR="${PG_DIR}/run"
LOG_FILE="${PG_DIR}/postgres.log"
PORT="${ELYSIUM_POSTGRES_PORT:-55432}"
DB_NAME="${ELYSIUM_POSTGRES_DB:-elysium}"

mkdir -p "${PG_DIR}" "${RUNTIME_DIR}"

if [[ ! -f "${DATA_DIR}/PG_VERSION" ]]; then
  initdb -D "${DATA_DIR}" --encoding=UTF8 --locale=C
fi

if pg_isready -h 127.0.0.1 -p "${PORT}" >/dev/null 2>&1; then
  echo "Postgres already running on 127.0.0.1:${PORT}"
else
  pg_ctl -D "${DATA_DIR}" -l "${LOG_FILE}" -o "-h 127.0.0.1 -p ${PORT} -k ${RUNTIME_DIR}" start
fi

if ! psql -h 127.0.0.1 -p "${PORT}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  createdb -h 127.0.0.1 -p "${PORT}" "${DB_NAME}"
fi

echo "DATABASE_URL=postgresql://${USER}@127.0.0.1:${PORT}/${DB_NAME}"
