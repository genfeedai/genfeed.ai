-- The hourly workflow-artifact cleanup sweep looks for scrubbed executions that
-- are due for purge or repair (`payloadScrubbedAt IS NOT NULL`, oldest first).
-- Scrubbed rows are a tiny, short-lived slice of `workflow_executions`, but no
-- index could serve that predicate together with the `completedAt` ordering, so
-- the sweep read the whole table (13s in production).
-- The predicate must match the query in `WorkflowArtifactLifecycleService`
-- (`findExecutionsDueForCleanup`) literally for Postgres to use this index.
-- Build without blocking execution writes; keep this as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_executions_scrubbed_cleanup_idx"
  ON "workflow_executions" ("completedAt")
  WHERE "payloadScrubbedAt" IS NOT NULL AND "isDeleted" = false;
