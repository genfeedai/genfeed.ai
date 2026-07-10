# DRY / Slop Audit

Date: 2026-07-09
HEAD: `81501464631739171682d998021e913b23697ad0` (`fix(app): delete request access route (#1525)`)
Scope: monorepo-wide static audit. No source code changes were made.

Evidence used:

- `bun run scripts/check-duplicate-code.ts --advisory --report-dir artifacts/dry-slop-jscpd-2026-07-09`
  - 3,115 TypeScript/TSX files scanned.
  - 562,099 lines scanned.
  - 120 clone classes.
  - 5,780 duplicated lines, 1.03%.
  - 45,252 duplicated tokens, 1.06%.
- `bunx knip --reporter json`
  - 228 unused-file candidates.
  - 225 unused-export candidates.
  - 509 unused-type candidates.
  - 23 duplicate exports.
  - 89 unused dependency candidates.
  - 883 unlisted import candidates.
  - 2 unresolved import candidates.
- Targeted `rg` inspection of affected files and representative symbols.

Important current-state corrections:

- The old dual encryption implementation is mostly resolved. `packages/libs/crypto/credential-cipher.ts` now contains `resolveTokenEncryptionKey`, `encryptWithKey`, `decryptWithKey`, and `isEncryptedValue`; `packages/libs/utils/encryption/encryption.util.ts` and `apps/server/api/src/collections/credentials/services/credential-crypto.service.ts` are facades over that core.
- The previous widespread built-in Nest `NotFoundException` inconsistency appears resolved inside `apps/server/api/src`; API code now uses the local exception helper and the shared `findOrThrow` utility is in active use.
- The old organization index gap is much smaller. Current Prisma scan found 128 organization-scoped models and 12 without an `organizationId` index: `AdOptimizationConfig`, `Announcement`, `CampaignTarget`, `ContentScore`, `ContextEntry`, `CreditBalance`, `OrganizationSetting`, `Prompt`, `RepurposingJob`, `TaskCounter`, `Vote`, `Watchlist`.
- The prior large workflow UI fork is no longer the dominant clone source. Residual app/package shadows remain, but the highest-risk current duplication is in workflow execution, worker processors, seeds, service health, HTTP clients, and operational scripts.

## 1. Executive Summary

The monorepo is not globally copy-paste-heavy by percentage, but the remaining duplication sits in places where behavioral drift is expensive: workflow automation, worker queue processors, external publishing, polling, API-client error handling, health checks, and deployment/configuration boundaries.

The highest-ROI refactors are not broad "make everything shared" moves. They are small, behavior-preserving extractions around repeated operational patterns:

1. Centralize workflow seed script boilerplate.
2. Extract clip highlight detection shared by the clip processors.
3. Retire or explicitly split legacy cron paths that now mirror workflow services.
4. Finish the polling abstraction already started by `PollUntilService`.
5. Consolidate duplicated health response builders and route conventions.
6. Normalize HTTP client/error-handling boundaries where the clients target the Genfeed API.
7. Replace duplicated UI guard scanners with one canonical scanner and one allowlist.

Dead-code cleanup should be staged. Knip found 228 unused-file candidates, but this repo has package publication surfaces, scripts, story files, archives, and generated or skill content that can create false positives. Treat Knip as a candidate generator, not an auto-delete command.

## 2. High-Impact Duplication Clusters

### A. Workflow Automation and Seed Scripts

Impact: operational risk. These scripts create and migrate workflow definitions across organizations; drift can seed different workflows depending on which script is run.

Evidence:

- `apps/server/api/scripts/seeds/ad-automation-workflows.seed.ts`
  - `loadEnvFile` at line 36.
  - `parseArgs` at line 65.
  - organization loop at line 106.
  - `ensureAdAutomationWorkflows` at line 153.
- `apps/server/api/scripts/seeds/agent-autopilot-workflows.seed.ts`
  - `loadEnvFile` at line 36.
  - `parseArgs` at line 65.
  - organization loop at line 106.
  - `ensureAgentAutopilotWorkflows` at line 153.
- `apps/server/api/scripts/seeds/analytics-sync-workflows.seed.ts`
  - `loadEnvFile` at line 36.
  - `parseArgs` at line 65.
  - organization loop at line 106.
  - `ensureAnalyticsSyncWorkflows` at line 153.
