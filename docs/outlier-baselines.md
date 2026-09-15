# Stored account outlier baselines

`/outlier-baselines` exposes immutable account and content-type baseline history.
An account is either a connected credential or an external account SocialSource.
Own-account SocialSources resolve to their connected credential and combine with
published-post analytics. Single-post import containers are excluded.

## Rollout and refresh

Apply the additive migration before deploying the API. It creates empty outlier
configuration, snapshot and measurement tables and adds nullable eligibility flags
and an active-row flag to daily post analytics. No provider calls or data backfill
run in the migration. Existing history is evaluated lazily after the next successful
collection, history import or resync. An organization owner/admin can POST
`/outlier-baselines/refresh` with `brandId`, `accountType` and `accountId` to evaluate
already-stored metrics. This endpoint does not collect providers.

Analytics workflows await refresh after all post writes in the account batch finish.
Source collection awaits refresh after its account batch is stored. A refresh failure propagates to the
existing collection failure/retry path; analytics data already written remains
available for that retry. Each snapshot and all its measurements commit in one
transaction. Snapshot history and past ratios are never overwritten.

The canonical normalized input, source identities, flags, deletion provenance,
resolved configuration and maturity eligibility determine an input fingerprint.
An unchanged retry returns the latest snapshot even if collection timestamps changed.
Changed state includes the preceding snapshot identity in its idempotency key, so
A → B → A creates three historical measurements. Concurrent identical requests with
the same predecessor converge on the database unique key.

## Calculation and limits

The existing `computeOutlierBaseline` helper selects the latest eligible posts,
default window 20, minimum 5, maturity 48 hours. Median 0 produces no ratios. Pinned
posts do not contribute but can receive ratios. Unknown provider flags stay unknown;
missing or unavailable views stay null. Impressions and reach are not substitutes
for views. Provider APIs that do not expose views therefore have no view ratio.

Reads are paginated at 200 observations, with a hard 10,000-observation account limit.
PostgreSQL selects one latest daily observation per post before pagination; historical
daily rows do not count toward this limit. Collected source-post observations do count.
Exceeding it fails before any new snapshot is written. Calculation is O(M*N),
N<=50, with per-post provenance across M tracked posts. The first backfill reads
only active records. Later refreshes compare the latest tracked IDs with current
active inputs and record disappeared IDs as soft-deleted without fetching content.

## API

All endpoints require an authenticated organization member and reauthorize active
accounts and brands. GET `/configuration` returns resolved organization defaults;
PATCH `/configuration` is owner/admin-only and changes the next refresh, preserving
old snapshots. Thresholds must be finite, positive and increasing. Maturity override
keys are canonical platforms and values are nonnegative safe integer hours.

GET `/` requires brandId, accountType and accountId; platform/contentType are optional.
GET `/:id` returns one authorized snapshot. GET `/:id/posts` returns its attributed
measurements. Lists default to 20 rows and cap at 100. Refresh returns every current
or previously tracked content-type bucket, including newly empty buckets. Responses
use dedicated serializers and expose no raw provider payloads or credentials.

### Collection completion

Analytics workflows await bounded post collection and refresh each successful account once after the batch completes. Partial batches refresh successful accounts and report `completed_with_errors`. A failed baseline refresh retries from saved child results without recollecting providers. Older immutable workflow versions retain per-action refresh until those runs drain. Direct analytics ingestion callers explicitly invoke `refreshOutliers` after their batch.

Legacy daily metrics without explicit views availability remain unavailable until recollected. Historical impressions are not treated as observed views. Provider compatibility still requires operator smoke verification.

Authorized brand relocation transfers snapshot and measurement ownership together.
Historical IDs, ratios, options and snapshot references remain unchanged. Organization
configuration stays with its organization; subsequent refreshes use the destination
organization's configuration and create new snapshots when the fingerprint changes.
