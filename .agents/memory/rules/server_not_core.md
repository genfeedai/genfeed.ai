# Server-tier extraction lib is `@genfeedai/server` — "core" is retired

**last_verified: 2026-07-24**

## Standing rule

**No new package or directory may be named "core".** The name has meant three
different things across the project's history (the pre-migration OSS repo, the
old workflow-utilities package, and a proposed server-domain package), so it is
permanently retired as a name.

The #1090 extraction target for entangled NestJS domain/integration services is
**`apps/server/server`** (package **`@genfeedai/server`**, alias **`@server/*`**
in `apps/server/tsconfig.json`) — never "core". The alias mirrors the package
name 1:1, which makes it uniquely greppable. The earlier alias draft `@domain/*`
is **rejected** (Vincent, 2026-07-06): too generic — "domain" reads as DDD
boilerplate at import sites and says nothing about which package it is. The
earlier draft name `apps/server/core` / `@genfeedai/core` is **cancelled**.

Two-tier split: pure infra → `packages/libs`; entangled DI services →
`@genfeedai/server`.

## Shipped end state — workflow consolidation is complete

What was planned as "workflow cluster consolidates 5 packages → 2" has landed:

- **`packages/workflows`** (`@genfeedai/workflows`) is the single canonical
  workflow package. It exposes the consolidated surface through subpath exports:
  `/contracts`, `/engine`, `/generation` (incl. `/generation/comfyui`),
  `/nodes`, and `/ui` (incl. `/ui/canvas`, `/ui/hooks`).
- **`packages/core`, `packages/workflow-engine`, `packages/workflow-saas`, and
  `packages/workflow-ui` are deleted** — none of them exist in git. Do not
  reintroduce them, and do not import `@genfeedai/core`,
  `@genfeedai/workflow-engine`, `@genfeedai/workflow-saas`, or
  `@genfeedai/workflow-ui`; no such packages exist.
- Workflow UI imports resolve through **`@genfeedai/workflows/ui`**, not a
  separate top-level workflow package.

Note: stale `dist/` (and `node_modules/`) output for the deleted packages can
linger in a local checkout under
`packages/{core,workflow-engine,workflow-saas,workflow-ui}/`. Those directories
are untracked build residue, not code — they confuse module resolution and
tooling, so delete them if present.

Canonical decision record:
https://github.com/genfeedai/genfeed.ai/issues/1090#issuecomment-4886754311
