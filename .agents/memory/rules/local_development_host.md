---
name: Canonical local development host
description: genfeed.localhost and env/config boundaries are the local-development URL contract
type: feedback
status: active
last_verified: 2026-07-26
topics: [development, environment, configuration]
---

**Rule:** use `genfeed.localhost` for interactive local development. Runtime domains and endpoints
come from the owning environment/config boundary — never scatter local URL literals through consumers.

**Why:** `*.localhost` resolves to loopback with no `/etc/hosts` setup and isolates Genfeed cookies.
Independent literals caused host and notifications-port drift.

**Apply:**
- Canonical values live in the root env contract, distributed by `bun run env:sync local`.
- Browser bundles read `NEXT_PUBLIC_*` / `PLASMO_PUBLIC_*`, or take endpoints from an existing
  provider/config interface. Never make them depend on server-only config access.
- Interactive local notifications/websocket runs on port **3111**.
- Keep `localhost` / port `3011` where the boundary is deliberately Docker, self-hosted, deployed
  infra, a health check, or a host-irrelevant test.
- `local.genfeed.ai` survives only as temporary compatibility in security allowlists, migration
  notes, and tests that prove that compatibility. It is never an active default.