- `apps/server/api/scripts/seeds/content-production-workflows.seed.ts`
  - `loadEnvFile` at line 37.
  - `parseArgs` at line 66.
  - organization loop at line 107.
  - `ensureContentProductionWorkflows` at line 122.
- `apps/server/api/scripts/seeds/reply-polling-workflows.seed.ts`
  - `loadEnvFile` at line 37.
  - `parseArgs` at line 66.
  - organization loop at line 107.
  - `ensureReplyPollingWorkflows` at line 122.
- `apps/server/api/scripts/seeds/trend-notification-workflows.seed.ts`
  - `loadEnvFile` at line 37.
  - `parseArgs` at line 66.
  - organization loop at line 107.
  - `ensureTrendNotificationWorkflows` at line 122.
- jscpd reports 83-95 line clone classes across these workflow seed scripts.

Refactor direction:

- Add a local seed runner helper under `apps/server/api/scripts/seeds/shared/`.
- Keep workflow-specific `ensure*Workflows` functions in their current services.
- Centralize only the repeated CLI/env/bootstrap/org iteration/reporting shell:
  - `loadEnvFile`
  - `parseArgs`
  - dry-run handling
  - cluster forwarding
  - organization selection
  - result summary formatting

Do not create a generic workflow-definition DSL as part of this pass. The duplication is script harness boilerplate, not workflow business rules.

### B. Legacy Cron Services Mirroring Workflow Services

Impact: product behavior and scheduling risk. If both paths are live, bug fixes can land in one runner but not the other. If one path is legacy, keeping it active obscures the real execution path.

Evidence:

- jscpd reports a 146-line clone:
  - `apps/server/workers/src/crons/social-polling/social-polling.service.ts:293-438`
  - `apps/server/api/src/collections/workflows/services/reply-polling-workflow.service.ts:416-561`
- jscpd reports an 83-line clone:
  - `apps/server/workers/src/crons/content-pipeline/cron.content-pipeline.service.ts:162-244`
  - `apps/server/api/src/collections/workflows/services/content-production-workflow.service.ts:369-452`

Refactor direction:

- First classify the old worker cron services as either still-production or migration fallback.
- If still-production: extract shared normalization/status-transition logic into an API package or service used by both.
- If fallback: remove the cron path only after verifying production scheduling, queues, and workflow rows no longer reference it.

This is a semantic refactor, not a mechanical dedupe.

### C. Clip Highlight Detection in Worker Processors

Impact: AI output consistency. Two queue processors use near-identical prompt, LLM call, JSON parse, and fallback behavior for highlight detection.

Evidence:

- `apps/server/workers/src/processors/api/queues/clip-analyze/clip-analyze.processor.ts`
  - `HIGHLIGHT_SYSTEM_PROMPT` at line 32.
  - `detectHighlights` call at line 135.
  - `detectHighlights` implementation at line 255.
  - `parseHighlights` at line 312.
- `apps/server/workers/src/processors/api/queues/clip-factory/clip-factory.processor.ts`
  - `HIGHLIGHT_SYSTEM_PROMPT` at line 29.
  - `detectHighlights` call at line 134.
  - `detectHighlights` implementation at line 303.
  - `parseHighlights` at line 360.
- jscpd reports a 144-line clone between the two processors.

Refactor direction:

- Extract a worker-local `ClipHighlightDetector` service/helper beside the processors.
- Preserve current prompt, JSON schema expectations, fallback clipping, and max-clip behavior in tests before changing internals.
- Do not move this to a public package unless another app outside workers needs it.

### D. Publishing Integrations

Impact: user-visible publishing behavior. There is an existing `BasePublisherService`, but platform services still repeat the same publish skeleton while diverging in validation and result shaping.

Evidence:

- Shared base:
  - `apps/server/api/src/services/integrations/publishers/base-publisher.service.ts`
    - `BasePublisherService` at line 19.
    - abstract `publish` at line 65.
    - `extractMediaInfo` around line 77.
    - `validatePost` around line 118.
    - `logPublishAttempt` around line 209.
