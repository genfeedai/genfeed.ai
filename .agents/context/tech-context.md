---
created: 2026-04-07T00:00:00Z
last_updated: 2026-04-07T00:00:00Z
version: 1.0
author: Claude Code PM System
---

# Tech Context — Genfeed.ai

## Core Stack

- **Runtime**: Bun >= 1.3.x, Node.js >= 20
- **Language**: TypeScript (strict, no `any`)
- **Backend**: NestJS 11 with Mongoose (MongoDB)
- **Frontend**: Next.js 16 with Turbopack
- **Queue**: BullMQ + Redis
- **Auth**: Clerk
- **Monorepo**: Turborepo with Bun workspaces

## Build & Quality Tools

- **Formatter**: Biome 2.4.x (`npx biome check --write .`)
- **Linter**: Turbo-orchestrated per-package (`bunx turbo lint`)
- **Type-check**: `bun type-check` (all packages)
- **Tests**: Vitest (unit/integration), Playwright (E2E)
- **Backend bundler**: Webpack (API builds alone due to size)
- **CI**: GitHub Actions

## Key Dependencies

- **UI**: Radix UI primitives, Tailwind CSS, shadcn/ui, GSAP animations
- **AI**: OpenAI, Anthropic, OpenRouter, fal.ai, Replicate, ElevenLabs
- **Storage**: S3-compatible object storage (configurable — see `docs/self-hosting.md`)
- **Monitoring**: Sentry (error tracking + sourcemaps)
- **Realtime**: Socket.io with Redis adapter
- **Workflow**: React Flow (visual workflow builder)

## Infrastructure (Self-Hosted)

- **Deployment**: Docker containers (see `docker/` for compose files and config)
- **Database**: MongoDB (self-hosted or Atlas)
- **Cache/Queue**: Redis
- **GPU**: Optional GPU services for image/video/voice generation
- **Documentation**: See `docs/self-hosting.md` for full deployment guide

## Development Ports

| Service | Port | App | Port |
|---------|------|-----|------|
| API | 3001 | Admin | 3101 |
| Clips | 3002 | App (Studio) | 3102 |
| Discord | 3003 | Website | 3105 |
| Files | 3005 | | |
| MCP | 3006 | | |
| Notifications | 3007 | | |
| Slack | 3008 | | |
| Telegram | 3009 | | |
| Workers | 3010 | | |
| Images | — | | |
| Videos | — | | |
| Voices | — | | |

## Compiled Packages (dist/ required)

- `@genfeedai/types` — uses `dist/` exports, must build before API webpack
- `@genfeedai/workflow-saas` — uses `dist/` exports, must build before API webpack
- Both need vitest aliases pointing to `src/` (not `dist/`)
