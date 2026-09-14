-- Fixed JSONB paths match the snapshot lookup, preserving JSON string identity
-- (missing, null, and non-string metadata must not match a string identifier).
-- Run outside a transaction. If interrupted, inspect pg_index.indisvalid and
-- DROP INDEX CONCURRENTLY workflow_executions_thread_snapshot_idx before retrying
-- an invalid build; IF NOT EXISTS would silently retain that unusable index.
-- Then run `prisma migrate resolve --rolled-back 20260914170000_workflow_thread_snapshot_index`
-- before `prisma migrate deploy` to clear Prisma's failed-migration record.
-- Rollback: DROP INDEX CONCURRENTLY workflow_executions_thread_snapshot_idx;
-- The lookup remains semantically correct without this performance index.
CREATE INDEX CONCURRENTLY workflow_executions_thread_snapshot_idx
ON workflow_executions (
  "organizationId", "isDeleted",
  (result #> '{metadata,threadId}'::text[]),
  (result #> '{metadata,canonicalId}'::text[]),
  "createdAt" DESC, id DESC
);
