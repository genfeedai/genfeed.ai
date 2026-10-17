# Branded text generation seam

`BrandedTextGenerationService.generate(request)` drives one approved-brand text
generation through the saved receipt (#5786):

create → resolve → dispatch → bind artifact → validate

Callers today: `POST /posts/draft-generations` (`PostDraftGenerationService`,

surface `api`, or `onboarding` for the agent first-content tool), account and
thread generation (`POST /posts/account-generations`), every agent
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

## Billing after a stopped request

`hasNewDispatch` on a `stopped` outcome means this call reached the provider.
That cost is known, so the caller charges it instead of releasing its credit
reservation (the draft route does this through `BrandedGenerationBlockedException`
carrying `providerAttempt`, which the credits interceptor settles). A stop
before any provider attempt (`no_approved_revision`, `unsupported_capability`,
`provider_attempt_ref_unavailable`) releases the reservation.

If the 15-minute dispatch window closes while the provider call is in flight,
`recordDispatch` fails. The seam classifies that race (the window-expiry
conflict, or the version/state conflict left by the recovery sweep) and returns
`stopped` with `dispatch_window_expired`, `hasNewDispatch: true` and no saved
post: the receipt is blocked, the paid call is visible and billed, and nothing is
persisted without a receipt. Any other `recordDispatch` failure is a real error
and propagates unchanged.

Agent `generate_content` (social), `refine_text`, `generate_reply_variants` and
`draft_thread` all charge `GENERATE_CONTENT_TEXT_CREDITS`. Each handler admits
the balance first, charges once when `hasNewDispatch` is true (on success, on a
stop after the provider attempt and when no usable reply came back) and marks
the result billing-delegated so the agent turn does not charge it again.

## Stable reason codes

`no_approved_revision`, `unsupported_capability`, `provider_attempt_ref_unavailable`
(502), `provider_output_empty` and `channel_limit_exceeded` (422),
`artifact_persist_failed` and `artifact_bind_failed` (500),
`dispatch_window_expired` (409). Responses carry
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


## The Genfeed system brand

Internal generation with no customer brand (system, lifecycle and internal
content) resolves one dedicated brand, `genfeed-system-brand`, under the system
organization (`SYSTEM_WORKFLOW_PRINCIPAL_ID`), so every receipt binds a brand
id. `BrandedModeResolverService.resolveSystem()` creates it idempotently on
first use (`SystemBrandService.ensure`, seeded with the Genfeed default kit
through `ensureBaselineDraft`) and returns `{ actor, brandId, mode }`. The
caller then runs the seam as `actor` inside `runAsSystemOrganization`.

The system principal is never a Member. `BrandAccessService` and the receipt
access service therefore grant it, and only it (not an API key presenting the
id, not any other organization), the system organization's brands.

The brand stays a DRAFT until it is approved once, so internal output completes
as `provisional_brand` / `needs_review` meanwhile. Nothing approves it, and
`approve()` refuses the unedited default kit. One-time approval, as a platform
admin on an allow-listed IP (the system organization has no members, so the
member-scoped Brand OS routes cannot reach it):

1. `GET /admin/system-brand` creates the brand on first use and returns the live
   DRAFT revision (`id`, `updatedAt`).
2. `PATCH /admin/system-brand/revisions/:revisionId` with the edited kit
   (`{ content, updatedAt }`) whose `generationRules` you changed. Changing the
   rules retires the default marker and keeps them; an edit to an owned field
   alone drops the seeded rules, and an approved snapshot needs rules.
3. `POST /admin/system-brand/revisions/:revisionId/approve` with the latest
   `{ updatedAt }`. Approval is recorded as the calling admin.

Approving switches the next system generation to `approved_brand`.

## Not wired yet


Content-intelligence, remaining workflow text/media generators and internal
surfaces are tracked in #6963 and #6937. The agent `generate_content` article
and newsletter types are not text-seam surfaces yet.

