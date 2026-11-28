-- Weekly read of tracked creators (#11642). Expand only: nullable or defaulted
-- columns and one new, empty table.

ALTER TABLE "outlier_creators"
  ADD COLUMN IF NOT EXISTS "lastReadAttemptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "missedReads" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "readClaimId" TEXT,
  ADD COLUMN IF NOT EXISTS "readClaimedUntil" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "outlier_creators_platform_status_lastReadAttemptAt_idx"
  ON "outlier_creators" ("platform", "status", "lastReadAttemptAt");

CREATE TABLE IF NOT EXISTS "outlier_read_budgets" (
  "id" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "weekStart" TIMESTAMP(3) NOT NULL,
  "claimed" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "outlier_read_budgets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "outlier_read_budgets_claimed_check" CHECK ("claimed" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "outlier_read_budgets_platform_weekStart_key"
  ON "outlier_read_budgets" ("platform", "weekStart");

ALTER TABLE "platform_settings"
  ADD COLUMN IF NOT EXISTS "outlierLibraryInstagramOrganizationId" TEXT,
  ADD COLUMN IF NOT EXISTS "outlierLibraryInstagramBrandId" TEXT,
  ADD COLUMN IF NOT EXISTS "outlierLibraryInstagramCredentialId" TEXT;
