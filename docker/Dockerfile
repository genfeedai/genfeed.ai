# Genfeed.ai — Multi-stage Dockerfile
# Usage: docker build --target <service> -t genfeedai/<service> .
#
# Targets: api, web, website, workers, files, notifications,
#          mcp, discord, slack, telegram

# ─── Base ───────────────────────────────────────────────────────────
# Docker resolves FROM before repository files are available, so this tag is
# pinned explicitly to the `packageManager` Bun version in package.json; the CI
# policy contract keeps them aligned. Every service runs as the image's
# unprivileged `bun` user; only package installs run as root.
FROM oven/bun:1.4.3 AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates python3 make g++ && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app && chown bun:bun /app
USER bun

# ─── Pruner ─────────────────────────────────────────────────────────
FROM base AS pruner
USER root
RUN bun add -g turbo@^2.5.0
USER bun
WORKDIR /app
COPY --chown=bun:bun . .

# ─── API ────────────────────────────────────────────────────────────
FROM pruner AS api-pruned
RUN turbo prune @genfeedai/api --docker

FROM base AS api
WORKDIR /app
COPY --chown=bun:bun --from=api-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --chown=bun:bun --from=api-pruned /app/out/full/ .
RUN bun run build --filter=@genfeedai/api
EXPOSE 3010
CMD ["bun", "run", "apps/server/api/dist/main.js"]

# ─── Web (Next.js Studio) ──────────────────────────────────────────
FROM pruner AS web-pruned
RUN turbo prune @genfeedai/web --docker

FROM base AS web
WORKDIR /app
COPY --chown=bun:bun --from=web-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --chown=bun:bun --from=web-pruned /app/out/full/ .
RUN bun run build --filter=@genfeedai/web
EXPOSE 3000
CMD ["bun", "run", "start", "--filter=@genfeedai/web"]

# ─── Website ────────────────────────────────────────────────────────
FROM pruner AS website-pruned
RUN turbo prune @genfeedai/website --docker

FROM base AS website
WORKDIR /app
COPY --chown=bun:bun --from=website-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --chown=bun:bun --from=website-pruned /app/out/full/ .
RUN bun run build --filter=@genfeedai/website
EXPOSE 3002
CMD ["bun", "run", "start", "--filter=@genfeedai/website"]

# ─── Workers ────────────────────────────────────────────────────────
FROM pruner AS workers-pruned
RUN turbo prune @genfeedai/workers --docker

FROM base AS workers
WORKDIR /app
COPY --chown=bun:bun --from=workers-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --chown=bun:bun --from=workers-pruned /app/out/full/ .
RUN bun run build --filter=@genfeedai/workers
EXPOSE 3013
CMD ["bun", "run", "apps/server/workers/dist/main.js"]

# ─── Files ──────────────────────────────────────────────────────────
FROM pruner AS files-pruned
RUN turbo prune @genfeedai/files --docker

FROM base AS files
WORKDIR /app
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    yt-dlp ffmpeg \
    fontconfig fonts-liberation fonts-noto-cjk fonts-noto-color-emoji \
    libnss3 libdbus-1-3 libatk1.0-0 libgbm1 libasound2 libxrandr2 \
    libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 \
    libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 \
    && rm -rf /var/lib/apt/lists/*
USER bun
COPY --chown=bun:bun --from=files-pruned /app/out/json/ .
RUN yt-dlp --version && ffmpeg -version > /dev/null
RUN bun install --frozen-lockfile
RUN bun -e "import { ensureBrowser } from '@remotion/renderer'; await ensureBrowser();"
COPY --chown=bun:bun --from=files-pruned /app/out/full/ .
RUN bun -e "import { bundle } from '@remotion/bundler'; import { resolve } from 'node:path'; await bundle({entryPoint:resolve('apps/server/files/src/remotion/index.tsx'),outDir:resolve('apps/server/files/remotion-bundle'),publicDir:null,rootDir:resolve('apps/server/files')});"
RUN test -x "$(find /app/node_modules/.remotion/chrome-headless-shell -type f -name chrome-headless-shell -print -quit)"
RUN bun run build --filter=@genfeedai/files
EXPOSE 3012
CMD ["bun", "run", "apps/server/files/dist/main.js"]

# ─── Notifications ──────────────────────────────────────────────────
FROM pruner AS notifications-pruned
RUN turbo prune @genfeedai/notifications --docker

FROM base AS notifications
WORKDIR /app
COPY --chown=bun:bun --from=notifications-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --chown=bun:bun --from=notifications-pruned /app/out/full/ .
RUN bun run build --filter=@genfeedai/notifications
EXPOSE 3011
CMD ["bun", "run", "apps/server/notifications/dist/main.js"]

# ─── Discord Bot ────────────────────────────────────────────────────
FROM pruner AS discord-pruned
RUN turbo prune @genfeedai/discord --docker

FROM base AS discord
WORKDIR /app
COPY --chown=bun:bun --from=discord-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --chown=bun:bun --from=discord-pruned /app/out/full/ .
RUN bun run build --filter=@genfeedai/discord
EXPOSE 3016
CMD ["bun", "run", "apps/server/discord/dist/main.js"]

# ─── Slack Bot ──────────────────────────────────────────────────────
FROM pruner AS slack-pruned
RUN turbo prune @genfeedai/slack --docker

FROM base AS slack
WORKDIR /app
COPY --chown=bun:bun --from=slack-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --chown=bun:bun --from=slack-pruned /app/out/full/ .
RUN bun run build --filter=@genfeedai/slack
EXPOSE 3018
CMD ["bun", "run", "apps/server/slack/dist/main.js"]

# ─── Telegram Bot ───────────────────────────────────────────────────
FROM pruner AS telegram-pruned
RUN turbo prune @genfeedai/telegram --docker

FROM base AS telegram
WORKDIR /app
COPY --chown=bun:bun --from=telegram-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --chown=bun:bun --from=telegram-pruned /app/out/full/ .
RUN bun run build --filter=@genfeedai/telegram
EXPOSE 3019
CMD ["bun", "run", "apps/server/telegram/dist/main.js"]

# ─── MCP ────────────────────────────────────────────────────────────
FROM pruner AS mcp-pruned
RUN turbo prune @genfeedai/mcp --docker

FROM base AS mcp
WORKDIR /app
COPY --chown=bun:bun --from=mcp-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --chown=bun:bun --from=mcp-pruned /app/out/full/ .
# The UI host catalog is outside the pruned MCP workspace graph.
COPY --chown=bun:bun --from=pruner /app/apps/app/messages/en/ui.json ./apps/app/messages/en/ui.json
RUN bun run build --filter=@genfeedai/mcp
EXPOSE 3014
CMD ["bun", "run", "apps/server/mcp/dist/main.js"]
