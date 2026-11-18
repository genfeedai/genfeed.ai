-- `captions.workflowExecutionId` is a foreign key to `workflow_executions` with
-- ON DELETE SET NULL but had no index, so deleting a run read the whole
-- `captions` table to null its links. The bulk purge of background runs (#10382)
-- deletes thousands of runs an hour.
-- Build without blocking writes; keep this as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "captions_workflowExecutionId_idx"
  ON "captions" ("workflowExecutionId");
