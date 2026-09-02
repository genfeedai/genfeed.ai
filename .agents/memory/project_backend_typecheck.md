# Backend type-check pattern (`apps/server/*`)

last_verified: 2026-07-11
Source: PR #1148, PR #1221 (#1145), and the former `@genfeedai/server` extraction in PR #1584 (folded back into api by #4348). Verified against committed `package.json` scripts and `tsconfig.typecheck.json` files.

## Invariant

`nest build` uses swc/webpack with `typeCheck: false`, so tsc never runs during build.
Each backend service workspace gets standalone coverage via a **dedicated** `tsconfig.typecheck.json`
that is **never** the runtime config.

- **Runtime path is untouched:** `start:prod` → `node -r tsconfig-paths/register` reads the
  app's `tsconfig.json` (needs `baseUrl` + `paths`). Do NOT add `baseUrl` to, or otherwise
  disturb, `tsconfig.json` / `tsconfig.app.json`. Webpack inlines internal `@alias/*` imports
  at build time, so runtime alias resolution does not depend on the typecheck config.

## The config

- Shared base: `apps/server/tsconfig.typecheck.base.json` — no `baseUrl` (TS5101 aborts;
  paths resolve relative to the base file's dir), `module: ESNext` + `moduleResolution:
  bundler` (for `import.meta` in `main.ts` and specs), `useDefineForClassFields: false`
  (mirror the swc legacy-decorator runtime — otherwise ES2022 target implies `true` and
  emits spurious TS2612 on entity fields that restate `BaseEntity`), full `@alias` path
  superset, `exclude` specs.
- Per app: `apps/server/<app>/tsconfig.typecheck.json` = `extends` base + `include: ["src/**/*"]`.
  Add `types: ["node","vitest/globals","multer"]` only where the graph reaches
  `Express.Multer` (api and workers). `@types/multer` is NOT hoisted to
  root — only apps declaring it resolve `multer` in `types`.
- Script: `"type-check": "tsc --noEmit -p tsconfig.typecheck.json"`.

## Turbo / CI

- Per-app tasks are auto-run by `turbo run type-check --affected`; no `ci.yml` change needed.
- **Cross-app source couplings are invisible to turbo's package graph** (no package dep).
  Declare them as `$TURBO_ROOT$` inputs in the app's `turbo.json` or the stale-cache blind
  spot (#1105) returns: `api ← apps/server/files/src`, `workers ← apps/server/api/src`.
  Root `type-check` task also lists `$TURBO_ROOT$/apps/server/tsconfig.typecheck.base.json`
  so compiler-option changes bust all caches.
- Billing collections live inside `apps/server/api`, so api's own `type-check` task covers
  them; there is no separate billing workspace or `--filter` shim.

## Workers consume api as a library (2026-09-02)

#4348 folded `@genfeedai/server` back into `apps/server/api`. Workers import `@api/*`
with no import ratchet. The former `check-no-api-imports-in-workers` guard and
`workers-api-imports.baseline.ts` were deleted with the seam they policed.

## Status (2026-09-02)

Dedicated type-check configuration is present for all current backend service workspaces:
`api, discord, files, mcp, notifications, slack, telegram, workers`.
`apps/server/clips/` is not currently a package workspace and has no
`tsconfig.typecheck.json`; re-verify before treating it as an active service.
