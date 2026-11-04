-- The hourly workflow-artifact cleanup sweep also looks for completed executions
-- that carry a retention policy but have not been scrubbed yet
-- (`payloadScrubbedAt IS NULL` plus `purgeAfterHours`, `scrubAllNodePayloads` or
-- `scrubNodeIds`, oldest first). Almost every execution has no policy, and no
-- index could serve this predicate, so the sweep read the whole table.
-- The predicate must match the query in `WorkflowArtifactLifecycleService`
-- (`findExecutionsDueForCleanup`) literally for Postgres to use this index.
-- Build without blocking execution writes; keep this as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_executions_retention_pending_idx"
  ON "workflow_executions" ("completedAt")
  WHERE "payloadScrubbedAt" IS NULL
    AND "isDeleted" = false
    AND (
      "purgeAfterHours" IS NOT NULL
      OR "scrubAllNodePayloads" = true
      OR "scrubNodeIds" <> '{}'
    );
