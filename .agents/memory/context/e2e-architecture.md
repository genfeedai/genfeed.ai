# E2E Architecture — Genfeed.ai

> **Last verified:** 2026-07-17 (against workflow files on `master`; latest live run not checked in this memory pass)
> **Source of truth:** `.github/workflows/e2e.yml`, `playwright/`, `apps/server/api/test/`, `packages/prisma/`

End-to-end testing runs **entirely on GitHub-hosted runners** (free for this public/OSS repo).
The legacy MacStudio cron is still active in parallel — this CI is the replacement, kept always-ready
to trigger. Nothing about the MacStudio process is disabled here.

---

## 1. Triggers & how to run

`.github/workflows/e2e.yml`:

```yaml
on:
  workflow_dispatch:            # manual — pick ANY branch via the ref dropdown
  workflow_call:                # reusable — full-suite.yml chains CI → E2E
  schedule:
    - cron: "17 2 * * *"        # nightly 02:17 UTC
concurrency:
  # workflow name in the group so a full-suite.yml workflow_call does not cancel
  # the nightly cron run of this workflow (and vice versa).
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

- **Manual, per-branch:** Actions → *E2E Tests* → *Run workflow* → choose `master` (the trunk) or any
  short-lived feature branch. CLI: `gh workflow run e2e.yml --ref <branch>`.
  `workflow_dispatch` checks out **that branch** and runs its copy of the workflow + tests.
  `master` is the single trunk.
- **Nightly review:** the `schedule` trigger always runs on the **default branch = `master`**
  (GitHub runs scheduled workflows only from the default branch). This is the nightly master review.
- **Availability:** the workflow only appears in the Actions UI / runs on schedule when the file
  exists on `master`. `master` is the single trunk.
- **Free compute:** public repo → unlimited GitHub Actions minutes on `ubuntu-latest`.

Top-level env: `TURBO_TOKEN` (secret) + `TURBO_TEAM` (var) enable Turborepo remote cache in every job.

---

## 2. Jobs (7 — the frontend suite is sharded 4-way, with separate API core/full tiers)

| Job id | Display name | Runner / timeout | Blocking? | What it runs |
|---|---|---|---|---|
| `e2e-route-coverage` | E2E Route Coverage Gate | ubuntu / 5m | **yes** (via gate) | `node scripts/e2e-route-coverage.mjs` |
| `e2e-api` | API E2E Tests | ubuntu / 20m | **yes** (via gate) | Postgres + Redis service containers, package build, Prisma migrate deploy, `test:e2e:core` |
| `e2e-api-full` | API E2E Full | ubuntu / 30m | **manual/nightly only** | Discovery-based compatible E2E/integration suite; skipped on production `workflow_call` |
| `e2e-frontend` | Frontend E2E (Shard N/4) | ubuntu / 45m | **yes** (via gate) | matrix 4 shards, `fail-fast:false`, `bun run test:e2e:sharded -- --reporter=blob` |
| `e2e-merge-reports` | Merge E2E Reports | ubuntu / 10m | no (`if: always()`) | `playwright merge-reports` → single HTML report |
| `e2e-gate` | E2E Gate (all shards) | ubuntu / 5m | **yes — the aggregator** | bash check of `e2e-route-coverage` + `e2e-frontend` + `e2e-api` results (fails on any required job failure OR cancellation) |
| `e2e-frontend-authed` | Frontend Authed E2E (real Better Auth) | ubuntu / 40m | **yes on nightly cron** (`continue-on-error` on all other events; gated by `E2E_AUTHED_ENABLED` var) | hermetic full stack: Postgres+Redis containers, `prisma migrate deploy`, real API on :3010, `bun run test:e2e:authed` |

`e2e-gate` is the single job that represents the required suite's pass/fail (it `needs:` route-coverage +
frontend + API). It exits 1 if route coverage failed, API E2E failed, or any shard failed/was cancelled. Re-running only the
failed shard + gate carries the green shards forward. **Frontend code-coverage moved out of this
workflow** — it now lives in `coverage.yml` (weekly), not here. The old single `e2e-frontend` /
`e2e-frontend-coverage` jobs in §2.3/§2.4 below are superseded by the sharded layout above.

### 2.1 `e2e-route-coverage` — static gate (fastest signal)
- No app build, no DB. Pure static analysis (`scripts/e2e-route-coverage.mjs`).
- Discovers every `apps/app/app/**/page.tsx`, then scans `playwright/e2e/tests` + `playwright/e2e/pages`
  for explicit navigations.
- Reports two numbers:
  - **Dedicated** — routes reached by an explicit nav in a spec/page object (the metric grown on purpose).
  - **Effective** — dedicated + every route swept by the generated `all-app-pages` smoke test.
- Gates on **dedicated** coverage, default **80%**. Overrides:
  - `E2E_ROUTE_COVERAGE_THRESHOLD=80`
  - `E2E_ROUTE_COVERAGE_MODE=dedicated|effective`
- Exit 1 below threshold. Local: `bun run test:e2e:routes`.

### 2.2 `e2e-api` — backend (Vitest + Postgres + Redis)
- **Service containers:** `postgres:17-alpine` (`POSTGRES_DB=test`, user `genfeed`, pw `genfeed_local`, `5432`)
  and `redis:7` (`6379`).
- **Job env:** `NODE_ENV=test`, `DATABASE_URL=postgresql://genfeed:genfeed_local@localhost:5432/test`,
  `REDIS_URL=redis://localhost:6379`. All external keys mocked
  (`REPLICATE_API_TOKEN`, `STRIPE_SECRET_KEY`, and auth secrets use test-safe values).
