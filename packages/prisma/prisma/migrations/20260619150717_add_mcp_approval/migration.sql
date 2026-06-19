-- CreateEnum
CREATE TYPE "McpApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');
-- CreateTable
CREATE TABLE "mcp_approvals" (
    "id" TEXT NOT NULL,
    "mongoId" TEXT,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "arguments" JSONB NOT NULL DEFAULT '{}',
    "status" "McpApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mcp_approvals_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "mcp_approvals_mongoId_key" ON "mcp_approvals"("mongoId");
-- CreateIndex
CREATE INDEX "mcp_approvals_organizationId_isDeleted_createdAt_idx" ON "mcp_approvals"("organizationId", "isDeleted", "createdAt" DESC);
-- CreateIndex
CREATE INDEX "mcp_approvals_organizationId_status_isDeleted_idx" ON "mcp_approvals"("organizationId", "status", "isDeleted");
-- AddForeignKey
ALTER TABLE "mcp_approvals" ADD CONSTRAINT "mcp_approvals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "mcp_approvals" ADD CONSTRAINT "mcp_approvals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