- Repeated service skeleton:
  - `apps/server/api/src/services/integrations/publishers/reddit-publisher.service.ts`
    - `RedditPublisherService` at line 18.
    - `publish` at line 67.
    - `extractMediaInfo`, `logPublishAttempt`, `validatePost` at lines 70-76.
  - `apps/server/api/src/services/integrations/publishers/tiktok-publisher.service.ts`
    - `TikTokPublisherService` at line 16.
    - `publish` at line 88.
    - `extractMediaInfo`, `logPublishAttempt`, `validatePost` at lines 91-97.
  - `apps/server/api/src/services/integrations/publishers/twitter-publisher.service.ts`
    - `TwitterPublisherService` at line 56.
    - `publish` at line 78.
    - `extractMediaInfo`, `logPublishAttempt`, `validatePost` at lines 81-87.
  - Similar skeleton appears in `beehiiv-publisher.service.ts`, `wordpress-publisher.service.ts`, `ghost-publisher.service.ts`, `shopify-publisher.service.ts`, `whatsapp-publisher.service.ts`, `snapchat-publisher.service.ts`, and `mastodon-publisher.service.ts`.
- jscpd also reports publisher clone classes across Reddit, YouTube, LinkedIn, Instagram, and Facebook services.

Refactor direction:

- Add narrow base hooks for repeated concerns only:
  - credential validation/decryption envelope
  - media URL normalization
  - common `PublishResult` success/failure shaping
  - common logging context
- Avoid a "one publish algorithm" abstraction. Platform APIs are different enough that a generic template would hide important behavior.

### E. API Clients, Fetch Wrappers, and Error Handling

Impact: auth, cancellation, error normalization, and telemetry can drift between web app, extension, mobile, CLI, MCP, and packages.

Evidence:

- Web/package service layer:
  - `packages/services/core/interceptor.service.ts`
    - `HTTPBaseService` at line 42.
    - `axios.create` at line 50.
  - `packages/services/core/base.service.ts`
    - `BaseService` at line 44.
- Browser extension fork:
  - `apps/extensions/browser/app/src/services/http-base.service.ts`
    - `HTTPBaseService` at line 9.
    - `axios.create` at line 17.
- Mobile wrapper:
  - `apps/mobile/app/services/api/base-http.service.ts`
    - `API_URL` default uses `https://api.genfeed.ai` at line 4.
    - `apiRequest` uses `fetch` at line 51.
- MCP server wrapper:
  - `apps/server/mcp/src/services/client/base-api-client.ts`
    - `BaseApiClient` at line 17.
- Package-level direct fetch/axios callers:
  - `packages/hooks/data/skills/use-brand-enabled-skills.ts:72`
  - `packages/services/analytics/insights.service.ts:160`
  - `packages/services/analytics/subscription-attribution.service.ts:103`, `139`, `189`
  - `packages/services/billing/managed-credits.service.ts:81`, `120`
  - `packages/services/ai/optimizers.service.ts:97`
  - `packages/services/ai/contexts.service.ts:45`
  - `packages/services/ai/profiles.service.ts:42`
  - `packages/services/ai/agent-runs.service.ts:40`, `172`
  - `packages/services/automation/schedules.service.ts:45`
  - `packages/services/content/prompt-generator.service.ts:20` creates an axios instance.

Refactor direction:

- Do not force CLI, mobile, browser extension, MCP, and browser app into one runtime-specific HTTP class.
- Define a small shared contract instead:
  - endpoint resolution
  - auth header injection
  - JSON:API error normalization
  - cancellation semantics
  - retry/timeout policy
- Migrate package services that call the Genfeed API directly to the package service layer.
- Port missing fixes from `packages/services/core/interceptor.service.ts` into the extension wrapper or make the extension consume a browser-safe shared variant.

### F. Config and Public Endpoint Drift

Impact: environment mistakes surface as calls to the wrong API, inconsistent local/dev behavior, or runtime-only failures.

Evidence:

- Central config exists:
  - `packages/libs/config/config.service.ts:182` returns `GENFEEDAI_API_URL` with default `https://api.genfeed.ai`.
- Runtime raw env reads still exist in API endpoints:
  - `apps/server/api/src/endpoints/webhooks/github/webhooks.github.service.ts:27` reads `process.env.GITHUB_WEBHOOK_SECRET`.
  - `apps/server/api/src/endpoints/admin/guards/ip-whitelist.guard.ts:15` reads `process.env.ADMIN_ALLOWED_IPS || ''`.
- Public client endpoint defaults are repeated:
  - `apps/mobile/app/services/api/base-http.service.ts:4`
  - `apps/mobile/app/app.config.js:32`
  - `apps/extensions/browser/app/src/services/environment.service.ts:14`
  - `packages/hooks/data/skills/use-brand-enabled-skills.ts:8`
