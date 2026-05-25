#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DATA_DIR="${ROOT_DIR}/.local/postgres/data"

if [[ ! -f "${DATA_DIR}/PG_VERSION" ]]; then
  echo "No project-local Postgres data directory exists."
  exit 0
fi

pg_ctl -D "${DATA_DIR}" stop
