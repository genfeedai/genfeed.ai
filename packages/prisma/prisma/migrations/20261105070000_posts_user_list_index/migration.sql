-- The posts list (`PostsController.buildFindAllQuery`) scopes rows with
-- `WHERE ("userId" = $1 OR "organizationId" = $2) AND "isDeleted" = $3 AND
-- "parentId" IS NULL`. Every other posts index leads with organizationId,
-- brandId or isDeleted, so Postgres cannot serve the `"userId" = $1` arm of the
-- OR from an index and falls back to a sequential scan of the whole table, for
-- every tenant, for both the page query and the `count(*)`. Measured on a
-- 1000x database: 157 ms for a typical tenant (1x: 4.5 ms).
-- With this index the OR becomes a BitmapOr of two index scans.
-- Build without blocking post writes; keep this as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "posts_user_deleted_created_at_idx"
  ON "posts" ("userId", "isDeleted", "createdAt" DESC);
