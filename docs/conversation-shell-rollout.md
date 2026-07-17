# Agent-first shell operations

The agent-first shell is the permanent protected application UI. It is not a
feature flag, cohort, deployment-mode experiment, or user preference.

Every registered protected route renders as either a conversation or a focused
canvas inside the same shell. SaaS onboarding also starts in the org-scoped
agent onboarding flow. Community and Desktop retain their local form onboarding
only where the managed orchestrator is unavailable; after onboarding, their
protected application routes use the same agent-first shell.

## Runtime contract

- There is no `conversation_shell` configuration key.
- There is no feature-flag evaluation endpoint or client polling.
- Missing or malformed `FEATURE_FLAG_DEFAULTS` cannot change the shell.
- There is no session-persistent circuit breaker to a legacy UI.
- Registered routes cannot opt out through a `dedicated` route mode.
- The legacy terminal dock is not registered or mounted.
- A shell render exception stays inside the shell ErrorBoundary and is reported
  to the existing logger/Sentry path.

Canonical protected URLs, authorization, scope validation, browser history,
typed references, version pins, approval integrity, and restoration rules remain
unchanged.

## Recovery

Production recovery is a deploy operation:

1. Confirm the failing production SHA and affected route class.
2. Revert the responsible change on the default branch.
3. Let the normal production workflow deploy the reverted SHA.
4. Verify authenticated shell bootstrap, a direct product route, a conversation
   route, and SaaS agent onboarding.

Do not add a runtime kill switch or restore the legacy shell as a fallback.
Localized failures should use the shell ErrorBoundary, typed empty/error states,
and retry behavior.

## Health evidence

The permanent shell keeps content-free telemetry for sessions, transitions,
render/restoration errors, scope corrections, overlay abandonment,
version-bound approvals, and first useful paint. These events are health and
safety evidence, not rollout gates.

PostHog remains SaaS-only and applies the existing recursive deny-list scrub.
Self-hosted and Desktop do not add product-analytics call-home; their safety
counters remain in local operator logs. Never attach prompts, messages,
generated content, credentials, tokens, exception text, or direct identifiers
to shell analytics.

The durable roadmap and verification ledger live in epic #1670. The former
rollout ledger #1682 is historical and should remain closed after the permanent
cutover.
