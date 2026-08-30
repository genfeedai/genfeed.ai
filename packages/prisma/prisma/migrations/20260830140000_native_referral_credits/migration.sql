CREATE TYPE "ReferralStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'EXPIRED');

CREATE TYPE "ReferralRewardStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'GRANTED',
  'CANCELLED',
  'REVERSED',
  'FAILED'
);

CREATE TABLE "referral_codes" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "rewardBillingAccountId" TEXT NOT NULL,
  "rewardOrganizationId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "referrals" (
  "id" TEXT NOT NULL,
  "codeId" TEXT NOT NULL,
  "referrerBillingAccountId" TEXT NOT NULL,
  "referredBillingAccountId" TEXT NOT NULL,
  "referrerOrganizationId" TEXT NOT NULL,
  "referredOrganizationId" TEXT NOT NULL,
  "status" "ReferralStatus" NOT NULL DEFAULT 'ACTIVE',
  "attributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rewardEndsAt" TIMESTAMP(3) NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "referral_rewards" (
  "id" TEXT NOT NULL,
  "referralId" TEXT NOT NULL,
  "referralCodeId" TEXT NOT NULL,
  "stripeCheckoutSessionId" TEXT NOT NULL,
  "stripePaymentIntentId" TEXT,
  "grossAmountCents" INTEGER NOT NULL,
  "netAmountCents" INTEGER NOT NULL,
  "purchasedCredits" INTEGER NOT NULL,
  "refundedAmountCents" INTEGER NOT NULL DEFAULT 0,
  "rewardCredits" INTEGER NOT NULL,
  "reversedCredits" INTEGER NOT NULL DEFAULT 0,
  "status" "ReferralRewardStatus" NOT NULL DEFAULT 'PENDING',
  "eligibleAt" TIMESTAMP(3) NOT NULL,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lockedAt" TIMESTAMP(3),
  "grantedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "reversedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "grantTransactionId" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "referral_rewards_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "referral_rewards_amount_check" CHECK (
    "grossAmountCents" >= 0
    AND "netAmountCents" >= 0
    AND "netAmountCents" <= "grossAmountCents"
    AND "purchasedCredits" >= 0
    AND "refundedAmountCents" >= 0
    AND "rewardCredits" >= 0
    AND "reversedCredits" >= 0
    AND "reversedCredits" <= "rewardCredits"
  ),
  CONSTRAINT "referral_rewards_failure_reason_length_check" CHECK (
    "failureReason" IS NULL OR char_length("failureReason") <= 500
  )
);

CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");
CREATE UNIQUE INDEX "referral_codes_owner_billing_account_key" ON "referral_codes"("ownerUserId", "rewardBillingAccountId");
CREATE INDEX "referral_codes_rewardBillingAccountId_isDeleted_idx" ON "referral_codes"("rewardBillingAccountId", "isDeleted");
CREATE INDEX "referral_codes_rewardOrganizationId_isDeleted_idx" ON "referral_codes"("rewardOrganizationId", "isDeleted");

CREATE UNIQUE INDEX "referrals_referredBillingAccountId_active_key"
  ON "referrals"("referredBillingAccountId")
  WHERE "isDeleted" = false;
CREATE INDEX "referrals_codeId_status_isDeleted_idx" ON "referrals"("codeId", "status", "isDeleted");
CREATE INDEX "referrals_referrerBillingAccountId_status_isDeleted_idx" ON "referrals"("referrerBillingAccountId", "status", "isDeleted");
CREATE INDEX "referrals_referredOrganizationId_isDeleted_idx" ON "referrals"("referredOrganizationId", "isDeleted");

CREATE UNIQUE INDEX "referral_rewards_stripeCheckoutSessionId_key" ON "referral_rewards"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX "referral_rewards_grantTransactionId_key" ON "referral_rewards"("grantTransactionId");
CREATE INDEX "referral_rewards_status_nextAttemptAt_isDeleted_idx" ON "referral_rewards"("status", "nextAttemptAt", "isDeleted");
CREATE INDEX "referral_rewards_stripePaymentIntentId_isDeleted_idx" ON "referral_rewards"("stripePaymentIntentId", "isDeleted");
CREATE INDEX "referral_rewards_referralId_createdAt_idx" ON "referral_rewards"("referralId", "createdAt" DESC);
CREATE INDEX "referral_rewards_referralCodeId_createdAt_idx" ON "referral_rewards"("referralCodeId", "createdAt" DESC);
CREATE INDEX "referral_rewards_referralCodeId_status_isDeleted_idx" ON "referral_rewards"("referralCodeId", "status", "isDeleted");

ALTER TABLE "referral_codes"
  ADD CONSTRAINT "referral_codes_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "referral_codes_rewardBillingAccountId_fkey"
  FOREIGN KEY ("rewardBillingAccountId") REFERENCES "billing_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "referral_codes_rewardOrganizationId_fkey"
  FOREIGN KEY ("rewardOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "referrals"
  ADD CONSTRAINT "referrals_codeId_fkey"
  FOREIGN KEY ("codeId") REFERENCES "referral_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "referrals_referrerBillingAccountId_fkey"
  FOREIGN KEY ("referrerBillingAccountId") REFERENCES "billing_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "referrals_referredBillingAccountId_fkey"
  FOREIGN KEY ("referredBillingAccountId") REFERENCES "billing_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "referrals_referrerOrganizationId_fkey"
  FOREIGN KEY ("referrerOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "referrals_referredOrganizationId_fkey"
  FOREIGN KEY ("referredOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "referral_rewards"
  ADD CONSTRAINT "referral_rewards_referralId_fkey"
  FOREIGN KEY ("referralId") REFERENCES "referrals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "referral_rewards_referralCodeId_fkey"
  FOREIGN KEY ("referralCodeId") REFERENCES "referral_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "referral_rewards_grantTransactionId_fkey"
  FOREIGN KEY ("grantTransactionId") REFERENCES "credit_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
