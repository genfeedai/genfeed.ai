# Branded text generation seam

`BrandedTextGenerationService.generate(request)` drives one approved-brand text
generation through the saved receipt (#5786):

create → resolve → dispatch → bind artifact → validate

Callers today: `POST /posts/draft-generations` (`PostDraftGenerationService`,
surface `api`, or `onboarding` for the agent first-content tool), the agent text
actions (`BrandedTextRunnerService`, surface `agent`) and breakout text output.
There is no unreceipted draft path: the mode is decided on the server by
`BrandedModeResolverService` (an approved revision wins; otherwise the brand's
live DRAFT, created from the Genfeed default style kit when none exists, runs as
`provisional_brand`). Provisional output always completes as `needs_review`.

## Guarantees

- One provider call per receipt (`OpenRouterService.chatCompletion`, no hidden
  re-dispatch), never retried automatically.
- A missing approved revision, an unsupported capability or an unresolvable
  skill context blocks before any paid dispatch. A branded request never falls
  back to raw.
- Dispatch is recorded when the provider accepts, using the response id. A
  missing id blocks with `provider_attempt_ref_unavailable`.
- The accepted text is saved as a DRAFT post, bound to the receipt by the hash
  of the exact bytes, then validated. Unavailable validation records
  `needs_review`; the receipt is never marked compliant on a failure.

## Replay by receipt state

| State after `create` | Outcome |
| --- | --- |
| `created` | runs the full flow |
| `resolved`, `dispatched` | `in_progress`, no provider call |
| `checking` | validates only |
| `ready`, `needs_review` | `completed`, the saved post |
| `blocked`, `failed`, `cancelled` | `stopped` with the last error diagnostic code |

A replay is never charged. A same-key request from another actor or with a
changed payload is rejected with `request_payload_conflict`.

## Stable reason codes

`no_approved_revision`, `unsupported_capability`, `provider_attempt_ref_unavailable`
(502), `provider_output_empty` and `channel_limit_exceeded` (422),
`artifact_persist_failed` and `artifact_bind_failed` (500). Responses carry
`meta.brandedGenerationReceiptId`.

## Media prompts

Image and video generation (`MediaPromptEnhancementService`) resolves the same
identity: `BrandedModeResolverService` picks the approved revision, else the
live draft provisionally, and the snapshot seam pins it. The enhanced prompt and
the media receipt carry the mode and revision; a branded output is never
compliant without a validation report, so it completes as `needs_review`.
A failed enhancement stops before any paid call with a typed 502
(`MEDIA_PROMPT_BRAND_ENHANCEMENT_FAILED`) and never falls back to the raw
prompt. The only raw path is the user's explicit `brandMode: 'raw'`, which skips
brand work and records a raw receipt.

## Not wired yet

Account and thread generation, content-intelligence, MCP, workflows, schedules,
batches and desktop adapters remain open on #5786.
