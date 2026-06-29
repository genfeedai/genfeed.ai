---
created: 2026-04-07T00:00:00Z
last_updated: 2026-06-29T00:00:00Z
version: 1.1
author: Claude Code PM System
---

# Progress — Genfeed.ai

## Current State (2026-06-29)

### Migration Complete
- Successfully migrated and consolidated from separate `cloud` + `core` repositories into a single `genfeed.ai` monorepo
- All pages, tests, and features ported over
- Cloud-only services (fanvue, llm, twitch) and apps (chatgpt, marketplace, shared) removed
- Enterprise features isolated into `ee/packages/` under commercial license

### CI/CD
- GitHub Actions configured for CI/CD, E2E, release QA, and production deploy pipelines
- Standard GitHub Actions runners are the default execution environment
- Secret scanning is set up (`gitleaks`, changed-file `secretlint`, local staged-content scan before commits)
- Branch flow: trunk-based — short-lived branches off `master` → PR → `master`

### Recent Milestones
- Better Auth is the active auth baseline after the #735 cutover and hardening passes.
- Default local ports remain grouped: frontend `300x`, API core `3010-3014`, service/bot apps `3015-3019`, fleet services `3020-3022`.
- GitHub issue implementation workflow is trunk-based on `master` with short-lived worktrees/branches and PRs back to `master`.
- Product recurring automation has been migrated toward workflow-backed scheduling; legacy `cron-jobs` is compatibility-only for new product work.

### Codebase Health
- Fallow health score: 72/100 (tracked via issue #83)
- BullMQ processor placement refactor resolved for API: current source has no `@Processor(...)` decorators in `apps/server/api`; add new processors to workers or the owning runtime service.

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

- Some legacy naming/comments remain from the pre-migration cloud/core and Mongo stacks; verify against current Prisma/Postgres source before acting.
- Desktop and mobile apps in early stages
- GPU pipeline services (images, videos, voices) need deployment documentation
- Full `bun type-check` currently blocked by the existing `@genfeedai/ui` rootDir/file-list issue around `packages/client/src/schemas/*`
- MCP/notifications Vitest commands currently blocked before test execution because `unplugin-swc` is missing from their Vitest config resolution
