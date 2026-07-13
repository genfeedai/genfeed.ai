-- Use the inbound social message as the durable enqueue record for comment
-- workflow triggers. Null status represents a legacy/missing enqueue and is
-- intentionally retryable when the same provider message is ingested again.
ALTER TABLE "social_messages"
  ADD COLUMN "workflowTriggerStatus" TEXT,
  ADD COLUMN "workflowTriggerJobId" TEXT,
  ADD COLUMN "workflowTriggerError" TEXT,
  ADD COLUMN "workflowTriggerAttemptedAt" TIMESTAMP(3),
  ADD COLUMN "workflowTriggerQueuedAt" TIMESTAMP(3);
