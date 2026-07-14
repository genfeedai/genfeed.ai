---
name: Local Development Host Decisions
description: Architecture choices for canonical genfeed.localhost endpoints and the notifications development port
type: project
status: active
last_verified: 2026-07-14
topics: [development, environment, configuration, notifications]
---

# Local Development Host Decisions

## Optimization target

Minimize endpoint drift across local apps, services, browser extensions, and test tooling without coupling browser bundles to server-only configuration APIs.

## Approaches considered

1. **One universal TypeScript constants package.** This gives one import for every runtime, but it turns environment-specific deployment values into compiled constants and risks pulling server-oriented configuration dependencies into browser bundles.
2. **Root env source plus runtime-specific config adapters.** Root `.env.local` values are distributed by `scripts/env-sync.ts`; Next.js, Plasmo, NestJS, workflow UI, and Playwright read through their existing environment/config boundaries. Shared UI packages accept injected endpoints where runtime configuration is required.
3. **Independent defaults in every consumer.** This is the smallest immediate diff, but it preserves the failure mode that produced inconsistent hosts and notifications ports.

## Decision

Use approach 2. The canonical interactive-development endpoints live in the root environment contract and flow into generated app/service env files. Browser code reads only `NEXT_PUBLIC_*` or `PLASMO_PUBLIC_*` values (or receives an injected URL); NestJS code uses its config service. Docker/self-hosted loopback configuration remains independent because its network topology intentionally differs.

Use `genfeed.localhost` as the interactive-development host and port `3111` for the local notifications/websocket service. Keep port `3011` for Docker, self-hosted, deployed infrastructure, health checks, and tests that intentionally model those boundaries.

Keep `local.genfeed.ai` only in explicitly documented temporary compatibility allowlists and focused compatibility tests.

