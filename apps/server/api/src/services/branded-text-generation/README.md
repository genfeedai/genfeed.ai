# Branded text generation seam

`BrandedTextGenerationService.generate(request)` drives one approved-brand text
generation through the saved receipt (#5786):

create → resolve → dispatch → bind artifact → validate

Callers today: `POST /posts/draft-generations` (`PostDraftGenerationService`,
surface `api`, or `onboarding` for the agent first-content tool), every agent
text tool (surface `agent`) and breakout text output:

- `refine_text` and `generate_reply_variants` (`BrandedTextActionsService`);
- social `generate_content` and `draft_thread` replies
  (`BrandedContentActionsService`), which return the receipt id to the chat.

All agent tools run through `BrandedTextRunnerService`; none has an unreceipted
fallback. There is no unreceipted draft path: the mode is decided on the server
by `BrandedModeResolverService` (an approved revision wins; otherwise the
brand's live DRAFT, created from the Genfeed default style kit when none
exists, runs as `provisional_brand`). Provisional output always completes as
`needs_review`.

The receipt binds an artifact, so every completed agent generation also keeps
its exact text as a DRAFT post (the receipt's artifact). The agent tools
propose; they add nothing to a thread, schedule or publish until the user
accepts through the approval-gated save tools.

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

## Not wired yet

Account and thread generation, content-intelligence, Studio media prompts, MCP,
workflows, schedules, batches and desktop adapters remain open on #5786. The
agent `generate_content` article and newsletter types are not text-seam
surfaces yet.
