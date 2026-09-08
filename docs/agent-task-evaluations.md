# Agent task evaluations and canonical smoke

Owner: agent runtime maintainers. Scope: #3999 FR-8 and #4001 FR-8.
Fixture version: 1; rubric: `contract-exact-v1`. Reviewed source date: 2026-09-08.

## Run deterministic evaluations

On the authorized verification host, from the repository root:

```bash
bunx vitest run --config scripts/agent-eval/vitest.config.ts
bunx tsc -p scripts/agent-eval/tsconfig.json
(cd scripts/agent-eval && bun run run.ts) > /path/to/private/agent-contract-report.json
```

The existing root Vitest project glob discovers this suite. This is a manual
Studio verification suite; CI does not currently invoke it. The report records source revision, fixture/rubric versions, elapsed
time per case, expected and observed values, and a 100% exact-match threshold.
Any mismatch returns a nonzero exit code. A thrown production-contract error
also fails the command. Provider and model are explicitly `none`, with versions
`not-applicable`: no provider request or mutation occurs.

The harness imports the production workflow schema validator, tool output envelope, catalog, mutation-policy evaluator, logical
write-key builder, runtime-state resolver, scope metadata mapper, and thread
visibility predicate through source aliases. It does not copy their algorithms.
The fixtures provide independently declared expected outcomes.

| Fixture group | What is exercised | Limit |
| --- | --- | --- |
| Action/policy | Reviewed action availability per surface, safe reads, direct generation, batch approval, missing host capability, trusted approval, completed-result replay, unknown action denial | Candidate action is supplied by the fixture; this does not measure model tool selection or authenticate a proof |
| Intent binding | Equivalent reordered JSON; changed organization, user, thread, brand, context version, action, arguments | Tests identity construction, not database atomicity or a real external side effect |
| Runtime | Durable completion, cancellation, interruption, failure, exhausted budget, restored confirmation/question | Tests canonical state projection; it does not send stop events |
| Scope metadata | Correlated organization, brand, thread and provenance metadata | Authorization and stale context are exercised by service tests |
| Structured output | Real workflow JSON-schema validation accepts prepared/error results and rejects malformed success, negative credits and unknown envelope fields; failures retain run/node provenance | Nested JSON data is intentionally opaque; this does not validate a renderer-specific card |
| Render visibility | Pending cards/questions survive empty message history | Actual DOM safety and interactions remain renderer tests |

Keep the focused production tests alongside the task report. In particular:

- `apps/server/api/src/agent-context/agent-scope-context.service.spec.ts` and
  `agent-tools.controller.scope.spec.ts` exercise scope authority.
- `agent-tool-executor.mutation-policy.spec.ts`,
  `agent-tool-confirmation.service.spec.ts`, and
  `collections/mcp-approvals/services/mcp-approvals.service.spec.ts` exercise
  proof trust, queueing and atomic claims.
- `packages/agent/src/components/UiActionRenderer*.spec.tsx`,
  `SafeMarkdown.render.spec.tsx`, and work-object/decision component tests
  exercise rendering and interaction.
- Event-level stop/settle race tests must prove late stop is a no-op for the
  original run and cannot stop a later run. An in-flight tool interruption must
  persist `interrupted`. A state fixture alone cannot establish these effects.

## Why this harness

Two approaches were compared: a second miniature mocked agent that generates
expected canned outputs, and fixture orchestration over existing production
contracts. The latter retains actual ownership and exposes drift without
creating another runtime. It has lower migration risk and clearer failure
boundaries. It deliberately cannot establish provider quality or a working
deployed journey; those require the following live capture.

For a future model-selection benchmark, freeze prompts, permitted action sets,
scope and fixtures before collecting responses. Record exact provider, API/
adapter version, resolved model version, generation settings and rubric version
for every sample. Use at least five independent samples per task; require 100%
scope/approval safety and at least 95% permitted-action selection. Report sample
counts and per-task failures, including missing and refused outputs. Do not
infer a model-quality improvement from the deterministic report or change the
rubric after inspecting responses. No such benchmark result is claimed here.

## Production-like five-run protocol

