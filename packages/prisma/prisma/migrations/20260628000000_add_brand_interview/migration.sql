-- CreateEnum
CREATE TYPE "brand_interview_status" AS ENUM ('in_progress', 'completed', 'abandoned');

-- CreateTable
CREATE TABLE "brand_interviews" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "brand_interview_status" NOT NULL DEFAULT 'in_progress',
    "answeredFields" JSONB NOT NULL DEFAULT '{}',
    "askedFieldKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currentFieldKey" TEXT,
    "completenessBefore" INTEGER NOT NULL DEFAULT 0,
    "completenessAfter" INTEGER,
    "creditsCharged" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_interviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brand_interviews_organizationId_isDeleted_idx" ON "brand_interviews"("organizationId", "isDeleted");

-- CreateIndex
CREATE INDEX "brand_interviews_brandId_status_idx" ON "brand_interviews"("brandId", "status");

-- CreateIndex
-- Partial unique index: at most one active (in-progress, non-deleted) interview per brand.
-- Enforces idempotency of BrandInterviewService.start() at the DB level so concurrent
-- starts cannot create two sessions / double-charge. Not expressible in the Prisma schema.
CREATE UNIQUE INDEX "brand_interview_active_unique" ON "brand_interviews"("brandId") WHERE "status" = 'in_progress' AND "isDeleted" = false;

-- AddForeignKey
ALTER TABLE "brand_interviews" ADD CONSTRAINT "brand_interviews_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_interviews" ADD CONSTRAINT "brand_interviews_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_interviews" ADD CONSTRAINT "brand_interviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
