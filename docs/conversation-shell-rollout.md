# Conversation-first shell rollout

The conversation-first shell is a server-evaluated, organization-scoped rollout. Missing, malformed, unavailable, or contradictory configuration always resolves to the legacy shell. Do not use `NEXT_PUBLIC_FEATURE_FLAG_DEFAULTS` to enable it.

## Rollout configuration

Set `FEATURE_FLAG_DEFAULTS` to a JSON object containing a `conversation_shell` document:

```json
{
  "conversation_shell": {
    "schemaVersion": 1,
    "configVersion": "2026-07-internal-1",
    "enabled": true,
    "enabledCohorts": ["internal"],
    "enabledDeploymentModes": ["community"],
    "organizations": {
      "internal": ["organization-id"],
      "opt_in": []
    },
    "rollbackRevision": 0
  }
}
```

An organization must appear in exactly one explicit cohort. The deployment list must be a prefix of this immutable order:

1. `community`
2. `desktop_self_hosted`
3. `desktop_cloud`
4. `saas`

This prevents SaaS from being enabled before Community and both Desktop modes. Cohort membership and deployment eligibility are both required. SaaS onboarding uses the same evaluation: enabled organizations enter agent-first onboarding; everyone else retains the classic wizard.

## Fail-closed behavior and rollback

The protected layout starts in a not-ready legacy state and requests `GET /feature-flags/conversation-shell?client=web|desktop`. Only an authenticated, schema-valid response with `enabled: true` activates the shell. Evaluation failures, invalid contracts, missing organization context, render failures, and server disablement immediately open the session circuit and render the existing legacy shell.

Enabled clients poll the server every 60 seconds for rollback. To roll back, set `enabled` to `false`, increment `rollbackRevision`, and update the server configuration. Keep the configuration shape, compatibility reads, threads, drafts, version pins, and artifacts intact; no schema reversal is required.

Before a live change, validate the proposed kill switch without writing configuration:

```sh
bun run conversation-shell:rehearse-rollback -- /path/to/feature-flag-defaults.json
```

The command verifies every targeted organization across all deployment modes. A successful static result is preparation only. Record a live rollback-and-restore rehearsal in the cohort gate snapshot before promotion.

Disable the cohort immediately when any cross-organization scope violation, approval/version mismatch, protected-route authorization regression, or data-loss symptom is observed. After minimum denominators are available, also roll back when restoration reaches `0.5%`, fallback reaches `1%`, or either performance budget is exceeded. Evaluation, render, and restoration error spikes are operator stop signals even before minimum denominators exist. The client independently fails to legacy on its own evaluation or render error; this limits impact while the operator applies the server kill switch.

## Telemetry and privacy

Telemetry query version `1` emits bounded, content-free fields for:

- sessions, shell transitions, fallbacks, and restoration failures;
- scope corrections and blocked/stale consequential actions;
- overlay abandonment and version-bound approvals;
- first useful paint for shell and legacy, split by device and route class;
- evaluation, render, restoration, and scope errors.

Client events include only cohort, rollout version, deployment mode, rollback revision, enum-like outcomes, durations, and route classes. PostHog is SaaS-only and applies a final recursive deny-list scrub for prompt, message, content, credential, secret, text, and token keys. Self-hosted and Desktop do not add product-analytics call-home; their server-side safety counters remain in local operator logs. Server safety events retain the organization identifier required to join an event to its explicit rollout cohort, but omit user, thread, brand, message, artifact, credential, and content fields. Error details go to the existing error logger/Sentry path and are not copied into product analytics.

Never attach user IDs, thread IDs, artifact IDs, prompts, generated content, titles, messages, credentials, tokens, or exception text as rollout event properties. The existing SaaS analytics organization-group boundary remains unchanged.

## Promotion gates

Generate one immutable JSON snapshot per cohort and deployment mode from telemetry query version `1`, then evaluate it with:

```sh
bun run conversation-shell:gates -- /path/to/cohort-gate-snapshot.json
```

The canonical snapshot and report shapes are `ConversationShellGateSnapshot` and `ConversationShellGateReport` in [the gate contract](../packages/config/src/conversation-shell-gates.ts). Use the passing fixture in [the gate tests](../packages/config/src/conversation-shell-gates.spec.ts) as the operator template; replace every count, percentile, window, and manual result with evidence from that one cohort/deployment snapshot.

The evaluator rejects partial or future windows. Every promotion requires 14 complete UTC days and all of these gates:

- protected-route direct-link, enabled-shell, fallback, and authorization parity: `100%`;
- scope violations: `0` across at least `1,000` consequential attempts;
- stale-context blocking: `100%` across at least `100` attempts;
- restoration failures: `<0.5%` across at least `2,000` transitions and `100` enabled sessions;
- fallback sessions: `<1%` across at least `1,000` enabled sessions;
- compatibility reads: `<1%` across at least `10,000` eligible reads per cohort;
- first useful paint: shell p75 at most legacy `+10%`, shell p95 at most legacy `+15%`, with at least `1,000` shell and `1,000` legacy observations;
- version-bound approval integrity: exact match `100%` across at least `100` attempts;
- accessibility, responsive behavior, and live rollback rehearsal: manually evidenced as passed.

Do not combine cohorts to satisfy denominators. Do not remove compatibility reads until every deployment cohort independently meets the compatibility threshold for its complete observation window. A code-complete release is not authorization for broad production enablement.

## Ownership and evidence ledger

Use issue #1682 as the durable rollout ledger. The rollout operator owns configuration versioning, the kill switch, and rollback rehearsal evidence. The product owner approves each cohort/deployment promotion from the generated gate report. Security review owns cross-organization, stale-context, and approval-integrity evidence; accessibility review owns the manual keyboard/screen-reader and responsive results. Attach the immutable denominator snapshot ID, telemetry query version, complete UTC interval, gate report, rehearsal record, and relevant CI run to every promotion decision.
