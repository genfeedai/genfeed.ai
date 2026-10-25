-- Prefix of research_collection_jobs_organizationId_isDeleted_upstreamRunId_idx.
-- Keep this as the migration's only statement.
DROP INDEX CONCURRENTLY IF EXISTS "research_collection_jobs_organizationId_isDeleted_idx";
