-- The review inbox (#7340) lists RUNNING executions paused at a review gate per
-- organization. Only the organization/deleted/createdAt index served it, so an
-- organization with many finished executions and no pending gate scanned every
-- execution (and its result JSON) before returning an empty inbox. Lead with
-- status so the lookup reads only the live runs. Build without blocking
-- execution writes; keep this as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_executions_org_status_deleted_created_idx"
  ON "workflow_executions" ("organizationId", "status", "isDeleted", "createdAt");
