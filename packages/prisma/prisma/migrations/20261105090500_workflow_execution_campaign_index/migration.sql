-- Agent campaign stats and content rotation read a campaign's executions. Only
-- campaign runs carry a `campaignId`, so a partial index stays small.
-- Build without blocking execution writes; keep this as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_executions_campaign_idx"
  ON "workflow_executions" ("organizationId", "campaignId", "createdAt" DESC)
  WHERE "campaignId" IS NOT NULL;