- Env vocabulary is spread across `scripts/env-spec.ts`, including `API_BASE_URL`, `NEXT_PUBLIC_API_URL`, `GENFEEDAI_API_URL`, `GENFEEDAI_APP_URL`, and `API_URL`.

Refactor direction:

- Move runtime API endpoint secrets to typed `ConfigService` getters.
- Keep client build-time public env separate from server runtime env, but define the names and defaults in one documented source.
- Do not eliminate legitimate script-level `process.env` usage. This finding is about long-lived app/service code.

### G. Health Checks and Service Readiness

Impact: deployment readiness and observability. Core services use shared health, while bot and GPU services use local controllers with similar response shapes and route conventions.

Evidence:

- Shared health module:
  - `packages/libs/health/health.module.ts`
  - `packages/libs/health/health.controller.ts`
  - used by `apps/server/api/src/app.module.ts:199` and `297`
  - used by `apps/server/files/src/app.module.ts:9` and `26`
  - used by `apps/server/mcp/src/app.module.ts:1` and `12`
  - used by `apps/server/notifications/src/app.module.ts:2` and `26`
- Local health controllers:
  - `apps/server/discord/src/controllers/health.controller.ts:5`
  - `apps/server/slack/src/controllers/health.controller.ts:5`
  - `apps/server/telegram/src/controllers/health.controller.ts:5`
  - `apps/server/images/src/controllers/health.controller.ts:6`
  - `apps/server/videos/src/controllers/health.controller.ts:6`
  - `apps/server/voices/src/controllers/health.controller.ts:9`

Refactor direction:

- Extend `packages/libs/health` with a response builder or registration API that accepts service-specific extras such as active bot count, jobs, TTS, memory, and uptime.
- Keep service-specific probes local when they hit platform-specific dependencies.
- Standardize route expectations across Docker Compose, deployment manifests, and controllers.

### H. Security Utility Duplication

Impact: file/path/command sanitization is security-sensitive. Duplicates are currently close, but drift would be expensive.

Evidence:

- `apps/server/api/src/helpers/utils/security/security.util.ts`
  - path validation around line 70.
  - `sanitizeCommandArgs` at line 156.
  - prompt-injection sanitization starts around line 229.
- `apps/server/files/src/helpers/utils/security/security.util.ts`
  - path validation around line 71.
  - `sanitizeCommandArgs` at line 156.
- jscpd reports an 83-line clone between API and files service security utilities.

Refactor direction:

- Extract only path and command sanitization to a shared server-safe package.
- Leave prompt-input sanitization API-local unless the files service needs it.
- Add focused tests before moving any sanitizer, because this is security behavior.

### I. Workflow UI Package/App Shadows

Impact: UI behavior drift in the workflow builder and prompt library. The large fork has been reduced, but app-local copies still shadow package logic.

Evidence:

- `apps/app/src/hooks/usePaneActions.ts`
  - `usePaneActions` at line 8.
  - reads app-local `useSettingsStore` at line 38.
- `packages/workflow-ui/src/hooks/usePaneActions.ts`
  - `usePaneActions` at line 9.
  - reads package `useSettingsStore` at line 39.
- `apps/app/src/types/groups.ts`
  - `_GROUP_COLORS` at line 14.
  - `DEFAULT_GROUP_COLORS` at line 60.
- `packages/workflow-ui/src/types/groups.ts`
  - `GROUP_COLORS` at line 11.
  - `DEFAULT_GROUP_COLORS` at line 57.
- `apps/app/src/store/promptLibraryStore.ts`
  - `usePromptLibraryStore` at line 53.
- `packages/workflow-ui/src/stores/promptLibraryStore.ts`
  - `_promptApi` at line 14.
  - `usePromptLibraryStore` at line 73.
- `apps/app/src/store/settingsStore.ts`
  - `useSettingsStore` at line 267.
  - real server sync at lines 477 and 529.
- `packages/workflow-ui/src/stores/settingsStore.ts`
  - `useSettingsStore` at line 193.
  - no-op sync at lines 333 and 337.

Refactor direction:

- Complete package-level provider injection rather than copying package stores into the app.
- Let the app configure `promptApi`, logger, and settings sync.
- Keep BYOK and server-sync extensions app-owned if they are not package concerns.

### J. Tenant-Scoped Lookup and Not-Found Patterns

Impact: authorization correctness and consistent JSON:API error surfaces. The common helper exists, but adoption is incomplete.

