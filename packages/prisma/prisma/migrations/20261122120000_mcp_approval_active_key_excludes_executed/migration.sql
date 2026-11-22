-- An approval that has executed no longer holds its logical write key, so the
-- same call can be requested again (and approved again) after it ran.
DROP INDEX IF EXISTS "mcp_approvals_active_logical_write_key";

CREATE UNIQUE INDEX "mcp_approvals_active_logical_write_key" ON "mcp_approvals"("organizationId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL AND "isDeleted" = false AND "executedAt" IS NULL AND "status" IN ('PENDING', 'APPROVED');
