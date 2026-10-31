# Project Structure — Genfeed.ai

**last_verified: 2026-09-03** · Read when relevant to the task — keep it short. `ls` gives you the
full inventory; this file records only what `ls` cannot tell you.

## Top level

| path | what |
|---|---|
| `apps/server/*` | backend workspaces with a `package.json` (api, workers, files, mcp, notifications, discord, slack, telegram) |
| `apps/web` | Next.js product app (`@genfeedai/web`, app.genfeed.ai) |
| `apps/marketing` | Next.js marketing site (`@genfeedai/marketing`, genfeed.ai) |
| `apps/desktop`, `apps/mobile`, `apps/extension` | Electron, Expo and browser-extension clients. Apps are named by client, not by subdomain. |
| `.agents/` | agent memory, sessions, build skills |

## Non-obvious facts

- **`apps/server/api/`** is the shared server tree (`@genfeedai/api`, alias `@api/*`).
  #4348 folded `@genfeedai/server` back into api. Do not recreate `apps/server/server`.
  The name "core" stays retired — enforced by `bun run check:retired-core-names`.
- **`apps/server/{clips,images,videos,voices}/` are not services.** Clip/media code lives under
  API, files, and packages. Do not recreate those directories or `@clips`/`@images`/`@videos`/`@voices` aliases.
- **`packages/contracts` (`@genfeedai/contracts`)** is the shared contracts workspace
  (enums at `.`, plus `/constants`, `/interfaces`, `/types`, `/api-types`, `/queue`,
  `/desktop`). `enums`, `constants`, `interfaces`, `types`, `api-types`,
  `queue-contracts`, and `desktop-contracts` are **deleted**. `props` stays its own
  workspace because it depends on client/serializers/services/models.
- **`packages/workflows` is the only workflow package** (subpath exports `/contracts`, `/engine`,
  `/generation`, `/nodes`, `/ui`). That `/contracts` subpath is workflow-engine contracts, not
  `@genfeedai/contracts`. `packages/core`, `workflow-engine`, `workflow-saas`, and
  `workflow-ui` are **deleted**; stale `dist/`/`node_modules/` residue may linger locally — delete it.
- **Billing is in-tree and AGPL** — `apps/server/api/src/collections/{subscriptions,user-subscriptions,subscription-attributions}/`,
  runtime-gated by `apps/server/api/src/common/subscriptions/billing.providers.ts`. No `ee/`,
  no build flavor.

## Conventions

- API domain services `apps/server/api/src/services/{name}/` (30+); integrations at
  `.../integrations/{platform}/` (48+)
- Admin routes live in `apps/web/app/(protected)/admin`
- App-only feature code lives in `apps/web/src/features/<feature>/` (see system-patterns → Feature folders)
- Packages export through `packages/{name}/src/index.ts`
- Serializers: `packages/serializers/src/{attributes,configs,server}/{category}/`
- Tests colocated as `*.test.ts` / `*.spec.ts`
