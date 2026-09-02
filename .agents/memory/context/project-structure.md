# Project Structure — Genfeed.ai

**last_verified: 2026-07-26** · Auto-loaded every request — keep it short. `ls` gives you the
full inventory; this file records only what `ls` cannot tell you.

## Top level

| path | what |
|---|---|
| `apps/server/*` | backend service/server-tier workspaces (port table in CLAUDE.md) |
| `apps/extensions/{browser,ide}/app` | browser + IDE extensions (v2 milestone) |
| `.agents/` | agent memory, sessions, build skills |

## Non-obvious facts

- **`apps/server/clips/` is not a workspace** — no `package.json` on `origin/master`. Clip code
  currently lives under API/packages/files paths. Re-verify before treating it as a service.
- **`apps/server/api/`** is the shared server tree (`@genfeedai/api`, alias `@api/*`).
  #4348 folded `@genfeedai/server` back into api. The name "core" stays retired — see `rules/server_not_core.md`.
- **`packages/workflows` is the only workflow package** (subpath exports `/contracts`, `/engine`,
  `/generation`, `/nodes`, `/ui`). `packages/core`, `workflow-engine`, `workflow-saas`, and
  `workflow-ui` are **deleted**; stale `dist/`/`node_modules/` residue may linger locally — delete it.
- **Billing is in-tree and AGPL** — `apps/server/api/src/collections/{subscriptions,user-subscriptions,subscription-attributions}/`,
  runtime-gated by `apps/server/api/src/common/subscriptions/billing.providers.ts`. No `ee/`,
  no build flavor.

## Conventions

- API domain services `apps/server/api/src/services/{name}/` (30+); integrations at
  `.../integrations/{platform}/` (48+)
- Admin routes live in `apps/app/app/(protected)/admin`
- Packages export through `packages/{name}/src/index.ts`
- Serializers: `packages/serializers/src/{attributes,configs,server}/{category}/`
- Tests colocated as `*.test.ts` / `*.spec.ts`
