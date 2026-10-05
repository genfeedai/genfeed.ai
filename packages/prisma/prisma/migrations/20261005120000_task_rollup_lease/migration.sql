-- Recoverable execution-rollup lease for workspace tasks (#6265).
-- Additive: two nullable columns and one index; no row rewrite.

ALTER TABLE "tasks" ADD COLUMN "rollupLeaseOwner" TEXT;
ALTER TABLE "tasks" ADD COLUMN "rollupLeaseExpiresAt" TIMESTAMP(3);

CREATE INDEX "tasks_status_rollupLeaseExpiresAt_idx" ON "tasks"("status", "rollupLeaseExpiresAt");
