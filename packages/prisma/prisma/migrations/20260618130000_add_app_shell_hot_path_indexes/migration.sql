-- App shell hot-path indexes.
--
-- Built with CREATE INDEX CONCURRENTLY so the migration never takes an ACCESS
-- EXCLUSIVE lock on hot tables (posts, agent_runs, activities, batches,
-- content_runs) while each index builds — concurrent reads and writes keep
-- running throughout. A plain CREATE INDEX would block all traffic on those
-- tables for the duration of the build, which is unacceptable on a live deploy.
--
-- CONCURRENTLY must run outside a transaction block. Prisma 7.8.0+ executes each
-- migration statement without wrapping the migration in a transaction (including
-- shadow-database replay during `migrate dev`), so this is safe under both
-- `prisma migrate deploy` (CI / prod) and `prisma migrate dev` (local).
-- See prisma/prisma#14456 and the Prisma 7.8.0 release notes.
--
-- NOTE: if a CONCURRENTLY build fails midway it leaves an INVALID index of the
-- same name and marks this migration failed. Resolution is to DROP the invalid
-- index, then `prisma migrate resolve` + re-deploy — do not blindly re-run.

-- Cold protected bootstrap: non-admin membership check.
CREATE INDEX CONCURRENTLY "members_org_user_deleted_idx"
ON "members"("organizationId", "userId", "isDeleted");

-- Cold protected bootstrap: organization brand list ordered by label.
CREATE INDEX CONCURRENTLY "brands_org_deleted_label_idx"
ON "brands"("organizationId", "isDeleted", "label");

-- Posts list hot paths: tenant/status/platform filters with created-at ordering.
CREATE INDEX CONCURRENTLY "posts_org_deleted_status_created_at_idx"
ON "posts"("organizationId", "isDeleted", "status", "createdAt" DESC);

CREATE INDEX CONCURRENTLY "posts_brand_deleted_status_created_at_idx"
ON "posts"("brandId", "isDeleted", "status", "createdAt" DESC);

CREATE INDEX CONCURRENTLY "posts_brand_credential_deleted_created_at_idx"
ON "posts"("brandId", "credentialId", "isDeleted", "createdAt" DESC);

CREATE INDEX CONCURRENTLY "posts_brand_platform_deleted_created_at_idx"
ON "posts"("brandId", "platform", "isDeleted", "createdAt" DESC);

-- Overview bootstrap: agent-run stats by status/completion window.
CREATE INDEX CONCURRENTLY "agent_runs_org_deleted_status_completed_at_idx"
ON "agent_runs"("organizationId", "isDeleted", "status", "completedAt" DESC);

-- Content run list/detail hot paths.
CREATE INDEX CONCURRENTLY "content_runs_org_brand_deleted_created_at_idx"
ON "content_runs"("organizationId", "brandId", "isDeleted", "createdAt" DESC);

CREATE INDEX CONCURRENTLY "content_runs_org_brand_deleted_status_created_at_idx"
ON "content_runs"("organizationId", "brandId", "isDeleted", "status", "createdAt" DESC);

-- Activity feeds: deleted filter with created-at ordering at platform/org/brand/user scopes.
CREATE INDEX CONCURRENTLY "activities_deleted_created_at_idx"
ON "activities"("isDeleted", "createdAt" DESC);

CREATE INDEX CONCURRENTLY "activities_org_deleted_created_at_idx"
ON "activities"("organizationId", "isDeleted", "createdAt" DESC);

CREATE INDEX CONCURRENTLY "activities_brand_deleted_created_at_idx"
ON "activities"("brandId", "isDeleted", "createdAt" DESC);

CREATE INDEX CONCURRENTLY "activities_user_deleted_created_at_idx"
ON "activities"("userId", "isDeleted", "createdAt" DESC);

-- Overview review inbox and batch lists.
CREATE INDEX CONCURRENTLY "batches_org_deleted_created_at_idx"
ON "batches"("organizationId", "isDeleted", "createdAt" DESC);

CREATE INDEX CONCURRENTLY "batches_org_brand_deleted_created_at_idx"
ON "batches"("organizationId", "brandId", "isDeleted", "createdAt" DESC);

CREATE INDEX CONCURRENTLY "batches_org_deleted_status_created_at_idx"
ON "batches"("organizationId", "isDeleted", "status", "createdAt" DESC);