Evidence:

- Shared helpers:
  - `apps/server/api/src/shared/utils/find-or-throw/find-or-throw.util.ts`
    - `findOrThrow` at line 21.
    - `findUniqueOrThrow` at line 37.
  - `apps/server/api/src/shared/services/base/base.service.ts`
    - `findOneWithOrganization` at line 1189.
- Good adoption examples:
  - `apps/server/api/src/services/batch-generation/batch-generation.service.ts`
    - imports `findOrThrow` at line 14.
    - uses it at lines 551, 720, 770, 850, 916, 981, 1024.
  - `apps/server/api/src/collections/tracked-links/services/tracked-links.service.ts`
    - imports `findOrThrow` at line 9.
    - uses it at lines 47, 70, 341.
- Remaining manual `findFirst` patterns:
  - `apps/server/api/src/collections/content-drafts/services/content-drafts.service.ts:132`, `156`, `237`, `254`
  - `apps/server/api/src/collections/content-schedules/services/content-schedules.service.ts:114`, `137`, `161`
  - `apps/server/api/src/collections/agent-runs/services/agent-runs.service.ts:195`, `218`, `256`, `300`, `329`, `358`
  - `apps/server/api/src/collections/contexts/services/contexts.service.ts:260`, `280`, `312`, `375`
  - `apps/server/api/src/collections/tracked-links/services/tracked-links.service.ts:109`, `355`, `418`, `756`

Refactor direction:

- Incrementally convert manual organization-scoped "fetch or 404" branches to `findOrThrow` or `findOneWithOrganization`.
- Do not blanket-convert every `findFirst`; some are existence checks or optional lookups.

### K. UI Guard Script Duplication

Impact: design-system enforcement is split between overlapping scripts with different include scopes and allowlists. This makes false positives and false negatives likely.

Evidence:

- `scripts/check-raw-button-usage.ts`
  - allowlist starts at line 25.
  - includes `apps/website/...` entries at lines 30-35.
  - `rawButtonPattern` at line 52.
  - reports `raw-button` and `styled-anchor` at line 58.
- `scripts/check-raw-ui-controls.ts`
  - separate scanner and rules.
- `scripts/lint-no-raw-html.sh`
  - separate raw HTML scanner.
  - tells developers to update its own exclusion list at line 187.
- `scripts/ui/check-ui-guards.ts`
  - runs raw UI controls at line 15.
  - runs raw button usage at line 20.
  - runs Bash raw HTML guard at line 42.
- `lint-staged.config.mjs`
  - runs only `scripts/lint-no-raw-html.sh` and bespoke-card guard at lines 8-9.

Refactor direction:

- Replace the overlapping raw-control scanners with one canonical TypeScript scanner and one allowlist.
- Make CI and lint-staged call the same entrypoint.
- Keep individual rule categories in the report output, but not as separate scripts with separate baselines.

## 3. Dead / Obsolete Code Candidates

### Safer Mechanical Cleanup Candidates

These should still be reviewed in small batches, but they are good cleanup candidates because the evidence is static and localized.

| Candidate | Evidence | Recommended action |
| --- | --- | --- |
| Duplicate warning filter | jscpd reports `configs/vitest-warning-filter.ts:1-70` vs `packages/next-config/vitest-warning-filter.ts:1-79` | Choose one canonical module and update imports/config references. |
| Raw duplicate exports | Knip reports 23 duplicate exports, including component/default pairs such as `AppShell`, `LinkCard`, `NodeSelect`, `NodeTextarea`, `AppSwitcher`, mobile components, and several page components | Normalize public exports package by package. Preserve compatibility exports where package API consumers exist. |
| Unused enum members | Knip reports `BatchAction.REJECT`, `ReplicateStatus.CREATED`, `ReplicateStatus.RUNNING` | Remove only after checking API/serialized contract exposure. |
| Unused app context-menu files | Knip flags `apps/app/src/components/context-menu/*` | Verify the package workflow context menu replaced these, then delete as one batch. |
| Mobile dead barrels/services | Knip flags `apps/mobile/app/components/index.ts`, `apps/mobile/app/hooks/index.ts`, `apps/mobile/app/hooks/use-notifications.ts`, `apps/mobile/app/hooks/use-websocket.ts`, `apps/mobile/app/services/api/index.ts`, `apps/mobile/app/services/websocket.service.ts`, and related mobile styles | If mobile remains disabled/experimental, either archive behind a documented boundary or remove unused barrels. |
| Story/demo files in packages | Knip flags many files under `packages/pages`, `packages/contexts`, `packages/props`, `packages/hooks` | Treat as false-positive-prone. Remove only if Storybook/package demos do not consume them. |
| Old schema/entity shadows | Knip flags many API `collections/*/schemas/*.schema.ts` and `entities/*.entity.ts` files | Verify serializers/tests do not import them, then remove in collection-sized batches. |
| Unused package manifest checker | Knip flags `scripts/check-public-package-manifests.mjs` | If no package release process or docs invoke it, delete or wire it into package API checks. |

