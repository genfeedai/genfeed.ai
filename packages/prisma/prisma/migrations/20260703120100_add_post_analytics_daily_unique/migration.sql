-- Enforce one analytics snapshot per (post, platform, day) on `post_analytics`
-- (#1185, epic #1176).
--
-- Why this is a natural key
-- -------------------------
-- `PostAnalyticsService.upsertTodaysAnalytics` / `updateFromMetrics` already
-- upsert on `where: { postId_platform_date: { postId, platform, date } }` and
-- catch a P2002 to serialize concurrent writers — but the constraint was only
-- ever expressed in application code (with an `as never` cast) and never existed
-- in the schema or a migration: classic drift. Without the DB constraint the
-- upsert's `where` is not a valid unique locator and the P2002 catch can never
-- fire. This aligns the DB with the code's assumption and mirrors the existing
-- `ArticleAnalytics @@unique([articleId, date])`. `date` is normalized to
-- local-server midnight by the writer (`new Date()` then `.setHours(0, 0, 0, 0)`
-- in `PostAnalyticsService`), so for a fixed server timezone the tuple is a true
-- per-day natural key.
--
-- Built CONCURRENTLY: locking
-- ---------------------------
-- `post_analytics` is a hot, continuously-written table — every metrics refresh
-- upserts today's row. A plain `CREATE UNIQUE INDEX` takes an ACCESS EXCLUSIVE
-- lock for the whole build and would stall live analytics ingestion, so the
-- index is built CONCURRENTLY: concurrent reads and writes keep running while it
-- builds. CONCURRENTLY cannot run inside a transaction block; Prisma 7.8.0+
-- executes each migration statement without wrapping the migration in a
-- transaction (including shadow-database replay during `migrate dev`), so the
-- preflight `DO` block and the index build below run as two separate,
-- autocommitted statements. See prisma/prisma#14456 and the 7.8.0 release notes.
--
-- Safety against existing duplicates
-- ----------------------------------
-- `post_analytics` has NO soft-delete column, so duplicates cannot be collapsed
-- by soft-deleting losers, and silently hard-deleting analytics rows would be
-- data loss. Instead the preflight below aborts loudly if any duplicate group
-- exists: it is its own statement and only reads (SELECT COUNT), so the RAISE
-- fails the migration before the index build is ever attempted and leaves the
-- data untouched for a reviewed manual dedupe before re-apply. On production the
-- unique index is expected to already exist (the app has been running against
-- it), so `IF NOT EXISTS` makes this a no-op there and a real create only on
-- databases that lack it.
--
-- NOTE: a CONCURRENTLY build that fails midway leaves an INVALID index of the
-- same name and marks this migration failed. Because of `IF NOT EXISTS` a blind
-- re-run would skip rebuilding it — DROP the invalid index, then
-- `prisma migrate resolve` + re-deploy. Do not blindly re-run.
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT 1
    FROM "post_analytics"
    GROUP BY "postId", "platform", "date"
    HAVING COUNT(*) > 1
  ) AS dupes;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Migration aborted (#1185): % duplicate (postId, platform, date) group(s) in post_analytics. Dedupe these before applying the unique constraint.', dup_count;
  END IF;
END$$;

-- Name MUST match Prisma's default for `@@unique([postId, platform, date])` on
-- `@@map("post_analytics")` so the schema and database stay drift-free.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "post_analytics_postId_platform_date_key"
  ON "post_analytics" ("postId", "platform", "date");
