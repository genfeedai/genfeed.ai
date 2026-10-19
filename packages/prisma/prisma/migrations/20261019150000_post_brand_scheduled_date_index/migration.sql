-- The publishing calendar lists a brand's posts for a month
-- (`brandId`, `isDeleted = false`, `scheduledDate` between the month's bounds).
-- The only indexes on scheduledDate lead with isDeleted or with
-- organization/credential/status, none of which the calendar filters on, so
-- Postgres read every tenant's posts scheduled in that month and filtered by
-- brand afterwards. Lead with the brand so the month is a short range scan.
-- Build without blocking post writes; keep this as the migration's only statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "posts_brand_deleted_scheduled_date_idx"
  ON "posts" ("brandId", "isDeleted", "scheduledDate");