### Risky Semantic Cleanup Candidates

These should not be deleted mechanically.

| Candidate | Evidence | Why risky |
| --- | --- | --- |
| Legacy cron services mirrored by workflow services | `social-polling.service.ts` vs `reply-polling-workflow.service.ts`; `cron.content-pipeline.service.ts` vs `content-production-workflow.service.ts` | Could still be production schedulers or fallback paths. Need queue/scheduler/DB proof first. |
| EE/OSS subscription DTO clone | jscpd reports `ee/packages/billing/src/subscriptions/dto/create-subscription.dto.ts:1-144` vs `apps/server/api/src/collections/subscriptions/dto/create-subscription.dto.ts:1-144` | Sharing across EE and OSS can create package-boundary or licensing coupling. Move only into a neutral contract package if both sides can depend on it. |
| Workflow execution contracts | Resolved: the engine now consumes `@genfeedai/workflows/contracts` directly. | Keep the contract owned by the workflows package. |
| Dependency cleanup | Knip reports 89 unused dependency candidates and 883 unlisted import candidates | Monorepo hoisting, package publication, scripts, and optional integrations make this noisy. Triage by package owner and package manifest, not globally. |
| Archived migration unresolved import | Knip reports unresolved import in `scripts/migrations/archive/tenant-recreate.ts` | Archive may be intentionally inert. Decide whether archived migrations must compile or should be moved outside the checked tree. |
| `packages/pages/agent/agent-page-content.tsx` unresolved `@/lib/config/edition` | Knip unresolved import | Could indicate a real broken package import or an app-only alias leak. Needs package-boundary decision. |

## 4. Inconsistent Local Patterns

1. Polling:
   - `apps/server/api/src/shared/services/poll-until/poll-until.service.ts` provides `PollUntilService.poll`.
   - `apps/server/api/src/shared/services/polling/polling.service.ts` keeps a separate ingredient-specific loop and `PollingTimeoutError`.
   - Additional loops exist in FAL, ComfyUI, managed inference, workflow UI, and app workflow pages.

2. HTTP clients:
   - `packages/services/core/interceptor.service.ts` and `apps/extensions/browser/app/src/services/http-base.service.ts` share shape but drift in runtime behavior.
   - Mobile, CLI, MCP, hooks, and analytics services each handle auth/error/cancellation differently.

3. Env/config:
   - Server app code mostly has shared config, but `webhooks.github.service.ts` and `ip-whitelist.guard.ts` still read raw env.
   - Client/public endpoint defaults are repeated across mobile, browser extension, hooks, and central config.

4. Health:
   - Core services import `HealthModule`.
   - Bot and GPU services each own local `HealthController` implementations and tests.

5. UI guard enforcement:
   - Three raw-control scanners overlap.
   - CI and lint-staged do not run the exact same guard set.
   - Allowlists live in multiple files.

6. Workflow UI app/package boundary:
   - Package stores support injection/no-op sync, while app copies implement real sync.
   - This is close to the right architecture, but not finished enough to delete app shadows.

7. Tenant lookups:
   - `findOrThrow` and `findOneWithOrganization` exist and are used.
   - Manual `findFirst` + custom not-found branches remain in several collection services.

8. Security utilities:
   - API and files services share path/command sanitizer logic by copy-paste.
   - API adds prompt sanitization, which should remain API-specific unless reused.

## 5. Recommended Shared Modules / Components

Recommended because they remove real duplicated behavior:

1. `apps/server/api/scripts/seeds/shared/run-workflow-seed.ts`
   - Centralizes CLI/env/org iteration for workflow seed scripts.
   - Removes the largest low-risk clone cluster.

