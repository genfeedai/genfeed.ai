# @genfeedai/ee-billing — Phase C Extraction Plan

Tracking issue: [#87 refactor: move Stripe, billing, and org management to ee/](https://github.com/genfeedai/genfeed.ai/issues/87)

Plan file: `.claude-genfeedai/plans/delegated-churning-sifakis.md` §5.1b

## Status

**Layer 1 — COMPLETE** (this commit, with Codex review follow-up):

- Service contracts defined in `@genfeedai/interfaces/billing`:
  - `ICreditsUtilsService` — **9 methods** (`checkOrganizationCreditsAvailable`, `getOrganizationCreditsBalance`, `deductCreditsFromOrganization`, `addOrganizationCreditsWithExpiration`, `refundOrganizationCredits`, `resetOrganizationCredits`, `removeAllOrganizationCredits`, `getOrganizationCreditsWithExpiration`, `getCycleRemainingMetrics`). Initial draft had 6 — Codex adversarial review caught the 3 omissions; expanded to cover every OSS call site verified via repo-wide grep.
  - `ISubscriptionsService` — 3 methods (`findOne`, `findByOrganizationId`, `findAll`). Initial draft was narrower (`findOne` only) and Codex flagged two missing OSS callers; expanded.
- **Both** `CreditsUtilsService` and `SubscriptionsService` now declare `implements` on the contracts — compiler-enforced, not doc-comment-enforced.

## OSS vs EE classification of current consumers

Verified via `grep -rn "creditsUtilsService\.\|subscriptionsService\." apps/server/api/src` as of commit d0052e7c. This list is what Layer 2 extraction must preserve.

**CreditsUtilsService — OSS callers (stay on OSS-callable contract):**

- `auth/services/auth-bootstrap.service.ts`
- `collections/articles/controllers/articles.controller.ts`, `services/articles-analytics.service.ts`, `services/articles.service.ts`
- `collections/clip-projects/clip-projects.controller.ts`
- `collections/contexts/controllers/contexts.controller.ts`
- `collections/evaluations/services/evaluations.service.ts`
- `collections/images/controllers/operations/images-operations.controller.ts`
- `collections/insights/controllers/insights.controller.ts`
- `collections/musics/controllers/musics-operations.controller.ts`
- `collections/optimizers/controllers/optimizers.controller.ts`
- `collections/posts/services/posts.service.ts`
- `collections/profiles/controllers/profiles.controller.ts`
- `collections/prompts/controllers/prompts-operations.controller.ts`, `prompts.controller.ts`
- `collections/schedules/controllers/schedules.controller.ts`
- `collections/streaks/services/streaks.service.ts`
- `collections/templates/controllers/templates.controller.ts`
- `collections/trends/controllers/trends.controller.ts`
- `collections/users/services/user-setup.service.ts`
- `collections/videos/controllers/**` (videos, batch-interpolation, lip-sync, reframe, upscale)
- `collections/videos/services/avatar-video-generation.service.ts`
- `collections/workflows/services/workflows.service.ts`
- `endpoints/admin/crm/proactive-onboarding.service.ts`
- `endpoints/integrations/shopify/shopify.controller.ts`
- `endpoints/onboarding/onboarding.service.ts`
- `helpers/guards/credits/credits.guard.ts`
- `queues/credit-deduction/credit-deduction.processor.ts`
- `services/agent-orchestrator/agent-orchestrator.controller.ts`, `agent-orchestrator.service.ts`, `tools/agent-tool-executor.service.ts`
- `services/bot-gateway/services/bot-generation.service.ts`
- `services/knowledge-base/master-prompt-generator.service.ts`
- `services/reply-bot/reply-generation.service.ts`
- `services/workflow-executor/processors/trend-inspiration.processor.ts`

**CreditsUtilsService — EE-only callers (move with Layer 2):**

- `endpoints/webhooks/stripe/webhooks.stripe.service.ts`
- `services/integrations/stripe/controllers/user-stripe.controller.ts`
- `collections/subscriptions/controllers/subscriptions.controller.ts`
- `collections/subscriptions/services/subscriptions.service.ts` (itself — moves with billing)

**SubscriptionsService — OSS callers:**

- `common/middleware/request-context.middleware.ts:121` — `findOne({organization, isDeleted})`
- `collections/users/controllers/users.controller.ts:141` — `findOne({isDeleted, user})`
- `collections/organizations/controllers/organizations-settings.controller.ts:206` — `findOne({organization: ObjectId})`
- `collections/credits/services/credits.utils.service.ts:275,373,569,656` — `findByOrganizationId(orgId)`
- `endpoints/analytics/analytics.controller.ts:164` — `findAll([{$count:'total'}], options)`

**SubscriptionsService — EE-only callers (move with Layer 2):**

- `endpoints/webhooks/stripe/webhooks.stripe.service.ts` (all methods)
- `services/integrations/stripe/controllers/user-stripe.controller.ts`
- `services/byok-billing/byok-billing.service.ts`
- The collection's own controllers (move with the collection)

**Layer 2 — TODO** (follow-up PR stack, tracked in #87):

Move the following directories from `apps/server/api/src/` into `ee/packages/billing/src/`. Each move should be its own PR so blast radius stays bounded.

| Source | Target | Notes |
|---|---|---|
| `collections/credits/` | `src/credits/` | 18 files; credit ledger, balance, transactions, utils |
| `collections/subscriptions/` | `src/subscriptions/` | Subscription state + Stripe sync methods |
| `collections/user-subscriptions/` | `src/user-subscriptions/` | User ↔ subscription joins |
| `collections/subscription-attributions/` | `src/subscription-attributions/` | Billing attribution |
| `services/byok-billing/` | `src/byok-billing/` | Bring-your-own-key billing |
| `services/integrations/stripe/` | `src/integrations/stripe/` | Stripe SDK wrapper + webhooks |
| `endpoints/webhooks/stripe/` | `src/webhooks/stripe/` | Stripe webhook controller |
| `helpers/interceptors/credits/` | `src/interceptors/` | Per-request credit debit |
| `helpers/decorators/credits/` | `src/decorators/` | `@CreditCost(n)` |
| `helpers/guards/credits/` | `src/guards/credits/` | Balance-check guard |
| `helpers/guards/brand-credits/` | `src/guards/brand-credits/` | Brand-scoped credit guard |
| `helpers/guards/member-credits/` | `src/guards/member-credits/` | Member-scoped credit guard |
| `helpers/guards/subscription/` | `src/guards/subscription/` | Subscription-tier guard |
| `packages/config/src/schemas/stripe.schema.ts` | `src/config/stripe.schema.ts` | Stripe config schema |
| `packages/config/src/schemas/credit.schema.ts` (if exists) | `src/config/credit.schema.ts` | Credit config |

## Layer 2 Strategy

**Do NOT do this in one PR.** Recommended sequencing:

1. **PR 1 — Move `credits/` collection + related guards/interceptors/decorators.** Create OSS-core no-op stubs in `apps/server/api/src/common/credits/` that implement `ICreditsUtilsService`. Wire DI override in `app.module.ts:563` to bind `CreditsUtilsService` to the EE implementation when `isEEEnabled()`.
2. **PR 2 — Move `subscriptions/`, `user-subscriptions/`, `subscription-attributions/`.** Same pattern: OSS no-op `SubscriptionsService` that `findOne()` returns `null`. EE implementation is the real one.
3. **PR 3 — Move `services/byok-billing/` and `services/integrations/stripe/`.** No OSS replacement needed — these have no OSS consumers (webhooks are enterprise-only).
4. **PR 4 — Move `endpoints/webhooks/stripe/`.** This endpoint is only mounted when EE is enabled.
5. **PR 5 — Tree-shake verification.** Assert that `isEEEnabled() === false` boots with zero references resolved to `@genfeedai/ee-billing`.

## Gate Mechanism

`isEEEnabled()` in `packages/config/src/license.ts` stays the source of truth. Post-split, `apps/server/api/src/app.module.ts:563` registers DI override providers:

```ts
providers: [
  // ... OSS no-op defaults always registered
  CreditsUtilsService,
  SubscriptionsService,
  // ... EE overrides conditionally applied:
  ...(isEEEnabled()
    ? [
        { provide: CreditsUtilsService, useClass: EECreditsUtilsService },
        { provide: SubscriptionsService, useClass: EESubscriptionsService },
      ]
    : []),
]
```

This keeps every OSS import site straight-line and avoids conditional module imports.

## Critical Coupling Points (must verify in both OSS and EE boot modes)

Codex adversarial review identified these as the injection sites that break first if the split is wrong:

- `apps/server/api/src/common/middleware/request-context.middleware.ts:42,:117` — injects `SubscriptionsService`, hits on every authenticated request
- `apps/server/api/src/services/agent-orchestrator/agent-orchestrator.service.ts:408` — injects `CreditsUtilsService`, hits on every agent run
- `apps/server/api/src/collections/trends/controllers/trends.controller.ts:21` — imports credits/subscription guards
- `apps/server/api/src/collections/templates/controllers/templates.controller.ts:18` — imports credits/subscription guards
- Any `endpoints/webhooks/*` consumer

Layer 2 PRs MUST add smoke tests covering these paths in both `isEEEnabled()=true` and `isEEEnabled()=false` modes.