- **Steps:** checkout → Bun 1.3.14 via `.github/actions/setup-bun-env` → cache bun/turbo → `bun install` →
  `bunx turbo run build --filter="./packages/*"` →
  `bunx prisma migrate deploy` (cwd `packages/prisma`) → `test:e2e:core` → codecov (flag `api-e2e`, non-fatal).
- `e2e-api-full` uses the same hermetic Postgres/Redis/migration boundary, runs `test:e2e:full`,
  writes discovered/selected/executed/excluded/failed counts to the job summary, and uploads its JSON report.
  It is intentionally skipped when `e2e.yml` is called by the production full-suite workflow.
- The API E2E job is enabled and required by `e2e-gate`; it has no `continue-on-error`.

### 2.3 `e2e-frontend` — Playwright core
- **Steps:** checkout → Node 22 → Bun → cache bun/turbo/playwright-browsers → `bun install` →
  `npx playwright install --with-deps chromium` → `bunx turbo run build --filter=@genfeedai/app` →
  `bun run test:e2e:core`.
- **Build env:** auth test keys plus `NEXT_PUBLIC_API_URL=http://localhost:3010`.
- **Run env:** `CI=true`, `APP_BASE_URL=http://localhost:3000`, auth test keys.
- **Artifacts:** `playwright-report` (always), `playwright-traces` (on failure),
  `screenshot-diffs` (on failure) — all 7-day retention.

