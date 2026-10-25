-- Prefix of ad_performance_org_deleted_date_idx and the other
-- (organizationId, isDeleted, ...) indexes on ad_performance.
-- Keep this as the migration's only statement.
DROP INDEX CONCURRENTLY IF EXISTS "ad_performance_organizationId_isDeleted_idx";
