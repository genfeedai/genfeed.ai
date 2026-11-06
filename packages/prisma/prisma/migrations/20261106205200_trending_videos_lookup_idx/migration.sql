-- Refresh dedupe: finds the stored row for each fetched video by platform and
-- external id. One statement, CONCURRENTLY: Prisma runs a single-statement
-- migration outside a transaction block.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "trending_videos_lookup_idx" ON "trending_videos" ("platform", "lookupKey") WHERE "isDeleted" = false;
