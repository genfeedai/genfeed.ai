# Integrations

Framework-agnostic integration core.

This package is for shared integration contracts, normalization helpers, and cross-platform utilities that can be reused by multiple apps without importing NestJS adapters, Mongo services, or app-specific controllers.

## Scope

Put these here:

- Shared integration constants that are specific to integration orchestration.
  Example: Redis event names used by bot/integration hot-reload.
- Integration domain types and interfaces.
  Example: normalized account, campaign, ad, insight, credential-capability, webhook payload, workflow execution output.
- Provider-agnostic helper functions.
  Example: output extraction, payload normalization, date-range helpers, result mapping.
- Abstract base classes or pure TypeScript contracts for integration runtimes.
  Example: bot manager abstractions that do not depend on Nest modules or database models.
- Cross-platform normalization models for ads/social integrations.
  Example: `NormalizedAdAccount`, `NormalizedCampaign`, `NormalizedInsightRow`.

Do not put these here:

- Nest controllers, modules, guards, interceptors, schedulers, or decorators.
- Database schemas, collection services, credential persistence, or org/brand authorization.
- Queue processors or cron jobs tied to a specific app runtime.
- Provider OAuth callback handlers or API endpoint wiring.
- UI components or app-facing serializer logic.

Those stay in `apps/server/*` or other app packages.

## Enums

Default rule:

- Global product enums belong in `@genfeedai/enums`, not here.

Examples that should stay in `@genfeedai/enums`:

- `CredentialPlatform`
- `IntegrationPlatform`
- post/content/status enums used across the product

Put an enum in this package only when both are true:

- it is integration-domain specific
- it is not a global product enum

Examples that can live here:

- integration event names if you want them as enum-like constants
- normalized integration capability flags
- integration-specific runtime states used only by integration core

In practice, prefer literal unions or `as const` objects over TypeScript `enum` unless there is a strong reason not to.

## Ads Integrations

For Meta Ads / Google Ads / Facebook, this package should eventually own:

- normalized ads data models
- provider-neutral mapping interfaces
- pure normalization helpers
- shared auth-state payload schemas
- shared error/result types

This package should not own:

- `facebook.controller.ts`
- `google-ads.controller.ts`
- `meta-ads.controller.ts`
- credential database writes
- cron scheduling
- queue enqueue/process wiring

## Current State

Today this package mainly contains bot-manager primitives plus workflow execution helpers. It is intentionally still smaller than the full backend integration surface.

That is acceptable, but new shared integration logic should go here instead of being redefined ad hoc inside app code.

Current public subpaths:

- `@genfeedai/integrations`
- `@genfeedai/integrations/ads`
