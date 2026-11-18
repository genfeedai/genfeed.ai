-- `posts.workflowExecutionId` is a foreign key to `workflow_executions` with
-- ON DELETE SET NULL but had no index, so deleting a run read the whole `posts`
-- table to null its links. The bulk purge of background runs (#10382) deletes
-- thousands of runs an hour, and it checks the same link before it deletes.
-- Build without blocking post writes; keep this as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "posts_workflowExecutionId_idx"
  ON "posts" ("workflowExecutionId");
