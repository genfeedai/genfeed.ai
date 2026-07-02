# Repo Map — genfeed.ai Monorepo Audit (Session 00)

> Factual map of the codebase before any cleanup recommendations. Every claim below is
> evidence-backed by file paths read during this audit (2026-07-02, branch
> `claude/silly-wozniak-3fca03` @ `81080c7de`). Items that could not be verified are
> explicitly marked **UNCLEAR** with the missing evidence named.

---

## 1. System overview

**What it is:** An open-source "AI OS for content creation" — a TypeScript monorepo that
generates, orchestrates, and publishes AI content (images, video, voice, posts) across
~49 external platforms, shipped simultaneously as a SaaS (cloud), a self-hosted community
Docker image, and desktop/mobile/extension clients.

**Scale (measured):**

| Metric | Value | Evidence |
|---|---|---|
| Tracked files | 12,051 | `git ls-files \| wc -l` |
| TypeScript files | 10,637 | `git ls-files '*.ts' '*.tsx'` |
| Hand-written TS LOC (excl. `.d.ts`/generated) | ~118K | `wc -l` over filtered `git ls-files` |
| Workspace packages | ~65 (19 apps + 44 `packages/` + 2 real `ee/`) | `package.json:24-35` workspaces; dir listings |
| Prisma models (cloud schema) | 151 (4,441-line schema) | `packages/prisma/prisma/schema.prisma` |
| DB migrations | 36 (2026-04-17 → 2026-06-30) | `packages/prisma/prisma/migrations/` |
| API domain services / collections / integrations | 54 / 108 / 49 | `apps/server/api/src/{services,collections,services/integrations}/` |
| Frontend routes | 192 pages (app), 36 (website), 1 catch-all + 49 MDX (docs) | `find apps/*/app -name page.tsx` |
| Unit/integration spec files | ~3,000 (1,431 server + 451 app + 1,114 packages + 11 ee) | `find … -name '*.spec.ts' -o -name '*.test.ts*'` |
| Playwright e2e specs | 115 | `find playwright -name '*.spec.ts'` |
| GitHub Actions workflows | 24 + 2 composite actions | `.github/workflows/`, `.github/actions/` |
| Git history | 1,327 commits since 2026-04-04; single human author (3 aliases) + 12 Claude-authored | `git rev-list --count HEAD`, `git shortlog -sn` |

**Core runtime stack (all versions read from manifests, not inferred):**

- **Package manager:** Bun 1.3.14 (`package.json:36 "packageManager"`), Node engine `>=24 <25`, `bun.lock` only (no npm/yarn lockfiles). `bunfig.toml` enforces `minimumReleaseAge = 10800s` on installs.
- **Orchestration:** Turborepo 2.10.0 (`turbo.json`, schema pinned v2-9-12). Tasks: `build`, `dev`, `dev:portless`, `lint`, `type-check`, `test`, `clean`, plus a root-only uncached `//#env:check` that gates build/type-check/test.
- **Backend:** NestJS 11.1.27 on Express 5.2.1, bundled with webpack 5.108 + swc-loader (es2022, decorators) via the `createWebpackConfig` factory (`webpack.base.config.js`).
- **Frontend:** Next.js 16.2.9 / React 19.2.7 (Turbopack dev+build), Tailwind CSS 4.3.1 (v4 `@theme` blocks in `packages/styles/globals.css`).
- **Language/tooling:** TypeScript 6.0.2, Biome 2.4.16 (format+lint), Vitest 4.1.9 (projects mode), Playwright 1.61.1, Knip (dead code), Secretlint 13 (custom Bun shim `scripts/run-secretlint.ts`).
- **Data:** PostgreSQL via Prisma 7.8.0 (`@prisma/adapter-pg`; `prisma-client` generator → `packages/prisma/generated/prisma/client`). Desktop uses embedded PGlite via `prisma-pglite` (`packages/desktop-prisma`, 18-model schema).
- **Cache/queues:** Redis — node-redis 6.0.1 for pub/sub/cache/socket-adapters; ioredis 5.11.1 only as BullMQ 5.79.1's transport (never imported directly; documented in `packages/libs/redis/redis-connection.utils.ts:5-7`).
- **Auth:** Better Auth ^1.6.21, server config in `apps/server/api/src/auth/better-auth/better-auth.factory.ts` (Prisma adapter, postgresql).
- **Payments:** Stripe 22.3.0 (`apps/server/api/src/services/integrations/stripe/`), webhooks via svix dep.
- **Monitoring:** Sentry (`@sentry/nestjs` + `@sentry/nextjs` 10.61.0) — all 12 backend services have `src/instrument.ts`; frontends via shared `packages/next-config/sentry.config.base.ts`. No PostHog anywhere (grep: 0 hits).
- **AI SDKs:** `ai` 7.0.2, `@ai-sdk/anthropic` + `@ai-sdk/openai` 4.0.0, plus fal/replicate/elevenlabs SDKs and a self-hosted vLLM GPU instance (`docker/docker-compose.llm.yml`).

