# Own-account breakout responses

Tracked in [#6526](https://github.com/genfeedai/genfeed.ai/issues/6526), a child of
[#6472](https://github.com/genfeedai/genfeed.ai/issues/6472).

## Exposure policy approved on 2026-10-09

Use the views/impressions already collected. Organic, paid, aggregate and unknown
provenance are explicit evidence values, not an organic-only eligibility gate.
Comparisons use matching provenance and provider metric source; unknown is never
silently upgraded to organic. Observed zero remains a measurement; unavailable or
unauthorized counts remain missing. Paid/promotion flags alone do not disqualify a
post. This supersedes the earlier organic-only requirement and dependency receipt.

## Current implementation boundary

Analytics collectors prepare canonical publication identity before fetching provider
measurements. PostAnalyticsService retains an immutable exposure observation and
immediately evaluates available observed exposure in the same transaction. A positive
comparison records one durable detected response per account/publication. Detection
does not queue generation, spend credits, reserve publishing quota or publish a post.

Own-account social-source synchronization also records the server's actual winning
provider attempt with its request/receive interval, before collection data reaches
persistence. Imported posts bind through their native `SourcePost` identity and the
current scoped own-account source, active organization/brand, connected credential,
platform and actual provider author ID. They do not acquire a fabricated Genfeed
published post, version pin or acting principal. Observations and response roots
have exactly one generated-post or native-source reference; the additive migration
enforces that boundary with scoped foreign keys and database checks.

Native X OAuth collection requests separate organic metrics only for explicit
own-account capture, retains media keys and known text/image/carousel/video formats,
and requires the actual returned author ID for organic qualification. Display author
fallbacks are not evidence. Missing/unknown formats remain held; existing typed
native video/short formats are retained without guessing from runtime duration.
Public/scraped counts remain aggregate, and fallback providers cannot claim organic
authority. Reposts, changed captured material, changed account binding and generated
responses cannot initiate a response. Ordinary collection outputs and daily analytics
remain separate from immutable evidence. Native and generated publications share the
bounded comparison, response identity, capacity planner and complete post binder.

The observation binds organization, brand, connected credential, platform, format,
external publication, material digest and confirmed publication/version identity.
Views and impressions remain separate. Observed zero is a measurement; unavailable
exposure stays null. Aggregate counts do not become organic evidence because a
promotion flag is missing or false. X post impressions and views retain their actual
provider field-group source and provenance. A returned post-level `view_count` is
eligible even when a separate media view count is also returned. Media-only views
remain separate because asset reuse across posts does not establish this post's
exposure; they continue to appear in the existing descriptive analytics.
See the [X metrics documentation](https://docs.x.com/x-api/fundamentals/metrics).

The comparison uses the source's measured post age, from a provider as-of timestamp
when available or the midpoint of the server collection interval. Tolerance is ten
percent of that age, with a five-minute floor and a thirty-minute ceiling, further
limited to less than the post age. The entire collection interval must fit the window
when the provider does not supply an as-of timestamp. This is a sampling rule and
does not define when follow-up execution is permitted.

The existing outlier configuration supplies window size, sample size and threshold.
The breakout threshold remains at least ten; higher configured thresholds apply.
Only distinct earlier posts from the same organization, brand, account, platform,
format, metric source, exposure provenance and time basis may contribute. Reads
resolve current canonical publication material and exclude invalidated, deleted,
pinned or generated response sources. Unknown flags remain explicit. Paid/promoted
posts are eligible; recorded promotion flags are retained in contributors. The read
is limited to 2,000 rows
and 50 prior publication resolutions; saturation produces a truncated comparison.
There is no fabricated early-history backfill from cumulative daily analytics.

An immutable comparison receipt retains contributors, exclusions, metric,
provenance, options, median and ratio. Retry cannot overwrite its original evidence.
The 2026-10-09 provenance policy has a distinct options identity so legacy
organic-only evaluations remain immutable. Changed evidence produces a held
conflict. Detection identities and output identities remain distinct:
a detected response has not generated content, and a reserved output has not been
published.

An output plan has at most five total slots. An X quote uses slot one and counts
inside that limit. Slots and generation identities are never recycled after failure
or deletion. A post's persistent breakout output link identifies generated responses
independently of ordinary quote fields and prevents recursive response chains.
Generation must attach that link before publication. Thread segments inherit the
parent's response lineage for recursive detection exclusion, including historical
links; those links do not grant current publication authority. The transaction-local
`bindBreakoutPostArtifact` utility verifies a completed approved-brand receipt
against the complete canonical post material and current source identity.
It attaches the existing output ID and, for an X quote, the source external ID to an
existing draft before review starts. It never creates a post or changes its publish
state, approval or credit accounting. Text, image, carousel, video, short and thread
material bind captions, ordered segment membership, scoped ingredients, retained
storage versions and content hashes. Material acquisition re-reads the pinned bytes;
changed membership, metadata, captions or bytes are held. Shapes exceeding the
existing material bounds are held rather than truncated. Explicit attachment order and target settings are retained;
an attachment without a matching scoped ingredient is held instead of certifying
unread media. The text-only helper remains
a compatibility adapter. Conflicting lineage and posts already entering
review/publication are held. The writer is not
yet called from generation or an authorized product endpoint.

## Capacity and recovery interfaces

`planBreakoutCapacity` reduces a requested one-to-five total output plan within a
supplied server budget snapshot and remaining publication slots. It includes
separate generation and quality estimates, daily/weekly/monthly budgets, available
organization funds, platform limits, pacing limits and configured format caps. The
X quote is the first text slot; other outputs preserve the winning format/account.
Missing prices, unknown configured caps, unsupported formats and exhausted capacity
have explicit reasons. Explicit zero prices remain different from unavailable
prices. These estimates neither debit credits nor reserve future publishing slots.

`reserveBreakoutCapacityPlan` revalidates the current source and serializes planning
with the existing parent-row lock. Initial plans and replays both require the fresh
growth gate; a held replay preserves its identities without admitting new work.
Replays retain their original slots and generation
keys, even when today's budget changes. A replay reports no original price estimate
because that price snapshot is not persisted; it does not invent one. Dispatch and
scheduling still need fresh accounting and transactional cadence admission. This
utility is not yet connected to a policy-authorized workflow caller.

`readBreakoutLiveCapacity` reads the current scoped active strategy and account,
resolves the existing billing-account authority, and reads settled wallet funds less
held funds without creating a wallet. It retains current stored daily/weekly/monthly
budget usage and existing pacing. Cadence uses the existing timezone/week/group
rules, with a bounded 1,001-row read; saturation leaves quota unknown. Configured
platform/format caps use the same UTC calendar-month period as the total monthly
budget. `readBreakoutMonthlyUsage` reads actual deductions/refunds and current
reserved holds with server-retained strategy/platform/format attribution. Exact
scoped reservation attribution can explain a settlement. Terminal holds are not
counted again; unresolved carryover holds still constrain the current month.
Decimal sums avoid drift, and a matching stored counter is never added twice. A
larger stored counter is a lower bound with unknown dimension allocation. Legacy
unattributed charges, inconsistent settlement, unmatched refunds and saturated
reads hold capacity. Missing allocation never becomes zero. New generation still
needs to retain this attribution through its actual credit producer and perform
transactional admission. `reserveBreakoutLiveCapacityPlan`
feeds this fresh snapshot to the existing immutable slot registry. These reads and
identity reservations neither debit credits nor reserve future posting capacity.

`readBreakoutOutputRecovery` reads the existing scoped branded generation receipt
using the output generation key and candidate index zero, validates its canonical
schema and retained identity, and returns normalized internal status without prompts,
actor identity or a fabricated cost total. Pending generation waits; indeterminate
outcomes, missing in-flight receipts and invalid projections require reconciliation.
Every result forbids repeating a paid request based on this read alone. Approved
brand readiness is separate from platform quality, actor and publication permission.
Complete current post material is checked before treating a bound artifact as
reusable. This check does not replace fresh byte acquisition, render qualification
or normal quality/review/publication admission.

Draft, review, scheduled, paused, publishing, confirmed publication, suppression,
expiry and failure remain distinct. Published status requires the existing canonical
publication resolver's real approval, material/version and provider-finalization
proof; a queue, workflow or output state is insufficient. Confirmed publication
remains a fact after response suppression. These are internal transaction utilities,
not dispatch or publication routes.

## Authorized status reads

`GET /brands/:brandId/breakout-responses` lists bounded paginated response status;
`GET /brands/:brandId/breakout-responses/:id` adds at most five output recovery
projections. The analytics feature boundary and selected tenant read scope apply.
The adapter requires the guard's canonical user ID, then consumes the existing
manual member/brand access service before querying the response. API-key requests
are held because this manual actor shape cannot carry a capped key's authority.
No actor is derived from source ownership or a receipt, and these reads do not
resolve automatic execution principals.

The serializer exposes allowlisted source identity, current-source validity,
trigger ratio/median/sample size and normalized recovery state. It omits prompts,
actor IDs and invented costs/lift. List reads explicitly omit detailed recovery;
detail reads distinguish an empty plan from an invalid/overfull registry. An
explicit optional `strategyId` adds the existing scoped advisory capacity snapshot.
No read creates receipts, slots, generation jobs, provider calls, credit debits,
publication authority or automatic expiration. Consolidated MCP work remains separate. Final combined-source authorization still must prove #5147's current
Cloud unassigned/assigned brand rules, Owner/Admin access, removed membership and
capped-key denial, plus self-hosted semantics. Current branch guard behavior alone
does not qualify that policy as complete.

## Breakouts status page

The brand-scoped `/analytics/breakouts` page reads the manual status routes through
`BreakoutResponsesService`. The client binds each fresh instance to the confirmed
organization using the existing HTTP interceptor contract and encodes brand and
response path segments. It uses the existing JSON:API deserializers and pagination;
there are no client generation, reservation or publication methods.

Changing organization, brand, session or user remounts the scoped read view before
another scope renders. Both list and detail requests abort on replacement and
ignore late results. Unexpected response scope is held, failed reads stay errors,
and omitted output details remain distinct from an empty plan or registry conflict.

The page exposes original-post identity and trigger evidence, normalized output
state and post links, and confirmed external publication identity when available.
Capacity remains explicitly unchecked without a selected strategy. An explicit
`?strategyId=<id>` on the page requests the existing scoped advisory snapshot for
that strategy when inspecting a response; it reserves nothing. Changing this
selection clears and aborts the previous scoped view. Refresh, inspection and pagination are read actions. No navigation/menu
file is changed by this isolated page addition; it is accessible at the existing
brand route plus `/analytics/breakouts`.

Frontend/client fixtures cover brand/org/session replacement, late responses,
organization-bound HTTP cancellation, access errors, observed zero versus missing
metrics/capacity and scheduled versus confirmed publication. They are written but
unrun until the final designated-host batch. Final combined #5147 authorization
qualification remains required; this UI does not establish a new actor policy.

## Required connected outcome

The remaining implementation must react while attention is growing, prioritize
original useful follow-ups, and on X attach useful new commentary to the source
post through its winning credential. Response volume is chosen dynamically, up to
five total outputs including the quote, within existing credits and publishing
ceilings. Weekly targets and draft reserves do not grant publishing authority.

Every supported platform and format must reach its normal quality, budget, review
and publication path. Review-only accounts receive drafts; existing authorized
publication still requires current source, credential, actor and policy admission.
Ambiguous paid outcomes require reconciliation before another provider request.
Product and agent reads must distinguish detection, reservation, drafts, review,
scheduling, confirmed publication, suppression, expiry and failure, with retained
lineage and subsequent measurements.

Additional qualified provider exposure mappings, priority workflow execution,
generation-to-artifact/quote workflow attachment, recovery
workflow wiring, consolidated agent reads and connected acceptance
remain unfinished. Lifetime policy is settled: older posts remain eligible when
fresh measurements show resumed growth, with no fixed 24-hour expiry; follow-ups
stop when growth fades. All schedules retain the authenticated configuring user/key
and recheck current authority; old unbound Cloud schedules stay held until
reconfigured. The shared automatic actor implementation is owned by #5147. Source
ownership, workflow creator attribution and synthetic owner identities grant no
permission to execute.

The planning growth gate reads at most three latest prospective observations from
the same publication. Measurements match account, material, metric provenance,
provider source and time basis. Collection intervals must not overlap. The latest
measurement is at most 15 minutes old and adjacent measurements are at most two
hours apart. Current exposure must increase; when three samples exist, its rate
must not fall below the preceding rate. Renewal after a zero-growth interval is
explicit. These are evidence-freshness bounds, independent of publication age.
Dispatch and publication wiring still must recheck this gate; no measurement
alone grants authority or reserves money.

## Evidence and delivery

Unit fixtures are written for capture, comparable-age evaluation, immutable
receipts, source identity, output caps, lineage, the capture-to-detection path,
bounded capacity, live billing/cadence snapshots, immutable plan replay, receipt
recovery and pre-review text lineage attachment. Native fixtures cover provider
attempt ownership/timing, organic/fallback provenance, zero/missing exposure,
explicit supported formats, mutable source material, account/author changes,
native baseline/identity/plan/quote binding and recursive response exclusion.
They remain unrun until the final designated-host verification batch. Schema
generation and permitted package builds do not prove PostgreSQL constraints,
concurrent delivery or the complete provider workflow.

Keep the issue and epic open until connected fake-provider acceptance, required
current-head CI, protected merge and required deployment acceptance are recorded.
Production enablement, live posting and paid provider acceptance are separate
actions. A single breakout or quote cannot establish causal performance lift.
