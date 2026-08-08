-- Ascending (updatedAt, id) keyset indexes for the desktop sync composite
-- cursor (#2515). The manifest pull (brands / ingredients / assets) and the
-- thread pull now page with
--   ORDER BY "updatedAt" ASC, "id" ASC
--   WHERE "updatedAt" > $cursor OR ("updatedAt" = $cursor AND "id" > $id)
-- scoped by organization. Existing indexes on these tables either lead with
-- isDeleted/parentBrandId or lack the id tie-breaker, so the keyset scan
-- would sort every equal-updatedAt group per page.
--
-- Built CONCURRENTLY: all four tables take continuous writes (brand edits,
-- ingredient generation, desktop asset sync, thread sync), so a plain
-- CREATE INDEX would hold an ACCESS EXCLUSIVE lock for the whole build.
--
-- CONCURRENTLY must run OUTSIDE a transaction block. Prisma only skips
-- wrapping a migration in a transaction when the file contains just bare
-- CONCURRENTLY index builds — so this file carries ONLY bare CONCURRENTLY
-- builds, no DML, matching the precedent 20260807150000_add_hot_path_indexes.
--
-- `IF NOT EXISTS` makes each build a no-op where the index already exists. If
-- a build fails it leaves an INVALID index of the same name — DROP it and
-- re-deploy; do not blindly re-run.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "brands_org_updated_at_id_idx"
  ON "brands" ("organizationId", "updatedAt", "id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "ingredients_org_updated_at_id_idx"
  ON "ingredients" ("organizationId", "updatedAt", "id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "assets_parent_org_updated_at_id_idx"
  ON "assets" ("parentOrgId", "updatedAt", "id");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "desktop_threads_org_user_updated_at_id_idx"
  ON "desktop_threads" ("organization_id", "user_id", "updatedAt", "id");
