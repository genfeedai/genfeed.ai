-- Refresh dedupe: finds the stored row for each fetched hashtag by platform and
-- hashtag. One statement, CONCURRENTLY: Prisma runs a single-statement
-- migration outside a transaction block.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "trending_hashtags_lookup_idx" ON "trending_hashtags" ("platform", "lookupKey") WHERE "isDeleted" = false;
