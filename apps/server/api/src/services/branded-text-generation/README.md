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

## Stable reason codes

`no_approved_revision`, `unsupported_capability`, `provider_attempt_ref_unavailable`
(502), `provider_output_empty` and `channel_limit_exceeded` (422),
`artifact_persist_failed` and `artifact_bind_failed` (500),
`dispatch_window_expired` (409). Responses carry
`meta.brandedGenerationReceiptId`.

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

Account and thread generation, content-intelligence, Studio media prompts, MCP,
workflows, schedules, batches, desktop adapters and the internal surfaces that
will generate on the system brand remain open on #5786.
