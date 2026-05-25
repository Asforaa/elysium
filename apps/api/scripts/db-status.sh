#!/usr/bin/env bash
set -euo pipefail

PORT="${ELYSIUM_POSTGRES_PORT:-55432}"

pg_isready -h 127.0.0.1 -p "${PORT}"
