-- #629: rank-specific trend reference corpus indexes.
--
-- The first normalization pass added scalar columns and generic lookup indexes.
-- These two indexes cover the normal corpus ranking paths that combine
-- platform/author filters with engagement and virality ordering.
--
-- CONCURRENTLY avoids ACCESS EXCLUSIVE locks on the corpus table during deploy.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "trend_source_refs_platform_rank_idx"
ON "trend_source_references"(
  "isDeleted",
  "platform",
  "currentEngagementTotal" DESC,
  "latestTrendViralityScore" DESC,
  "lastSeenAt" DESC
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "trend_source_refs_account_rank_idx"
ON "trend_source_references"(
  "isDeleted",
  "platform",
  "authorHandle",
  "currentEngagementTotal" DESC,
  "latestTrendViralityScore" DESC,
  "lastSeenAt" DESC
);
