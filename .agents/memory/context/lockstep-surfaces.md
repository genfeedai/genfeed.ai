---
name: lockstep-surfaces
description: Files that must change together, and the command that fails when one is missed; read before editing routes, the curated action catalog, MCP tools, the Prisma schema or UI copy
type: reference
last_verified: 2026-11-21
---

Checked against the code on 2026-11-21. "Fails" names the check that catches a missed companion.

| When you change | Also change | Fails |
| --- | --- | --- |
| `packages/contracts/src/constants/routes.constant.ts` (and `route-manifest.constant.ts`) | `apps/web/src/lib/workspace-shell/workspace-shell-registry.ts` (`PROTECTED_ROUTE_INVENTORY`) and the specs next to it. Public routes are classified in `scripts/architecture/check-product-route-inventory.ts` | `bun run check:route-inventory` |
| `packages/actions/src/registry/curated-actions.catalog.ts` (which actions the Agent and MCP expose) | `curated-action-catalog.spec.ts`; `mutation-policy.ts` when a mutation changes. A surface change shows up as a CI annotation from the Curated Action Catalog workflow | `bun run check:mcp-tool-references` for docs that name a removed tool |
| `apps/server/mcp/src/services/tool-registry.service.ts` | `tool-registry.service.spec.ts`, `tool-registry.presentation.spec.ts`, `apps/docs/content/api-reference/mcp.mdx` | `check:mcp-tool-references` |
| `packages/prisma/prisma/schema.prisma` | Regenerate `packages/prisma/src/enum-field-map.ts`: `cd packages/prisma && bun run db:generate`. Never edit it by hand | `check:model-metadata` in `packages/prisma` (run by the executable contracts) |
| A file listed in `scripts/architecture/untranslated-strings.baseline.json`, when you move or remove its strings | Lower the baseline in the same PR: `bun run check:untranslated-strings --update-baseline` | `bun run check:untranslated-strings` (a file under its allowance is stale) |
| A file listed in `scripts/architecture/runtime-complexity.baseline.json`, when it gets shorter | `bun run check:runtime-complexity:update` | `bun run check:runtime-complexity` (a file under its ceiling is stale) |

New copy goes to `apps/web/messages/en/<namespace>.json` and is read with `useTranslations`; see `project_shared_package_message_catalogs.md`.
