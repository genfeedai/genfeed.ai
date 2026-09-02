# ADR: Prompt Moderation And Review Stance

## Status

Accepted

## Spec Version

v1.1.0

## Last Updated

2026-08-18

## Canonical Source

This file. Implementation tracking: issue #3012 (this decision) under epic
#3007. Sibling enforcement work: #3008, #3009, #3010, #3011, #3013, #3014.
Follow-up implementation: #3029 (OpenRouter ZDR), #3030 (soft-delete purge).

## Decision Summary

Genfeed does not operate a first-party prompt-reading or conversation-review
surface. We do not add a pre-LLM moderation classifier that stores verdicts
against user prompts, and we do not add a staff admin UI for reading agent
conversations.

Enforcement is product-scope language, untrusted-data fencing, turn-endpoint
bounds, and provider-side media safety checkers — not a Genfeed-operated
review desk.

Telemetry stays privacy-preserving. Soft-deleted transcript text is purged
after 30 days (#3030). OpenRouter vendor retention flags are a documented
client gap, tracked in #3029.

## Why

The 2026-08-17 agent audit (epic #3007) found no moderation pass, no
conversation-review admin, and no OpenRouter zero-retention flag — while
telemetry already scrubbed prompt text. That combination looked like a
"we do not read user prompts" stance, but it was an accident of
implementation.

This ADR makes the stance a decision so later work cannot quietly add a
classifier store, a staff conversation reader, or prompt-bearing analytics
without changing this file first.

## Stance

| Capability | Decision |
| --- | --- |
| Pre-LLM moderation classifier that stores verdicts against prompts | No |
| Staff admin UI for reading agent conversations | No |
| Better Auth admin impersonation (existing, not purpose-built for review) | Unchanged; not a review surface |
| Product-scope / refusal / jailbreak language on every prompt path | Yes — #3009, #3010 |
| Untrusted-data fencing + `sanitizePromptInput` on user/memory/skill text | Yes — #3008 |
| Rate limits and prompt-length bounds on turn endpoints | Yes — #3011 |
| Provider-side safety checkers on standard Replicate image/video paths | Yes — keep on |
| Trained-model / LoRA Replicate `disable_safety_checker: true` | Keep — personal-likeness LoRAs trip Replicate's NSFW checker; rationale owned by #3013 |
| First-party prompt text in PostHog / Sentry / session replay | No |
| OpenRouter `provider.zdr` / `provider.data_collection` on first-party requests | Gap — #3029 |
| Time-bounded purge of soft-deleted agent transcripts | Yes — 30 days, #3030 |

## Enforcement (what we do instead)

1. **Product-scope, refusal, and jailbreak language** on every system-prompt
   resolution path (#3009, #3010). Off-topic and extraction attempts are
   refused in the prompt contract, not classified into a stored verdict.
2. **Untrusted-data fencing** plus `sanitizePromptInput` on user, memory, and
   skill text (#3008). Quoted inbox/page context stays fenced; user-authored
   memory and skill instructions must not enter the model as trusted system
   text.
3. **Rate limits and prompt-length bounds** on agent turn endpoints (#3011).
   Abuse is throttled at the API boundary; credit gating is not a substitute.
4. **Provider-side safety checkers** on standard Replicate image/video paths.
   The trained-model / LoRA path keeps `disable_safety_checker: true` because
   personal-likeness LoRAs trip Replicate's NSFW checker. That exception is
   owned by #3013 and must stay documented there and here.

The only staff path that can see another user's conversation remains Better
Auth admin impersonation. It is an account-support tool, not a prompt-review
queue, and this ADR does not expand it.

## Telemetry

Telemetry must stay privacy-preserving:

- PostHog `$ai_generation` is an allowlist of tokens, cost, model, and ids —
  never messages, prompt text, or completion content
  (`llm-generation-telemetry.ts`).
- Browser property-key scrubbing and session recording remain hard-off
  (`posthog-client.ts`; session recording was a non-goal of #1178).
- Sentry replay masking and `sendDefaultPii: false` are made explicit by
  sibling #3014. Until that lands, replay masking rests on SDK defaults and
  non-production `sendDefaultPii` may attach request bodies — a known gap,
  not a license to add prompt text to events.

## OpenRouter vendor retention

Inspected 2026-08-17:
`apps/server/api/src/services/integrations/openrouter/`.

`OpenRouterChatCompletionParams` has no `provider` object. `OpenRouterService`
posts `{ ...params, stream }` with Authorization, `HTTP-Referer`, and
`X-Title` only. There is no `data_collection`, `zdr`, or other zero-retention
flag on the request body or headers.

OpenRouter's documented per-request API (do not invent a different contract):

- `provider: { zdr: true }` — route only to Zero Data Retention endpoints
  (https://openrouter.ai/docs/guides/features/zdr)
- `provider: { data_collection: "deny" }` — exclude providers that store or
  train on inputs
  (https://openrouter.ai/docs/guides/privacy/data-collection,
  https://openrouter.ai/docs/guides/routing/provider-selection)

Account-level OpenRouter privacy settings are operator-owned and are not a
substitute for setting these flags on every first-party request. Wiring them
is #3029.

## Retention

Live threads persist full prompt text so the product conversation works.

Soft-deleted agent transcript fields are purged **30 days** after the
tombstone instant (`updatedAt` on `isDeleted: true` rows). There is no
separate `deletedAt` column. The window is the product default for this
stance; it is not configurable per tenant.

Purged fields (null/empty, rows kept):

- `AgentThread.systemPrompt`
- `AgentMessage.content`
- `AgentThreadEvent.data`
- `AgentThreadSnapshot.data`
- `ThreadContextState.data`

Eligibility:

- Independently soft-deleted rows whose `updatedAt` is older than 30 days.
- Child transcript rows of a soft-deleted thread whose thread `updatedAt` is
  older than 30 days (thread delete does not cascade `isDeleted` to children).

Live (`isDeleted: false`) threads and in-window tombstones are untouched.
The daily `transcript-purge-sweep` system sweep (`15 2 * * *` UTC) owns the
job. No staff review UI. No hard-delete of live threads.

Implemented by #3030.

## Public privacy docs

`docs/` has no privacy-facing contributor or product page. The public
marketing legal page is application copy at
`apps/website/app/(public)/privacy/` (https://genfeed.ai/privacy). This issue
does not edit application or marketing code. A later legal-copy update may
add a one-line "we do not operate a first-party prompt-reading or
conversation-review surface" statement there; this ADR is the canonical
source until then.

## Non-Goals

- Building or buying a prompt-moderation classifier
- Storing moderation verdicts against user prompts
- A staff conversation-review / audit-reading UI
- Expanding Better Auth impersonation into a review desk
- Implementing OpenRouter ZDR in this change (#3029)
- Changing the 30-day soft-delete transcript retention window without a new
  ADR revision (#3030 owns the current default)
- Changing Replicate LoRA `disable_safety_checker` (owned by #3013)
- Changing Sentry replay / PII settings (owned by #3014)
- Rewriting the public marketing privacy page

## Non-Negotiables

1. Do not add a first-party prompt-reading or conversation-review surface
   without changing this ADR first.
2. Do not persist classifier verdicts against user prompts.
3. Do not send prompt or completion text to PostHog, Sentry, or session
   replay.
4. Enforcement stays on the four paths above (scope language, fencing,
   rate/length bounds, provider media checkers).
5. OpenRouter vendor flags, when added, must use OpenRouter's documented
   `provider.zdr` / `provider.data_collection` contract — no invented API.

## Consequences

- Staff cannot browse user prompts from an admin surface. Support stays on
  impersonation and user-visible artifacts.
- Abuse that slips past prompt-scope language, fencing, and rate limits is
  not classified or queued for human review inside Genfeed.
- Soft-deleted transcripts stay in Postgres for 30 days, then prompt text is
  wiped. That is a retention window, not a license to build a review UI.
- First-party OpenRouter traffic follows account-level vendor defaults until
  #3029 sets per-request ZDR / deny-collection flags.
- Downstream PRs in #3007 implement the enforcement list. They do not reopen
  this stance.

## Follow-ups

| Issue | Role |
| --- | --- |
| #3008 | Untrusted-data fencing + `sanitizePromptInput` on the agent path |
| #3009 | Keep the content-scope guardrail on every system-prompt path |
| #3010 | Anti-jailbreak and prompt-extraction language |
| #3011 | Rate-limit turn endpoints and bound prompt length |
| #3013 | Document or replace LoRA `disable_safety_checker: true` |
| #3014 | Explicit Sentry replay masking + `sendDefaultPii: false` |
| #3029 | Set OpenRouter `provider.zdr` and `provider.data_collection` |
| #3030 | Time-bounded purge of soft-deleted agent transcripts (30 days) |

#3029 and #3030 were filed from this ADR. #3030 is implemented. #3013 and
#3014 remain sibling work on epic #3007.

## Related ADRs

- `ADR-SKILLS-ROUTINES-MEMORY-BOUNDARY.md` — personal feedback memory stays
  local unless explicitly promoted; this ADR adds that we also do not staff-
  review the prompts that produced it.
- `ADR-PLG-BOUNDARY-OSS-CLOUD.md` — parent OSS vs Cloud product boundary.
  Conversation review is not a Cloud-only entitlement either.

## Version Bump Checklist

1. Update the spec version and last-updated date.
2. If the stance itself changes (classifier, review UI, or telemetry
   starts carrying prompt text), treat it as a new accepted decision, not a
   silent patch.
3. Point follow-up issues at the new version in this file.

## Revision Log

| Version | Date       | Summary                                                                 |
| ------- | ---------- | ----------------------------------------------------------------------- |
| v1.1.0  | 2026-08-18 | #3030: purge soft-deleted transcript fields after 30 days             |
| v1.0.0  | 2026-08-17 | Accepted no-review stance; OpenRouter ZDR gap #3029; retention #3030 |
