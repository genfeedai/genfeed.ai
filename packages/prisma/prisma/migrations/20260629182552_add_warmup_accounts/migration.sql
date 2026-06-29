-- CreateEnum
CREATE TYPE "WarmupAccountStatus" AS ENUM ('DRAFT', 'PROVISIONING', 'PROVISIONED', 'INVITED', 'FAILED', 'CLAIMED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "warmup_accounts" (
    "id" TEXT NOT NULL,
    "leadEmail" TEXT NOT NULL,
    "leadFirstName" TEXT,
    "leadLastName" TEXT,
    "organizationName" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "guidance" TEXT,
    "status" "WarmupAccountStatus" NOT NULL DEFAULT 'DRAFT',
    "operatorUserId" TEXT NOT NULL,
    "customerUserId" TEXT,
    "organizationId" TEXT,
    "brandId" TEXT,
    "invitationId" TEXT,
    "diagnostics" JSONB NOT NULL DEFAULT '{}',
    "auditEvents" JSONB NOT NULL DEFAULT '[]',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warmup_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "warmup_accounts_lead_status_idx" ON "warmup_accounts"("leadEmail", "isDeleted", "status");

-- CreateIndex
CREATE INDEX "warmup_accounts_status_created_idx" ON "warmup_accounts"("status", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "warmup_accounts_org_deleted_idx" ON "warmup_accounts"("organizationId", "isDeleted");

-- AddForeignKey
ALTER TABLE "warmup_accounts" ADD CONSTRAINT "warmup_accounts_operatorUserId_fkey" FOREIGN KEY ("operatorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warmup_accounts" ADD CONSTRAINT "warmup_accounts_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warmup_accounts" ADD CONSTRAINT "warmup_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warmup_accounts" ADD CONSTRAINT "warmup_accounts_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warmup_accounts" ADD CONSTRAINT "warmup_accounts_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "invitations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
