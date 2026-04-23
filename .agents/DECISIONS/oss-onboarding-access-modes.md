# OSS Onboarding Access Modes Decisions

## Context

OSS onboarding already had:

- server/provider readiness checks
- org-level BYOK storage and hosted fallback at execution time
- a generic Genfeed Cloud CTA

What it did not have:

- a truthful runtime access summary
- a persisted onboarding choice for `server | byok | cloud`
- a real cloud signup handoff that carries brand intent forward

## Options Considered

### 1. Add new dedicated DB fields on `OrganizationSetting`

Pros:

- explicit, queryable contract
- org-scoped and durable

Cons:

- requires Prisma schema + migration + broader client surface churn
- higher conflict risk in a dirty worktree already touching onboarding/settings

### 2. Persist onboarding choice in existing user `settings.dashboardPreferences` JSON

Pros:

- no schema migration
- fits the wizard: the onboarding choice is user-driven UI state
- existing patch/read path already exists through `UsersService.patchSettings`

Cons:

- less discoverable than a dedicated column
- not ideal as a long-term analytics source

### 3. Persist only in `localStorage`

Pros:

- trivial implementation

Cons:

- not durable across devices/sessions
- does not satisfy the request for a persisted onboarding choice

## Recommendation

Use option 2 now.

- Runtime truth remains organization-scoped and is derived from existing org/BYOK state.
- The onboarding choice is persisted in existing user settings JSON.
- This solves the product gap without introducing migration risk during ongoing backend work.

## Cloud Handoff Decision

Use the real cloud signup entrypoint on `EnvironmentService.apps.app + /sign-up`, not the website marketing page.

Reason:

- the repo already supports `sign-up?plan=...`
- the public signup form already captures query params into local storage
- onboarding already has an auto-brand path keyed off stored brand domain

We will extend that path to carry:

- onboarding source
- preferred access mode
- brand name
- brand domain/url

## Non-Goals

- building a full multi-step cloud sales funnel inside OSS onboarding
- adding billing checkout into OSS onboarding
- adding a new Prisma field for onboarding access mode

## Hardening Decisions

- Treat signup query params as untrusted input. Normalize/sanitize them before persisting into onboarding localStorage.
- Reject malformed credit handoff values instead of using `Number.parseInt` directly, because values such as `500abc` should not become checkout quantity `500`.
- Keep localStorage as handoff state only. Plan and credit keys are consumed and removed in post-signup routing, and onboarding keys are cleared on success.
- Centralize domain-to-brand-name derivation in the shared onboarding access utility so brand auto-scan and post-signup tests do not drift.
- Do not cast around mismatched Next types caused by broken workspace links. Repair the package link so all config types resolve from the same `next` install.
