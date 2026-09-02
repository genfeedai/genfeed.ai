-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "brief" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "idempotencyKey" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_organizationId_idempotencyKey_key" ON "campaigns"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "campaigns_org_brand_status_idx" ON "campaigns"("organizationId", "isDeleted", "brandId", "status", "createdAt" DESC, "id");

-- AlterTable
ALTER TABLE "posts" ADD COLUMN "campaignId" TEXT;

-- AlterTable
ALTER TABLE "post_groups" ADD COLUMN "campaignId" TEXT;

-- CreateIndex
CREATE INDEX "posts_org_campaign_created_idx" ON "posts"("organizationId", "campaignId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "post_groups_org_campaign_schedule_idx" ON "post_groups"("organizationId", "campaignId", "isDeleted", "scheduledAt" ASC);

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_brandId_organizationId_fkey" FOREIGN KEY ("brandId", "organizationId") REFERENCES "brands"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_groups" ADD CONSTRAINT "post_groups_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
