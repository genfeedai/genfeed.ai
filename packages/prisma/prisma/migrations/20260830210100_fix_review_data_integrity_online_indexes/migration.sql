-- Keep index construction out of the schema/backfill transaction so normal
-- writes continue while PostgreSQL scans the affected production tables.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "subscription_attributions_org_stripe_subscription_key"
  ON "subscription_attributions"("organizationId", "stripeSubscriptionId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "posts_org_credential_status_scheduled_idx"
  ON "posts"("organizationId", "credentialId", "isDeleted", "status", "scheduledDate");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "posts_org_credential_status_published_idx"
  ON "posts"("organizationId", "credentialId", "isDeleted", "status", "publishedAt");
