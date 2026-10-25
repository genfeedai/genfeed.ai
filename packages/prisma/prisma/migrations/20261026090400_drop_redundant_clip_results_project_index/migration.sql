-- Prefix of clip_results_organizationId_projectId_status_isDeleted_idx.
-- Keep this as the migration's only statement.
DROP INDEX CONCURRENTLY IF EXISTS "clip_results_organizationId_projectId_idx";
