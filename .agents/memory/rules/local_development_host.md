---
name: Canonical local development host
description: Portless HTTP routes and runtime-derived environment values are the local-development contract
type: feedback
status: active
last_verified: 2026-07-28
topics: [development, environment, configuration]
---

**Rule:** use the repository's Portless HTTP routes on port `1355` for interactive local
development. Runtime domains and endpoints derive from each process's worktree-aware
`PORTLESS_URL` — never mix those routes with fixed-port URLs.

**Why:** `*.localhost` resolves to loopback with no `/etc/hosts` setup. Portless gives stable service
names and worktree isolation without binding privileged ports. Mixing a Portless app origin with a
fixed-port API origin split Better Auth's local cookie context and caused magic-link failure.

**Apply:**
- Normal root `dev*` commands use `http://<service>.genfeed.localhost:1355`; linked worktrees
  automatically receive a branch prefix.
- `scripts/dev/run-portless.ts` pins plain HTTP, port `1355`, `.localhost`, and no hosts-file sync,
  then derives all service endpoints from `PORTLESS_URL`.
- Browser API/auth traffic stays on the app origin under `/v1`; Next.js proxies it to the derived
  Portless API origin. Do not set a shared `.genfeed.localhost` auth cookie domain.
- Browser bundles read `NEXT_PUBLIC_*` / `PLASMO_PUBLIC_*`, or take endpoints from an existing
  provider/config interface. Never make them depend on server-only config access.
- Fixed ports (`3000`, `3010`, `3111`, and peers) belong only to explicit `dev:direct:*`, Docker,
  self-hosted, deployed infrastructure, health checks, or boundary-neutral tests.
- Keep `localhost` / port `3011` where the boundary is deliberately Docker, self-hosted, deployed
  infra, a health check, or a host-irrelevant test.
- `local.genfeed.ai` survives only as temporary compatibility in security allowlists, migration
  notes, and tests that prove that compatibility. It is never an active default.
