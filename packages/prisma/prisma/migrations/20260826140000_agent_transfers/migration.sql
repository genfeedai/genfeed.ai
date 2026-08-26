CREATE TYPE "AgentTransferDeliveryMode" AS ENUM ('SEND', 'SEND_AND_RUN');
CREATE TYPE "AgentTransferStatus" AS ENUM (
  'PENDING',
  'DELIVERED',
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'DEPTH_LIMIT_REACHED'
);

CREATE TABLE "agent_transfers" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceBrandId" TEXT,
  "destinationBrandId" TEXT,
  "sourceThreadId" TEXT NOT NULL,
  "destinationThreadId" TEXT NOT NULL,
  "sourceMessageId" TEXT,
  "destinationMessageId" TEXT,
  "destinationRunId" TEXT,
  "deliveryMode" "AgentTransferDeliveryMode" NOT NULL,
  "status" "AgentTransferStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "parentCorrelationId" TEXT,
  "depth" INTEGER NOT NULL DEFAULT 0,
  "content" TEXT NOT NULL,
  "selectedContext" JSONB NOT NULL DEFAULT '{}',
  "artifactReferences" JSONB NOT NULL DEFAULT '[]',
  "artifactVersionPinIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "completionSummary" TEXT,
  "outputArtifactReferences" JSONB NOT NULL DEFAULT '[]',
  "outputArtifactVersionPinIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "failureReason" TEXT,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "deliveredAt" TIMESTAMP(3),
  "queuedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "agent_transfers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_transfers_depth_check" CHECK ("depth" >= 0 AND "depth" <= 3),
  CONSTRAINT "agent_transfers_progress_check" CHECK ("progress" >= 0 AND "progress" <= 100)
);

CREATE UNIQUE INDEX "agent_transfers_org_user_idempotency_key"
  ON "agent_transfers"("organizationId", "userId", "idempotencyKey");
CREATE UNIQUE INDEX "agent_transfers_correlationId_key"
  ON "agent_transfers"("correlationId");
CREATE UNIQUE INDEX "agent_transfers_destinationRunId_key"
  ON "agent_transfers"("destinationRunId");
CREATE INDEX "agent_transfers_source_thread_idx"
  ON "agent_transfers"("organizationId", "userId", "sourceThreadId", "isDeleted", "createdAt" DESC);
CREATE INDEX "agent_transfers_destination_thread_idx"
  ON "agent_transfers"("organizationId", "userId", "destinationThreadId", "isDeleted", "createdAt" DESC);
CREATE INDEX "agent_transfers_destination_run_idx"
  ON "agent_transfers"("organizationId", "destinationRunId", "isDeleted");

ALTER TABLE "agent_transfers" ADD CONSTRAINT "agent_transfers_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_transfers" ADD CONSTRAINT "agent_transfers_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_transfers" ADD CONSTRAINT "agent_transfers_sourceBrandId_organizationId_fkey"
  FOREIGN KEY ("sourceBrandId", "organizationId") REFERENCES "brands"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_transfers" ADD CONSTRAINT "agent_transfers_destinationBrandId_organizationId_fkey"
  FOREIGN KEY ("destinationBrandId", "organizationId") REFERENCES "brands"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_transfers" ADD CONSTRAINT "agent_transfers_sourceThreadId_fkey"
  FOREIGN KEY ("sourceThreadId") REFERENCES "agent_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_transfers" ADD CONSTRAINT "agent_transfers_destinationThreadId_fkey"
  FOREIGN KEY ("destinationThreadId") REFERENCES "agent_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_transfers" ADD CONSTRAINT "agent_transfers_destinationRunId_fkey"
  FOREIGN KEY ("destinationRunId") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION prevent_agent_transfer_identity_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'agent transfer records are immutable';
  END IF;

  IF NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
    OR NEW."userId" IS DISTINCT FROM OLD."userId"
    OR NEW."sourceBrandId" IS DISTINCT FROM OLD."sourceBrandId"
    OR NEW."destinationBrandId" IS DISTINCT FROM OLD."destinationBrandId"
    OR NEW."sourceThreadId" IS DISTINCT FROM OLD."sourceThreadId"
    OR NEW."destinationThreadId" IS DISTINCT FROM OLD."destinationThreadId"
    OR NEW."sourceMessageId" IS DISTINCT FROM OLD."sourceMessageId"
    OR NEW."destinationMessageId" IS DISTINCT FROM OLD."destinationMessageId"
    OR NEW."deliveryMode" IS DISTINCT FROM OLD."deliveryMode"
    OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
    OR NEW."requestHash" IS DISTINCT FROM OLD."requestHash"
    OR NEW."correlationId" IS DISTINCT FROM OLD."correlationId"
    OR NEW."parentCorrelationId" IS DISTINCT FROM OLD."parentCorrelationId"
    OR NEW."depth" IS DISTINCT FROM OLD."depth"
    OR NEW."content" IS DISTINCT FROM OLD."content"
    OR NEW."selectedContext" IS DISTINCT FROM OLD."selectedContext"
    OR NEW."artifactReferences" IS DISTINCT FROM OLD."artifactReferences"
    OR NEW."artifactVersionPinIds" IS DISTINCT FROM OLD."artifactVersionPinIds"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'agent transfer identity and payload are immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "agent_transfers_immutable_identity"
  BEFORE UPDATE OR DELETE ON "agent_transfers"
  FOR EACH ROW EXECUTE FUNCTION prevent_agent_transfer_identity_mutation();
