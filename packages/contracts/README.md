# @genfeedai/contracts

Shared contracts for Genfeed enums, constants, interfaces, API types, queues,
and desktop IPC.

This package is the place other workspaces import for cross-app types and
constants. Keep shared shapes here (or in `packages/props/`) instead of defining
interfaces inline in components. See the Shared interfaces section below.

## Use

This is a private workspace package (`"private": true` in `package.json`).
Depend on it with `"@genfeedai/contracts": "workspace:*"`; it is not published
to npm. Prefer the package subpath that matches the folder you need (for
example `@genfeedai/contracts/enums` or `@genfeedai/contracts/interfaces`).

The package root export (`src/index.ts`) currently re-exports `analytics` and
`enums` only. Other folders are available through the subpath exports listed in
`package.json`.

```ts
import { ActivityKey } from '@genfeedai/contracts'; // root: enums and analytics only
import type { IActivityPopulated } from '@genfeedai/contracts/interfaces';
import { WORKFLOW_EXECUTION_QUEUE } from '@genfeedai/contracts/queue';
```

Enums are imported by almost every file and the analytics helpers are small, so
both stay on the root. The other folders are large and used by fewer files;
keeping them off the root barrel stops every consumer from loading all of them.
When you add a folder, add a subpath export for it, and add it to the root only
when nearly every consumer needs it.

## `src/` directory map

| Folder | Role |
| --- | --- |
| `analytics/` | Shared analytics evaluation and metric availability types (root export) |
| `enums/` | Shared enums and activity catalogs (root export) |
| `constants/` | Shared constants (API keys, models, credits, feature flags, and more) |
| `interfaces/` | Shared TypeScript interfaces for AI, admin, studio, billing, and apps |
| `types/` | Domain type modules (workflow, nodes, jobs, prompts, cost, and related) |
| `api-types/` | OpenAPI-generated API types plus Zod helpers (`src/api-types/generated/`) |
| `queue/` | Queue names, job data shapes, and dispatch helpers |
| `desktop/` | Desktop IPC channel names and local/offline runtime switches |

Do not edit generated API types under `src/api-types/generated/` by hand.

`package.json` `exports` is the source of truth for the exact subpaths. If this
table and `exports` disagree, `exports` wins.

## Shared interfaces

`CLAUDE.md` requires shared interfaces in `packages/contracts/src/interfaces/`
or `packages/props/` (no inline interfaces in components). `CONTRIBUTING.md`
also asks contributors not to introduce inline shortcut interfaces under
TypeScript strict mode.

## Tests

```bash
cd packages/contracts && bunx vitest run --config vitest.config.ts
```

## License

AGPL-3.0
