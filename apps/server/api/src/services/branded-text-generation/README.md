# Branded text generation seam

`BrandedTextGenerationService.generate(request)` drives one approved-brand text
generation through the saved receipt (#5786):

create → resolve → dispatch → bind artifact → validate

Callers today: `POST /posts/draft-generations` (`PostDraftGenerationService`,
surface `api`, or `onboarding` for the agent first-content tool), account and
thread generation (`POST /posts/account-generations`, see below), the agent text
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

## Account and thread runs

`PostAccountGenerationService` (`POST /posts/account-generations`) makes **one
dispatch and one receipt per post**, in order, tied by the run's batch id
(`runId`, also the posts' `groupId`; the requestKey is the same id and the
candidate index is the post's position). Each later dispatch is told what the
run already wrote so the posts differ. A thread is one dispatch: its receipt
binds the whole thread (a receipt artifact holds at most nine posts, so a
thread has two to nine posts).

- The run takes ONE credit hold for every dispatch before any placeholder
  exists and answers 402 when the balance cannot cover it. Each dispatch carves
  its share out of that pool, is charged when the provider recorded an attempt
  (including a stopped one) and returns its share otherwise; the remainder goes
  back at the end. BYOK runs and free models hold nothing. There is no fixed
  post cap.
- Placeholders stay and are patched as each dispatch finishes: the text,
  `brandedReceiptId` and `brandedReceiptState`. One failed dispatch never stops
  the others; its placeholder is `failed` with `targetError.code` and a
  message, and `POST /posts/:postId/generation-retries` (new `requestKey`)
  retries it. Nothing is retried or charged automatically.
- Provisional brands generate `needs_review` output, never compliant.

## Not wired yet

Content-intelligence, Studio media prompts, MCP,
workflows, schedules, batches and desktop adapters remain open on #5786.
