-- WorkflowExecution is the only execution authority. Batch fan-out is now a
-- parent immutable workflow execution with action-backed child executions.
DROP TABLE "batch_workflow_jobs";

ALTER TABLE "workflow_executions"
ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "workflow_executions_org_idempotency_key"
ON "workflow_executions"("organizationId", "idempotencyKey");
