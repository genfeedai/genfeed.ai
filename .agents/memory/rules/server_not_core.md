# "core" is a retired name — the server-tier lib is `@genfeedai/server`

**last_verified: 2026-07-26**

**No new package or directory may be named "core."** The name meant three different things across
this project's history, so it is permanently retired.

- Server-tier extraction target (#1090) is `apps/server/server` → package `@genfeedai/server`,
  alias `@server/*` in `apps/server/tsconfig.json`. The alias mirrors the package name 1:1 so it
  stays greppable. `@domain/*` was rejected; `apps/server/core` was cancelled.
- Two-tier split: pure infra → `packages/libs`; entangled DI services → `@genfeedai/server`.
- Workflow consolidation **shipped**: `packages/workflows` is canonical (subpath exports
  `/contracts`, `/engine`, `/generation`, `/nodes`, `/ui`). `packages/core`, `workflow-engine`,
  `workflow-saas`, and `workflow-ui` are deleted — do not import `@genfeedai/core`,
  `@genfeedai/workflow-engine`, `@genfeedai/workflow-saas`, or `@genfeedai/workflow-ui`.
  Workflow UI resolves through `@genfeedai/workflows/ui`.
- Local checkouts may still hold untracked `dist/`/`node_modules/` residue under those deleted
  package paths. It confuses module resolution — delete it.

Decision record: https://github.com/genfeedai/genfeed.ai/issues/1090#issuecomment-4886754311
