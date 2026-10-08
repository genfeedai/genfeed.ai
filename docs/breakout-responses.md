# Own-account breakout responses

Tracked in [#6526](https://github.com/genfeedai/genfeed.ai/issues/6526), a child of
[#6472](https://github.com/genfeedai/genfeed.ai/issues/6472).

## Current implementation boundary

Analytics collectors prepare canonical publication identity before fetching provider
measurements. PostAnalyticsService retains an immutable exposure observation and
immediately evaluates available organic exposure in the same transaction. A positive
comparison records one durable detected response per account/publication. Detection
does not queue generation, spend credits, reserve publishing quota or publish a post.

The observation binds organization, brand, connected credential, platform, format,
external publication, material digest and confirmed publication/version identity.
Views and impressions remain separate. Observed zero is a measurement; unavailable
exposure stays null. Aggregate counts do not become organic evidence because a
promotion flag is missing or false. X post organic impressions retain their provider
field-group source; aggregate media views do not establish per-post exposure.
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
format, metric source and time basis may contribute. Reads resolve current canonical
publication material and exclude invalidated, deleted, promoted, pinned or generated
response sources. Unknown flags remain explicit. The read is limited to 2,000 rows
and 50 prior publication resolutions; saturation produces a truncated comparison.
There is no fabricated early-history backfill from cumulative daily analytics.

An immutable comparison receipt retains contributors, exclusions, metric, options,
median and ratio. Retry cannot overwrite its original evidence. Changed evidence
produces a held conflict. Detection identities and output identities remain distinct:
a detected response has not generated content, and a reserved output has not been
published.

An output plan has at most five total slots. An X quote uses slot one and counts
inside that limit. Slots and generation identities are never recycled after failure
or deletion. A post's persistent breakout output link identifies generated responses
independently of ordinary quote fields and prevents recursive response chains.
Generation must attach that link before publication.

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

Imported own-account sources, additional qualified provider exposure mappings,
priority workflow execution, artifact and quote attachment, recovery, product/agent
status surfaces and connected acceptance remain unfinished. The human response
lifetime choice and the authoritative automatic actor contract are unresolved.
No default lifetime or synthetic owner principal grants permission to execute.

## Evidence and delivery

Unit fixtures are written for capture, comparable-age evaluation, immutable
receipts, source identity, output caps, lineage and the capture-to-detection path.
They remain unrun until the final designated-host verification batch. Schema
generation and permitted package builds do not prove PostgreSQL constraints,
concurrent delivery or the complete provider workflow.

Keep the issue and epic open until connected fake-provider acceptance, required
current-head CI, protected merge and required deployment acceptance are recorded.
Production enablement, live posting and paid provider acceptance are separate
actions. A single breakout or quote cannot establish causal performance lift.
