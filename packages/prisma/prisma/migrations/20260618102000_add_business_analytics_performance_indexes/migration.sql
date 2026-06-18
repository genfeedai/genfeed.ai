-- Business analytics credit totals and daily/source reporting.
CREATE INDEX "credit_transactions_source_deleted_created_at_idx"
ON "credit_transactions"("source", "isDeleted", "createdAt" DESC);

-- Business analytics credit leaderboards grouped by organization.
CREATE INDEX "credit_transactions_source_deleted_org_created_at_idx"
ON "credit_transactions"("source", "isDeleted", "organizationId", "createdAt" DESC);

-- Business analytics ingredient totals and daily reporting.
CREATE INDEX "ingredients_deleted_created_at_idx"
ON "ingredients"("isDeleted", "createdAt" DESC);

-- Business analytics ingredient category breakdowns.
CREATE INDEX "ingredients_deleted_category_created_at_idx"
ON "ingredients"("isDeleted", "category", "createdAt" DESC);

-- Business analytics ingredient leaderboards grouped by organization.
CREATE INDEX "ingredients_deleted_org_created_at_idx"
ON "ingredients"("isDeleted", "organizationId", "createdAt" DESC);
