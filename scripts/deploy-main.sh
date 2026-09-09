#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."

compose=(docker compose -f docker-compose.prod.yml --env-file .env)

"${compose[@]}" build
"${compose[@]}" run --rm backend npx prisma migrate deploy
"${compose[@]}" up -d --remove-orphans
"${compose[@]}" restart frontend

for attempt in {1..20}; do
  if curl --fail --silent --show-error http://127.0.0.1:5173/api/health >/dev/null; then
    "${compose[@]}" ps
    exit 0
  fi
  sleep 3
done

"${compose[@]}" ps
exit 1
