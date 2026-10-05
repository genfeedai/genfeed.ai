-- Recoverable execution-rollup lease for workspace tasks (#6265).
-- Additive: three nullable columns, one column with a constant default and one
-- index; no row rewrite.

ALTER TABLE "tasks" ADD COLUMN "rollupLeaseOwner" TEXT;
ALTER TABLE "tasks" ADD COLUMN "rollupLeaseExpiresAt" TIMESTAMP(3);
ALTER TABLE "tasks" ADD COLUMN "rolledUpAt" TIMESTAMP(3);
ALTER TABLE "tasks" ADD COLUMN "rollupAttempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "tasks_status_rollupLeaseExpiresAt_idx" ON "tasks"("status", "rollupLeaseExpiresAt");
