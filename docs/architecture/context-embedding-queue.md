# Durable context embedding queue

Context entries and embedding intents commit together in PostgreSQL. Redis carries
job identifiers only and is a best-effort transport. Requests return saved entries
without waiting for a stored-entry provider call. Retrieval performs only its query
embedding and reads eligible committed vectors; it never admits historical work.

## Admission and execution

The selected Router embedding model is persisted with each intent. The existing
OpenRouter embedding transport produces exactly 1024 finite components. Each
WorkerHost process consumes two jobs concurrently. PostgreSQL owns the three-attempt
limit, 30/120 second retry delays, generation fences, and 120 second leases; stored
provider calls have a 60 second timeout. Lease predicates use database wall time.
A late result cannot overwrite a newer generation or expired/replaced lease.
Provider requests are at least once: a lost response can lead to a repeated request.

Every admitted job retains actual authority: the authenticated actor, validated
code-owned workflow provenance, or an explicit committed-memory derivative.
Claims and commits revalidate current tenant, user, API-key, base, brand, and source
eligibility. Ordinary interactive memory capture without a principal fails before
writes. Only genuinely actorless server-marked proactive capture may use derived
memory authority after the memory record commits.

New memory-linked entries and jobs also bind the same sourceSnapshotHash. One
PostgreSQL 17 expression hashes the versioned 23-value committed AgentMemory
snapshot. Admission, claim, commit, and retrieval share that expression. Live source
changes invalidate old work/results; timestamps and promotion bookkeeping do not.
Hashes, principals, leases, vectors, and job internals are not public attributes.

## Knowledge readiness

A transaction stages at most 200 ordered chunks, their jobs, and an immutable
manifest. Same-execution replays reuse that manifest. Only a distinct explicit
retry can replace a failed generation, retaining attempt history. Sealing does not
mean READY: completion verifies the exact manifest and every committed vector
before settling source, capture, or refresh state. An eligible refresh predecessor
remains searchable until atomic promotion; a failed candidate leaves it current.
Visibility, retention, deletion, expiry, audience, and current-version rules remain
live retrieval predicates.

## Recovery and historical entries

Minute-based platform maintenance recovers bounded admitted work, expired leases,
and manifests, with at most 200 rows in each category. It never discovers and embeds
all missing historical vectors. Terminal failures require an explicit retry.

OWNER/ADMIN callers may explicitly POST to
`contexts/:contextId/embeddings/backfill` with maxEntries from 1 through 200 and an
optional cursor. Current role, API-key scopes, base ownership, tenant, and brand
access are enforced again in the service. Each invocation is bounded and returns a
serialized ContextBase plus operation metadata; callers choose any continuation.
Legacy vectors retain generation zero and remain unchanged by migration.

## Evidence and target

Searchability within ten minutes under normal load is an engineering acceptance
target, not a measured production SLA. The named Context Embedding Acceptance job
uses dedicated PostgreSQL 17/pgvector runtime and predecessor-upgrade databases,
Redis 7, actual production Core/WorkerHost services, and a loopback fake HTTP
provider. It checks the real complete migration/checksum ledger, legacy vector
preservation, outage/restart recovery, leases, authority/privacy fences, manifest
completion, refresh, citations, and a 200-job batch. Missing resources fail closed.
Exact-head real acceptance and required current-head checks precede auto-merge;
production deployment and live acceptance are separate delivery evidence.
