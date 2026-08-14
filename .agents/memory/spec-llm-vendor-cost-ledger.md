---
name: llm vendor cost ledger
description: Per-completion LLM telemetry and vendor-cost ledger (#2361)
type: project
---

# LLM Vendor Cost Ledger Spec

## Purpose

Record what each dispatcher-routed LLM completion actually cost the platform (tokens, latency, vendor USD in micro-units), separately from credits charged to the user. Enable org/model margin queries and PostHog LLM analytics without ever sending prompt or completion content.

## Non-Goals

- Public Settings UI for cost vs credits
- Changing credit billing or round-credit floors
- Instrumenting non-dispatcher LLM paths (direct OpenRouter in twitter-pipeline, etc.)
- Persisting prompt/completion text anywhere in this feature

## Interfaces

- Dispatcher seam: `LlmDispatcherService.chatCompletion` and `streamChatCompletionAggregated` call `LlmCompletionTelemetryService.recordCompletion` after a successful response with usage.
- Optional `ILlmCompletionCallContext` (`threadId`, `runId`, `userId`) as the last argument so agent orchestrator can attach ids without a breaking options object.
- Prisma `LlmVendorCost` rows in micro-USD (`vendorCostMicros`), `isByok`, tenant filter `{ organizationId, isDeleted: false }`.
- `LlmVendorCostLedgerService.aggregateByOrgModel({ organizationId, from, to })` for date-range queries.
- PostHog event `$ai_generation` with allowlisted properties only, via existing `safeFetch` + `POSTHOG_PROJECT_API_KEY` (no new SDK in API).

## Key Decisions

See `decisions-llm-vendor-cost-ledger.md`.

## Edge Cases and Failure Modes

- BYOK: record tokens/latency, `isByok: true`, `vendorCostMicros = 0`.
- Missing org: skip ledger persist; still emit PostHog if configured.
- Unknown / self-hosted model: tokens recorded, vendor cost 0.
- Telemetry/ledger failure must not fail the completion.
- Raw `streamChatCompletion` has no usage — not a completion record.

## Acceptance Criteria

- WHEN a dispatcher-routed `chatCompletion` or `streamChatCompletionAggregated` succeeds, THE SYSTEM SHALL emit one telemetry event and one ledger row (when `organizationId` is present).
- WHEN the call used a BYOK key, THE SYSTEM SHALL set `isByok: true` and `vendorCostMicros` to 0.
- WHEN aggregating by org over a date range, THE SYSTEM SHALL return per-model platform vendor cost in micro-USD excluding BYOK spend.
- THE SYSTEM SHALL never include prompt, completion, or message content in telemetry payloads.

## Test Plan

- Pure cost + payload-builder unit tests (no network).
- Ledger service with Prisma mock (`create` + `groupBy`).
- Dispatcher spec: wrapper called once per completion; BYOK vs platform; serialized call args contain no message content.
---
