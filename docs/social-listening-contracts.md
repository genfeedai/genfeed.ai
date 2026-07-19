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

## Operational invariants

- Every read and write is scoped by both `organizationId` and `brandId`.
- Source membership is explicit and reviewable through `ListeningTopicSource`.
- Removing a source excludes evidence collected through that membership from
  active reads while retaining the evidence as audit history.
- Soft-deleting a topic leaves its historical record but excludes it from
  default queries.
- Contract changes increment `LISTENING_CONTRACT_VERSION` and require compatible
  serializers and consumers.

This contract defines storage and transport boundaries only. Provider polling,
collector credentials, theme extraction, alerting, and UI workflows are separate
milestone deliverables.
