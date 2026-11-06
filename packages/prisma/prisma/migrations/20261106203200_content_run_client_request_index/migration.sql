-- Storyboard creation dedupes a retried request by its client request id.
-- Only storyboard runs carry one. Build without blocking run writes; keep this
-- as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "content_runs_client_request_idx"
  ON "content_runs" ("organizationId", "clientRequestId")
  WHERE "clientRequestId" IS NOT NULL;
