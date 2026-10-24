-- The generation toasts read the organization's activity list newest-updated
-- first (`sort=updatedAt: -1`) on every focus, socket event and poll. The only
-- organization indexes order by createdAt, so Postgres sorted the
-- organization's whole activity history to return one page. Order the index
-- the way the query reads. Build without blocking activity writes; keep this
-- as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "activities_org_updated_at_idx"
  ON "activities" ("organizationId", "updatedAt" DESC)
  WHERE "isDeleted" = false;
