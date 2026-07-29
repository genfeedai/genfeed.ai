---
name: Local Development Host Decisions
description: Architecture choices for clean HTTPS Portless runtime URL derivation and direct fixed-port fallbacks
type: project
status: active
last_verified: 2026-07-29
topics: [development, environment, configuration, notifications]
---

# Local Development Host Decisions

## Optimization target

Eliminate endpoint and auth-cookie drift across local apps and services while preserving zero-setup worktree isolation and an explicit fixed-port debugging escape hatch.

## Approaches considered

1. **Plain HTTP on an unprivileged proxy port.** Avoids certificate trust and privileged binding, but exposes a noisy port in every URL and splits the visible contract from normal HTTPS behavior.
2. **Portless HTTPS on the standard port.** Each Portless process receives `PORTLESS_URL`; a shared runner replaces the service label while preserving protocol, TLD, and worktree prefix. Portless owns the one-time local CA trust and the URL has no explicit port.
3. **A separate repository reverse proxy.** Provides clean HTTPS names, but duplicates Portless routing, certificate, and lifecycle state.

## Decision

Use approach 2. The repository pins Portless as a development dependency and exposes `bun run dev:setup` as an idempotent machine-onboarding command that installs or verifies the HTTPS startup service. The repository wrapper always starts Portless as HTTPS on port `443`, disables hosts-file synchronization, and derives every sibling service origin from `PORTLESS_URL`. Root `dev*` commands use that contract; package `dev:direct` and root `dev:direct:*` commands retain the fixed-port escape hatch through an explicit direct-runtime environment adapter.

The app's public API variables point to its own `/v1` route. Next.js rewrites that route to the derived API origin, keeping Better Auth cookies host-scoped to one app/worktree instead of sharing them across `*.genfeed.localhost`. Server-to-server variables use the direct derived service origins.

Committed local environment examples use `https://app.genfeed.localhost`, `https://api.genfeed.localhost`, and the equivalent named service origins. Fixed direct development continues to bind app `3000`, API `3010`, and notifications `3111`, but those values are injected at the `dev:direct:*` boundary rather than serving as normal endpoint defaults. Keep port `3011` for Docker, self-hosted, deployed infrastructure, health checks, and tests that intentionally model those boundaries.

Keep `local.genfeed.ai` only in explicitly documented temporary compatibility allowlists and focused compatibility tests.
