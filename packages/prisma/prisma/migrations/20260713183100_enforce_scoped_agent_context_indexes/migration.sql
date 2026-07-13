-- Keep concurrent builds in a migration containing only bare CONCURRENTLY
-- statements. Prisma runs this file without a transaction, matching the hot
-- table index convention used by the existing production-safe migrations.

CREATE INDEX CONCURRENTLY "agent_threads_org_brand_deleted_updated_at_idx"
ON "agent_threads"("organizationId", "brandId", "isDeleted", "updatedAt" DESC);

CREATE INDEX CONCURRENTLY "posts_agentThreadId_idx"
ON "posts"("agentThreadId");
