-- BYOK is a paid-subscription feature (#5254). The metered BYOK platform fee
-- (free threshold, monthly invoice, rollover, past-due suspension) and the
-- free `byok` subscription tier are retired.

-- A cancelled subscription used to land on the `byok` tier; it is the free
-- tier now.
UPDATE "organization_settings"
SET "subscriptionTier" = 'free'
WHERE "subscriptionTier" = 'byok';

UPDATE "billing_accounts"
SET "planTier" = 'free'
WHERE "planTier" = 'byok';

-- AlterTable
ALTER TABLE "organization_settings"
  DROP COLUMN "byokBillingRollover",
  DROP COLUMN "byokBillingStatus",
  DROP COLUMN "byokFreeThresholdOverride";

-- DropEnum
DROP TYPE "ByokBillingStatus";
