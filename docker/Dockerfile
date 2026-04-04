# Genfeed.ai — Multi-stage Dockerfile
# Usage: docker build --target <service> -t genfeedai/<service> .
#
# Targets: api, web, admin, website, workers, files, notifications,
#          clips, mcp, discord, slack, telegram, images, videos, voices

# ─── Base ───────────────────────────────────────────────────────────
FROM oven/bun:1.2.12 AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && rm -rf /var/lib/apt/lists/*

# ─── Pruner ─────────────────────────────────────────────────────────
FROM base AS pruner
RUN bun add -g turbo@^2.5.0
WORKDIR /app
COPY . .

# ─── API ────────────────────────────────────────────────────────────
FROM pruner AS api-pruned
RUN turbo prune @genfeedai/api --docker

FROM base AS api
WORKDIR /app
COPY --from=api-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=api-pruned /app/out/full/ .
RUN bun run build --filter=@genfeedai/api
EXPOSE 3001
CMD ["bun", "run", "apps/server/api/dist/main.js"]

# ─── Web (Next.js Studio) ──────────────────────────────────────────
FROM pruner AS web-pruned
RUN turbo prune @genfeedai/web --docker

FROM base AS web
WORKDIR /app
COPY --from=web-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=web-pruned /app/out/full/ .
RUN bun run build --filter=@genfeedai/web
EXPOSE 3000
CMD ["bun", "run", "start", "--filter=@genfeedai/web"]

# ─── Admin ──────────────────────────────────────────────────────────
FROM pruner AS admin-pruned
RUN turbo prune @genfeedai/admin --docker

FROM base AS admin
WORKDIR /app
COPY --from=admin-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=admin-pruned /app/out/full/ .
RUN bun run build --filter=@genfeedai/admin
EXPOSE 3100
CMD ["bun", "run", "start", "--filter=@genfeedai/admin"]

# ─── Website ────────────────────────────────────────────────────────
FROM pruner AS website-pruned
RUN turbo prune @genfeedai/website --docker

FROM base AS website
WORKDIR /app
COPY --from=website-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=website-pruned /app/out/full/ .
RUN bun run build --filter=@genfeedai/website
EXPOSE 3107
CMD ["bun", "run", "start", "--filter=@genfeedai/website"]

# ─── Workers ────────────────────────────────────────────────────────
FROM pruner AS workers-pruned
RUN turbo prune @genfeedai/workers --docker

FROM base AS workers
WORKDIR /app
COPY --from=workers-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=workers-pruned /app/out/full/ .
RUN bun run build --filter=@genfeedai/workers
CMD ["bun", "run", "apps/server/workers/dist/main.js"]

# ─── Files ──────────────────────────────────────────────────────────
FROM pruner AS files-pruned
RUN turbo prune @genfeedai/files --docker

FROM base AS files
WORKDIR /app
COPY --from=files-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=files-pruned /app/out/full/ .
RUN bun run build --filter=@genfeedai/files
EXPOSE 3005
CMD ["bun", "run", "apps/server/files/dist/main.js"]

# ─── Notifications ──────────────────────────────────────────────────
FROM pruner AS notifications-pruned
RUN turbo prune @genfeedai/notifications --docker

FROM base AS notifications
WORKDIR /app
COPY --from=notifications-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=notifications-pruned /app/out/full/ .
RUN bun run build --filter=@genfeedai/notifications
EXPOSE 3007
CMD ["bun", "run", "apps/server/notifications/dist/main.js"]

# ─── Discord Bot ────────────────────────────────────────────────────
FROM pruner AS discord-pruned
RUN turbo prune @genfeedai/discord --docker

FROM base AS discord
WORKDIR /app
COPY --from=discord-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=discord-pruned /app/out/full/ .
RUN bun run build --filter=@genfeedai/discord
EXPOSE 3003
CMD ["bun", "run", "apps/server/discord/dist/main.js"]

# ─── Slack Bot ──────────────────────────────────────────────────────
FROM pruner AS slack-pruned
RUN turbo prune @genfeedai/slack --docker

FROM base AS slack
WORKDIR /app
COPY --from=slack-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=slack-pruned /app/out/full/ .
RUN bun run build --filter=@genfeedai/slack
EXPOSE 3008
CMD ["bun", "run", "apps/server/slack/dist/main.js"]

# ─── Telegram Bot ───────────────────────────────────────────────────
FROM pruner AS telegram-pruned
RUN turbo prune @genfeedai/telegram --docker

FROM base AS telegram
WORKDIR /app
COPY --from=telegram-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=telegram-pruned /app/out/full/ .
RUN bun run build --filter=@genfeedai/telegram
EXPOSE 3009
CMD ["bun", "run", "apps/server/telegram/dist/main.js"]

# ─── GPU: Images ────────────────────────────────────────────────────
FROM pruner AS images-pruned
RUN turbo prune @genfeedai/images --docker

FROM base AS images
WORKDIR /app
COPY --from=images-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=images-pruned /app/out/full/ .
RUN bun run build --filter=@genfeedai/images
EXPOSE 3012
CMD ["bun", "run", "apps/server/images/dist/main.js"]

# ─── GPU: Videos ────────────────────────────────────────────────────
FROM pruner AS videos-pruned
RUN turbo prune @genfeedai/videos --docker

FROM base AS videos
WORKDIR /app
COPY --from=videos-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=videos-pruned /app/out/full/ .
RUN bun run build --filter=@genfeedai/videos
CMD ["bun", "run", "apps/server/videos/dist/main.js"]

# ─── GPU: Voices ────────────────────────────────────────────────────
FROM pruner AS voices-pruned
RUN turbo prune @genfeedai/voices --docker

FROM base AS voices
WORKDIR /app
COPY --from=voices-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=voices-pruned /app/out/full/ .
RUN bun run build --filter=@genfeedai/voices
EXPOSE 3013
CMD ["bun", "run", "apps/server/voices/dist/main.js"]

# ─── MCP ────────────────────────────────────────────────────────────
FROM pruner AS mcp-pruned
RUN turbo prune @genfeedai/mcp --docker

FROM base AS mcp
WORKDIR /app
COPY --from=mcp-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=mcp-pruned /app/out/full/ .
RUN bun run build --filter=@genfeedai/mcp
EXPOSE 3006
CMD ["bun", "run", "apps/server/mcp/dist/main.js"]

# ─── Clips ──────────────────────────────────────────────────────────
FROM pruner AS clips-pruned
RUN turbo prune @genfeedai/clips --docker

FROM base AS clips
WORKDIR /app
COPY --from=clips-pruned /app/out/json/ .
RUN bun install --frozen-lockfile
COPY --from=clips-pruned /app/out/full/ .
RUN bun run build --filter=@genfeedai/clips
EXPOSE 3002
CMD ["bun", "run", "apps/server/clips/dist/main.js"]
