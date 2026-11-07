-- Several affiliate codes per member (#9643). A member could hold exactly one
-- code per billing account; now they can create more, named or per brand.
--
-- Every existing code is the owner's first random code, so it becomes the
-- primary one. The partial unique index keeps "one primary per owner and
-- billing account" for the get-or-create path that races on it.
DROP INDEX "referral_codes_owner_billing_account_key";

ALTER TABLE "referral_codes"
  ADD COLUMN "brandId" TEXT,
  ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

UPDATE "referral_codes" SET "isPrimary" = true;

CREATE UNIQUE INDEX "referral_codes_primary_per_owner_key"
  ON "referral_codes"("ownerUserId", "rewardBillingAccountId")
  WHERE "isPrimary" = true;

CREATE INDEX "referral_codes_ownerUserId_rewardBillingAccountId_isDeleted_idx"
  ON "referral_codes"("ownerUserId", "rewardBillingAccountId", "isDeleted");
CREATE INDEX "referral_codes_brandId_isDeleted_idx"
  ON "referral_codes"("brandId", "isDeleted");

ALTER TABLE "referral_codes"
  ADD CONSTRAINT "referral_codes_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "brands"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
