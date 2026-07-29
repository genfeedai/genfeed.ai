---
name: Canonical local development host
description: Clean Portless HTTPS routes and runtime-derived environment values are the local-development contract
type: feedback
status: active
last_verified: 2026-07-29
topics: [development, environment, configuration]
---

**Rule:** use the repository's clean Portless HTTPS routes for interactive local
development. Runtime domains and endpoints derive from each process's worktree-aware
`PORTLESS_URL` — never mix those routes with fixed-port URLs.

**Why:** `*.localhost` resolves to loopback with no `/etc/hosts` setup. Portless gives stable service
names, trusted local HTTPS, and worktree isolation. Mixing a Portless app origin with a fixed-port
API origin split Better Auth's local cookie context and caused magic-link failure.

**Apply:**
- Normal root `dev*` commands use `https://<service>.genfeed.localhost`; linked worktrees
  automatically receive a branch prefix.
- `scripts/dev/run-portless.ts` pins HTTPS, port `443`, `.localhost`, and no hosts-file sync,
  then derives all service endpoints from `PORTLESS_URL`.
- Portless performs the one-time local CA trust required for browser-valid HTTPS; it does not
  modify `/etc/hosts`.
- Browser API/auth traffic stays on the app origin under `/v1`; Next.js proxies it to the derived
  Portless API origin. Do not set a shared `.genfeed.localhost` auth cookie domain.
- Browser bundles read `NEXT_PUBLIC_*` / `PLASMO_PUBLIC_*`, or take endpoints from an existing
  provider/config interface. Never make them depend on server-only config access.
- Committed environment examples use clean HTTPS service origins; fixed ports are injected only by
  explicit `dev:direct:*` commands or owned by Docker, self-hosted, deployed infrastructure, health
  checks, or boundary-neutral tests.
- Keep `localhost` / port `3011` where the boundary is deliberately Docker, self-hosted, deployed
  infra, a health check, or a host-irrelevant test.
- `local.genfeed.ai` survives only as temporary compatibility in security allowlists, migration
  notes, and tests that prove that compatibility. It is never an active default.
