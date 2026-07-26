# Project Structure — Genfeed.ai

**last_verified: 2026-07-26** · Auto-loaded every request — keep it short. `ls` gives you the
full inventory; this file records only what `ls` cannot tell you.

## Top level

| path | what |
|---|---|
| `apps/server/*` | 12 backend service/server-tier workspaces (port table in CLAUDE.md) |
| `apps/app`, `apps/docs`, `apps/website` | Next.js App Router apps |
| `apps/desktop/app`, `apps/mobile/app` | Electron and Expo workspaces |
| `apps/extensions/{browser,ide}/app` | browser + IDE extensions (v2 milestone) |
| `packages/*` | 38 shared `@genfeedai/*` packages |
| `ee/packages/{billing,harness}` | commercial-license packages |
| `playwright/` `tests/` `scripts/` `tools/` `docker/` `docs/` | suites, tooling, deploy, docs |
| `.agents/` | agent memory, sessions, build skills |

## Non-obvious facts

- **`apps/server/clips/` is not a workspace** — no `package.json` on `origin/master`. Clip code
  currently lives under API/packages/files paths. Re-verify before treating it as a service.
- **`apps/server/server/`** is the shared `@genfeedai/server` package, aliased `@server/*`.
  The name "core" is retired — see `rules/server_not_core.md`.
- **`packages/workflows` is the only workflow package** (subpath exports `/contracts`, `/engine`,
  `/generation`, `/nodes`, `/ui`). `packages/core`, `workflow-engine`, `workflow-saas`, and
  `workflow-ui` are **deleted**; stale `dist/`/`node_modules/` residue may linger locally — delete it.
- **Billing** reaches the API through the webpack `@billing-providers` alias; OSS builds resolve to
  `billing.providers.oss.ts` stubs. Credits collections/controllers stay in the OSS API.

## Conventions

- API domain services `apps/server/api/src/services/{name}/` (30+); integrations at
  `.../integrations/{platform}/` (48+)
- Admin routes live in `apps/app/app/(protected)/admin`
- Packages export through `packages/{name}/src/index.ts`
- Serializers: `packages/serializers/src/{attributes,configs,server}/{category}/`
- Tests colocated as `*.test.ts` / `*.spec.ts`
