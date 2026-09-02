# "core" is a retired name — do not revive it

**last_verified: 2026-09-02**

**No new package or directory may be named "core."** The name meant three different things across
this project's history, so it is permanently retired.

- The shared server tree is `apps/server/api` (`@genfeedai/api`, alias `@api/*`).
  #4348 folded the #1090 `@genfeedai/server` extraction back into api.
  Do not recreate `apps/server/server`, `@genfeedai/server`, or `@server/*`.
- Two-tier split: pure infra → `packages/libs`; Nest services → `apps/server/api`.
  Workers consume api as a library through `@api/*`.
- Workflow consolidation **shipped**: `packages/workflows` is canonical (subpath exports
  `/contracts`, `/engine`, `/generation`, `/nodes`, `/ui`). `packages/core`, `workflow-engine`,
  `workflow-saas`, and `workflow-ui` are deleted — do not import `@genfeedai/core`,
  `@genfeedai/workflow-engine`, `@genfeedai/workflow-saas`, or `@genfeedai/workflow-ui`.
  Workflow UI resolves through `@genfeedai/workflows/ui`.
- Local checkouts may still hold untracked `dist/`/`node_modules/` residue under those deleted
  package paths, including `apps/server/server`. It confuses module resolution — delete it.

Decision record: https://github.com/genfeedai/genfeed.ai/issues/4348