---

## 2. Repo / package map

### 2.1 Apps — backend (`apps/server/*`, 12 NestJS services)

All 12 bootstrap through shared `@libs/bootstrap` and `RedisModule.forRoot` (verified 12/12
in each `src/main.ts` / `app.module.ts`). `PORT` is a **required** Joi env var with no code
default (`packages/config/src/schemas/base.schema.ts:10`); documented defaults live in
`.env.example` and per-service compose files.

| Service | Port (.env.example) | Role | Notable |
|---|---|---|---|
| `api` | 3010 | Main API: 54 domain services, 108 CRUD collections, 49 platform integrations, 15 endpoint groups, auth, webhooks, workflows | `src/app.module.ts` is 485 lines / 197 imports; global prefix `v1`; Swagger; helmet + express-rate-limit + compression; Bull Board at `/admin/queues` (bearer-token, `timingSafeEqual`, fail-closed — `src/main.ts:284-311`) |
| `notifications` | 3011 | Notifications + websocket terminal gateway | Only `@WebSocketGateway` in repo (`src/services/terminal/terminal.gateway.ts`); node-pty native dep |
| `files` | 3012 | File/media processing | Own 5-queue BullMQ set + 5 processors (`src/queues/`, `src/processors/`); sharp |
| `workers` | 3013 | Background job engine | Registers ~30 queues, 35 `@Processor` classes; **imports the API's own PrismaModule and ~35 `@api/*` modules via forwardRef** (`src/processors/processors.module.ts`, header cites issue #84) |
| `mcp` | 3014 | MCP server for AI tools | |
| `clips` | 3015 | Clip pipeline | 1 queue `clipper-processing` (`src/queues/clipper.processor.ts`) |
| `discord` / `slack` / `telegram` | 3016 / 3018 / 3019 | Bot managers | Identical minimal shape (bot manager + health); discord.js 14.26.4, @slack/bolt 4.7.3, grammy 1.44.0 |
| `images` / `videos` / `voices` | 3020 / 3021 / 3022 | GPU generation pipelines | S3Module (only these 3); images+videos share a ComfyUI controller/service; compose maps host port from shared `${GPU_API_PORT:-8189}` |

### 2.2 Apps — frontend

| App | Stack | Routes | Backend access | Deploy |
|---|---|---|---|---|
| `apps/app` (studio) | Next 16.2.9, fully dynamic (0 static/ISR exports across 192 pages) | 192 pages: `(public)`, `(onboarding)`, `(protected)` incl. `admin/` (12 sections) + `[orgSlug]/[brandSlug]/` (13 sections) | `packages/services` BaseService (JSON:API) in 253 files + react-query 5.101.1 | Vercel `app.genfeed.ai` |
| `apps/website` (marketing) | Next 16.2.9, mixed static/dynamic per route | 36 pages incl. 5 landing funnels + programmatic `[slug]` families | Raw fetch (2 files) + server-side conversions API routes (LinkedIn/Meta/X) | Vercel `genfeed.ai` + `www` |
| `apps/docs` | Nextra 4.6.1, fully static | 1 catch-all + 49 MDX | none — zero `@genfeedai/*` deps | Vercel `docs.genfeed.ai` |

Auth enforcement for the studio lives in **`apps/app/proxy.ts` (796 lines)**: Better Auth
session cookie → bearer-token exchange against `/auth/token`, desktop-shell header auth,
HMAC-signed workspace-slug cookie (`gf_ws`), onboarding redirects. Website/docs have no middleware.
All three `vercel.json` files disable git auto-deploy — CI is the sole deploy path.

### 2.3 Apps — desktop / mobile / extensions

