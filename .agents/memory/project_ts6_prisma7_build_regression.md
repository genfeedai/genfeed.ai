---
name: TS6.0 / Prisma-7 deps bump broke repo-wide tsc build
description: Deps bump 473613a00 introduced ~2020 tsc errors; bun type-check / turbo build / CI Build+Typecheck are red. Dev server unaffected.
type: project
status: temporary
last_verified: 2026-06-03
---

**Status:** BUILD REGRESSION RESOLVED 2026-06-03 — CI fully green @
`2e66b0aa8` (all 15 jobs incl. Build/Typecheck/Test Packages).

**Actual root cause (corrects the breakdown below):** the `~2020 errors` were
mostly **outdated turbo cache + `dist/src` nesting from the `mv dist/src` hack**, not
real code. Under TS6.0 `tsc` emits flat to `dist/`, so the hack was a no-op that
rewrote `dist/` after `.tsbuildinfo` was written → cached outdated buildinfo → TS6305
cascade on cache replay. Fix: clean rebuild + **removed the `mv` hack from the 9
composite packages** (busts poisoned cache via new task hash). The only **real**
code errors were ~7 Prisma-7 `*Document` interface mismatches (nullable columns
generate as `string | null`, hand-written interfaces redeclared them optional →
`undefined` conflict) + `normalizeSort` needing `PrismaOrderByInput[]` — fixed in
`apps/server/api`. A latent jsdom gap (`elementFromPoint`/pointer-capture) in the
agent overlay specs was unmasked by the cache bust and stubbed in test setup.

**Still pending (separate, NOT build-health):** the migration *apply* (needs
`DATABASE_URL`) and compile-time Stage 4 typed `Prisma.<Model>WhereInput` builders.
Safe to remove this file once those land too.

**What happened:** the concurrent deps-update automation committed `473613a00`
(`chore(dependencies): update various package versions`), bumping TypeScript to
**6.0.3** and `@prisma/client`/`@prisma/adapter-pg` to **7.8.0**. This broke
`tsc`-based building/typechecking across the monorepo (~2020 errors). Runtime is
fine — the apps bundle from source (esbuild/swc); `bun run test` (vitest) works.
Only `tsc --build` / `bun type-check` / `bunx turbo build` + CI Build/Typecheck
are red.

**Error breakdown (api):**
- **955× TS6059** "File … is not under rootDir" — TS6.0 stricter; configs with
  `outDir` import package *source* across `rootDir`. Affects `--noEmit` too.
- **TS5101** `baseUrl` deprecated (only `apps/server/tsconfig.json` sets it). Fix:
  `ignoreDeprecations: "6.0"` or remove baseUrl.
- **Path/baseUrl inheritance:** extending configs (`apps/server/api`) inherit
  `baseUrl` from the parent → `@api/* → ./src/*` resolves to the PARENT dir.
  Fix: give each extending app its own `baseUrl: "."`.
- **TS1343 import.meta / TS1378 top-level await / TS5097 `.ts` imports** — module/
  target need es2020+ / allowImportingTsExtensions in the affected configs/specs.
- **`tsc --build` + `mv dist/src/* dist/` hack** (every package `build` script):
  the `mv` desyncs the project's `.tsbuildinfo` (recorded `dist/src/*`) → consumers
  throw **TS6305** "Output file … not built from source". Deleting `.tsbuildinfo`
  or `--force` does NOT fix it (structural). Real fix: stop emitting to `dist/src`
  (build configs should resolve inter-package deps to dist, not src, so `rootDir`
  is honored) — i.e. separate dev (paths→src) vs build (refs→dist) tsconfigs.
- **Prisma-7 regen:** `JsonValue` typing changes → hand-written `*Document`
  interfaces (e.g. `AgentRunDocument`, `AgentStrategyDocument`) "incorrectly
  extend" the generated types.

**Cannot revert:** the 2026-06-03 filter-reconciliation migration + wiring are
written for Prisma 7. Rolling back to Prisma 6 breaks them. The migration must go
**forward**.

**Consequence:** compile-time Stage 4 (typed `Prisma.<Model>WhereInput` builders)
is blocked — a package that doesn't compile can't enforce field-type safety. The
interim runtime guard `BaseService.auditUnknownFilterFields` is in place
(`b6b47077d`).

**This is One API build-health work.** Fixing it unblocks `bun type-check`, CI,
and the compile-time filter-field safety.
