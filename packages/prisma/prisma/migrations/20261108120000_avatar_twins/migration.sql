-- Digital twins recorded in the app (#9681, #9683). One row per enrollment:
-- upload, training and consent at the provider until the twin is ready. The
-- twin itself lives in the workspace's own provider account.

-- CreateEnum
CREATE TYPE "AvatarTwinStatus" AS ENUM ('UPLOADING', 'TRAINING', 'AWAITING_CONSENT', 'READY', 'FAILED', 'CONSENT_REJECTED');

-- CreateTable
CREATE TABLE "avatar_twins" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'heygen',
    "name" TEXT NOT NULL,
    "status" "AvatarTwinStatus" NOT NULL DEFAULT 'UPLOADING',
    "idempotencyKey" TEXT NOT NULL,
    "sourceIngredientId" TEXT,
    "providerAssetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "providerGroupId" TEXT,
    "providerLookId" TEXT,
    "providerLookStatus" TEXT,
    "providerConsent" TEXT,
    "supportedEngines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "previewImageUrl" TEXT,
    "voiceId" TEXT,
    "consentLinkExpiresAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "avatar_twins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "avatar_twins_org_user_created_idx" ON "avatar_twins"("organizationId", "userId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "avatar_twins_status_checked_idx" ON "avatar_twins"("status", "isDeleted", "lastCheckedAt");

-- CreateIndex
CREATE INDEX "avatar_twins_provider_look_idx" ON "avatar_twins"("provider", "providerLookId");

-- CreateIndex
CREATE UNIQUE INDEX "avatar_twins_org_user_idempotency_key" ON "avatar_twins"("organizationId", "userId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "avatar_twins" ADD CONSTRAINT "avatar_twins_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avatar_twins" ADD CONSTRAINT "avatar_twins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