- **Desktop** (`apps/desktop/app`): Electron 42.5.0 + Next 16 renderer; local-first embedded Postgres via PGlite 0.5.3 + `@genfeedai/desktop-prisma`; explicit offline mode with cloud/local authority split (`src/main.ts:107-125`); macOS-only electron-builder targets (dmg/zip, notarized), published to GitHub Releases.
- **Mobile** (`apps/mobile/app`): Expo SDK 56.0.12 / RN 0.86, cloud-only (REST + WS, AsyncStorage offline queue). **`eas.json` is marked `"_status": "DISABLED - Not actively developed"` with placeholder store credentials** — mobile cannot ship as configured.
- **Browser extension** (`apps/extensions/browser/app`): Plasmo 0.90.5, host permissions for 8 social platforms, side panel; scripts use `npm exec` (violates bun-only convention). Manifest version not explicitly declared (Plasmo defaults to MV3 — **UNCLEAR**: confirm from build output).
- **IDE extension** (`apps/extensions/ide/app`): VS Code `^1.105.0`, esbuild + vsce, Better Auth device-code flow against `accounts.genfeed.ai` (`src/services/auth.service.ts:84-341`).

### 2.4 Shared packages (`packages/`, 44 dirs)

Full inventory verified per-package (package.json + entry read). Highlights:

- **Contracts stack (intentional layering, dependency-direction verified):** `enums` (112 enums, leaf) → `interfaces` (250 interface files) → `props` (186 React prop files, depends on everything below). `types` = workflow-domain types (leaf).
- **Serializers:** attributes→config→serializer triplet confirmed with 3+ examples (post, brand, agent-run under `packages/serializers/src/{attributes,configs,server}/…`). `buildSerializer` (`src/builders/serializer.builder.ts`) maps **`_id` for server-side** — a MongoDB-era remnant in a Postgres stack.
- **Workflow trio:** `workflow-engine` (runtime, ~50 node executors, retry/resume), `workflows` (official JSON templates + extension contracts), `workflow-saas` (node type definitions + registry merge for the visual builder; plain `tsc`, AGPL, source shipped in tarball — not obfuscated). `workflow-ui` = React Flow canvas.
- **`client` is NOT an HTTP client** — handwritten domain models + Zod schemas only; actual HTTP lives in `packages/services` (frontend) and `packages/cli/src/api/client.ts` (ofetch).
- **`api-types`** is generated from the live OpenAPI spec (`scripts/generate.ts` → `openapi-typescript`, default `http://localhost:3010/v1/openapi.json`).
- **Design system:** `packages/ui` = 55 primitives + ~900 feature components + token generator (`src/generators/web-css.ts` emits `web-tokens.css`); `packages/styles` = Tailwind v4 `@theme` + 89 `gen-*` utility classes. Depends on external `@shipshitdev/ui` (`packages/styles/globals.css` `@source` directive).
- **Published to npm** (publishConfig/private checked): api-types, auth-client, cli, client, constants, core, create, enums, errors, harness, helpers, interfaces, prompts, serializers, tools, types, ui, workflow-engine, workflow-saas, workflow-ui, workflows (~21 of 44).
- **Real duplication found:** `packages/libs/s3` (NestJS S3Module) vs `packages/storage` (framework-agnostic S3/local provider behind `createStorageProvider()`, self-hosted → local FS) — two independent AWS-SDK S3 wrappers. Also two logger stacks: winston (`packages/libs/logger/logger.service.ts`, backend LoggerService) and pino (`packages/services/core/logger.service.ts`, frontend services).
- **`helpers` vs `utils`:** intentional split — `helpers` published, low-dependency, owns JSON:API (de)serialization plumbing; `utils` private, sits above `client`/`services`/`props` with feature one-offs.

### 2.5 Enterprise (`ee/`)

