---
name: Local Development Host Decisions
description: Architecture choices for Portless runtime URL derivation and direct fixed-port fallbacks
type: project
status: active
last_verified: 2026-07-28
topics: [development, environment, configuration, notifications]
---

# Local Development Host Decisions

## Optimization target

Eliminate endpoint and auth-cookie drift across local apps and services while preserving zero-setup worktree isolation and an explicit fixed-port debugging escape hatch.

## Approaches considered

1. **Static Portless URLs in env files.** Simple for the main checkout, but it loses automatic branch prefixes in linked worktrees and cannot follow a configured proxy port or TLD.
2. **Runtime-derived sibling origins.** Each Portless process receives `PORTLESS_URL`; a shared runner replaces the service label while preserving protocol, proxy port, TLD, and worktree prefix.
3. **Fixed ports as the normal contract.** Familiar and dependency-free, but collisions make ports unstable and it provides no worktree namespace.

## Decision

Use approach 2. The repository wrapper always starts Portless as plain HTTP on unprivileged port `1355`, disables hosts-file synchronization, and derives every sibling service origin from `PORTLESS_URL`. Root `dev*` commands use that contract; package `dev:direct` and root `dev:direct:*` commands retain the fixed-port escape hatch.

The app's public API variables point to its own `/v1` route. Next.js rewrites that route to the derived API origin, keeping Better Auth cookies host-scoped to one app/worktree instead of sharing them across `*.genfeed.localhost`. Server-to-server variables use the direct derived service origins.

Fixed direct development continues to use `genfeed.localhost` with app `3000`, API `3010`, and notifications `3111`. Keep port `3011` for Docker, self-hosted, deployed infrastructure, health checks, and tests that intentionally model those boundaries.

Keep `local.genfeed.ai` only in explicitly documented temporary compatibility allowlists and focused compatibility tests.
