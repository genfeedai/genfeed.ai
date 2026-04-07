#!/bin/bash
set -e

# Defaults (all overridable via environment variables)
export MONGODB_URI=${MONGODB_URI:-mongodb://localhost:27017/genfeed}
export REDIS_URL=${REDIS_URL:-redis://localhost:6379}
export PORT=${PORT:-4001}
export TOKEN_ENCRYPTION_KEY=${TOKEN_ENCRYPTION_KEY:-$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 32)}
export GENFEEDAI_MICROSERVICES_FILES_URL=${GENFEEDAI_MICROSERVICES_FILES_URL:-http://localhost:3005}
export GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL=${GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL:-http://localhost:3007}
export GENFEEDAI_CDN_URL=${GENFEEDAI_CDN_URL:-http://localhost:3005}
export GENFEEDAI_WEBHOOKS_URL=${GENFEEDAI_WEBHOOKS_URL:-http://localhost:4001}
export GENFEEDAI_API_URL=${GENFEEDAI_API_URL:-http://localhost:4001}
export GENFEEDAI_APP_URL=${GENFEEDAI_APP_URL:-http://localhost:3102}
export GENFEEDAI_PUBLIC_URL=${GENFEEDAI_PUBLIC_URL:-http://localhost:3102}

# Start infrastructure
mongod --dbpath /data/db --wiredTigerCacheSizeGB 0.5 --fork --logpath /data/mongod.log
redis-server --dir /data/redis --appendonly yes --daemonize yes

# Start NestJS services (each needs its own PORT to avoid bind collisions)
PORT=4001 node apps/server/dist/apps/api/main.js &
PORT=4002 node apps/server/dist/apps/workers/main.js &
PORT=3005 node apps/server/dist/apps/files/main.js &
PORT=3007 node apps/server/dist/apps/notifications/main.js &

# Start Next.js web app (foreground — keeps container alive)
cd apps/web && bun run start
