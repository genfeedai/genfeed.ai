# DRY / Slop Audit — Genfeed.ai Monorepo

- **Date:** 2026-07-02
- **Scope:** full monorepo (`apps/`, `packages/`, `ee/`, `scripts/`, `docker/`, `.github/workflows/`) — ~10,637 tracked TS files
- **Method:** 14 dimension-specific auditor agents + adversarial verification of every high/medium finding (each finding independently re-checked against the actual code by a second agent instructed to refute it), a completeness-critic gap-fill round, plus two mechanical scanners: `knip` (dead code) and `jscpd` (clone detection, ≥30-line threshold, tests excluded). 67 agents total. Verdict labels below: **confirmed** (survived adversarial verification as written), **adjusted** (real, but evidence/severity corrected — corrections incorporated here), **unverified-low** (low severity, not independently verified).
- **Ground rule applied:** intentional boundaries (OSS root vs `ee/`, `desktop-prisma` PGlite vs `prisma` Postgres, compiled `workflow-saas`, generated tests, mandated serializer triplets) were excluded, and several plausible-looking findings were refuted and rejected (Appendix B).

---

## 1. Executive summary

Overall duplication is **low for a repo this size** (jscpd: 154 clones ≥30 lines, 8,629 duplicated lines, 1.61%) and the core architecture holds up well under adversarial review — auth guards, the frontend/backend logger stacks, the ECS deploy workflows, the serializer pipeline, and the publisher/BYOK factory patterns were all checked and are healthy. The rot is concentrated, not systemic:

1. **One fork dominates everything else.** `apps/app`'s workflow builder is a hand-maintained ~3,200-line fork of `packages/workflow-ui` (42 clone pairs = **37% of all duplicated lines in the repo**), and git history literally documents devs manually propagating fixes between the two. The forked SSE subscription copy silently drops all error logging.
2. **The tenant data-access layer is copy-pasted, not shared.** The `findFirst({ id, isDeleted, organizationId }) → throw NotFoundException` guard is hand-rolled in ~52 files / 150-220 call sites while the existing `BaseService.findOneWithOrganization()` helper has **zero callers**. Compounding it: 77 of 125 `organizationId`-bearing Prisma models have **no index containing `organizationId` at all** (Postgres does not auto-index FKs), and two incompatible `NotFoundException` shapes reach clients.
3. **Security-critical code exists in duplicate.** Two byte-compatible AES-256-GCM implementations (the legacy one, reading `process.env` directly, still has 58 consumers vs 4 for its documented replacement); the internal API-key guard is copy-pasted across 3 services; path/injection sanitization is duplicated (already drifted) between `api` and `files`.
4. **The audit surfaced 6 latent production bugs** hiding inside "boilerplate" divergence — see the callout box below. These are cheap to fix and should ship before any refactor.
5. **Dead code is meaningful but bounded:** 239 knip-flagged unused files, a fully dead *double* implementation of AdInsights, 4 orphaned analytics cron services from a completed migration, dead helper modules, and ~30 unused dependencies.

### ⚠️ Latent bugs found during the audit (fix first, independent of any refactor)

| # | Bug | Evidence | Verdict |
|---|-----|----------|---------|
| B1 | `mcp` service never calls `enableShutdownHooks()`/trust-proxy (`setupServiceShell`) — `OnModuleDestroy` cleanup (DB/Redis) never runs on ECS SIGTERM. Sole outlier among 11 HTTP services. | `apps/server/mcp/src/main.ts:39-45` vs `packages/libs/bootstrap/env-loader.ts:110-129` | confirmed |
| B2 | `files` and `workers` swallow bootstrap failures — `catch` logs but never `process.exit(1)`, so a failed startup hangs until ECS health-check timeout instead of failing fast. (10 sibling services all exit.) | `apps/server/files/src/main.ts:89-93`, `apps/server/workers/src/main.ts:127-131` | confirmed |
| B3 | `apps/app/src/lib/logger.ts` has a dead Sentry hook — `errorReporter` is only ever set in its own test. Its 8 production importers (execution slice, autosave, SSE subscription, settings store…) log errors that **never reach Sentry**. | `apps/app/src/lib/logger.ts:76`; sole `setErrorReporter` call site is `logger.test.ts` | adjusted (confirmed core) |
| B4 | `packages/workflow-ui`'s forked SSE subscription swallows `onerror` in both handlers (the `apps/app` copy logs them) — SSE failures in the package path are invisible. | `packages/workflow-ui/src/stores/execution/helpers/sseSubscription.ts` vs `apps/app/src/store/execution/helpers/sseSubscription.ts` | adjusted (confirmed core) |
| B5 | CLI `Brand` type declares `handle` but the API serves `slug` — `gf brands` has a permanently dead branch; handle output is always empty. | `packages/cli/src/api/brands.ts`, `packages/cli/src/commands/brands.ts:189-190` | confirmed |
| B6 | MCP tool layer actively filters out valid platforms — `isSocialPlatform()` and the publishing tool description hardcode 5 platforms vs the real 25-value `Platform` enum, so LLM agents can't target Facebook, Pinterest, Reddit, Threads, etc. | `apps/server/mcp/src/shared/interfaces/post.interface.ts`, `tool-validators.ts`, `publishing.tool.ts` | confirmed |

Also perf-relevant: **77/125 org-scoped Prisma models lack any org index** (P2 below, verified by direct schema scan); hot models `Article`, `AgentThread`, `Bot`, `Template`, `Skill`, `Preset` have zero `@@index` directives while `Post` has 18.

---

