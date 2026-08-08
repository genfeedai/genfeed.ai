---
name: local_dev_portless_only
description: Interactive local app always boots on https://app.genfeed.localhost via package `dev` (Portless) — never silent fixed-port debug
type: feedback
last_verified: 2026-08-08
---

# Local interactive boot: Portless HTTPS only

**Rule:** When asked to run / use / QA the local app, start **Portless** services only. The app URL is always:

**`https://app.genfeed.localhost/`**

## Canonical root scripts

| Script | Starts |
|---|---|
| `bun run dev:setup` | Machine once — Portless HTTPS on :443 |
| `bun run dev:doctor` | Read-only Portless contract check |
| `bun run dev:backend:min` | api + files + notifications |
| `bun run dev:backend` | full backend (+ mcp + workers) |
| `bun run dev:app` | Next app |
| `bun run dev` | full stack |
| `bun run dev:debug*` | **Explicit** fixed-port escape hatch only |

Never start fixed ports (`:3000`, `:3010`, …), `http://localhost:*`, or `dev:debug*` as the interactive path unless **explicitly** asked for fixed-port/debug mode in that conversation.

## Package script model (no more `dev:direct` / `dev:portless`)

| Script | Role |
|---|---|
| **`dev`** | **Portless start** (the only normal entry) |
| **`dev:process`** | Child process Portless runs; also the fixed-port process when `PORTLESS_URL` is unset (`run-service.ts`) |
| **`dev:debug`** | Alias of `dev:process` without Portless (fixed ports) |

**Why:** `dev:direct` / `dev:portless` were a confusing dual surface. Interactive = Portless. Fixed ports are named `debug`.

**How to apply:**

1. Put the repo-pinned Portless binary first: `export PATH="$PWD/node_modules/.bin:$PATH"`.
2. Boot: `bun run dev:backend:min` + `bun run dev:app` (or `bun run dev`).
3. Open **`https://app.genfeed.localhost/`**.
4. Portless down: fix proxy once (at most one elevated prompt). Do **not** silently fall back to `dev:debug*`.
5. Work on the main checkout (or worktree after `bun run wt:sync`) so `.env*` exist.
