# Server-tier extraction lib is `@genfeedai/server-domain` — "core" is retired

**last_verified: 2026-07-05**

The #1090 extraction target for entangled NestJS domain/integration services is
**`apps/server/domain`** (package **`@genfeedai/server-domain`**, alias
`@domain/*` in `apps/server/tsconfig.json`). The earlier draft name
`apps/server/core` / `@genfeedai/core` is **cancelled**:

- `@genfeedai/core` is already taken — `packages/core`, the old workflows-OSS
  "Core utilities for Genfeed workflow engine" (live consumer: `workflow-ui`).
- "core" has meant three different things (pre-migration OSS repo, workflow
  utils, proposed server domain). **No new package or directory may be named
  "core".**

Two-tier split stays: pure infra → `packages/libs`; entangled DI services →
`@genfeedai/server-domain`. Planned end-state (decision on the epic): workflow
cluster consolidates 5 → 2 (`@genfeedai/workflows` with `/contracts`,
`/generation`, `/nodes`, `/engine` subpaths + `workflow-ui`), and
`packages/core` is deleted in that consolidation.

Canonical decision record:
https://github.com/genfeedai/genfeed.ai/issues/1090#issuecomment-4886754311