## 2. High-impact duplication clusters

Grouped by business/domain impact. Each cluster cites representative evidence; severity and verdict are post-verification.

### C1 — Workflow builder fork: `apps/app` ↔ `packages/workflow-ui` (HIGH, confirmed)

The single largest duplication in the repo: 42 jscpd clone pairs / 3,216 lines (37% of all duplicated lines).

- `apps/app/src/hooks/useContextMenu.ts` (373L) vs `packages/workflow-ui/src/hooks/useContextMenu.ts` (372L)
- `apps/app/src/store/workflow/helpers/{propagation,equality}.ts` vs `packages/workflow-ui/src/stores/workflow/helpers/*` — `equality.ts` is **byte-identical**
- `apps/app/src/lib/autoLayout.ts` vs `packages/workflow-ui/src/lib/autoLayout.ts` (full 266-line files)
- 8 Zustand slice files (`nodeSlice`, `groupSlice`, `lockingSlice`, `edgeSlice`, `chatSlice`, `persistenceSlice`, `snapshotSlice`, `selectionSlice`) duplicated across both trees
- `apps/app/src/store/execution/helpers/sseSubscription.ts` vs `packages/workflow-ui/src/stores/execution/helpers/sseSubscription.ts` — near-verbatim, with the error-logging divergence (bug B4)

**Why it matters:** `apps/app` already depends on `@genfeedai/workflow-ui` (imports `useUIStore`, node types, lib primitives *inside its own forked files*), and commit `478da1d16` documents manually "propagating slice updates to apps/app." Every node-action/auto-layout/SSE fix is currently a two-place change that has already been missed at least once (B4).

**Fix:** make `packages/workflow-ui` the single canonical implementation; repoint `apps/app` and delete the local copies. App-specific behavior goes through the package's existing `WorkflowUIProvider` config-injection seam (already used by the package's `useContextMenu`). The package has **no tests** for the execution store today — tests must be authored as part of the merge, and the package needs an error-reporting injection point (it currently has no logger).

### C2 — Tenant data-access consistency (HIGH, confirmed ×3)

Three related findings that together define the biggest correctness-risk cluster:

**C2a. Find-or-404 boilerplate, ~52 files / 150-220 call sites.** The pattern `prisma.<model>.findFirst({ where: { id, isDeleted: false, organizationId } }); if (!x) throw new NotFoundException(…)` is hand-copied per call site. `apps/server/api/src/services/batch-generation/batch-generation.service.ts:540-926` alone repeats it 7 times. Meanwhile `apps/server/api/src/shared/services/base/base.service.ts:1151-1167` (`findOneWithOrganization`) already implements exactly this — with **zero call sites anywhere**. Even `BrandsService`, which *extends* `BaseService`, hand-rolls the pattern (`brands.service.ts:837-842,1059-1064`). A missed `isDeleted` or `organizationId` filter in any one copy is a silent tenant-isolation or soft-delete bug. The boilerplate is concentrated entirely in `apps/server/api` (0 matches in the other 11 services).

**C2b. Org-index coverage gap (verified by direct schema scan).** 77 of 125 models carrying `organizationId` have no `@@index`/`@@unique` containing it. `Article`, `AgentThread`, `Bot`, `Template`, `Skill`, `Preset` have zero indexes; `Article` is queried on the hot list/RSS path (`articles.controller.ts:162,464`). Contrast: `Post` has 18 `@@index` directives including `@@index([organizationId, isDeleted, status, createdAt(sort: Desc)])`. Don't blanket-add 77 indexes — audit against actual query patterns and index the proven org-queried models.

**C2c. Two incompatible `NotFoundException` shapes.** 33 files throw `@nestjs/common`'s built-in vs 16 throwing the custom JSON:API-shaped `apps/server/api/src/helpers/exceptions/http/not-found.exception.ts`. `http-exception.filter.ts:27-35` produces different `title`/`detail`/`source` for each, so clients get inconsistent 404 JSON depending on which service file handled the request. No lint rule guards this today.

### C3 — Security-critical primitives in duplicate (HIGH/MEDIUM, confirmed)

**C3a. Dual AES-256-GCM encryption (HIGH, verified directly).** `apps/server/api/src/shared/utils/encryption/encryption.util.ts` (`EncryptionUtil`, static, reads `process.env.TOKEN_ENCRYPTION_KEY` directly — violating the ConfigService rule) has **58 non-test consumers** (twitter/shopify/ghost integrations, workflows, workers crons). Its documented replacement `apps/server/api/src/collections/credentials/services/credential-crypto.service.ts` (`CredentialCryptoService`, ConfigService-sourced, adds an idempotency guard) has 4. The service's own docblock declares byte-for-byte envelope compatibility with "the legacy `EncryptionUtil`" — this is an acknowledged, unfinished migration on the OAuth-token-encryption path.

**C3b. `InternalApiKeyGuard` ×3 (MEDIUM, confirmed).** Byte-near-identical `timingSafeEqual` bearer-token guards in `apps/server/clips/src/guards/internal-api-key.guard.ts` (no spec file) and `apps/server/images/src/guards/internal-api-key.guard.ts`, plus the near-identical `AdminApiKeyGuard` in `apps/server/api/src/helpers/guards/admin-api-key/` (no dev-bypass, different header parsing). A security fix to one copy silently leaves the others behind. All three services already consume `packages/libs` (`@libs/logger`), so a shared guard is low-friction.

