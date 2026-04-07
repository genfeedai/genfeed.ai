---
created: 2026-04-07T00:00:00Z
last_updated: 2026-04-07T00:00:00Z
version: 1.0
author: Claude Code PM System
---

# Project Structure — Genfeed.ai

## Root Layout

```
genfeed.ai/
├── apps/
│   ├── server/              # 12 NestJS backend services
│   │   ├── api/             # Main API (port 3001)
│   │   ├── clips/           # Clips processing (3002)
│   │   ├── discord/         # Discord integration (3003)
│   │   ├── files/           # File processing (3005)
│   │   ├── images/          # Image generation
│   │   ├── mcp/             # MCP server (3006)
│   │   ├── notifications/   # Notification service (3007)
│   │   ├── slack/           # Slack integration (3008)
│   │   ├── telegram/        # Telegram bot (3009)
│   │   ├── videos/          # Video generation
│   │   ├── voices/          # Voice generation
│   │   └── workers/         # Background jobs (3010)
│   ├── app/                 # Main studio app (Next.js)
│   ├── admin/               # Admin panel (Next.js)
│   ├── website/             # Marketing site (Next.js)
│   ├── desktop/             # Electron desktop app
│   ├── mobile/              # React Native / Expo
│   └── extensions/          # Browser & IDE extensions
│       ├── browser/
│       ├── ide/
│       └── vscode/
├── packages/                # ~45 shared packages (@genfeedai/*)
│   ├── agent/               # Agent logic
│   ├── api-types/           # Generated API types
│   ├── cli/                 # CLI tooling
│   ├── client/              # API client
│   ├── config/              # ConfigService
│   ├── constants/           # Shared constants
│   ├── contexts/            # React contexts
│   ├── core/                # Core library
│   ├── db/                  # Database utilities
│   ├── deserializer/        # JSON:API deserializer
│   ├── desktop-client/      # Desktop API client
│   ├── desktop-contracts/   # Desktop IPC contracts
│   ├── desktop-core/        # Desktop core logic
│   ├── desktop-shell/       # Desktop shell
│   ├── enums/               # Shared enums
│   ├── errors/              # Error types
│   ├── fonts/               # Font assets
│   ├── helpers/             # Utility helpers
│   ├── hooks/               # React hooks
│   ├── integration-common/  # Integration base
│   ├── integrations/        # Platform integrations
│   │   ├── discord/
│   │   ├── fanvue/
│   │   ├── instagram/
│   │   ├── linkedin/
│   │   ├── slack/
│   │   ├── telegram/
│   │   ├── threads/
│   │   ├── tiktok/
│   │   ├── twitter/
│   │   └── youtube/
│   ├── interfaces/          # TypeScript interfaces
│   ├── libs/                # Shared libraries
│   ├── models/              # Mongoose models
│   ├── next-config/         # Shared Next.js config
│   ├── pages/               # Shared page components
│   ├── prompts/             # AI prompts
│   ├── props/               # Component prop interfaces
│   ├── providers/           # React providers
│   ├── serializers/         # JSON:API serializers
│   ├── services/            # Frontend services
│   ├── storage/             # Storage abstraction
│   ├── styles/              # SCSS/CSS (gen-* design system)
│   ├── tools/               # Agent tool definitions
│   ├── tsconfig/            # Shared TS configs
│   ├── types/               # Shared types
│   ├── ui/                  # UI component library
│   ├── utils/               # Utilities
│   ├── workflow-cloud/      # Cloud workflow logic
│   ├── workflow-engine/     # Workflow execution engine
│   ├── workflow-saas/       # SaaS workflow (compiled)
│   ├── workflow-ui/         # Workflow UI components
│   └── workflows/           # Workflow definitions
├── ee/                      # Enterprise features (commercial license)
│   └── packages/
│       ├── admin-ee/        # Enterprise admin features
│       ├── analytics/       # Advanced analytics
│       ├── billing/         # Stripe billing & credits
│       ├── branding/        # Brand management
│       ├── collaboration/   # Team collaboration
│       ├── multi-tenancy/   # Multi-tenant org isolation
│       ├── scheduling/      # Advanced scheduling
│       ├── sso/             # Single sign-on
│       └── teams/           # Team management
├── docker/                  # Docker configs
├── docs/                    # Documentation
├── e2e/                     # E2E test suites
├── scripts/                 # Build & utility scripts
├── tests/                   # Shared test utilities
├── tools/                   # Dev tooling
└── .agents/                 # Agent session docs & context
```

## Key Conventions

- **Backend service structure**: `apps/server/{service}/src/` with NestJS modules
- **API services**: `apps/server/api/src/services/{service-name}/` — 30+ domain services
- **Integrations**: `apps/server/api/src/services/integrations/{platform}/` — 48+ platforms
- **Frontend app structure**: `apps/{app}/app/` (Next.js App Router)
- **Shared packages**: `packages/{name}/src/index.ts` barrel exports
- **Serializers**: `packages/serializers/src/{attributes,configs,server}/{category}/`
- **Enterprise packages**: `ee/packages/{name}/` — commercial license, multi-tenancy features
- **Tests**: Colocated `*.test.ts` / `*.spec.ts` next to source files
