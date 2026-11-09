-- Paid creator subscriptions (#9717): a creator's monthly plan in credits and
-- the readers paying it.

-- CreateEnum
CREATE TYPE "CreatorSubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'ENDED');

-- CreateTable
CREATE TABLE "creator_subscription_plans" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "monthlyPriceCredits" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creator_subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "payerOrganizationId" TEXT NOT NULL,
    "payerUserId" TEXT NOT NULL,
    "priceCredits" INTEGER NOT NULL,
    "status" "CreatorSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "pastDueSince" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "firstChargeTransferId" TEXT NOT NULL,
    "lastChargeTransferId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "creator_subscription_plans_brandId_key" ON "creator_subscription_plans"("brandId");

-- CreateIndex
CREATE INDEX "creator_subscription_plans_organizationId_isDeleted_idx" ON "creator_subscription_plans"("organizationId", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "creator_subscriptions_firstChargeTransferId_key" ON "creator_subscriptions"("firstChargeTransferId");

-- CreateIndex
CREATE INDEX "creator_subscriptions_organizationId_brandId_status_isDelet_idx" ON "creator_subscriptions"("organizationId", "brandId", "status", "isDeleted");

-- CreateIndex
CREATE INDEX "creator_subscriptions_payerUserId_isDeleted_idx" ON "creator_subscriptions"("payerUserId", "isDeleted");

-- CreateIndex
CREATE INDEX "creator_subscriptions_status_currentPeriodEnd_idx" ON "creator_subscriptions"("status", "currentPeriodEnd");

-- AddForeignKey
ALTER TABLE "creator_subscription_plans" ADD CONSTRAINT "creator_subscription_plans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_subscription_plans" ADD CONSTRAINT "creator_subscription_plans_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_subscriptions" ADD CONSTRAINT "creator_subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_subscriptions" ADD CONSTRAINT "creator_subscriptions_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_subscriptions" ADD CONSTRAINT "creator_subscriptions_payerOrganizationId_fkey" FOREIGN KEY ("payerOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_subscriptions" ADD CONSTRAINT "creator_subscriptions_payerUserId_fkey" FOREIGN KEY ("payerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One live (ACTIVE or PAST_DUE) subscription per reader and creator brand.
CREATE UNIQUE INDEX "creator_subscriptions_live_payer_brand_key" ON "creator_subscriptions"("brandId", "payerUserId") WHERE "isDeleted" = false AND "status" IN ('ACTIVE', 'PAST_DUE');