### 2.4 `e2e-frontend-coverage` — V8 → monocart (non-blocking)
- `continue-on-error: true`. Builds app with `E2E_COVERAGE=1` (browser source maps) →
  `bun run test:e2e:coverage` with `E2E_COVERAGE_THRESHOLD=0` (report, don't gate while suite hardens).
- Artifacts: `e2e-coverage-report` (`playwright-report/coverage/`), codecov flag `app-e2e`.

### Caching
| Cache | Path | Key | Jobs |
|---|---|---|---|
| Bun modules | `~/.bun/install/cache` | `{os}-bun-{hash(bun.lock)}` (restore `{os}-bun-`) | all |
| Turbo | `.turbo` | `{os}-turbo-{hash(turbo.json,bun.lock)}` (restore `{os}-turbo-`) | api, frontend |
| Playwright browsers | `~/.cache/ms-playwright` | `{os}-playwright-{hash(bun.lock)}` (no restore-key) | frontend, coverage |

---

## 3. Playwright layer

### Configs — `playwright/configs/`
| Config | testDir | Projects | webServer | Use |
|---|---|---|---|---|
| `playwright.config.ts` | `playwright/e2e/tests` | auth setup, `app-core`, `app-authed` | yes (CI: `start`, dev: `dev`) | primary / `test:e2e:core` |
| `playwright-coverage.config.ts` | (coverage variant) | — | — | `test:e2e:coverage` |
| `playwright-full.config.ts` | `playwright/e2e/tests` (ignores admin/core/marketplace/website) | `chromium` | yes (30s CI) | `test:e2e:full` |
| `playwright-cross-app.config.ts` | `playwright/e2e/tests` | `website` (:3002), `marketplace` (:3104) | **none** (expects running servers) | cross-app |
| `playwright-smoke.config.ts` | `playwright/e2e/tests/smoke` | `chromium` | none | quick smoke |

Primary config highlights:
- `baseURL` = `APP_BASE_URL || BASE_URL || http://127.0.0.1:3000` (127.0.0.1 to dodge IPv6).
- webServer command uses `--hostname ::` (dual-stack) to prevent `ECONNREFUSED ::1:3000` on SSR fetches;
  readiness URL `<baseURL>/playwright-ready`; `reuseExistingServer: true`; 300s timeout.
- `PLAYWRIGHT_SKIP_WEBSERVER=1` disables the managed server.
- `workers: 1` (serial) despite `fullyParallel: true`. Retries: CI 2 / local 0.
- Timeouts: test 120s, expect 60s, action 15s, nav 30s. Viewport 1280×720, locale en-US, TZ America/New_York.
- `toHaveScreenshot: { maxDiffPixels: 100, threshold: 0.2 }`.
- `globalSetup` = `playwright/e2e/global-setup.ts`, `globalTeardown` = `playwright/e2e/global-teardown.ts`.

### Root Playwright scripts (`package.json`)
| Script | Target | Project |
|---|---|---|
| `test:e2e` | all `e2e/tests/**/*.spec.ts` | all |
| `test:e2e:core` | `e2e/tests/smoke` + `e2e/tests/core` | `app-core` |
| `test:e2e:smoke` | `smoke/all-app-pages.spec.ts` | `app-core` |
| `test:e2e:full` | all except admin/core/marketplace/website | `chromium` |
| `test:e2e:coverage` | `E2E_COVERAGE=1` + coverage config | — |
| `test:e2e:routes` | `node scripts/e2e-route-coverage.mjs` | — |

### Setup / teardown / auth
- **global-setup.ts** — lightweight: logs config, stamps `NODE_ENV=test` + `PLAYWRIGHT_TEST=true`,
  creates `playwright/artifacts/screenshots/`, wipes artifacts if `CLEAN_ARTIFACTS=true`.
  No real backend calls; `requiredEnvVars` is intentionally empty.
- **global-teardown.ts** — deletes `apps/app/.next/dev/cache` (Turbopack persistent cache, observed at
  ~15 GB → `ENOSPC`). Best-effort; never fails the suite. Respects `PLAYWRIGHT_WEB_APP_PATH`.
- **auth.setup.ts** (`better-auth-setup` project) — hermetic by default: mints a fresh
  session against the job-local API (`sign-up/email` → session cookie → `/auth/token`
  JWT → `PATCH /users/me {isOnboardingCompleted:true}`), then writes Better Auth storage
  state for the `app-authed` project. No repo secrets, no production dependency —
  `BETTER_AUTH_SECRET` is a synthetic workflow literal. A pre-minted token can still be
  supplied via `E2E_BETTER_AUTH_SESSION_TOKEN` for local runs (`E2E_AUTHED_LOCAL=1`).
  The authed smoke derives org/brand slugs from the real provisioned workspace
  (`/` → canonical redirect), not hardcoded `test-org/brand-1`.

### Mock-auth fixtures (`playwright/e2e/fixtures/`)
Most specs use **3-layer auth bypass** (no real Better Auth session needed):
1. **Middleware bypass** — `__playwright_test=true` cookie; `proxy.ts` skips `authMiddleware`.
2. **Client SDK mock** — `addInitScript` sets `window.__better_auth_client_state` + `__better_auth_is_signed_in`.
3. **API mock** — `setupApiMocks` intercepts `api.genfeed.ai` + `genfeed.localhost:3010`.
   **Order matters:** call `setupApiMocks` BEFORE `setupBetterAuthMocks` (Playwright routes resolve last-registered-first).

Fixtures: `auth.fixture.ts` (`authenticatedPage`, `adminPage`, `automationPage`, `unauthenticatedPage`,
`authenticatedContext`), `onboarding.fixture.ts`, `api-mocks.fixture.ts` (generation/billing/data/workspace/workflow mocks),
`test-data.fixture.ts` (deterministic data + `testRoutes` + `selectors`), barrel `index.ts`.

**Network guard** (`utils/network-guard.ts`): catch-all `page.route('**/*')` that aborts any cost-risk host
(OpenAI/Anthropic/ElevenLabs/HeyGen/Stripe/Replicate/Fal/Together/Stability + `api.genfeed.ai`).
`E2E_STRICT_NETWORK=true` aborts everything off the localhost/auth/fonts allowlist.
`assertNoBlockedRequests()` fails the test if any real external call escaped — asserted in fixture teardown.

### Test layout (`playwright/e2e/tests/`)
- **smoke/** — `safe.spec.ts` (health), `all-app-pages.spec.ts` (discovers every `page.tsx`, sweeps all
  routes via in-process mock server on :3010, asserts >100 routes, 900s), `all-app-pages.authed.spec.ts`
  (authenticated storage state, curated protected routes, 600s).
- **core + ~25 domain dirs** — admin, agents, analytics, auth, automation, brands, calendar, chat, compose,
  core, dashboard, editor, library, onboarding, overview, posts, research, responsive, settings, studio,
  tasks, visual, website, workflow(s), workspace. ~50 spec files.
- **visual/** — `visual-regression.spec.ts`; baselines in `__screenshots__/` via `snapshotPathTemplate`.
- **pages/** — one Page Object per area (login, dashboard, studio, settings, …) via `pages/index.ts`.
- **utils/** — `route-assertions.ts`, `interaction-helpers.ts`, `network-guard.ts`, `api-interceptor.ts`.

---

## 4. API E2E layer (`apps/server/api/`)

- **Runner:** Vitest (NOT Jest). `vitest.config.e2e.ts` loads `unplugin-swc` for NestJS decorator metadata,
  disables OXC. Pool `threads`, `maxWorkers: 1` (serial, avoids DB contention), 60s timeout, setup `test/setup.ts`.
- **Core tier** (`test:e2e:core`) preserves the five release-critical files in
  `scripts/api-e2e-tiers.manifest.ts`:
  - `test/e2e/integrations.e2e-spec.ts` — org integrations CRUD over HTTP (the only full HTTP suite in CI).
  - `test/integration/generation-credit-decrement.integration.spec.ts` — real Postgres credit decrement behavior.
  - `test/integration/payment-processing.integration.spec.ts` — Stripe flow (mocked).
  - `test/integration/health.e2e-spec.spec.ts` — unit-level `HealthController` (no HTTP/DB).
  - `test/integration/stripe-webhook-credit-grant.integration.spec.ts` — signed Stripe webhook credit grants.
- **Full tier** (`test:e2e:full`) recursively discovers every `*spec.ts` file under
  `test/e2e` and `test/integration`, then removes only entries from the typed exclusion manifest.
  Every exclusion has a reason and tracking issue. Manual and nightly Actions runs execute this tier.
- **DB lifecycle:** `TestDatabaseHelper` (`test/e2e-test.module.ts`) — `beforeEach` `clearDatabase()` deletes in
  FK-safe order then `seedCollection()` (normalizes ids and uppercases enums). No `afterAll`
  truncation (safe only because `maxWorkers: 1`).
- **Auth:** test auth guard injects a synthetic authenticated user. External keys are `test-mock-*`.

---

## 5. Database & migrations provisioning

- **Schema:** `packages/prisma/prisma/schema.prisma` — PostgreSQL, Prisma v7 (`prisma-client` generator →
  `packages/prisma/generated/prisma/client/`, re-exported as `@genfeedai/prisma`).
  `DATABASE_URL` read via `packages/prisma/prisma.config.mjs` (not in schema), so `prisma generate` needs no DB.
- **Migrations:** `packages/prisma/prisma/migrations/` — baseline `20260417050332_init` (all enums + ~140 tables)
  + incremental migrations through `20260628200000_backfill_email_verified_for_migrated_users`.
- **CI provisioning:** `e2e-api` job's `postgres` service container + `bunx prisma migrate deploy`
  (production-safe, applies pending migrations in order, no prompts). Suite then truncates/reseeds per test.
- **Redis:** first-class dep — `RedisService` pub/sub (`packages/libs/redis/`) + BullMQ queues. Fault-tolerant
  (offline mode if `REDIS_URL` absent / 3s timeout), but CI always provides the container.

---

## 6. Known risks / debt (gardening backlog)

- The release/deploy core tier remains intentionally small; broad API E2E coverage belongs to the
  manual/nightly full tier until its reliability supports promotion.
- **`health.e2e-spec.ts`** (HTTP version) imports `@test/app.module` which does not exist — would fail if added.
- **`tasks.e2e-spec.ts`** passes a `schemas` option that `E2ETestModule.forRoot` silently ignores
  (data-layer porting artifact).
- **`workers: 1` + `fullyParallel: true`** is contradictory; masks races that surface if workers increase.
- **Playwright browser cache** has no restore-key fallback — any `bun.lock` change forces full Chromium re-download.
- **Visual baselines** (`__screenshots__/`) are OS/font-sensitive — diffs across environments.
- **Not a regular PR gate** — the full E2E suite runs nightly/manual and through `full-suite.yml` / production QA, so an ordinary PR can merge before the nightly or release gate catches an E2E-only regression.

---

## 7. Quick reference

```bash
# Trigger per branch
gh workflow run e2e.yml --ref master
gh workflow run e2e.yml --ref feat/your-branch

# Watch latest
gh run list --workflow=e2e.yml --branch master --limit 1
gh run watch <run-id>

# Local
bun run test:e2e:routes      # route coverage gate
bun run test:e2e:core        # frontend core (needs app build/serve)
bun run --cwd apps/server/api test:e2e:core # release/deploy subset (needs pg+redis+migrate)
bun run --cwd apps/server/api test:e2e:full # discovery-based compatible suite
```
