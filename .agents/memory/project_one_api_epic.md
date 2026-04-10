---
name: One API Epic
description: Epic #95 — consolidate genfeed.ai into single NestJS API for self-hosted + cloud, 20 sub-issues across 8 phases
type: project
---

Epic: genfeedai/genfeed.ai#95
Plan: `elegant-imagining-bunny.md` in local Claude Code plans dir (machine-local, not in repo)

**Why:** The codebase had two API surfaces (Next.js routes + NestJS backend). Self-hosted users couldn't run the app without Clerk/Stripe keys because the codebase was deeply coupled to cloud services.

**How to apply:** When implementing any issue in this epic, follow the phase ordering strictly. Phase 0 (config decoupling) and Phase 0.5 (noop providers) must complete before auth/middleware changes.

Key architectural decisions:
- Edition detection via `IS_SELF_HOSTED = !process.env.CLERK_SECRET_KEY`
- Noop providers for Clerk/Stripe in self-hosted (not conditional imports)
- Self-hosted seed uses `onApplicationBootstrap` NestJS lifecycle hook
- WebSocket via direct port connection (Next.js rewrites can't proxy WS upgrades)
- Minimum self-hosted env vars: MONGODB_URI + REDIS_HOST + PORT + TOKEN_ENCRYPTION_KEY
- Three install paths: npx (no Docker), single Docker image, Docker Compose

Sub-issues: #96 #97 #98 #99 #100 #101 #102 #103 #105 #106 #107 #108 #109 #110 #111 #112 #113 #114 #115 #117
