---
name: operational_app_home_spec
description: Verified-MCP authenticated-root state machine and operational summary contract for issue #1866.
type: project
---

# Operational App Home Spec

## Purpose

Make the authenticated root useful in two states: an unconfigured organization
gets a direct Connect Genfeed path, while a configured organization gets the
human control plane for approvals, publishing, credential health, and recent
activity without depending on Studio.

## Non-Goals

- Add or change backend endpoints, serializers, tenancy helpers, API-key scopes,
  or CI workflows.
- Replace the existing detail pages for review, posts, publishing settings, API
  keys, or activity.
- Add a new protected route or duplicate the organization and brand scopes
  already owned by the protected bootstrap.
- Treat an unverified API key as proof that an MCP client is connected.

## Interfaces

- `ApiKeysService.findAll({ limit: 100 })` supplies active API keys, scopes, and
  persisted metadata.
- A key proves a configured MCP connection only when it is active, not revoked,
  contains every `API_KEY_SCOPE_PRESETS.mcp` scope, and contains a valid
  `metadata.connectGenfeed` record written by successful MCP verification:
  `lastVerifiedAt` is a valid timestamp and `transport` is
  `streamable-http`.
- `useOverviewBootstrap()` supplies review inbox counts/items, active and recent
  runs, and publishing analytics.
- `useBrand()` supplies the selected organization/brand and its credential
  connection and account-health state.
- `useActivities({ scope: PageScope.ORGANIZATION })` supplies recent
  organization-scoped activity.
- Navigation uses existing canonical organization and brand routes derived from
  the protected context.

## Key Decisions

- The existing authenticated `/` route owns the state machine. It preserves
  onboarding redirects, then renders the home in place instead of redirecting a
  configured user to Workspace.
- Configuration detection fails closed. Missing, malformed, future-dated, or
  incorrectly transported verification metadata is unconfigured.
- Summary reads degrade independently. A failed API-key status read provides a
  retry path; operational summary failures remain inside their own surfaces.
- The page uses existing `WorkspaceSurface`, `@ui/primitives`, semantic status
  tokens, and canonical Link-versus-Button behavior.

## Edge Cases And Failure Modes

- Incomplete onboarding keeps the existing SaaS agent-onboarding or
  Community/Desktop wizard redirect.
- SaaS bootstrap can temporarily lack an organization slug; the root stays in
  its bounded loading state until one is available.
- A verified key can be expired, inactive, or revoked after verification; it no
  longer configures the home.
- Organizations with no brand render organization-safe connection and API-key
  actions, while brand-only operational actions are replaced by an actionable
  brand setup state.
- API-key, overview, and activity reads can fail independently and provide
  bounded retry actions without widening scope.

## Acceptance Criteria

- WHILE onboarding is incomplete THE SYSTEM SHALL preserve the existing
  deployment-mode-specific onboarding redirects.
- WHILE no verified MCP key exists THE SYSTEM SHALL render the authenticated root
  as an unconfigured connection state linking to `/:orgSlug/~/connect`.
- WHILE a verified MCP key exists THE SYSTEM SHALL render approvals, publishing
  state, credential health, and recent activity without Studio.
- IF a summary read fails THE SYSTEM SHALL keep the page and unaffected summaries
  available and SHALL expose an actionable retry.
- WHERE a brand-scoped action is unavailable because no brand is selected THE
  SYSTEM SHALL expose the canonical brand-management path instead of constructing
  a broken URL.
- THE SYSTEM SHALL preserve keyboard navigation, visible focus, logical heading
  order, screen-reader status text, responsive layout, organization scope, brand
  scope, and SaaS/Community/Desktop parity.

## Test Plan

- Resolver tests cover completed and incomplete onboarding, organization
  readiness, and rendering the home instead of redirecting to Workspace.
- Pure configured-state tests cover verified, unverified, revoked, inactive,
  expired, wrong-scope, malformed, and future-dated API keys.
- Component tests cover loading, unconfigured, configured, no-brand, empty,
  partial-error, retry, canonical links, and accessible names/headings.
- PR CI supplies the required test, type-check, build, and UI-guard evidence; the
  MacBook does not run those workloads locally.
