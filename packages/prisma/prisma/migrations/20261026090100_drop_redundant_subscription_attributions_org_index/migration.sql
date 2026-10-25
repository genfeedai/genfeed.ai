-- Prefix of the unique (organizationId, stripeSubscriptionId) index.
-- Keep this as the migration's only statement.
DROP INDEX CONCURRENTLY IF EXISTS "subscription_attributions_organizationId_idx";
