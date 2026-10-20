-- The generation toasts poll the activity list filtered to in-flight actions
-- (`action IN (<...-processing>)`) and count it for pagination. The only
-- organization index orders by createdAt, so Postgres walked and counted the
-- organization's whole activity history to find the few rows still running.
-- Lead with the action so those rows are read directly. Build without blocking
-- activity writes; keep this as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "activities_org_action_created_at_idx"
  ON "activities" ("organizationId", "action", "createdAt" DESC)
  WHERE "isDeleted" = false;
