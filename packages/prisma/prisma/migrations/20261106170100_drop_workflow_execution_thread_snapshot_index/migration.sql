-- Replaced by `workflow_executions_thread_idx` on the promoted `threadId` and
-- `canonicalId` columns (20261105090100, shipped in v0.2.26). No running
-- release reads the `result` JSON paths for the thread snapshot any more.
-- Keep this as the migration's only statement.
DROP INDEX CONCURRENTLY IF EXISTS "workflow_executions_thread_snapshot_idx";
