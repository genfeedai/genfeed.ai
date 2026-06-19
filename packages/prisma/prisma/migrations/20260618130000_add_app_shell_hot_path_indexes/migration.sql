-- Cold protected bootstrap: non-admin membership check.
CREATE INDEX "members_org_user_deleted_idx"
ON "members"("organizationId", "userId", "isDeleted");

-- Cold protected bootstrap: organization brand list ordered by label.
CREATE INDEX "brands_org_deleted_label_idx"
ON "brands"("organizationId", "isDeleted", "label");

-- Posts list hot paths: tenant/status/platform filters with created-at ordering.
CREATE INDEX "posts_org_deleted_status_created_at_idx"
ON "posts"("organizationId", "isDeleted", "status", "createdAt" DESC);

CREATE INDEX "posts_brand_deleted_status_created_at_idx"
ON "posts"("brandId", "isDeleted", "status", "createdAt" DESC);

CREATE INDEX "posts_brand_credential_deleted_created_at_idx"
ON "posts"("brandId", "credentialId", "isDeleted", "createdAt" DESC);

CREATE INDEX "posts_brand_platform_deleted_created_at_idx"
ON "posts"("brandId", "platform", "isDeleted", "createdAt" DESC);

-- Overview bootstrap: agent-run stats by status/completion window.
CREATE INDEX "agent_runs_org_deleted_status_completed_at_idx"
ON "agent_runs"("organizationId", "isDeleted", "status", "completedAt" DESC);

-- Content run list/detail hot paths.
CREATE INDEX "content_runs_org_brand_deleted_created_at_idx"
ON "content_runs"("organizationId", "brandId", "isDeleted", "createdAt" DESC);

CREATE INDEX "content_runs_org_brand_deleted_status_created_at_idx"
ON "content_runs"("organizationId", "brandId", "isDeleted", "status", "createdAt" DESC);

-- Activity feeds: deleted filter with created-at ordering at platform/org/brand/user scopes.
CREATE INDEX "activities_deleted_created_at_idx"
ON "activities"("isDeleted", "createdAt" DESC);

CREATE INDEX "activities_org_deleted_created_at_idx"
ON "activities"("organizationId", "isDeleted", "createdAt" DESC);

CREATE INDEX "activities_brand_deleted_created_at_idx"
ON "activities"("brandId", "isDeleted", "createdAt" DESC);

CREATE INDEX "activities_user_deleted_created_at_idx"
ON "activities"("userId", "isDeleted", "createdAt" DESC);

-- Overview review inbox and batch lists.
CREATE INDEX "batches_org_deleted_created_at_idx"
ON "batches"("organizationId", "isDeleted", "createdAt" DESC);

CREATE INDEX "batches_org_brand_deleted_created_at_idx"
ON "batches"("organizationId", "brandId", "isDeleted", "createdAt" DESC);

CREATE INDEX "batches_org_deleted_status_created_at_idx"
ON "batches"("organizationId", "isDeleted", "status", "createdAt" DESC);
