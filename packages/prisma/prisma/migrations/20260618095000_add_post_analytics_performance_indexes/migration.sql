-- Add dashboard-oriented indexes for post analytics date-window aggregations.
CREATE INDEX "post_analytics_date_idx" ON "post_analytics"("date" DESC);
CREATE INDEX "post_analytics_organizationId_date_idx" ON "post_analytics"("organizationId", "date" DESC);
CREATE INDEX "post_analytics_brandId_date_idx" ON "post_analytics"("brandId", "date" DESC);
CREATE INDEX "post_analytics_platform_date_idx" ON "post_analytics"("platform", "date" DESC);
CREATE INDEX "post_analytics_postId_date_idx" ON "post_analytics"("postId", "date" DESC);