2. `apps/server/workers/src/processors/api/queues/shared/clip-highlight-detector.service.ts`
   - Centralizes `HIGHLIGHT_SYSTEM_PROMPT`, LLM call, response parsing, fallback behavior, and max-clip handling for clip processors.

3. `apps/server/api/src/shared/services/poll-until` adoption helpers
   - Keep the existing `PollUntilService`.
   - Add small adapter helpers for ingredient completion rather than maintaining `PollingService` as a separate polling engine.

4. `packages/libs/security/path-command-sanitizer`
   - Shared path and command sanitization for server API and files service.
   - Leave prompt sanitization out unless another service needs it.

5. `packages/libs/health` extensible health builder
   - Keep `HealthModule`, but add a service-specific extras model or helper for bot/GPU health controllers.

6. `packages/services/core` API transport contract
   - Define shared endpoint/auth/error/cancellation behavior.
   - Provide runtime adapters rather than one universal HTTP client class.

7. `packages/workflow-ui` host configuration boundary
   - `configureWorkflowUi({ promptApi, settingsSync, logger })` or equivalent provider.
   - Lets app delete duplicated stores/actions without moving app-only BYOK behavior into the package.

8. `scripts/ui/control-guard.ts`
   - One scanner, one allowlist, one CI/lint-staged entrypoint.
   - Rule categories can still be separate in output.

Not recommended:

- Do not centralize every publisher into one generic publish template.
- Do not force mobile, CLI, browser extension, MCP, and web package services into one HTTP class.
- Do not delete workflow-engine shims or EE/OSS DTO duplicates until package-boundary intent is confirmed.
- Do not convert every `findFirst` to `findOrThrow`; some are optional existence checks.

## 6. Refactor Roadmap Ordered by ROI

### Phase 1: Low-Risk Mechanical Wins

1. Add workflow seed runner helper and migrate seed scripts.
   - ROI: high. Many clone classes, low semantic complexity.
   - Blast radius: script execution only.

2. Consolidate vitest warning filter duplicate.
   - ROI: medium. Small but clean, removes a config drift point.
   - Blast radius: test config behavior.

3. Consolidate UI guard scanners.
   - ROI: medium-high. Reduces future design-system bypasses and allowlist drift.
   - Blast radius: CI/lint-staged developer workflow.

4. Triage duplicate exports package by package.
   - ROI: medium. Reduces API surface confusion.
   - Blast radius: published package consumers.

### Phase 2: Behavior-Preserving Shared Logic

5. Extract worker clip highlight detector.
   - ROI: high. Removes duplicated AI behavior and prompt drift.
   - Blast radius: clip analysis and clip factory queue jobs.

6. Extract shared path/command sanitizer.
   - ROI: high for security consistency.
   - Blast radius: file operations and command argument validation.

7. Extend shared health module for bot/GPU services.
   - ROI: medium-high. Improves deploy/observability consistency.
   - Blast radius: health endpoints and deployment probes.

8. Finish `PollUntilService` adoption for backend polling.
   - ROI: high. Prevents timeout/backoff/error drift.
   - Blast radius: async provider integrations and ingredient completion.

### Phase 3: Boundary Cleanup

9. Normalize Genfeed API client transport behavior.
   - ROI: high but mixed risk.
   - Start with package services directly calling Genfeed API, then browser extension.
   - Leave mobile/CLI/MCP on runtime-specific adapters unless a shared contract is available.

10. Complete workflow-ui host injection and delete app shadows.
    - ROI: medium-high.
    - Requires careful UI interaction coverage.

11. Incrementally adopt `findOrThrow` / `findOneWithOrganization`.
    - ROI: medium.
    - Do collection by collection to avoid changing optional lookup semantics.

### Phase 4: Risky Semantic Deletions

12. Decide cron-vs-workflow ownership for social polling and content pipeline.
    - ROI: very high if legacy crons can be removed.
    - Requires production evidence.

13. Resolve EE/OSS subscription DTO duplication.
    - ROI: medium.
    - Move to neutral contract only if package boundaries permit.

14. Resolve workflow contracts shim duplication.
    - ROI: medium.
    - Requires dependency-cycle and package API analysis.

15. Delete Knip unused-file batches.
    - ROI: medium.
    - Batch by area: mobile, app context menu, API schemas/entities, package stories/demos, scripts.

## 7. Risk Level and Test Coverage Needed

