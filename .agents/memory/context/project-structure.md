---
created: 2026-04-07T00:00:00Z
last_updated: 2026-07-06T00:00:00Z
version: 1.2
author: Claude Code PM System
---

# Project Structure — Genfeed.ai

## Root Layout

```
genfeed.ai/
├── apps/
│   ├── server/              # 11 NestJS backend service workspaces
│   │   ├── api/             # Main API (port 3010)
│   │   ├── notifications/   # Notification service (3011)
│   │   ├── files/           # File processing (3012)
│   │   ├── workers/         # Background jobs (3013)
│   │   ├── mcp/             # MCP server (3014)
│   │   ├── clips/           # Not currently a package workspace; re-verify before treating as a service
│   │   ├── discord/         # Discord integration (3016)
│   │   ├── slack/           # Slack integration (3018)
│   │   ├── telegram/        # Telegram bot (3019)
│   │   ├── images/          # Image generation (3020)
│   │   ├── videos/          # Video generation (3021)
│   │   └── voices/          # Voice generation (3022)
│   ├── app/                 # Main studio app (Next.js)
│   ├── docs/                # Documentation site (Next.js)
│   ├── website/             # Marketing site (Next.js)
│   ├── desktop/app/         # Electron desktop app workspace
│   ├── mobile/app/          # React Native / Expo workspace
│   └── extensions/          # Browser & IDE extensions (v2 milestone)
│       ├── browser/app/
│       └── ide/app/
├── packages/                # 43 shared packages (@genfeedai/*)
│   ├── agent/               # Agent logic
│   ├── api-types/           # Generated API types
│   ├── auth-client/         # Better Auth client wrappers
│   ├── cli/                 # CLI tooling
│   ├── client/              # API client
│   ├── config/              # ConfigService
│   ├── constants/           # Shared constants
│   ├── contexts/            # React contexts
│   ├── core/                # Core library
│   ├── desktop-contracts/   # Desktop IPC contracts
│   ├── desktop-core/        # Desktop core logic
│   ├── desktop-prisma/      # Desktop-local Prisma/PGlite schema + client
│   ├── enums/               # Shared enums
│   ├── errors/              # Error types
│   ├── fonts/               # Font assets
│   ├── harness/             # Test/content harness support
│   ├── helpers/             # Utility helpers
│   ├── hooks/               # React hooks
│   ├── integrations/        # Platform integrations
│   ├── interfaces/          # TypeScript interfaces
│   ├── libs/                # Shared libraries
│   ├── models/              # Domain data models
│   ├── next-config/         # Shared Next.js config
│   ├── pages/               # Shared page components
│   ├── pricing/             # Pricing helpers
│   ├── prisma/              # PostgreSQL Prisma schema, migrations, generated client
│   ├── prompts/             # AI prompts
│   ├── props/               # Component prop interfaces
│   ├── serializers/         # JSON:API serializers
│   ├── services/            # Frontend services
│   ├── storage/             # Storage abstraction
│   ├── styles/              # SCSS/CSS (gen-* design system)
│   ├── tools/               # Agent tool definitions
│   ├── tsconfig/            # Shared TS configs
│   ├── types/               # Shared types
│   ├── ui/                  # UI component library
│   ├── utils/               # Utilities
│   ├── workflow-engine/     # Workflow execution engine
│   ├── workflow-saas/       # SaaS workflow node defs + registry (hand-written, not generated)
│   ├── workflow-ui/         # Workflow UI components
│   └── workflows/           # Workflow definitions
├── ee/                      # Enterprise features (commercial license)
│   └── packages/
│       ├── billing/         # Stripe billing providers (wired via webpack @billing-providers alias)
│       └── harness/         # @genfeedai/ee-harness — enterprise content-harness pack
├── docker/                  # Docker configs
├── docs/                    # Documentation
├── playwright/              # Playwright e2e suite (configs + tests)
├── scripts/                 # Build & utility scripts
├── tests/                   # Shared test utilities
├── tools/                   # Dev tooling
└── .agents/                 # Agent session docs & context
```

## Key Conventions

- **Backend service structure**: `apps/server/{service}/src/` with NestJS modules for service workspaces that have `package.json`
- **API services**: `apps/server/api/src/services/{service-name}/` — 30+ domain services
- **Integrations**: `apps/server/api/src/services/integrations/{platform}/` — 48+ platforms
- **Frontend app structure**: `apps/app/app/`, `apps/docs/app/`, and `apps/website/app/` use Next.js App Router. Admin routes are inside `apps/app/app/(protected)/admin`.
- **Shared packages**: `packages/{name}/src/index.ts` barrel exports
- **Serializers**: `packages/serializers/src/{attributes,configs,server}/{category}/`
- **Enterprise packages**: `ee/packages/{name}/` — commercial license packages; current workspace packages are `billing` and `harness`
- **Tests**: Colocated `*.test.ts` / `*.spec.ts` next to source files
