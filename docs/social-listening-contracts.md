# Social Listening Contracts

Genfeed's social-listening boundary separates durable product contracts from
provider-specific collection details. API, worker, MCP, and UI consumers share
the same listening topic and evidence identifiers without depending on raw
connector payloads.

## Listening topics

A listening topic is owned by one organization and brand and contains:

- normalized keywords, exclusions, and language filters;
- an explicit set of authorized `SocialSource` records;
- a freshness window between 1 and 720 hours;
- a versioned fingerprint for idempotent creation and audit history; and
- active and soft-delete state.

Topic creation and updates reject inactive, deleted, cross-tenant, or
unsupported sources before writing. Equivalent active contracts return the
existing topic on create and are rejected as duplicates on update.

The version 1 contract supports X/Twitter, Reddit, Hacker News, Instagram,
LinkedIn, and YouTube. TikTok and other connector platforms remain unsupported
until the listening contract explicitly adds them.

## Evidence

`ListeningEvidence` is the normalized attribution unit produced by future
collectors. It records stable topic, topic-source, and provider identifiers plus
timestamps, a bounded excerpt, normalized metrics, and freshness expiry.

Raw provider payloads are not part of this contract. Existing `SourcePost`
records can be linked when available, while `externalId` remains the durable
provider reference for comments, mentions, posts, replies, and reviews.

Themes and downstream actions reference evidence IDs rather than copying source
content. This keeps briefs, publications, and response workflows traceable back
to their supporting observations.

## Themes and attributable signals

`POST /listening-topics/:id/analyze` accepts explicit, non-overlapping current
and previous windows. The windows must have equal duration, each is limited to
31 days, and both use inclusive-start/exclusive-end boundaries. The optional
`minimumEvidencePerWindow` threshold defaults to 2.

Analysis uses the versioned `deterministic-keyword-v1` methodology. It is a
non-LLM algorithm: fresh evidence is assigned to the longest normalized topic
keyword found in its excerpt, with a deterministic `unclassified` fallback.
Each evidence record belongs to exactly one generated theme. The explicit
`ListeningThemeEvidence` join stores every contributing evidence ID inside the
same organization, brand, and topic scope.

Signals are calculated only from sources with fresh evidence in both windows.
The persisted signal retains all included and excluded source IDs, every
evidence ID used in the calculation, both windows, methodology version,
confidence, and an idempotency key. Four bounded signal contracts are emitted:

- `volume`: the current-window evidence count;
- `change`: current versus previous relative change, clamped to `[-1, 1]`;
- `comparative`: normalized current-versus-previous difference in `[-1, 1]`;
- `sentiment_direction`: the mean numeric `sentiment` or `sentimentScore`
  metric, clamped to `[-1, 1]`.

Missing, stale, source-coverage-gapped, or underpowered evidence produces an
`insufficient_evidence` signal with a reason, confidence `0`, and `value: null`.
The analysis response is discriminated by `status: sufficient` or
`status: insufficient_evidence`. Repeating the same topic, windows, threshold,
and methodology revives and updates the same theme and signal identities rather
than creating duplicates.

Scoped historical reads are available at
`GET /listening-topics/:id/themes` and
`GET /listening-topics/:id/signals`. Both exclude soft-deleted rows and require
the authenticated organization and brand scope.

## Operational invariants

- Every read and write is scoped by both `organizationId` and `brandId`.
- Source membership is explicit and reviewable through `ListeningTopicSource`.
- Removing a source excludes evidence collected through that membership from
  active reads while retaining the evidence as audit history.
- Soft-deleting a topic leaves its historical record but excludes it from
  default queries.
- Contract changes increment `LISTENING_CONTRACT_VERSION` and require compatible
  serializers and consumers.

Provider credentials, alerting, downstream review, and UI workflows remain
separate milestone deliverables.
