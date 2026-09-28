-- Durable drain cancellation intent (#5450): the one-time deploy drain records
-- its intent to cancel a PENDING execution before it removes the queued job, so
-- the stale-PENDING reconciler can finish the silent cancel later even if the
-- database was unavailable right after the removal.

ALTER TABLE "workflow_executions" ADD COLUMN "cancelRequestedAt" TIMESTAMP(3);
