-- System workflow lookups (hidden mirrors under the system principal, the
-- activity list's agent-turn and batch workflow ids, the schedule sweep's
-- install check) match `systemWorkflowCanonicalId` within one organization.
-- Only system workflows carry one. Build without blocking workflow writes; keep
-- this as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflows_system_canonical_idx"
  ON "workflows" ("organizationId", "systemWorkflowCanonicalId")
  WHERE "systemWorkflowCanonicalId" IS NOT NULL;
