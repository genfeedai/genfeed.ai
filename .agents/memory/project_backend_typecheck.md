# Backend type-check pattern (`apps/server/*`)

last_verified: 2026-07-02
Source: PR #1148 (#1145). Verified against local `turbo run type-check` + committed configs.

## Invariant

`nest build` uses swc/webpack with `typeCheck: false`, so tsc never runs during build.
Each backend app gets standalone coverage via a **dedicated** `tsconfig.typecheck.json`
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
  `Express.Multer` (api; workers, which imports `@api/*`). `@types/multer` is NOT hoisted to
  root — only apps declaring it resolve `multer` in `types`.
- Script: `"type-check": "tsc --noEmit -p tsconfig.typecheck.json"`.

## Turbo / CI

- Per-app tasks are auto-run by `turbo run type-check --affected`; no `ci.yml` change needed.
- **Cross-app source couplings are invisible to turbo's package graph** (no package dep).
  Declare them as `$TURBO_ROOT$` inputs in the app's `turbo.json` or the stale-cache blind
  spot (#1105) returns: `api ← apps/server/files/src`, `workers ← apps/server/api/src`.
  Root `type-check` task also lists `$TURBO_ROOT$/apps/server/tsconfig.typecheck.base.json`
  so compiler-option changes bust all caches.
- `ee-billing`'s explicit `--filter` shim + `$TURBO_ROOT$` inputs stay: it validates the EE
  billing contract via `@api/*`, which api's own (OSS-flavor) task does not subsume, and
  `--affected` won't select it on api-only changes.

## Status (2026-07-02)

Green: `api, clips, discord, images, mcp, slack, telegram, videos, voices, workers` (10/12).
Follow-ups on #1145: `notifications` (discord.js payload typing + `NotificationEvent.payload`
narrowing), `files` (per-endpoint request-body interfaces for `@Body() body: unknown`).
