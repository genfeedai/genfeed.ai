-- Durable provider callbacks are part of workflow execution, not a second
-- media-generation control plane. The row is created before provider submit
-- and stays pinned to the exact immutable workflow version and node.
CREATE TYPE "WorkflowNodeContinuationStatus" AS ENUM (
  'PENDING_SUBMISSION',
  'WAITING_PROVIDER',
  'PROVIDER_SUCCEEDED',
  'PROVIDER_FAILED',
  'RESUMING',
  'COMPLETED',
  'FAILED'
);

CREATE TABLE "workflow_node_continuations" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "workflowVersionId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "actionId" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "externalId" TEXT,
  "status" "WorkflowNodeContinuationStatus" NOT NULL DEFAULT 'PENDING_SUBMISSION',
  "initialOutput" JSONB,
  "providerResult" JSONB,
  "error" TEXT,
  "creditsUsed" INTEGER NOT NULL DEFAULT 0,
  "resumeClaimedAt" TIMESTAMP(3),
  "pollAttempt" INTEGER,
  "pollDispatchClaimedAt" TIMESTAMP(3),
  "pollDispatchedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "workflow_node_continuations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workflow_node_continuations_execution_node_key"
ON "workflow_node_continuations"("executionId", "nodeId");

CREATE UNIQUE INDEX "workflow_node_continuations_org_ingredient_key"
ON "workflow_node_continuations"("organizationId", "ingredientId");

CREATE UNIQUE INDEX "workflow_node_continuations_org_provider_external_key"
ON "workflow_node_continuations"("organizationId", "provider", "externalId");

CREATE INDEX "workflow_node_continuations_org_execution_status_idx"
ON "workflow_node_continuations"("organizationId", "executionId", "status");

CREATE INDEX "workflow_node_continuations_resume_lease_idx"
ON "workflow_node_continuations"("status", "resumeClaimedAt");

CREATE INDEX "workflow_node_continuations_poll_outbox_idx"
ON "workflow_node_continuations"("provider", "status", "pollDispatchedAt");

ALTER TABLE "workflow_node_continuations"
ADD CONSTRAINT "workflow_node_continuations_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_node_continuations"
ADD CONSTRAINT "workflow_node_continuations_executionId_fkey"
FOREIGN KEY ("executionId") REFERENCES "workflow_executions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_node_continuations"
ADD CONSTRAINT "workflow_node_continuations_workflowVersionId_fkey"
FOREIGN KEY ("workflowVersionId") REFERENCES "workflow_versions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_node_continuations"
ADD CONSTRAINT "workflow_node_continuations_ingredientId_fkey"
FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
