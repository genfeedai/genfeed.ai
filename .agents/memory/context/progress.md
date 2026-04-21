---
created: 2026-04-07T00:00:00Z
last_updated: 2026-04-10T00:00:00Z
version: 1.0
author: Claude Code PM System
---

# Progress — Genfeed.ai

## Current State (2026-04-10)

### Migration Complete
- Successfully migrated and consolidated from separate `cloud` + `core` repositories into a single `genfeed.ai` monorepo
- All pages, tests, and features ported over
- Cloud-only services (fanvue, llm, twitch) and apps (chatgpt, marketplace, shared) removed
- Enterprise features isolated into `ee/packages/` under commercial license

### CI/CD
- GitHub Actions configured for CI/CD pipeline
- Blacksmith runners removed — using standard GitHub Actions runners
- Secret scanning set up
- Branch flow: `develop` -> `staging` -> `master` via PR

### Recent Milestones
- PR #116: Migrated raw HTML to UI primitives across the codebase
- PR #120: Dynamic model registry implementation
- PR #118: Thread context compaction for agent conversations
- Root `/` redirect loop fixed for authenticated users with org/brand slug resolution; self-hosted onboarding loop tracked separately in issue #141
- Default local ports regrouped: frontend `300x`, API core `3010-3014`, service/bot apps `3015-3019`, fleet services `3020-3022`
- GitHub issue implementation workflow standardized on worktrees from `develop` with PRs back to `develop`

### Codebase Health
- Fallow health score: 72/100 (tracked via issue #83)
- BullMQ refactor ongoing: 32 `@Processor` decorators in API need moving to workers service (issue #84)

### Active Development Areas
- Stabilization post-migration
- Open-source readiness and documentation
- UI primitives adoption (replacing legacy raw HTML patterns)
- Agent system improvements (dynamic models, context compaction)

## What Works

- Full NestJS backend with 12 services
- Next.js studio app, docs site, marketing website, desktop, mobile, and extensions surfaces
- Agent orchestration and workflow builder
- 48+ platform integrations
- Docker-based deployment
- E2E test suite with Playwright

## Known Issues / Debt

- BullMQ processors still co-located in API instead of workers service
- Some legacy patterns remain from pre-migration cloud/core split
- Desktop and mobile apps in early stages
- GPU pipeline services (images, videos, voices) need deployment documentation
- Full `bun type-check` currently blocked by the existing `@genfeedai/ui` rootDir/file-list issue around `packages/client/src/schemas/*`
- MCP/notifications Vitest commands currently blocked before test execution because `unplugin-swc` is missing from their Vitest config resolution