Use a real API, durable database, queue/Redis, worker, signed-in browser session,
and configured provider. Use an authorized disposable organization, two brands,
and a second organization for denial checks. Before a paid or publishing step,
review the exact asset, destination and spending allowance. Keep secrets in the
existing secret environment and evidence outside the public repository.

Start at `/<orgSlug>/~/agent/new`. The canonical REST observations are
`POST /v1/agent/threads`, thread detail/messages under
`/v1/agent/threads/:threadId`, and `GET /v1/agent/runs`.
Inspect the current browser request DTOs and responses when collecting evidence;
do not invent payloads from prose. External action execution uses the existing
`POST /v1/agent-tools/:name/execute` adapter and never bypasses approval.

The existing `playwright/e2e/tests/agents/agent-surface.spec.ts` and
`runs.spec.ts` import fabricated auth and API interceptors. Their passing
results are useful route coverage, but cannot count toward this protocol.
`campaign-runtime-smoke.spec.ts` is also service-level evidence.

For each complete journey:

1. Start a new thread with explicit organization/brand; capture thread/run IDs,
   context version, provider and resolved model versions. Submit a safe read
   and verify the scoped result appears without approval.
2. Produce and answer a structured consequential question; create and edit a
   work object; reopen an existing thread. Capture the durable state and
   keyboard-accessible actions, with a text fallback.
3. Prepare an approved test mutation. Capture exact prepared intent,
   confirmation ID, logical write key and workflow execution ID. Assert no
   side effect before confirmation. Submit mismatched, expired, missing and
   already-consumed confirmation attempts: no new effect may occur.
4. Confirm the exact intent through the product. Observe completion and the
   durable result. Retry/reload/reconnect at pending and completed states:
   retain the same effect and result. Compare the cross-thread runs surface
   with durable terminal state.
5. Cancel a separate active run. Send a delayed stop for an already-settled run
   after a new run starts and verify the newer run continues. Stop an in-flight
   tool run and verify durable interruption. Exercise recoverable provider/tool
   failure and terminal failure; record typed UI recovery and correlated
   diagnostics. Validate unsafe markdown/unknown-part fallbacks without running
   embedded HTML. Restore the environment before starting the next journey.

Capture monotonic/UTC timings, sanitized browser console/network evidence,
durable run/workflow receipts, scope provenance, action/policy decisions,
approval/claim/result identifiers, rendering outcomes, and retry/cancel events.
Use event references rather than prompt bodies, credentials, raw proof tokens,
private generated media or third-party personal data. A private evidence store
may hold the underlying captures; public issues should contain sanitized
identifiers and counts only.

Run five complete journeys consecutively on the same revision/environment.
A failure resets the consecutive-success count; retain failed attempts. Across
all five require zero dead ends, duplicate mutations, stale terminal states and
unhandled client errors. All 18 criteria in
`scripts/agent-eval/live-evidence.ts` must have correlated observations.
One journey can contain several runs for failure/cancellation branches.

## Check captured evidence

```bash
bun run scripts/agent-eval/verify-live-evidence.ts /path/to/private/canonical-smoke.json
```

Use `liveEvidenceSchema` as the versioned record format. Its required fields
include exact source revision, environment, capture reference, real transport
and provider declarations, and five sequential attempts. Each attempt records
UTC start/end, all run IDs, the mutation's workflow/intent/confirmation/write
identity, provider/model versions, zero-error counters and the full observation
list. Each observation names a criterion, status, run ID and private evidence
references. The schema rejects extra properties to discourage raw payloads.

Missing files/fields, mocks, unknown versions, omitted criteria, failed or
blocked observations, reused run/proof identities, nonconsecutive attempts and
uncorrelated runs fail with a nonzero exit code. With no input the command
reports `BLOCKED`; there is no fabricated successful example.

`evidence-complete` means the supplied record meets this schema. A reviewer
must still open the referenced captures and verify they describe real runs on
that revision. The validator neither performs live requests nor proves the
truth of supplied observations. Its synthetic unit-test records are never
emitted as acceptance evidence.

Live credentials, provider access, missing controls, or unavailable UI are
reported as blocked steps. Until five inspected live journeys pass, the
canonical smoke acceptance criterion remains unproven regardless of unit-test
counts.
