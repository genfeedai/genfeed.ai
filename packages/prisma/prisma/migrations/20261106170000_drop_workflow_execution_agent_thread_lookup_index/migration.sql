-- Replaced by `workflow_executions_thread_created_idx` on the promoted
-- `threadId` column (20261105090150, shipped in v0.2.26). No running release
-- reads the `result` JSON thread path any more, and each extra index costs on
-- every execution write. Keep this as the migration's only statement.
DROP INDEX CONCURRENTLY IF EXISTS "workflow_executions_agent_thread_lookup_idx";