**C3c. `security.util.ts` duplicated api ↔ files (LOW after verification).** ~180 shared lines of path-traversal/command-injection sanitization exist in both `apps/server/api/src/helpers/utils/security/` and `apps/server/files/src/helpers/utils/security/`, and have already drifted — though the verifier found the drift is currently *benign* (the `files` copy has an extra `;` blocked pattern the api copy lacks; the api-only prompt-injection functions are dead code in `files`, which never builds LLM prompts). Consolidate on the next touch; not urgent.

### C4 — Service bootstrap drift across the 12 NestJS services (HIGH/MEDIUM, confirmed)

Beyond bugs B1/B2:

- **Health checks ×8 implementations (MEDIUM, confirmed).** `packages/libs/health/health.module.ts` (@Global, `/health` + `/detailed` + `/ready` + `/live`) is used by only 4 services (api, files, mcp, notifications). discord/slack/telegram hand-roll 3 near-identical ~15-line controllers; **images and videos are byte-identical** except the service-name string; clips has a 12-line clone. No tsconfig barrier exists — all 7 already use other `@libs/*` modules.
- **`workers` bespoke health server (MEDIUM, adjusted).** `apps/server/workers/src/main.ts:32-82` reimplements the shared health response shape + 4-route set over raw Express. Caveat from verification: workers uses `NestFactory.createApplicationContext` (no HTTP adapter), so the shared `HealthModule` cannot mount as-is — the realistic fix is extracting shared response-builder functions, or switching bootstrap style. Its hand-rolled shutdown is actually *more* complete than the shared `setupGracefulShutdown()` (which is a bare `process.exit(0)`).
- **discord/slack use raw `new Logger()` from `@nestjs/common`** in main.ts while 9 siblings resolve the DI `LoggerService` — startup logs bypass the winston pipeline (LOW).
- **Sentry `instrument.ts` glue ×10** — verified as mostly fine: the real logic already lives in `packages/libs/config/sentry.config.ts`; the per-service 3-4-line preload files are required by Sentry's init-first contract. Leave as-is (LOW).

### C5 — MCP's parallel type universe (HIGH, confirmed)

`apps/server/mcp/src/shared/interfaces/` (14 files) re-declares domain types instead of importing `@genfeedai/enums`/`@genfeedai/api-types`:

- `post.interface.ts`: `SocialPlatform` = 5 values vs the real 25-value `Platform` enum; `PostResponse.status` = 4 values vs 8-value `PostStatus`; `content.client.ts:139-141` papers over it with `as` casts (`|| 'pending'` default swallows real statuses). Downstream, `tool-validators.ts` filters valid platforms out and `publishing.tool.ts` tells the LLM only 5 platforms exist (bug B6).
- `workflow.interface.ts` re-declares `WorkflowStatus` although mcp already depends on `@genfeedai/interfaces` (which re-exports the enum) — no new wiring needed.
- mcp also re-declares `@Public()`/`IS_PUBLIC_KEY` locally (`mcp-auth.guard.ts:12-14`) instead of importing `packages/libs/decorators/public.decorator.ts`.

Verification caveats: `google-ads`/`meta-ads` interface files model third-party API responses (not Genfeed domain) and are legitimate; `packages/api-types` has only 2 contracts today, so "route everything through api-types" requires authoring contracts first. Priority order: post + workflow types now, the rest opportunistically.

### C6 — Observability duplication that loses errors (HIGH/MEDIUM)

- Bug B3 (apps/app dead-Sentry logger — **delete `apps/app/src/lib/logger.ts`**, repoint 8 importers; note the 3-arg → 2-arg `error()` signature rewrite, not a drop-in swap).
- Bug B4 (workflow-ui SSE swallowed errors — folds into C1).
- `WorkflowDeploymentBackfillService.logProgress` (`apps/server/api/src/seeds/workflow-deployment-backfill.service.ts:255-266`) double-logs every checkpoint through winston **and** raw `console.info`, unconditionally (MEDIUM, confirmed core). Delete the `console.info`.
- `packages/helpers/src/ui/modal/modal.helper.ts` (`logError`/`logDebug`) and `packages/helpers/src/utm/utm-builder.helper.ts` (`logInvalidUrl`) hand-roll NODE_ENV-gated console wrappers whose guard is *inverted* vs the canonical logger — they silently drop errors in production (LOW, unverified).

### C7 — Polling/timeout logic re-implemented 4+ times (MEDIUM, confirmed)

A purpose-built, tested generic exists: `apps/server/api/src/shared/services/poll-until/poll-until.service.ts` (`PollUntilService.poll`, 224-line spec, adopted by Higgsfield + LLM services). Still hand-rolled:

- `apps/server/api/src/shared/services/polling/polling.service.ts:35-244` — ingredient-specific `waitForIngredientCompletion`/`waitForMultipleIngredientsCompletion` with its own `PollingTimeoutError` class, detected by **string-comparing `error.name`** in 3 places (`musics-operations.controller.ts:463`, `video-generation.service.ts:709`, +1)
- `apps/server/api/src/services/integrations/fal/fal.service.ts:206-263` (`runWithOverride`)
- `apps/server/api/src/services/integrations/apify/services/modules/apify-base.service.ts:194-225` (`waitForRun`)

Frontend mirror: **zero** uses of react-query `refetchInterval` anywhere; 8+ pages/hooks hand-roll `pollingRef`/`setInterval` (fleet training/generate/lip-sync/infrastructure pages, batch workflow page, `ExecutionPanel`, `useNodeExecution`, onboarding proactive). Verification caveat: only 1 of the 5 cited pages can bolt `refetchInterval` onto an existing query; the rest need net-new `useQuery` wiring.