| Refactor | Risk | Required verification |
| --- | --- | --- |
| Workflow seed runner helper | Low-medium | Targeted dry-run execution for at least two migrated seeds. Snapshot or assert CLI arg parsing, env loading, org filtering, and result summaries. Do not run full suite locally. |
| Vitest warning filter consolidation | Low | Run the smallest config consumer check available, or validate imports/config references statically. |
| UI guard consolidation | Medium | Add scanner unit tests for raw buttons, styled anchors, raw inputs/selects, allowlist entries, and lint-staged changed-file mode. Run the consolidated scanner on a sample path set. |
| Duplicate export cleanup | Low-medium | Package API surface check for each touched package. Preserve compatibility exports if consumers exist. |
| Clip highlight detector extraction | Medium | Focused tests for prompt construction, provider failure fallback, JSON parse failure, max clip cap, and transcript timestamp handling. Run clip-analyze and clip-factory processor specs if they exist. |
| Path/command sanitizer extraction | High | Security-focused unit tests for traversal, encoded traversal, absolute path boundaries, command argument type checks, blocked patterns, and known-good paths. Add regression tests in both API and files service import paths. |
| Health module extension | Medium | Controller tests for shared core endpoints and service-specific extras. Verify Docker/deploy healthcheck paths. |
| PollUntilService adoption | Medium-high | Fake-timer tests for timeout, backoff, cancellation/abort if supported, provider error retry behavior, and ingredient completion semantics. Verify callers that catch `PollingTimeoutError` are updated intentionally. |
| API transport normalization | Medium-high | Contract tests for auth header injection, JSON:API error mapping, cancellation, base URL resolution, and response envelope handling. Runtime-specific adapter tests for browser extension/mobile/CLI only where touched. |
| Workflow-ui host injection | Medium-high | Component/store tests for pane actions, prompt library load/create/update/delete, settings sync, BYOK settings, and app-package import boundaries. Add a focused Playwright flow only if UI behavior changes. |
| Tenant lookup helper adoption | Medium-high | Collection-level tests for authorized access, wrong-organization access, soft-deleted rows, optional lookups that must remain optional, and JSON:API error shape. |
| Legacy cron retirement | High | Production usage audit, queue/scheduler inspection, workflow row migration verification, dry-run migration output, and focused worker/API service tests. Prefer PR CI for broad gates. |
| EE/OSS DTO consolidation | Medium-high | Package dependency boundary check, OSS build without EE, EE billing tests, API validation tests for subscription creation. |
| Workflow contracts shim cleanup | High | Dependency graph check, package API surface check, workflow-engine and workflows package tests, downstream import scan. |
| Knip unused-file deletion | Varies | Delete in small batches. For app files, run targeted import/static checks. For packages, run package API surface checks. For scripts, search package scripts/docs/CI before removal. |

Overall recommendation: start with the seed scripts, clip highlight detector, sanitizer extraction, and health module extension. Those remove real duplication without trying to redesign the monorepo. Defer legacy cron deletion, EE/OSS DTO sharing, and workflow contract shim cleanup until there is production/package-boundary evidence.

## 8. Independent Verification (2026-07-09, HEAD `0b74eb757`)

This revision was independently re-verified against the working tree at `0b74eb757` (one commit after the audit HEAD) before replacing the 2026-07-02 edition:

- **All six latent bugs (B1–B6) from the 2026-07-02 edition are fixed at HEAD** and are intentionally dropped from this revision: `mcp` now calls `setupServiceShell` (`apps/server/mcp/src/main.ts:70`); `files`/`workers` bootstrap failures `process.exit(1)`; the dead-Sentry `apps/app/src/lib/logger.ts` is deleted; the forked app `sseSubscription.ts` is deleted and the package copy logs `onerror`; CLI `Brand` uses `slug`; the MCP 5-platform `isSocialPlatform` filter is gone.
- The Prisma index scan was reproduced independently: **128 organization-scoped models, 12 without an `organizationId` index**, and the model list matches this document exactly.
- Cluster evidence spot-checked and confirmed present at HEAD: seed script boilerplate (A), duplicated `HIGHLIGHT_SYSTEM_PROMPT` in clip processors (C), `usePaneActions` app/package shadow (I), vitest warning filter duplicate, per-service health controllers (G), and the API/files `security.util.ts` copy (H).
- The crypto consolidation and `findOrThrow` adoption corrections were confirmed (`packages/libs/crypto/credential-cipher.ts` is the single core; 27 non-test API files import `findOrThrow`).
