---
name: Canonical local development host
description: genfeed.localhost and env/config boundaries are the local-development URL contract
type: feedback
status: active
last_verified: 2026-07-14
topics: [development, environment, configuration]
---

**Rule:** Use `genfeed.localhost` for interactive local development. Runtime domains and endpoints come from the owning environment/config boundary; do not scatter local URL literals through consumers.

**Why:** `*.localhost` resolves to loopback without `/etc/hosts` setup and isolates Genfeed cookies, while independent literals caused host and notifications-port drift.

**How to apply:**
- Put canonical values in the root env contract and distribute them with `bun run env:sync local`.
- Browser bundles read `NEXT_PUBLIC_*` or `PLASMO_PUBLIC_*` values, or receive endpoints through an existing provider/config interface. Never make them depend on server-only config access.
- Use port `3111` for the interactive local notifications/websocket service.
- Keep `localhost`/port `3011` where the boundary is deliberately Docker, self-hosted, deployed infrastructure, a health check, or a host-irrelevant test.
- Keep `local.genfeed.ai` only as temporary backwards compatibility in security allowlists, migration notes, and tests that explicitly prove that compatibility. It is never an active default.

