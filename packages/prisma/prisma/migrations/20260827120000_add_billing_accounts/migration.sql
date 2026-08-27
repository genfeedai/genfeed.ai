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

WITH customer_candidates AS (
  SELECT
    o."id" AS "organizationId",
    COUNT(c."id") AS "activeCustomerCount",
    MAX(c."stripeCustomerId") AS "stripeCustomerId"
  FROM "organizations" o
  LEFT JOIN "customers" c
    ON c."organizationId" = o."id" AND c."isDeleted" = false
  WHERE o."isDeleted" = false
  GROUP BY o."id"
), safe_customer_identities AS (
  SELECT
    candidate."organizationId",
    CASE
      WHEN candidate."activeCustomerCount" = 1
        AND candidate."stripeCustomerId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "customers" other
          WHERE other."stripeCustomerId" = candidate."stripeCustomerId"
            AND other."organizationId" <> candidate."organizationId"
            AND other."isDeleted" = false
        )
      THEN candidate."stripeCustomerId"
      ELSE NULL
    END AS "stripeCustomerId"
  FROM customer_candidates candidate
)
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
LEFT JOIN safe_customer_identities c
  ON c."organizationId" = o."id"
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

-- Online indexes are created outside this transactional migration by the
-- follow-up migration 20260827150000_billing_account_online_indexes.

ALTER TABLE "billing_account_members"
  ADD CONSTRAINT "billing_account_members_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "billing_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "billing_account_members"
  ADD CONSTRAINT "billing_account_members_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "billing_account_organizations"
  ADD CONSTRAINT "billing_account_organizations_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "billing_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "billing_account_organizations"
  ADD CONSTRAINT "billing_account_organizations_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "credit_reservations"
  ADD CONSTRAINT "credit_reservations_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "billing_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "credit_reservations"
  ADD CONSTRAINT "credit_reservations_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "billing_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "billing_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "billing_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

ALTER TABLE "credit_balances"
  ADD CONSTRAINT "credit_balances_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "billing_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

ALTER TABLE "credit_transactions"
  ADD CONSTRAINT "credit_transactions_billingAccountId_fkey"
  FOREIGN KEY ("billingAccountId") REFERENCES "billing_accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

ALTER TABLE "credit_transactions"
  ADD CONSTRAINT "credit_transactions_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "credit_reservations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
