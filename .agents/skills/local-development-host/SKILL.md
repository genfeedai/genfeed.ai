---
name: local-development-host
description: The local-development host contract — clean Portless HTTPS routes (`https://<service>.genfeed.localhost`) and endpoints derived from `PORTLESS_URL`, never fixed-port URLs. Use when running or debugging local dev servers, editing `.env` examples or `scripts/dev/*`, changing dev commands, or diagnosing local auth/cookie/magic-link failures.
metadata:
  version: "1.1.0"
  tags: "development, environment, configuration, portless, local-https"
  last_verified: "2026-08-08"
---

# Canonical local development host

**Rule:** use the repository's clean Portless HTTPS routes for interactive local
development. Runtime domains and endpoints derive from each process's worktree-aware
`PORTLESS_URL` — never mix those routes with fixed-port URLs.

**Why:** `*.localhost` resolves to loopback with no `/etc/hosts` setup. Portless gives stable service
names, trusted local HTTPS, and worktree isolation. Mixing a Portless app origin with a fixed-port
API origin split Better Auth's local cookie context and caused magic-link failure.

**Apply:**
- Run `bun run dev:setup` once per development machine. It idempotently installs or verifies the
  repository-pinned Portless HTTPS startup service and never synchronizes `/etc/hosts`.
- `bun run dev:status` lists live Portless routes and each `next-server` cwd. `FOREIGN` is another
  repo. Never kill the shared Portless proxy on :443.
- Prefer `export PATH="$PWD/node_modules/.bin:$PATH"` so the repo-pinned Portless binary is used.
- Normal interactive boot: `bun run dev:backend:min` + `bun run dev:app` (or `bun run dev`).
  Open **`https://app.genfeed.localhost/`**.
- Package **`dev`** is the Portless entry; **`dev:process`** is the child (`run-service.ts`);
  root **`dev:debug*`** is the only fixed-port escape hatch. Do not use retired `dev:direct*` /
  `dev:portless*` names.
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
  explicit `dev:debug:*` commands or owned by Docker, self-hosted, deployed infrastructure, health
  checks, or boundary-neutral tests.
- Keep `localhost` / port `3011` where the boundary is deliberately Docker, self-hosted, deployed
  infra, a health check, or a host-irrelevant test.
- `local.genfeed.ai` survives only as temporary compatibility in security allowlists, migration
  notes, and tests that prove that compatibility. It is never an active default.