### C8 — Design-system rule enforced by 3 divergent checkers (HIGH, confirmed)

The "no raw HTML elements" rule runs through three independently-maintained mechanisms with drifting allowlists:

- `scripts/check-raw-button-usage.ts` (20-entry allowlist; **contains 6 `apps/website/**` entries its own include-globs never scan** — live staleness proof)
- `scripts/check-raw-ui-controls.ts` (separate globs + allowlist; `<input>`/`<select>` + legacy imports)
- `scripts/lint-no-raw-html.sh` (third exclusion list; covers 10 element types vs the TS scripts' combined 3; runs via lint-staged at commit time while the TS scripts run in CI via `check:ui-guards`)

A file can pass commit and fail CI (or vice versa). Consolidate to **one** checker with one allowlist. Related low-severity slop: 7+ `check-*.ts` scripts copy-paste logger/`EXCLUDE_GLOBS`/`isMainModule`/glob boilerplate (one — `check-modal-standard-usage.ts` — already lost its entrypoint guard and runs at import time), and two scripts hand-roll recursive file-walkers instead of `globSync`.

### C9 — Admin CRUD scaffolding (MEDIUM, adjusted)

- 11 admin "element" list pages (~250-385 lines each) + 13 create/edit modals repeat the same scaffold. Verification tempered the original claim: 7 of the 11 list files use a distinct `useReducer` architecture (so it's two families, not one), and the modals already delegate most logic to the shared `use-crud-modal` hook — the residual per-modal duplication is ~3 JSX fields + an inline slugify handler. **Real confirmed divergence:** `cameras-list.tsx` derives admin org/brand from URL params directly while `lenses-list.tsx` keeps parallel `useState` synced by hand — same feature, two behaviors.
- 6 collection controllers clone `templates.controller.ts:334-527`'s ~70-line list/filter/paginate block (schedules, profiles, optimizers, insights, contexts, trends; ~420 duplicated lines).

### C10 — Config/URL drift cluster (HIGH, verified directly)

- `http://localhost:3010` fallback hardcoded in 8+ files under **three env-var names** (`GENFEEDAI_API_URL`, `API_BASE_URL`, `API_URL`); `workflows.service.ts:2244` bypasses ConfigService entirely (`process.env.API_URL || 'https://api.genfeed.ai'`); 6 independent `https://app.genfeed.ai` literals (invitation service, mcp setup page, discord notifications, notifications publisher…). A domain change is currently a 10-file hunt.
- Security-relevant env vars read raw with no ConfigService entry: `GITHUB_WEBHOOK_SECRET` (`webhooks.github.service.ts:27`), `ADMIN_ALLOWED_IPS` (`ip-whitelist.guard.ts:15`) (MEDIUM, unverified but narrow).
- Verified-fine: the 12 per-service ConfigModule wrappers and the two-tier config design (Joi-validated `packages/config` vs lightweight `packages/libs/config`) are intentional — document the tiering, don't abstract it.

### C11 — Utility-layer duplication (MEDIUM, adjusted)

- **`formatDuration` defined 10 times** in two incompatible conventions (ms → `Xms/Xs/Xm` vs seconds → `M:SS`). The seconds-based canonical *is already barrel-exported* from `packages/helpers` (`video-duration.helper.ts`); cli/agent/pages/ui/website copies remain. Caveat: `packages/cli` is a published standalone binary — give it a zero-dep shared leaf rather than the full helpers package.
- **`formatDateInTimezone` name collision** with incompatible 3rd-arg types across `packages/helpers/src/formatting/timezone/` vs `.../timezone-date/` — and the entire `timezone-date` module is dead (zero non-test references). Delete it.
- **Currency formatter with Map-cache** byte-duplicated in `packages/ui/.../ListingCard.tsx:10-26` and `.../SubscriptionPlanChanger.tsx:11-20` (2 true sites; the admin dashboard variant is legitimately distinct).
- **`Date.now()+Math.random().toString(36)` ID generation** copy-pasted 20+ times (slice lengths 6-13 chars, uneven collision odds) while `nanoid` is already in use in the same packages.
- **`sleep()` re-implemented 4×** despite `packages/helpers/src/async/sleep.helper.ts`.
- **21 clipboard call sites** bypass the canonical `ClipboardService` (try/catch + toasts + `isProduction` guard). Verified scope: ~15-17 sites in `apps/app`/`desktop`/`website`/`packages/agent` genuinely have `@services` access and bypass it anyway (incl. one with zero error handling); `packages/workflow-ui` and browser-extension sites *can't* reach the service (package-boundary) and are out of scope.
- `SkeletonFallbacks.tsx` 'gallery'/'settings' cases hand-roll `animate-pulse` divs, visually divergent from the shimmer `Skeleton` primitive used by the other 5 cases in the same switch (MEDIUM, confirmed).

### C12 — Ops/infra copy-paste (MEDIUM, confirmed)

- **11 workflow seed scripts** (`apps/server/api/scripts/seeds/*.seed.ts`) share ~90-120 lines of `loadEnvFile`/`parseArgs`/org-iteration/idempotency boilerplate each — byte-identical to the point of sharing a typo (702 duplicated lines, 10 clone pairs). All expose the same `ensureXWorkflows(userId, orgId)` shape, so a `runWorkflowSeed(templates, label, ensureFn)` helper is a mechanical extraction.
- **Highlight-detection pipeline ×3**: verbatim `HIGHLIGHT_SYSTEM_PROMPT` + `detectHighlights()`/`parseHighlights()` in `apps/server/workers/.../clip-analyze.processor.ts:213-356`, `clip-factory.processor.ts:261-404`, **and** `apps/server/clips/src/services/highlight-detector.service.ts` (the code's own comment admits the third copy).
- **GPU-fleet compose trio**: `docker/docker-compose.{images,videos,voices}.yml` are 77-line near-clones (identical redis/healthcheck blocks; voices already drifted its sidecar contract). No YAML anchors/`include:` exist anywhere in `docker/` (18 files). Anchor the common skeleton; keep the GPU-sidecar blocks unmerged (already divergent contracts).
- **Browser extension forked `HTTPBaseService`** (158 lines vs the canonical 330 in `packages/services/core/interceptor.service.ts`): same origin commit (`c2ce5bf53`), and the canonical side's `AbortSignal.any` bug fix (`dc19ec30d`) never reached the extension copy — the "fixed twice" risk has already materialized once. Extension also forked `EmptyState` despite depending on `@genfeedai/ui`.

---

## 3. Dead / obsolete code candidates

Safe-delete list, ordered by size/clarity. All deletion candidates were grep-verified for dynamic-import/DI/string references by verifiers unless marked unverified.

| Candidate | Evidence | Verdict |
|---|---|---|
| **AdInsights, both implementations** — two full parallel stacks, neither wired into `app.module.ts`, sole dependency `ad-aggregation.service.ts` also unused | `apps/server/api/src/endpoints/ad-insights/`, `apps/server/api/src/collections/ad-insights/`, `apps/server/api/src/services/ad-aggregation/` | confirmed |
| **4 analytics cron services** — orphaned by the workflow-engine migration (#802/#785); no `@Cron` decorator, zero callers of `track*Analytics()`; only DI-registered. Includes the inert Twitter `orderBy` divergence | `apps/server/workers/src/crons/analytics/cron.analytics-{facebook,social,threads,twitter}.service.ts` + module | adjusted (dead, not live dup) |
| **`timezone-date.helper.ts` module** — both exports dead (zero non-test refs); also removes the `formatDateInTimezone` name collision | `packages/helpers/src/formatting/timezone-date/` | adjusted |
| **`effect-bridge.util.ts`** — Effect-based error mapping, zero production callers | `apps/server/api/src/shared/utils/effect-bridge/` | unverified-low |
| **Temp vitest configs** — `.temp` debugging artifact + orphaned batch config with no batch1/batch3 | `apps/server/api/vitest.qa.temp.config.ts`, `apps/server/api/vitest.batch2.config.ts` | unverified-low |
| **4 orphaned bot compose files** — byte-identical 29-line clones referenced nowhere (not in package.json, CI, or docs); live bot services are defined inline in `docker-compose.yml` (profiles) and production/staging composes | `docker/docker-compose.{clips,discord,slack,telegram}.yml` | adjusted (delete, don't anchor) |
| **2 genuinely orphaned scripts** (of 7 investigated; the other 5 are runbooks/one-shots or actually referenced) | `scripts/check-public-package-manifests.mjs`, `scripts/repair-tiptap-bun-install.mjs` | adjusted |
| **21 zero-arg `create*Executor()` factories** — pure `return new XxxExecutor()`; each has exactly 3 refs (definition, registry, own spec). Keep the 5 that take optional injected deps | `packages/workflow-engine/src/executors/saas/*.ts` + `executor-registry.ts` | adjusted |
| **`CacheKeyService`** — full DI service + 66-line spec wrapping one template-string join, one real caller | `apps/server/api/src/services/cache/services/cache-key.service.ts` | unverified-low |
| **AI-session narrative JSDoc** — 63% of `subscriptions-service.contract.ts` is comments citing plan-file paths, commit SHAs, "Codex adversarial review" anecdotes, and a file:line consumer table that rots on every edit | `packages/interfaces/src/billing/subscriptions-service.contract.ts:1-37,143-157` | unverified-low |
| **knip aggregate** — 239 unused files (apps/server ~105, `packages/pages` 33, `packages/props` 29, `packages/contexts` 20, `packages/hooks` 16, mobile 8); 104 unused exports; 225 unused exported types; 23 duplicate default+named exports | `bun run dead-code`; spot-checked (several false positives found and excluded: `FoldersModule`, storybook files, path-alias deps) | adjusted — sweep per-package with human review, knip has DI/dynamic-import blind spots |
| **Unused dependencies** — apps/app's full `@tiptap/extension-*` set, root `@remotion/*`, `@slack/bolt`, `bcrypt`, `@fullcalendar/*`, `@ai-sdk/*` (subset), +6 devDeps | knip report | unverified — verify per-dep before removal (install-size win, low risk) |

**Not dead (verified false positives, do not delete):** `check-pr-governance.mjs` (imported by `review-pr.mjs`), `check-prod-creds.mjs` (wrapped by `.sh`), `reseed-voice-catalog.incontainer.mjs` (docker-cp runbook by design), `backfill-ingredient-fks.mjs` (one-shot audit trail), `FoldersModule`, `endpoints/v1`, workflow-backfill, tsconfig/styles/create packages.

---

## 4. Inconsistent local patterns

Same concept, divergent implementations — the "almost the same with different behavior" list:

1. **404 semantics** — built-in vs custom `NotFoundException` (C2c): different client JSON per file.
2. **Env var naming for the same URL** — `GENFEEDAI_API_URL` vs `API_BASE_URL` vs `API_URL` (C10).
3. **Startup failure handling** — 10 services `process.exit(1)`, files+workers hang (B2).
4. **Graceful shutdown** — `setupServiceShell` everywhere except mcp (B1); workers rolls its own (better) shutdown.
5. **main.ts logging** — DI `LoggerService` (9 services) vs raw `new Logger()` (discord, slack).
6. **Admin list pages** — `useState`+`useQuery` family (cameras/lenses/lightings/presets) vs `useReducer` family (7 others); cameras vs lenses org/brand URL-state divergence is a live behavior difference.
7. **Duration formatting** — ms-based vs seconds-based conventions randomly per surface (C11).
8. **Timeout error signaling** — `PollTimeoutException` class vs `PollingTimeoutError` detected by `error.name` string comparison (C7).
9. **Polling** — tested `PollUntilService` vs 3 hand-rolled loops (backend); react-query present but `refetchInterval` never used (frontend).
10. **Health endpoint shape** — rich shared module (4 services) vs 3 hand-rolled variants (7 services) vs bespoke Express (workers).
11. **Skeleton loading states** — shimmer primitive vs raw `animate-pulse` divs inside the same dispatcher function.
12. **Clipboard** — canonical guarded service vs raw `navigator.clipboard` with and without error handling.
13. **Encryption key sourcing** — ConfigService vs raw `process.env` for the same AES key (C3a).

**Verified consistent (no action):** class-validator is the single backend validation stack (no zod mixing); frontend/backend logger stacks are each near-universally adopted; serializer triplets follow the mandated pattern; publisher services all extend `BasePublisherService`.

---

## 5. Recommended shared modules / components

Only abstractions that remove real, demonstrated complexity. Each lists what it replaces.

| # | Module | Replaces | Complexity removed |
|---|---|---|---|
| S1 | **`packages/libs/auth`**: shared `InternalApiKeyGuard` (configuredKey + isDevelopment ctor args) + `isPublicRoute(reflector, ctx)` helper co-located with `Public()` | 3 guard copies (C3b); 2 `isPublicRoute` copies; mcp's local `@Public()` | one security-review surface instead of three |
| S2 | **`findOrThrow(delegate, where, entityName)`** free-function helper + adoption of existing `BaseService.findOneWithOrganization` | 150-220 hand-rolled find-or-404 blocks (C2a) | every call site inherits correct `isDeleted`+org scoping; single 404 shape |
| S3 | **Adopt `@libs/health`** fleet-wide with a small `HealthIndicator` extension point for per-service extras (bot counts, job stats); extract response-builders for workers' context-only bootstrap | 7 hand-rolled controllers + workers' Express server (C4) | one health contract for ECS/ALB |
| S4 | **One raw-HTML checker** (keep the broadest-coverage tool, port the other two's allowlists, wire it to both lint-staged and CI) | 3 checkers, 3 allowlists (C8) | eliminates pass-commit/fail-CI splits |
| S5 | **`scripts/lib/check-runner.ts`** — logger factory, `DEFAULT_EXCLUDE_GLOBS`, `isMainModule()`, `runCheck()` wrapper | 7+ scripts' copy-pasted glue; 2 hand-rolled file walkers | new checks stop propagating drifted variants |
| S6 | **`runWorkflowSeed(templates, label, ensureFn)`** in `apps/server/api/scripts/seeds/shared/` | 11 seed scripts × ~100 lines (C12) | seeding fixes apply once |
| S7 | **Shared highlight-detection service** (prompt build + OpenRouter call + parse) | 3 verbatim copies across workers + clips (C12) | prompt/model updates in one place |
| S8 | **`packages/helpers` additions**: `generateId(prefix?)` over nanoid; cents-aware `formatCurrency(amountInCents, currency)` with cache; ms-based `formatDurationCompact`; then *adopt* the already-exported `sleep`/`formatDuration` | 20+ ID generators, 2 currency formatters, 9 duration copies, 4 sleeps (C11) | one convention per primitive; CLI/agent get a zero-dep leaf |
| S9 | **Config: canonical `GENFEEDAI_API_URL`/`GENFEEDAI_APP_URL` getters** in `packages/libs/config/default.config.ts` + typed getters for `GITHUB_WEBHOOK_SECRET`/`ADMIN_ALLOWED_IPS` in api's ConfigService | 10+ hardcoded URL fallbacks under 3 names; raw env reads (C10) | domain changes become one-line edits |
| S10 | **`workflow-ui` as sole workflow-builder implementation** (not a new module — finishing an existing one): merge SSE/store/hooks/lib, add error-reporting injection point | the 3,200-line fork (C1) | ends documented manual double-maintenance |
| S11 | **`CredentialCryptoService` (or its non-DI core) as the only cipher** | `EncryptionUtil` + 58 call sites (C3a) | one key-sourcing path, ConfigService-validated |

**Explicitly do NOT abstract (over-abstraction candidates / verified-fine duplication):**
- The 12 per-service `ConfigModule` wrappers (each binds a distinct per-app ConfigService type; a generic factory adds generics for ~no gain).
- The two-tier config design (Joi-validated vs lightweight) — document it instead.
- Sentry `instrument.ts` preload files (required by Sentry's init-first contract; logic already shared).
- The ECS deploy workflow trio (`_deploy-ecs-core.yml` is a correctly reused reusable workflow).
- `PublisherFactoryService`, `ByokProviderFactoryService`, `CacheStrategies`, OSS/EE billing contracts (genuine multi-implementation seams).
- `useAuthUser` vs `useAuthIdentity` (disjoint concerns by design — refuted; see Appendix B).

**Delete instead of generalize:** `CacheKeyService`, 21 zero-arg executor factories, `timezone-date` module, `effect-bridge`, narrative JSDoc blocks (Section 3).

---

## 6. Refactor roadmap (ordered by ROI)

Effort: S <½ day, M ≈1-2 days, L ≈3-5 days, XL >1 week. Ordered by (risk-adjusted value ÷ effort).

### Phase 0 — Latent-bug fixes (S each, do immediately, no refactor dependency)
1. **B2**: add `process.exit(1)` to files + workers bootstrap catch blocks.
2. **B1**: add `setupServiceShell(app, …)` to mcp main.ts.
3. **C6**: delete the `console.info` double-log in `workflow-deployment-backfill.service.ts`.
4. **B5**: rename CLI `Brand.handle` → `slug`, fix the dead branch.
5. **B3**: delete `apps/app/src/lib/logger.ts`, rewrite its 8 importers to the canonical logger (3-arg → 2-arg `error()` signature).
6. **B6 (first slice of C5)**: replace mcp's `post.interface.ts` unions with `Platform`/`PostStatus` from `@genfeedai/enums`; fix `tool-validators.ts` + `publishing.tool.ts`.

### Phase 1 — Deletions (S-M, mechanical, high signal-to-noise)
7. Delete AdInsights (both stacks) + `ad-aggregation.service.ts`.
8. Delete the 4 dead analytics cron services + their module registration.
9. Delete `timezone-date` module, `effect-bridge`, temp vitest configs, 2 orphaned scripts, 4 orphaned compose files.
10. Inline `CacheKeyService`; delete 21 zero-arg executor factories (registry calls `new XxxExecutor()` directly); trim narrative JSDoc.
11. knip-guided dependency cleanup (apps/app tiptap set, root remotion/slack-bolt/bcrypt/fullcalendar) — verify each, then remove.
12. Per-package knip unused-file sweep (start with `packages/pages`/`props`/`contexts`/`hooks`) — human-reviewed, not `--fix` blind.

### Phase 2 — High-leverage consolidation (M-L, semantic)
13. **S2**: introduce `findOrThrow` + migrate `batch-generation.service.ts` first, then the ~52 files incrementally; wire `BaseService` subclasses to `findOneWithOrganization`.
14. **C2b**: index audit → add `@@index([organizationId, isDeleted, …])` migrations for the proven-hot subset of the 77 unindexed models.
15. **C2c**: standardize on the custom `NotFoundException`; add a lint ban on the `@nestjs/common` import in `apps/server/api`; migrate 33 files.
16. **S11**: migrate the 58 `EncryptionUtil` call sites to `CredentialCryptoService`/shared core; delete `EncryptionUtil`.
17. **S1**: extract shared internal-API-key guard + `isPublicRoute`; delete 3 copies.
18. **S4**: consolidate the 3 raw-HTML checkers.
19. **S9**: canonical URL getters; fix the `process.env.API_URL` bypass in workflows.service.ts.
20. **S3**: health-module adoption across 7 services (+ workers response-builder reuse).

### Phase 3 — The big fork (XL, highest absolute value, do when workflow surface is stable)
21. **S10 / C1**: unify workflow builder on `packages/workflow-ui`. Sequence: (a) author tests for the package execution store (none exist), (b) add error-reporting injection, (c) merge SSE subscription (fixes B4 permanently), (d) repoint slices/hooks/lib one module at a time, (e) delete app copies. 37% of repo duplication disappears in one campaign.

### Phase 4 — Utility & UI consolidation (S-M each, schedule opportunistically)
22. **S8**: helpers additions + adoption sweeps (durations, currency, IDs, sleep).
23. **C11**: clipboard sweep (~15-17 in-scope sites); `SkeletonFallbacks` 2-case fix.
24. **C7**: rebuild `PollingService` on `PollUntilService`; migrate Fal + Apify loops; kill the `error.name` string checks. Frontend: introduce `usePollingQuery` and migrate the 8+ setInterval sites.
25. **S6/S7**: seed-script runner; shared highlight-detection service.
26. **C9**: config-driven `AdminElementList`/form-modal (fold the cameras/lenses divergence fix in); shared list-controller helper for the 6 CRUD controller clones.
27. **C12**: extension `HTTPBaseService` core extraction; extension `EmptyState` swap; GPU-compose anchors.
28. **C5 remainder**: author `api-types` contracts (workflow first), migrate remaining mcp interfaces opportunistically.

---

## 7. Risk level & test coverage needed per refactor

| Item | Type | Risk | Required coverage before/with the change |
|---|---|---|---|
| P0.1-0.2 exit(1)/setupServiceShell | mechanical | low | manual: force startup failure → non-zero exit; SIGTERM mcp locally → `OnModuleDestroy` fires |
| P0.3 double-log removal | mechanical | low | none (log-only); confirm no test snapshots assert console output |
| P0.4 CLI slug | mechanical | low | CLI integration test: `gf brands` prints slug from fixture response |
| P0.5 apps/app logger deletion | delete | medium | rewrite `logger.test.ts` against canonical logger; per-call-site signature check; verify a thrown error reaches Sentry in staging |
| P0.6 mcp platform/status enums | semantic | medium | unit tests: every real `PostStatus`/`Platform` value round-trips through `content.client.ts` without defaulting |
| P1 deletions (7-12) | delete | low | build + type-check per package; grep for string/DI references pre-delete; CI green is the gate |
| P2.13 findOrThrow | semantic | medium | helper unit tests: not-found, soft-deleted, wrong-org → 404; existing service specs must keep passing per migrated file |
| P2.14 org indexes | mechanical | low | migration applies cleanly on staging DB; `EXPLAIN ANALYZE` before/after on top 5 hot models |
| P2.15 NotFoundException | semantic | low | contract/snapshot test on `HttpExceptionFilter` 404 output; sweep specs asserting exception messages |
| P2.16 encryption migration | semantic | **medium-high** | round-trip encrypt/decrypt per migrated site; cross-implementation ciphertext decrypt test (old-written → new-read and vice versa); legacy-plaintext path; staged rollout — this touches OAuth tokens at rest |
| P2.17 shared API-key guard | mechanical | low | port images' spec to shared location; add the missing clips coverage; dev-bypass + timing-safe rejection parity per service |
| P2.18 raw-HTML checker merge | semantic | medium | snapshot combined violation set from all 3 tools first; merged tool must produce identical (or explicitly grandfathered) results on master before landing |
| P2.19 URL getters | mechanical | low | resolved-URL snapshot per service × dev/prod; regression test for workflow webhook URL generation |
| P2.20 health consolidation | semantic | medium | per-service `/health` shape parity test; ECS/ALB path returns 200 with expected fields; workers: SIGTERM still drains BullMQ before exit |
| P3.21 workflow-ui unification | semantic | **high** | author package-side store/SSE unit tests first (none exist); Playwright e2e: node CRUD, drag/reorder, auto-layout, context menu, SSE execution streaming — run before and after each module repoint; feature-flag or branch-stacked rollout |
| P4.22 helpers adoption | mechanical | low | unit tests per format variant incl. boundary values; snapshot checks where literal formats are asserted |
| P4.23 clipboard/skeleton | mechanical | low | toast success/error per migrated site; visual check on gallery/settings skeletons |
| P4.24 polling unification | semantic | medium | timeout, success-on-Nth, failure-short-circuit for Fal/Apify/PollingService; frontend terminal-state stop + unmount-cleanup per site; keep `PollingTimeoutError` name-compat or fix all 3 string checks atomically |
| P4.25 seeds/highlights | mechanical | low | dry-run seed diff against test DB pre/post; highlight output-shape + prompt-content regression against a fixture |
| P4.26 admin CRUD | semantic | medium | per-entity integration: filter/paginate/delete-confirm; explicit regression test for the org/brand URL-state behavior (currently divergent) |
| P4.27 extension HTTP/EmptyState | semantic | medium | abort-signal composition, 401/timeout/network classification parity tests; visual check on 2-3 extension screens |
| P4.28 mcp contracts | semantic | medium | Zod round-trip per authored contract against a seeded entity |

---

## Appendix A — Scanner snapshots

- **jscpd** (`.jscpd.json`: minLines 30, tests excluded): 3,017 files analyzed, 154 clones, 8,629 duplicated lines (1.61%). The 30-line floor means fine-grained duplication (e.g., the find-or-404 blocks) is *not* in this number — the true duplication surface is higher than 1.61% but is enumerated in Section 2 instead.
- **knip**: 239 unused files / 104 unused exports / 225 unused exported types / 23 unused deps / 6 unused devDeps / 23 duplicate exports / 724 "unlisted deps" (the last dominated by a repeated sentry-cli pattern across the 12 services — a manifest-hygiene chore, not slop).

## Appendix B — Investigated and rejected (do not re-litigate without new evidence)

| Claim | Why rejected |
|---|---|
| Workflow node/edge types duplicated between `packages/interfaces` and `workflow.schema.ts` cause data loss | The runtime validation boundary (`WorkflowInputVariableDto`) already matches the interfaces side; `workflow.schema.ts` is a TS-only annotation over a Prisma Json column. Intentional FE-builder vs BE-persistence split. |
| `useAuthUser` + `useAuthIdentity` should merge | Disjoint by design: token-choke-point identity vs display profile. Merging couples 61 identity-only callers to profile normalization — net complexity increase. |
| `ICredential` relation shapes diverge from the API | The serializer *does* nest user/org/brand/tags on the wire, matching `ICredential`. Real residue: 2-3 dead token fields to prune (low). |
| Publisher services duplicate retry/backoff | No retry/backoff exists in those files; they already extend `BasePublisherService`. Real residue: one `publishThreadChildren` template method worth extracting (low). |
| 4-way bot compose duplication needs anchors | The 4 files are orphaned (zero references) — delete them; the live definitions are inline in the main/production composes. |
| 4 analytics crons duplicate a query 4 ways in production | Dead code from the completed #802 workflow migration; nothing schedules them. Delete, don't refactor. |
| `packages/errors` bypassed by backend services | It's CLI-only by design. |
| ECS deploy workflow trio is copy-paste | `_deploy-ecs-core.yml` is a correctly reused reusable workflow with justified per-caller divergence. |
| Sentry init duplicated 10× | Logic already centralized in `@libs/config/sentry.config.ts`; per-service preload files are required by Sentry's init-order contract. |

## Appendix C — Audit gaps / caveats

- The config-env dimension's non-headline findings (rows on `GITHUB_WEBHOOK_SECRET`, onboarding env reads) did not get an adversarial verification pass (rate limits); the two headline findings (encryption, URLs) were verified directly against the code.
- knip has known blind spots here (DI tokens, dynamic imports, string-referenced modules) — several of its claims were disproven during verification; treat its file list as leads requiring per-file confirmation, never bulk `--fix`.
- E2E/`tests/`/`tools/` directories and the mobile app received lighter coverage than `apps/server` + `apps/app`; a follow-up pass focused on `e2e/` helper duplication may be worthwhile after Phase 3.
