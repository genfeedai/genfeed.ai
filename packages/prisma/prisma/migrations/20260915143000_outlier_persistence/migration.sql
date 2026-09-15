-- AlterTable
ALTER TABLE "post_analytics" ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPinned" BOOLEAN,
ADD COLUMN     "isPromoted" BOOLEAN;

-- CreateTable
CREATE TABLE "outlier_configurations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "windowSize" INTEGER NOT NULL DEFAULT 20,
    "minimumSampleSize" INTEGER NOT NULL DEFAULT 5,
    "outlierThreshold" DOUBLE PRECISION NOT NULL DEFAULT 3,
    "breakoutThreshold" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "maturityHoursByPlatform" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outlier_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlier_baseline_snapshots" (
    "inputFingerprint" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "medianViews" DOUBLE PRECISION,
    "sampleSize" INTEGER NOT NULL,
    "windowSize" INTEGER NOT NULL,
    "minimumSampleSize" INTEGER NOT NULL,
    "maturityMs" DOUBLE PRECISION NOT NULL,
    "outlierThreshold" DOUBLE PRECISION NOT NULL,
    "breakoutThreshold" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "exclusions" JSONB NOT NULL,
    "unknownEligibility" JSONB NOT NULL,
    "contributorIds" TEXT[],
    "idempotencyKey" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outlier_baseline_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlier_post_performances" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "postId" TEXT,
    "sourcePostId" TEXT,
    "logicalPostId" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "views" DOUBLE PRECISION,
    "publishedAt" TIMESTAMP(3),
    "outlierRatio" DOUBLE PRECISION,
    "outlierTier" TEXT,
    "baselineSnapshotId" TEXT NOT NULL,
    "isContributor" BOOLEAN NOT NULL,
    "eligibility" TEXT NOT NULL,
    "exclusionReasons" JSONB NOT NULL,
    "isPinnedUnknown" BOOLEAN NOT NULL,
    "isPromotedUnknown" BOOLEAN NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outlier_post_performances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outlier_configurations_organizationId_key" ON "outlier_configurations"("organizationId");

-- CreateIndex
CREATE INDEX "outlier_baseline_snapshots_organizationId_accountId_platfor_idx" ON "outlier_baseline_snapshots"("organizationId", "accountId", "platform", "computedAt");

-- CreateIndex
CREATE INDEX "outlier_baseline_snapshots_organizationId_brandId_accountTy_idx" ON "outlier_baseline_snapshots"("organizationId", "brandId", "accountType", "accountId", "platform", "contentType", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "outlier_baseline_snapshots_id_organizationId_key" ON "outlier_baseline_snapshots"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "outlier_baseline_snapshots_organizationId_idempotencyKey_key" ON "outlier_baseline_snapshots"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "outlier_post_performances_organizationId_baselineSnapshotId_idx" ON "outlier_post_performances"("organizationId", "baselineSnapshotId", "isDeleted", "logicalPostId");

-- CreateIndex
CREATE UNIQUE INDEX "outlier_post_performances_baselineSnapshotId_logicalPostId_key" ON "outlier_post_performances"("baselineSnapshotId", "logicalPostId");

-- AddForeignKey
ALTER TABLE "outlier_post_performances" ADD CONSTRAINT "outlier_post_performances_baselineSnapshotId_organizationI_fkey" FOREIGN KEY ("baselineSnapshotId", "organizationId") REFERENCES "outlier_baseline_snapshots"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
