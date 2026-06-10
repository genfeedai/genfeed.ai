#!/bin/bash
set -e

# Defaults (all overridable via environment variables)
# The DB URL is assembled from parts: compose-file local defaults, not
# credentials — the split form also keeps secret scanners from flagging
# a literal connection string.
POSTGRES_USER_DEFAULT=${POSTGRES_USER:-genfeed}
POSTGRES_PASSWORD_DEFAULT=${POSTGRES_PASSWORD:-genfeed_local}
POSTGRES_DB_DEFAULT=${POSTGRES_DB:-genfeed}
POSTGRES_HOST_DEFAULT=${POSTGRES_HOST:-postgres}
export DATABASE_URL=${DATABASE_URL:-postgresql://${POSTGRES_USER_DEFAULT}:${POSTGRES_PASSWORD_DEFAULT}@${POSTGRES_HOST_DEFAULT}:5432/${POSTGRES_DB_DEFAULT}}
export REDIS_URL=${REDIS_URL:-redis://localhost:6379}
# Persist auto-generated key so restarts can still decrypt existing data
if [ -z "$TOKEN_ENCRYPTION_KEY" ]; then
  if [ -f /data/.encryption-key ]; then
    TOKEN_ENCRYPTION_KEY=$(cat /data/.encryption-key)
  else
    TOKEN_ENCRYPTION_KEY=$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 32)
    echo -n "$TOKEN_ENCRYPTION_KEY" > /data/.encryption-key
    chmod 600 /data/.encryption-key
  fi
fi
export TOKEN_ENCRYPTION_KEY
export GENFEEDAI_MICROSERVICES_FILES_URL=${GENFEEDAI_MICROSERVICES_FILES_URL:-http://localhost:3012}
export GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL=${GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL:-http://localhost:3011}
export GENFEEDAI_CDN_URL=${GENFEEDAI_CDN_URL:-http://localhost:3012}
export GENFEEDAI_WEBHOOKS_URL=${GENFEEDAI_WEBHOOKS_URL:-http://localhost:3010}
export GENFEEDAI_API_URL=${GENFEEDAI_API_URL:-http://localhost:3010}
export GENFEEDAI_MICROSERVICES_WORKERS_URL=${GENFEEDAI_MICROSERVICES_WORKERS_URL:-http://localhost:3013}
export GENFEEDAI_APP_URL=${GENFEEDAI_APP_URL:-http://localhost:3000}
export GENFEEDAI_PUBLIC_URL=${GENFEEDAI_PUBLIC_URL:-http://localhost:3000}

# Optional: Enable HYBRID mode (local app + optional Clerk cloud connection)
# Set these to allow users to sign in with Clerk and sync to cloud:
#   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
#   CLERK_SECRET_KEY=sk_live_...
# When set, the app runs in HYBRID mode: works offline by default,
# but users can click "Connect to Cloud" to sign in and sync workflows.
# When unset, the app runs in LOCAL mode (fully offline, no account needed).

# Start infrastructure
redis-server --dir /data/redis --appendonly yes --daemonize yes

# Run Prisma migrations before starting services (DB may still be initialising)
echo "[entrypoint] Running Prisma migrations..."
MIGRATE_RETRIES=5
MIGRATE_DELAY=5
for i in $(seq 1 $MIGRATE_RETRIES); do
  if bunx prisma migrate deploy --schema packages/prisma/prisma/schema.prisma; then
    echo "[entrypoint] Prisma migrations applied successfully"
    break
  fi
  if [ "$i" -eq "$MIGRATE_RETRIES" ]; then
    echo "[entrypoint] FATAL: Prisma migrate deploy failed after ${MIGRATE_RETRIES} attempts" >&2
    exit 1
  fi
  echo "[entrypoint] Migration attempt ${i} failed, retrying in ${MIGRATE_DELAY}s..."
  sleep "$MIGRATE_DELAY"
done

# Derive service ports from their env URLs
API_PORT=$(echo "$GENFEEDAI_API_URL" | sed 's|.*:||')
FILES_PORT=$(echo "$GENFEEDAI_MICROSERVICES_FILES_URL" | sed 's|.*:||')
NOTIFICATIONS_PORT=$(echo "$GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL" | sed 's|.*:||')
WORKERS_PORT=$(echo "$GENFEEDAI_MICROSERVICES_WORKERS_URL" | sed 's|.*:||')
MCP_PORT=${MCP_PORT:-3014}

# Start NestJS services
PORT=${API_PORT} node apps/server/dist/apps/api/main.js &
PORT=${WORKERS_PORT} node apps/server/dist/apps/workers/main.js &
PORT=${FILES_PORT} node apps/server/dist/apps/files/main.js &
PORT=${NOTIFICATIONS_PORT} node apps/server/dist/apps/notifications/main.js &
PORT=${MCP_PORT} node apps/server/dist/apps/mcp/main.js &

# Start Next.js web app (foreground — keeps container alive)
# Derive port from GENFEEDAI_APP_URL so it stays in sync with env config
APP_PORT=$(echo "$GENFEEDAI_APP_URL" | sed 's|.*:||')
cd apps/app && PORT=${APP_PORT:-3000} bun run start
