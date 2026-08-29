CREATE TYPE "WorkflowArtifactState" AS ENUM (
  'ACTIVE',
  'DELETING',
  'DELETED',
  'CLEANUP_FAILED',
  'PROMOTED'
);

CREATE TABLE "workflow_artifacts" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "storageProvider" TEXT NOT NULL DEFAULT 'primary',
  "storageKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "retentionPolicy" TEXT NOT NULL DEFAULT 'terminal',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "state" "WorkflowArtifactState" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "cleanupClaimedAt" TIMESTAMP(3),
  "cleanupAttempts" INTEGER NOT NULL DEFAULT 0,
  "deletedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "promotedAt" TIMESTAMP(3),
  "promotedByUserId" TEXT,
  "promotionTargetType" TEXT,
  "promotionTargetId" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "workflow_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workflow_artifacts_storage_identity_key"
  ON "workflow_artifacts"("executionId", "nodeId", "storageProvider", "storageKey");
CREATE INDEX "workflow_artifacts_execution_state_idx"
  ON "workflow_artifacts"("organizationId", "executionId", "state", "isDeleted");
CREATE INDEX "workflow_artifacts_expiry_idx"
  ON "workflow_artifacts"("state", "retentionPolicy", "expiresAt");
CREATE INDEX "workflow_artifacts_cleanup_lease_idx"
  ON "workflow_artifacts"("state", "cleanupClaimedAt");

ALTER TABLE "workflow_artifacts"
  ADD CONSTRAINT "workflow_artifacts_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_artifacts"
  ADD CONSTRAINT "workflow_artifacts_executionId_fkey"
  FOREIGN KEY ("executionId") REFERENCES "workflow_executions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_artifacts"
  ADD CONSTRAINT "workflow_artifacts_promotedByUserId_fkey"
  FOREIGN KEY ("promotedByUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_executions"
  ADD COLUMN "scrubAllNodePayloads" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "scrubNodeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "payloadScrubbedAt" TIMESTAMP(3),
  ADD COLUMN "purgeAfterHours" INTEGER,
  ADD COLUMN "purgeAt" TIMESTAMP(3);

CREATE INDEX "workflow_executions_purgeAt_idx"
  ON "workflow_executions"("purgeAt", "payloadScrubbedAt", "isDeleted");
