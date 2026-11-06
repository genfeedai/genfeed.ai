-- The activity list, the stats panel and the approval queue count and read an
-- organization's activities by status. Build without blocking activity writes;
-- keep this as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "bot_activities_status_idx"
  ON "bot_activities" ("organizationId", "status", "createdAt" DESC)
  WHERE "isDeleted" = false;
