-- Supports TrendReferenceCorpusService.getCorpusFreshnessHealth: filters
-- (isDeleted, organizationId) and orders by (platform, updatedAt). The tenant
-- path scopes Trend rows by organizationId (own + global/null); this compound
-- index keeps that read off a full sequential scan as the trends table grows.
-- CONCURRENTLY avoids ACCESS EXCLUSIVE locks on the trends table during deploy.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "trends_freshness_org_idx"
ON "trends"(
  "isDeleted",
  "organizationId",
  "platform",
  "updatedAt"
);
