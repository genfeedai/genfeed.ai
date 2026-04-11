# @genfeedai/ee-billing — Phase C Extraction Plan

Tracking issue: [#87 refactor: move Stripe, billing, and org management to ee/](https://github.com/genfeedai/genfeed.ai/issues/87)

Plan file: `.claude-genfeedai/plans/delegated-churning-sifakis.md` §5.1b

## Status

**Layer 1 — COMPLETE** (this commit):

- Service contracts defined in `@genfeedai/interfaces/billing`:
  - `ICreditsUtilsService`
  - `ISubscriptionsService` + `ISubscriptionFindOneFilter`
- Existing `CreditsUtilsService` and `SubscriptionsService` declare `implements` the contracts to lock the OSS-callable surface.
- This package scaffold is in place and type-checks.

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
