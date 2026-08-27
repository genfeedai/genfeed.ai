-- Billing accounts own Stripe identity, subscriptions, and the credit wallet
-- independently of any one organization (#3612 / #3621 / #3625).
--
-- This migration is schema + an idempotent 1:1 local backfill. It does not
-- contact Stripe, cancel subscriptions, or merge Scale wallets. Ambiguous
-- live identities stay on the child org customer row for #3614 / #3616.

CREATE TYPE "BillingAccountStatus" AS ENUM (
  'UNPROVISIONED',
  'ACTIVE',
  'PAST_DUE',
  'CANCELLED',
  'STALE'
);

CREATE TYPE "BillingAccountMemberRole" AS ENUM (
  'OWNER',
  'ADMINISTRATOR',
  'VIEWER'
);

CREATE TYPE "BillingAccountOrganizationStatus" AS ENUM (
  'LINKED',
  'DETACHED'
);

CREATE TYPE "CreditReservationStatus" AS ENUM (
  'RESERVED',
  'SETTLED',
  'RELEASED',
  'EXPIRED'
);

CREATE TABLE "billing_accounts" (
  "id" TEXT NOT NULL,
  "label" TEXT,
  "stripeCustomerId" TEXT,
  "status" "BillingAccountStatus" NOT NULL DEFAULT 'UNPROVISIONED',
  "planTier" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_account_members" (
  "id" TEXT NOT NULL,
  "billingAccountId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "BillingAccountMemberRole" NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_account_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_account_organizations" (
  "id" TEXT NOT NULL,
  "billingAccountId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "status" "BillingAccountOrganizationStatus" NOT NULL DEFAULT 'LINKED',
  "monthlyBudgetCredits" DOUBLE PRECISION,
  "budgetPolicy" TEXT,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "detachedAt" TIMESTAMP(3),
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_account_organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "credit_reservations" (
  "id" TEXT NOT NULL,
  "billingAccountId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "amount" DOUBLE PRECISION NOT NULL,
  "settledAmount" DOUBLE PRECISION,
  "status" "CreditReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "workloadType" TEXT,
  "workloadId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_reservations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "billingAccountId" TEXT;

ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "billingAccountId" TEXT;

ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "billingAccountId" TEXT;

ALTER TABLE "credit_balances"
  ADD COLUMN IF NOT EXISTS "billingAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "heldAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "credit_balances"
  ALTER COLUMN "organizationId" DROP NOT NULL;

ALTER TABLE "credit_transactions"
  ADD COLUMN IF NOT EXISTS "billingAccountId" TEXT,
  ADD COLUMN IF NOT EXISTS "actorUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "reservationId" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

INSERT INTO "billing_accounts" (
  "id",
  "label",
  "stripeCustomerId",
  "status",
  "planTier",
  "isDeleted",
  "createdAt",
  "updatedAt"
)
SELECT
  'ba_' || o."id",
  o."label",
  c."stripeCustomerId",
  CASE
    WHEN c."stripeCustomerId" IS NULL THEN 'UNPROVISIONED'::"BillingAccountStatus"
    ELSE 'ACTIVE'::"BillingAccountStatus"
  END,
  os."subscriptionTier",
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "organizations" o
LEFT JOIN "customers" c
  ON c."organizationId" = o."id" AND c."isDeleted" = false
LEFT JOIN "organization_settings" os
  ON os."organizationId" = o."id"
WHERE o."isDeleted" = false
  AND o."billingAccountId" IS NULL
ON CONFLICT ("id") DO NOTHING;

UPDATE "organizations" o
SET "billingAccountId" = 'ba_' || o."id",
    "updatedAt" = CURRENT_TIMESTAMP
WHERE o."isDeleted" = false
  AND o."billingAccountId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "billing_accounts" ba WHERE ba."id" = 'ba_' || o."id"
  );

INSERT INTO "billing_account_members" (
  "id",
  "billingAccountId",
  "userId",
  "role",
  "isDeleted",
  "createdAt",
  "updatedAt"
)
SELECT
  'bam_' || o."id",
  o."billingAccountId",
  o."userId",
  'OWNER'::"BillingAccountMemberRole",
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "organizations" o
WHERE o."isDeleted" = false
  AND o."billingAccountId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "billing_account_members" m
    WHERE m."billingAccountId" = o."billingAccountId"
      AND m."userId" = o."userId"
  );

INSERT INTO "billing_account_organizations" (
  "id",
  "billingAccountId",
  "organizationId",
  "status",
  "linkedAt",
  "isDeleted",
  "createdAt",
  "updatedAt"
)
SELECT
  'bao_' || o."id",
  o."billingAccountId",
  o."id",
  'LINKED'::"BillingAccountOrganizationStatus",
  CURRENT_TIMESTAMP,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "organizations" o
WHERE o."isDeleted" = false
  AND o."billingAccountId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "billing_account_organizations" link
    WHERE link."organizationId" = o."id"
      AND link."status" = 'LINKED'
      AND link."isDeleted" = false
  );

UPDATE "customers" c
SET "billingAccountId" = o."billingAccountId"
FROM "organizations" o
WHERE c."organizationId" = o."id"
  AND c."billingAccountId" IS NULL
  AND o."billingAccountId" IS NOT NULL;

UPDATE "subscriptions" s
SET "billingAccountId" = o."billingAccountId"
FROM "organizations" o
WHERE s."organizationId" = o."id"
  AND s."billingAccountId" IS NULL
  AND o."billingAccountId" IS NOT NULL;

UPDATE "credit_balances" b
SET "billingAccountId" = o."billingAccountId"
FROM "organizations" o
WHERE b."organizationId" = o."id"
  AND b."billingAccountId" IS NULL
  AND o."billingAccountId" IS NOT NULL;

UPDATE "credit_transactions" t
SET "billingAccountId" = o."billingAccountId"
FROM "organizations" o
WHERE t."organizationId" = o."id"
  AND t."billingAccountId" IS NULL
  AND o."billingAccountId" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "billing_accounts_stripeCustomerId_active_key"
  ON "billing_accounts" ("stripeCustomerId")
  WHERE "stripeCustomerId" IS NOT NULL AND "isDeleted" = false;

CREATE INDEX IF NOT EXISTS "billing_accounts_status_isDeleted_idx"
  ON "billing_accounts" ("status", "isDeleted");

CREATE UNIQUE INDEX IF NOT EXISTS "billing_account_members_billingAccountId_userId_key"
  ON "billing_account_members" ("billingAccountId", "userId");

CREATE INDEX IF NOT EXISTS "billing_account_members_userId_isDeleted_idx"
  ON "billing_account_members" ("userId", "isDeleted");

CREATE UNIQUE INDEX IF NOT EXISTS "billing_account_organizations_active_org_key"
  ON "billing_account_organizations" ("organizationId")
  WHERE "status" = 'LINKED' AND "isDeleted" = false;

CREATE INDEX IF NOT EXISTS "billing_account_organizations_account_status_idx"
  ON "billing_account_organizations" ("billingAccountId", "status", "isDeleted");

CREATE INDEX IF NOT EXISTS "billing_account_organizations_org_status_idx"
  ON "billing_account_organizations" ("organizationId", "status", "isDeleted");

CREATE UNIQUE INDEX IF NOT EXISTS "credit_reservations_idempotencyKey_key"
  ON "credit_reservations" ("idempotencyKey");

CREATE INDEX IF NOT EXISTS "credit_reservations_account_status_idx"
  ON "credit_reservations" ("billingAccountId", "status", "isDeleted");

CREATE INDEX IF NOT EXISTS "credit_reservations_org_status_idx"
  ON "credit_reservations" ("organizationId", "status", "isDeleted");

CREATE INDEX IF NOT EXISTS "credit_reservations_status_expiresAt_idx"
  ON "credit_reservations" ("status", "expiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "credit_balances_billingAccountId_active_key"
  ON "credit_balances" ("billingAccountId")
  WHERE "billingAccountId" IS NOT NULL AND "isDeleted" = false;

CREATE INDEX IF NOT EXISTS "credit_balances_billingAccountId_isDeleted_idx"
  ON "credit_balances" ("billingAccountId", "isDeleted");

CREATE UNIQUE INDEX IF NOT EXISTS "credit_transactions_idempotencyKey_active_key"
  ON "credit_transactions" ("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL AND "isDeleted" = false;

CREATE INDEX IF NOT EXISTS "credit_transactions_billingAccountId_created_idx"
  ON "credit_transactions" ("billingAccountId", "isDeleted", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "credit_transactions_reservationId_idx"
  ON "credit_transactions" ("reservationId");

CREATE INDEX IF NOT EXISTS "organizations_billingAccountId_idx"
  ON "organizations" ("billingAccountId");

CREATE INDEX IF NOT EXISTS "customers_billingAccountId_isDeleted_idx"
  ON "customers" ("billingAccountId", "isDeleted");

CREATE INDEX IF NOT EXISTS "subscriptions_billingAccountId_isDeleted_idx"
  ON "subscriptions" ("billingAccountId", "isDeleted");

ALTER TABLE "billing_account_members"
  ADD CONSTRAINT "billing_account_members_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "billing_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "billing_account_members"
  ADD CONSTRAINT "billing_account_members_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "billing_account_organizations"
  ADD CONSTRAINT "billing_account_organizations_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "billing_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "billing_account_organizations"
  ADD CONSTRAINT "billing_account_organizations_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_reservations"
  ADD CONSTRAINT "credit_reservations_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "billing_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_reservations"
  ADD CONSTRAINT "credit_reservations_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "billing_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "billing_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "billing_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "credit_balances"
  ADD CONSTRAINT "credit_balances_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "billing_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "credit_transactions"
  ADD CONSTRAINT "credit_transactions_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "billing_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "credit_transactions"
  ADD CONSTRAINT "credit_transactions_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "credit_reservations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
