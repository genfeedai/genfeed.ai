-- Keep index construction out of the schema/backfill transaction so existing
-- billing traffic is not blocked while PostgreSQL scans populated tables.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "billing_accounts_stripeCustomerId_active_key"
  ON "billing_accounts" ("stripeCustomerId")
  WHERE "stripeCustomerId" IS NOT NULL AND "isDeleted" = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "billing_accounts_status_isDeleted_idx"
  ON "billing_accounts" ("status", "isDeleted");
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "billing_account_members_billingAccountId_userId_key"
  ON "billing_account_members" ("billingAccountId", "userId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "billing_account_members_userId_isDeleted_idx"
  ON "billing_account_members" ("userId", "isDeleted");
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "billing_account_organizations_active_org_key"
  ON "billing_account_organizations" ("organizationId")
  WHERE "status" = 'LINKED' AND "isDeleted" = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "billing_account_organizations_account_status_idx"
  ON "billing_account_organizations" ("billingAccountId", "status", "isDeleted");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "billing_account_organizations_org_status_idx"
  ON "billing_account_organizations" ("organizationId", "status", "isDeleted");
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "credit_reservations_idempotencyKey_key"
  ON "credit_reservations" ("idempotencyKey");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "credit_reservations_account_status_idx"
  ON "credit_reservations" ("billingAccountId", "status", "isDeleted");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "credit_reservations_org_status_idx"
  ON "credit_reservations" ("organizationId", "status", "isDeleted");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "credit_reservations_status_expiresAt_idx"
  ON "credit_reservations" ("status", "expiresAt");
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "credit_balances_billingAccountId_active_key"
  ON "credit_balances" ("billingAccountId")
  WHERE "billingAccountId" IS NOT NULL AND "isDeleted" = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "credit_balances_billingAccountId_isDeleted_idx"
  ON "credit_balances" ("billingAccountId", "isDeleted");
DROP INDEX CONCURRENTLY IF EXISTS "credit_balances_organizationId_key";
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "credit_balances_organizationId_active_key"
  ON "credit_balances" ("organizationId")
  WHERE "organizationId" IS NOT NULL AND "isDeleted" = false;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "credit_transactions_idempotencyKey_active_key"
  ON "credit_transactions" ("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL AND "isDeleted" = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "credit_transactions_billingAccountId_created_idx"
  ON "credit_transactions" ("billingAccountId", "isDeleted", "createdAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "credit_transactions_reservationId_idx"
  ON "credit_transactions" ("reservationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "organizations_billingAccountId_idx"
  ON "organizations" ("billingAccountId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "customers_billingAccountId_isDeleted_idx"
  ON "customers" ("billingAccountId", "isDeleted");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "subscriptions_billingAccountId_isDeleted_idx"
  ON "subscriptions" ("billingAccountId", "isDeleted");
