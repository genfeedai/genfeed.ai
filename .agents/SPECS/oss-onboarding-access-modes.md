# OSS Onboarding Access Modes Spec

## Purpose

Make OSS onboarding explicit about how access works: default to server-hosted/provider keys configured on this install, allow BYOK as an override, and provide a real Genfeed Cloud signup handoff that preserves brand setup intent.

## Non-Goals

- No new pricing or checkout flow in OSS onboarding
- No new persistence table/column for onboarding access choice
- No changes to provider execution logic beyond reporting current runtime state

## Interfaces

### Backend: `GET /onboarding/install-readiness`

Extend response with:

- `access.runtimeMode`: `'server' | 'byok'`
- `access.selectedMode`: `'server' | 'byok' | 'cloud' | null`
- `access.serverDefaultsReady`: `boolean`
- `access.byokConfiguredProviders`: `string[]`
- `access.byokEnabled`: `boolean`

### Frontend persistence

Persist onboarding choice in existing user settings JSON:

- `settings.dashboardPreferences.onboarding.accessMode`
- `settings.dashboardPreferences.onboarding.selectedAt`
- optional handoff metadata for cloud flow

### Cloud handoff

Build a real cloud signup URL pointing at:

- `${EnvironmentService.apps.app}/sign-up?...`

Carry:

- `source=oss-onboarding`
- `accessMode=cloud`
- `brandName`
- `brandDomain`

### Auto-resume

Public signup and post-signup onboarding should preserve enough data so the cloud onboarding brand step can prefill/auto-scan.

## Key Decisions

- Persist onboarding choice in user settings JSON, not a new DB column
- Derive runtime mode from existing org/BYOK settings
- Use the real cloud app signup page for handoff
- Reuse existing local storage onboarding keys where possible

## Edge Cases and Failure Modes

- No DB user found from Clerk metadata: selected mode falls back to `null`
- No org settings found: runtime mode falls back to `server`
- No server keys configured: `serverDefaultsReady` is `false`, but the user can still choose BYOK or cloud
- No brand/domain info available during cloud handoff: signup still works without prefill
- Existing BYOK keys present: runtime mode reports `byok` even though the server fallback remains the default capability

## Acceptance Criteria

- OSS onboarding explicitly says server-hosted access is the default
- Choosing server/BYOK/cloud persists a user-level onboarding access preference
- `install-readiness` returns truthful runtime access state and persisted selected mode
- The Genfeed Cloud CTA goes to the real cloud signup flow, not the marketing homepage
- Brand/domain onboarding intent survives the cloud signup handoff and can auto-resume onboarding

## Test Plan

- Backend unit test for `getInstallReadiness` returning runtime access state
- Frontend utility tests for onboarding preference merge and cloud signup URL building
- Source-contract tests for providers/summary/API keys messaging
- Targeted post-signup routing test for auto-brand handoff
- Behavior tests for providers, summary, brand, success, signup, and post-signup handoff flows
- App type-check after dependency link repair
- Backend onboarding spec and supported API build

## Hardening Addendum

- Signup handoff params must be sanitized before writing localStorage:
  - brand domains are normalized to bare hostnames
  - access mode must be one of `server | byok | cloud`
  - credit values must be positive integer strings
- Post-signup routing must consume one-shot plan/credit handoff keys so stale checkout state cannot loop into later onboarding sessions.
- Brand auto-resume should use stored brand name when present and otherwise infer a readable brand label from the stored domain.
- App tests must be run through `cd apps/app && bun run test -- ...`; direct `bun test` bypasses the app Vitest config and can produce false jsdom/alias failures.
