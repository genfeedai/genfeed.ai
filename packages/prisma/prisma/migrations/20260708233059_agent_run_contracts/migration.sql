-- Reconcile the durable AgentRun model with the public run contract (#1013).
-- All columns are additive/defaulted so existing self-hosted installs keep their rows.

ALTER TABLE "agent_runs"
  ADD COLUMN "brandId" TEXT,
  ADD COLUMN "steps" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "toolCalls" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "summary" TEXT,
  ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "creditBudget" INTEGER;

CREATE INDEX "agent_runs_org_brand_deleted_created_at_idx"
ON "agent_runs"("organizationId", "brandId", "isDeleted", "createdAt" DESC);

ALTER TABLE "agent_runs"
ADD CONSTRAINT "agent_runs_brandId_organizationId_fkey"
FOREIGN KEY ("brandId", "organizationId")
REFERENCES "brands"("id", "organizationId")
ON DELETE RESTRICT
ON UPDATE CASCADE;
