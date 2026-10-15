-- Relocation reads every execution of a workflow across tenant ownership changes.
-- An organization-leading index cannot serve this lookup. Build without blocking
-- execution writes; keep this as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_executions_workflow_org_idx"
  ON "workflow_executions" ("workflowId", "organizationId");
