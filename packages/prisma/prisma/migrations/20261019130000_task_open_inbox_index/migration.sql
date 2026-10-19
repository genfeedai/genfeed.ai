-- The workspace inbox unread count (polled on every protected page) counts the
-- organization's open tasks against the viewer's receipts. Only the id and
-- updatedAt of live, undismissed tasks are read, so a covering partial index
-- lets Postgres answer it from the index alone. Build without blocking task
-- writes; keep this as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "tasks_org_open_inbox_idx"
  ON "tasks" ("organizationId", "id") INCLUDE ("updatedAt")
  WHERE "isDeleted" = false AND "dismissedAt" IS NULL AND "reviewState" <> 'dismissed';
