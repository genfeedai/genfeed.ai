-- CreateTable
CREATE TABLE "campaign_paid_activations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "postIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'paused',
    "externalCampaignId" TEXT,
    "externalAdSetId" TEXT,
    "externalAdId" TEXT,
    "currency" TEXT,
    "failureReason" TEXT,
    "idempotencyKey" TEXT,
    "spendApprovedAt" TIMESTAMP(3),
    "spendApprovedByUserId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_paid_activations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campaign_paid_activations_org_idempotency_key" ON "campaign_paid_activations"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "campaign_paid_activations_org_campaign_idx" ON "campaign_paid_activations"("organizationId", "isDeleted", "campaignId", "createdAt" DESC, "id");

-- AddForeignKey
ALTER TABLE "campaign_paid_activations" ADD CONSTRAINT "campaign_paid_activations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_paid_activations" ADD CONSTRAINT "campaign_paid_activations_brandId_organizationId_fkey" FOREIGN KEY ("brandId", "organizationId") REFERENCES "brands"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_paid_activations" ADD CONSTRAINT "campaign_paid_activations_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_paid_activations" ADD CONSTRAINT "campaign_paid_activations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_paid_activations" ADD CONSTRAINT "campaign_paid_activations_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "credentials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
