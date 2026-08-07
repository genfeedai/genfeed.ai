-- Keep the concurrent build in a migration containing only this bare index
-- statement so session reads and writes remain available during deployment.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "sessions_impersonatedBy_idx"
ON "sessions"("impersonatedBy");
