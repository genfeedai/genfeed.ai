# Server-tier extraction lib is `@genfeedai/server` — "core" is retired

**last_verified: 2026-07-06**

The #1090 extraction target for entangled NestJS domain/integration services is
**`apps/server/domain`** (package **`@genfeedai/server`**, alias
**`@server/*`** in `apps/server/tsconfig.json`). The earlier alias draft
`@domain/*` is **rejected** (Vincent, 2026-07-06): too generic — "domain" reads
as DDD boilerplate at import sites and says nothing about which package it is.
The alias mirrors the package name 1:1 (`@genfeedai/server` →
`@server/*`), is uniquely greppable, and was verified zero-cost at
rename time (0 existing `@domain/` imports; directory not yet scaffolded).
The earlier draft name `apps/server/core` / `@genfeedai/core` is **cancelled**:

- `@genfeedai/core` is already taken — `packages/core`, the old workflows-OSS
  "Core utilities for Genfeed workflow engine" (live consumer:
  `@genfeedai/workflow-ui`).
- "core" has meant three different things (pre-migration OSS repo, workflow
  utils, proposed server domain). **No new package or directory may be named
  "core".**

Two-tier split stays: pure infra → `packages/libs`; entangled DI services →
`@genfeedai/server`. Planned end-state (decision on the epic): workflow
cluster consolidates 5 → 2 (`@genfeedai/workflows` with `/contracts`,
`/generation`, `/nodes`, `/engine`, and `/ui` subpaths), and `packages/core`
is deleted in that consolidation. `@genfeedai/workflow-ui` is transitional;
future workflow UI imports should resolve through `@genfeedai/workflows/ui`, not
another top-level workflow package.

Canonical decision record:
https://github.com/genfeedai/genfeed.ai/issues/1090#issuecomment-4886754311
