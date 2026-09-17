-- CreateIndex
CREATE INDEX "outlier_post_performances_org_brand_ratio_idx" ON "outlier_post_performances"("organizationId", "brandId", "isDeleted", "outlierRatio");

-- CreateIndex
CREATE INDEX "outlier_post_performances_org_platform_account_tier_idx" ON "outlier_post_performances"("organizationId", "platform", "accountId", "outlierTier", "isDeleted");