- License: commercial, dev/test use allowed without subscription (`ee/LICENSE`).
- **Only 2 of 5 packages are real:** `billing` (`@genfeedai/ee-billing`, 33 files) and `harness` (`@genfeedai/ee-harness`, 1 file — a single `ContentHarnessPack` plugging into OSS `packages/harness`'s registry).
- **`analytics`, `multi-tenancy`, `teams` are placeholders** containing only `.gitkeep` + `EE-EXTRACTION.md`. Multi-tenancy actually lives in the OSS API today (`CombinedAuthGuard` at `apps/server/api/src/helpers/guards/combined-auth/`, 301 `organizationId` references in the Prisma schema) — the documented "multi-tenancy is an ee package" claim (CLAUDE.md, memory docs) describes a target state, not the code.
- EE/OSS split mechanism: webpack filesystem probe `hasEE` aliases `@billing-providers` to either `ee/packages/billing` or the OSS stub `apps/server/api/src/common/subscriptions/billing.providers.oss.ts` (`webpack.base.config.js:70-100`); consumed by `app.module.ts` and subscriptions modules. CI enforces the boundary: `build-verify-selfhosted.yml` greps the community image for `ee/` coupling.

### 2.6 Other top-level

- `skills/` — 31 product/content skills (app content). `.agents/skills/` — 48 dev skills. `.claude/skills/` — gitignored symlinks generated by `postinstall` (`scripts/setup-skills.sh`).
- `scripts/` — 71 entries: ~15 architecture guards (`check-*.ts`, incl. `check-platform-cron-boundary.ts`, `check-no-api-bullmq-processors.ts`), `api-audit/` (endpoint inventory, SQL risk audit, OpenAPI smoke — with their own tests), e2e sharding/route coverage, env check/sync, secretlint shim, session analytics miners.
- `docs/` — 9 entries (architecture, deployment-modes, self-hosting, platform-admin-role, better-auth-organization-bridge, execution-boundaries, contributing + `superpowers/`). `docs/audits/` created by this report.
- `playwright/` — e2e suite (configs + tests); `tests/` — shared page fixtures + setup; **no root `e2e/` dir exists** (memory/docs referencing one are stale).
- `infra/terraform/` — see §3. `artifacts/` — `verification/` outputs only.

---

## 3. Runtime / deployment map

### 3.1 Production (SaaS)

- **Backend: ECS Fargate**, cluster managed by OpenTofu in `infra/terraform/genfeed-prod/` (ECS cluster, ALB with `api` + `public_backend` target groups, ElastiCache + auth token in SSM, ECR, Route53 records for `api.genfeed.ai`, private-DNS service discovery, NAT, security groups; state bucket in `infra/terraform/bootstrap/`).
- **Deploy path (dispatch-only, never tag/push-triggered):** `deploy-ecs.yml` → validates ref is on `master` → runs `full-suite.yml` QA gate (ci heavy tests + build-verify + e2e) → `_deploy-ecs-core.yml`: promotes the GHCR image to ECR via `imagetools create` (no rebuild), OpenTofu apply, **RDS snapshot before migrations (fail-closed)**, one-off ECS tasks (migrate, workflow-backfill, boot-smoke), service roll, then Vercel frontend deploys + post-deploy smoke. Emergency bypass: `deploy-ecs-fastlane.yml` with a 4-layer admin gate (write access, environment reviewers, `FASTLane_ADMINS` allowlist, typed `confirm==DEPLOY`).
- **Frontends: Vercel**, deployed only from `_deploy-ecs-core` via `deploy-vercel-frontends.yml` (3 pinned project IDs; git auto-deploy disabled in all three `vercel.json`).
- **Image strategy:** ONE unified server image (`docker/Dockerfile.server`, node:24-slim + bun 1.3.14 + ffmpeg) builds all 12 NestJS bundles; built on master pushes by `build-server-image.yml` → GHCR.

### 3.2 Legacy / rollback EC2 path

`docker/docker-compose.production.yml` + `docker-compose.staging.yml` run **10 containers**
(redis + api, files, mcp, notifications, clips, discord, slack, telegram, workers) from the
same unified image with per-service memory limits, env via `render-ssm-env.sh` (SSM), driven
by `deploy-production.sh`/`deploy-staging.sh`. `RELEASING.md:24-27` states the legacy
"Deploy Production" workflow was removed after the Fargate cutover — these compose files are
the stopped-EC2 rollback path, not the active deploy. **UNCLEAR:** whether staging still runs
on this EC2 path or on ECS — no staging entry exists in `infra/terraform/`, and no CI workflow
invokes `deploy-staging.sh`.

### 3.3 GPU / generation services — no production deploy path in repo

`images`, `videos`, `voices` are **absent from both production and staging compose files**
(grep: 0 matches) and from the ECS terraform reads; they have standalone compose files keyed
to `${GPU_API_PORT:-8189}`. `docker/docker-compose.llm.yml` documents a vLLM
OpenAI-compatible server (Qwen 2.5 32B GPTQ + Mistral Small 3.1 24B) on a g6e.xlarge EC2,
started/stopped on demand by `LlmInstanceService` + the `llm-idle` cron (`*/5` shutdown-if-idle,
`apps/server/workers/src/crons/llm-idle/`). **UNCLEAR:** where images/videos/voices actually run in
production — missing evidence is either an entry in `infra/terraform/genfeed-prod/services.tf`
or an external (private console/fleet) deploy mechanism outside this repo.

### 3.4 Self-hosted / community

`docker/Dockerfile.selfhosted` (single image, `selfhosted-entrypoint.sh`,
`docker-compose.selfhosted.yml`). Published to GHCR **only** by `docker-publish.yml` on GitHub
Release, gated on `full-suite.yml` + `build-verify-selfhosted.yml` (which boots the image and
greps for `ee/` coupling). Nightly release e2e: `e2e-selfhosted-release.yml` boots the released
image and runs `test:e2e:release`, reporting to a deduped issue.

### 3.5 Client distribution

- Desktop: `desktop-release.yml` on `desktop-v*` tags (macOS sign+notarize → GitHub Releases; auto-update via electron-updater).
- Browser extension: `browser-extension-submit.yml` on `extension-browser-v*` tags → Chrome Web Store (PlasmoHQ/bpp).
- Mobile: `mobile-build.yml` on `mobile-v*` tags → EAS (but EAS config disabled, §2.3).
- npm packages: `publish-packages.yml`, dispatch-only, JSON-driven, dry-run default.

### 3.6 Background execution model

- **BullMQ queues: ~37 named queues** across 3 owners — `workers` (~30, central hub `apps/server/workers/src/queues/queues.module.ts`), `files` (5), `clips` (1). API registers producer-side modules per feature (`apps/server/api/src/queues/*`). Full name→producer→consumer table verified by direct read (see queue module files cited above).
- **Static cron: 20 active `@Cron` sites** (grep-verified), all present in the hardcoded `PLATFORM_CRON_ALLOWLIST` of `scripts/architecture/check-platform-cron-boundary.ts` — the CI guard fails on any tenant-facing cron not migrated to workflows.
- **Workflow scheduling** (`apps/server/api/src/collections/workflows/services/workflow-scheduler.service.ts`): per-workflow **in-process `cron` CronJobs** built from fields on the `Workflow` model (`schedule`, `isScheduleEnabled`, `timezone`), loaded on module init + reconciled hourly by an allowlisted `@Cron`. Workflow delay nodes use real BullMQ delayed jobs (`workflow-delay` queue, deterministic jobIds).
- **Legacy cron-jobs subsystem** (`apps/server/api/src/collections/cron-jobs/`): mutations throw `GoneException` ("Legacy cron jobs are retired"); a per-minute dispatcher (`cron.dynamic-jobs.service.ts`) still executes un-migrated rows under Redis lock, excluding `workflow_migrated` ones.
- **Bull Board** exposes only the `default` queue (`apps/server/api/src/main.ts:256-268`) — the other ~36 queues are invisible in the UI.

---

## 4. Data / auth / integration map

### 4.1 Database

- **PostgreSQL** via Prisma 7.8.0; datasource `postgresql`, generator `prisma-client` → `packages/prisma/generated/prisma/client`; runtime adapter `@prisma/adapter-pg`. Schema header: *"Migrated from the legacy MongoDB stack"* (`schema.prisma:1-4`).
- 151 models, 36 migrations (`20260417050332_init` → `20260630202414_add_credential_account_health`).
- **Soft-delete convention:** `isDeleted` (219 occurrences) — with exactly **one deviation**: `Asset.deletedAt DateTime?` (`schema.prisma:1714`).
- **Org scoping:** 301 `organizationId` occurrences — multi-tenancy is schema-native in the OSS core, not an EE add-on (§2.5).
- **Desktop DB:** separate 18-model schema (`packages/desktop-prisma/prisma/schema.prisma`) on PGlite via `prisma-pglite` driver adapter.
- **MongoDB is vestigial:** the root `mongodb` devDependency is used only by `scripts/check-prod-creds.mjs` and one-off migration scripts under `scripts/migrations/` (db-split, agent-messages extraction, etc.). No runtime imports.

### 4.2 Auth

- **Better Auth ^1.6.21** configured in `apps/server/api/src/auth/better-auth/better-auth.factory.ts`: `prismaAdapter(prisma, { provider: 'postgresql' })`, `emailAndPassword`, conditional Google + GitHub social providers (trusted-provider account linking), `magicLink`, and the `organization(...)` plugin (`:577`) bridging Better Auth orgs to the domain `Organization`/`Member` models (`docs/better-auth-organization-bridge.md`).
- **Guard architecture:** global `CombinedAuthGuard` (`apps/server/api/src/helpers/guards/combined-auth/combined-auth.guard.ts`) composes `BetterAuthGuard` + `ApiKeyAuthGuard`, honors `@Public()` (`@libs/decorators/public.decorator`), and short-circuits with a cached local identity in `IS_LOCAL_MODE`/`IS_HYBRID_MODE` (desktop/self-host modes from `@genfeedai/config`). Registered via `APP_GUARD` in `app.module.ts`.
- **Passport is a thin bridge, not a legacy stack:** `passport-custom` strategy wrapping Better Auth (`src/auth/better-auth/passport/better-auth.strategy.ts`). `jsonwebtoken` survives in `src/helpers/utils/jwt/jwt.util.ts` and the Ghost integration (Ghost Admin API requires JWTs).
- **Platform admin:** `User.platformRole PlatformRole @default(USER)` (`schema.prisma:517`).
- Auth flavors per client: session cookie + token exchange (web via `proxy.ts`), device-code flow (IDE ext), desktop token header, API keys (`src/collections/api-keys/`, `ApiKeyAuthGuard`).

### 4.3 External integrations (49 dirs in `apps/server/api/src/services/integrations/`, read-verified)

- **AI/generation:** anthropic, openai-llm, openrouter, xai, llm (self-hosted vLLM), fal, replicate, elevenlabs, comfyui, klingai, leonardoai, hedra, heygen (+ `heygen-poll` queue), higgsfield, whisper.
- **Social/publishing:** twitter, linkedin, instagram, facebook, threads, tiktok, youtube, pinterest, reddit, mastodon, medium, substack, ghost, wordpress, beehiiv, shopify, snapchat, whatsapp, telegram, slack, discord, unipile, fanvue, opuspro, publishers.
- **Ads:** google-ads, meta-ads, tiktok-ads (+ ad-sync/ad-insights queue families).
- **Data/misc:** apify, news, giphy, google-search-console, **solana** (a crypto integration in a content platform — worth a deliberate keep/kill decision), stripe.
- **Email:** resend (notifications service schema `resendSchema`).
- **Storage/CDN:** AWS S3 (`packages/storage` + `packages/libs/s3`), domains `cdn/assets/ingredients.genfeed.ai` referenced from client configs.
- Structural pattern confirmed (3+ examples): integration modules built with `createServiceModule` (higgsfield, fanvue, twitter, tiktok-ads module files).

### 4.4 Observability

- **Sentry:** 12/12 backend services via `src/instrument.ts` (+ `SentryModule.forRoot` in workers/discord/slack app modules); `apps/app` + `apps/website` via shared `initSentry` (projects `app-genfeed-ai` / `genfeed-ai`), gated to production + auth token. **Gap:** `apps/app` has no `instrumentation-client.ts` — no browser-side Sentry for the largest app (website has client replay).
- **Logging:** backend = winston LoggerService (`packages/libs/logger/`); frontend services layer = pino (`packages/services/core/logger.service.ts`). Two stacks by layer, not by accident — but still two stacks.
- **Product analytics:** none in-app (no PostHog). Website only: @vercel/analytics + speed-insights + GA/GTM/LinkedIn/Meta/X pixels with server-side conversions routes (`apps/website/app/api/marketing/conversions/route.ts`).
- **Health:** `@nestjs/terminus` health modules; per-service compose healthchecks (`/v1/health`; images/videos/voices use bare `/health` — inconsistency).

---

## 5. CI / test / tooling map

### 5.1 CI surface (24 workflows — full table verified)

- **On PR (the only automatic gates):** `ci.yml` (trust-gated: gitleaks, secretlint, react-doctor@0.4.2, architecture guards, format, lint, typecheck, build; heavy test shards only with `run_heavy_tests` or on push) and `link-check.yml` (paths-filtered).
- **QA gate for releases:** `full-suite.yml` = ci(heavy) + `build-verify.yml` (boots all 12 bundles + EE api bundle) + `e2e.yml` (API e2e with Postgres/Redis service containers + 12-way sharded frontend e2e). Required by both `deploy-ecs.yml` and `docker-publish.yml`.
- **Scheduled:** nightly e2e (`17 2 * * *`), nightly self-hosted release e2e (`23 5 * * *`), weekly coverage → Codecov (non-blocking), weekly `codebase-health.yml` (fallow 2.96.0 + react-doctor@0.5.6 + skills integrity, report-only), daily Claude pattern miner.
- **Manual-only despite their names:** `codeql.yml`, `security-scan.yml` (Trivy), `ide-extension-ci.yml` — no cron, no PR trigger.
- **Absent:** `dependabot.yml`, `CODEOWNERS` (find: 0 matches repo-wide).
- OIDC AWS auth in deploy workflows; shared `setup-bun-env` composite (bun/turbo caches, 3× retry install); GHCR registry build cache with provenance/sbom.

### 5.2 Testing

- **Vitest 4.1.9** workspace-projects mode (`vitest.config.ts` globs per app/package; `TZ=UTC` forced). ~3,000 colocated spec files (§1 table).
- **Playwright 1.61.1**, 115 specs, projects `better-auth-setup` → `app-core` → `app-authed` (`playwright/configs/playwright.config.ts`); 12-way CI sharding (`scripts/e2e-sharded.mjs`); the authed frontend job is dormant behind `vars.E2E_AUTHED_ENABLED`.
- **Coverage:** codecov.yml — project flags api/packages (2% threshold), web (3%, "relaxed — harder to maintain solo"), patch 80% but `informational: true`; uploads `continue-on-error`.

### 5.3 Quality tooling & guards

- Biome 2.4.16 with path-scoped overrides — **the linter is entirely disabled for `apps/server/**`** (`biome.json:104-114`); a separate `biome-staged.json` re-enables just 7 warn-level rules for staged backend files at pre-commit.
- Pre-commit (`.husky/pre-commit` via `core.hooksPath`): lint-staged → secretlint shim, biome-staged, `scripts/lint-no-raw-html.sh` (raw HTML element ban with primitive-dir whitelist).
- Architecture guards run in CI: cron boundary, no-API-BullMQ-processors, import cycles, multi-tenancy, serializer drift, package API surface, design system, pages boundary, generated-source artifacts.
- Knip dead-code config (`knip.config.ts`) — **stale**: declares workspaces `apps/server/fanvue` and `apps/server/llm` (don't exist) and omits `apps/server/images`/`voices` (exist).
- `doctor.config.json` — most plausibly consumed by react-doctor (used in ci.yml + codebase-health.yml); **UNCLEAR**: codebase-health's comment references `react-doctor.config.json`, a filename that doesn't exist; exact consumer unconfirmed.

---

## 6. Main architectural risks noticed during mapping

Ordered by blast radius. These are observations from mapping, not yet a remediation plan.

1. **`workers` is not a separate service — it's the API compiled twice.** It imports the API's PrismaModule, ~35 `@api/collections/*`/`@api/services/*` modules via forwardRef, and queue constants from `@api/queues/*` (`apps/server/workers/src/{app.module.ts,processors/processors.module.ts,queues/queues.module.ts}`). Any API-internal refactor can break workers with no package-boundary warning. The "12 backend services" framing overstates the real decomposition: 1 modular monolith (api+workers) + thin satellites.
2. **Backend lint coverage is near-zero.** Biome linting is disabled for all of `apps/server/**`; only 7 warn-rules apply to *staged* files at commit time. ~1,400 spec files notwithstanding, nothing enforces `noExplicitAny`, unused-vars, etc. on the largest code surface (`biome.json:104-114`, `biome-staged.json`).
3. **PR gate ≪ deploy gate.** PRs only run ci.yml fast checks + link-check; heavy tests, boot verification, and e2e run at deploy/nightly. Master can absorb regressions that only surface when a release is attempted (mitigated by nightly e2e, but detection lags merge).
4. **Workflow scheduler assumes a single API instance.** Scheduled workflows fire from in-process `cron` CronJobs inside the API (`workflow-scheduler.service.ts:91-136`); no distributed lock was observed in that path (unlike the legacy dispatcher, which locks via Redis). Scaling the api ECS service beyond 1 task would double-fire tenant schedules. **Verify before any horizontal scale-out.**
5. **Docs/memory describe a target state the code doesn't match.** `ee/packages/{multi-tenancy,teams,analytics}` are `.gitkeep` placeholders while CLAUDE.md/memory present them as live; multi-tenancy and credits actually live in the OSS API; a root `e2e/` dir is referenced but doesn't exist. In an AI-writes-all-code shop, stale steering docs directly cause wrong future code.
6. **GPU/generation services have no visible production story.** images/videos/voices are excluded from prod/staging compose, absent from knip, and not in the ECS reads; llm runs on a hand-managed EC2 via compose. If they're deployed via the private console repo, nothing in this repo says so.
7. **Root-level dependency hoisting:** ~135 runtime deps declared at the root `package.json` for a workspace monorepo. Version drift is prevented, but per-package dependency ownership is untrackable, knip accuracy suffers, and npm-published packages may under-declare their real deps.
8. **Mongo ghosts in a Postgres system:** serializers emit `_id` for the server package type (`packages/serializers/src/builders/serializer.builder.ts`), `mongodb` remains a root devDependency for one-off migration scripts, and interceptors normalize response ids (`response-id-normalizer.interceptor.ts`). Post-migration cleanup was never finished.
9. **Duplicated infrastructure primitives:** two S3 wrappers (`packages/libs/s3` vs `packages/storage`), two loggers (winston/pino), two `WorkflowExecutionProcessor` classes consuming the same `workflow-execution` queue (duplication acknowledged in a code comment at `workers/src/queues/queues.module.ts:330-331`), Bull Board monitoring only 1 of ~37 queues.
10. **Security scanning is opt-in:** CodeQL and Trivy are dispatch-only; no dependabot; no CODEOWNERS. Combined with a public repo and 49 credentialed integrations, unpatched-dependency latency is unbounded.
11. **Config-file rot is measurable:** knip ghost workspaces (fanvue/llm), react-doctor pinned at two versions (0.4.2 CI vs 0.5.6 weekly), doctor.config.json consumer ambiguity, images/voices healthcheck path inconsistency, browser-extension `npm exec` scripts.
12. **Studio app observability/perf gaps:** no client-side Sentry in `apps/app`; all 192 routes fully dynamic; `typescript.ignoreBuildErrors: true` in the shared Next config (type safety rests solely on the separate turbo type-check gate).
13. **Bus factor 1 at extreme velocity:** 1,327 commits / ~118K LOC / 65 packages / 24 workflows in 90 days by one person. Every risk above compounds with this one — the repo's guard-script culture is the correct mitigation and should keep expanding.

---

## 7. Suggested follow-up audit sessions

Each is scoped to one session and produces its own `docs/audits/NN-*.md`:

1. **01 — Service decomposition & workers coupling.** Quantify the `workers ↔ api` import graph, decide monolith-with-roles vs. real service split, define the package boundary (`@genfeedai/api-core`?) that would let workers build independently. Includes the duplicate `WorkflowExecutionProcessor` cleanup and the scheduler single-instance/locking question (risk #1, #4, #9).
2. **02 — Deploy topology & GPU fleet.** Enumerate ECS services from `services.tf`, document where images/videos/voices/llm actually run, decide the fate of the EC2 compose path and `deploy-staging.sh`, reconcile with the private console repo (risk #6, §3.2-3.3 unclears).
3. **03 — Security & supply chain.** Schedule CodeQL/Trivy, add dependabot (or bun-native equivalent), authz sweep across the 108 collections (org-scoping + `@Public()` inventory), webhook signature validation, API-key surface, `sql-risk-audit` findings review (risk #10).
4. **04 — Lint & type-safety re-enablement for `apps/server/**`.** Measure the violation count under Biome recommended rules, define a ratchet (per-directory enablement or error-budget), kill `ignoreBuildErrors` reliance (risk #2, #12).
5. **05 — Dead code, Mongo remnants & doc drift.** Fix knip config and run it; delete legacy cron-jobs after confirming zero un-migrated rows in prod; `_id` serializer cleanup; solana + fanvue/opuspro keep-kill decisions; correct CLAUDE.md/memory claims about ee packages and `e2e/` (risk #5, #8, #11).
6. **06 — Dependency architecture.** Move root-hoisted deps to their owning packages (or document the single-version policy deliberately), verify npm-published packages declare their real dependency sets, dedupe S3/logger stacks (risk #7, #9).
7. **07 — Test effectiveness & CI cost.** ~3,000 spec files: sample assertion quality vs. snapshot/boilerplate, decide whether the PR gate should include a fast test shard, enable the dormant authed e2e project, review the 12-way shard cost (risk #3).
8. **08 — Client fleet strategy.** Mobile (EAS disabled but README claims active work), browser extension MV3 confirmation + npm→bun script fix, desktop Windows/Linux targets, IDE extension CI trigger (§2.3).
