ALTER TABLE "mcp_approvals" ADD COLUMN "executedAt" TIMESTAMP(3);
ALTER TABLE "mcp_approvals" ADD COLUMN "idempotencyKey" TEXT;

CREATE INDEX "mcp_approvals_organizationId_idempotencyKey_isDeleted_idx" ON "mcp_approvals"("organizationId", "idempotencyKey", "isDeleted");

CREATE UNIQUE INDEX "mcp_approvals_active_logical_write_key" ON "mcp_approvals"("organizationId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL AND "isDeleted" = false AND "status" IN ('PENDING', 'APPROVED');
