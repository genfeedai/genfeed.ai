-- Hard cut: WorkflowExecution is the only execution authority. Remove the
-- standalone AgentRun graph and replace durable content/task attribution with
-- workflow-execution identities. There is intentionally no compatibility
-- projection or data backfill between the two execution models.
DROP TABLE IF EXISTS "_task_linked_runs";

ALTER TABLE "ingredients"
DROP COLUMN "agentRunId",
ADD COLUMN "workflowExecutionId" TEXT;

ALTER TABLE "posts"
DROP COLUMN "agentRunId";

ALTER TABLE "newsletters"
DROP COLUMN "agentRunId",
ADD COLUMN "workflowExecutionId" TEXT;

ALTER TABLE "captions"
DROP COLUMN "agentRunId",
ADD COLUMN "workflowExecutionId" TEXT;

ALTER TABLE "agent_transfers"
DROP COLUMN "destinationRunId",
ADD COLUMN "destinationExecutionId" TEXT;

ALTER TABLE "social_messages"
DROP COLUMN "agentRunId";

ALTER TABLE "agent_publish_audits"
DROP COLUMN "agentRunId",
ADD COLUMN "workflowExecutionId" TEXT;

DROP TABLE "agent_runs";
DROP TYPE "AgentRunStatus";

CREATE INDEX "ingredients_workflowExecutionId_idx"
ON "ingredients"("workflowExecutionId");

CREATE INDEX "newsletters_workflowExecutionId_idx"
ON "newsletters"("workflowExecutionId");

CREATE INDEX "captions_workflowExecutionId_idx"
ON "captions"("workflowExecutionId");

CREATE UNIQUE INDEX "agent_transfers_destinationExecutionId_key"
ON "agent_transfers"("destinationExecutionId");

CREATE INDEX "agent_transfers_destination_execution_idx"
ON "agent_transfers"("organizationId", "destinationExecutionId", "isDeleted");

CREATE INDEX "agent_publish_audits_workflowExecutionId_isDeleted_idx"
ON "agent_publish_audits"("workflowExecutionId", "isDeleted");

ALTER TABLE "ingredients"
ADD CONSTRAINT "ingredients_workflowExecutionId_fkey"
FOREIGN KEY ("workflowExecutionId") REFERENCES "workflow_executions"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "newsletters"
ADD CONSTRAINT "newsletters_workflowExecutionId_fkey"
FOREIGN KEY ("workflowExecutionId") REFERENCES "workflow_executions"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "captions"
ADD CONSTRAINT "captions_workflowExecutionId_fkey"
FOREIGN KEY ("workflowExecutionId") REFERENCES "workflow_executions"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agent_transfers"
ADD CONSTRAINT "agent_transfers_destinationExecutionId_fkey"
FOREIGN KEY ("destinationExecutionId") REFERENCES "workflow_executions"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agent_publish_audits"
ADD CONSTRAINT "agent_publish_audits_workflowExecutionId_fkey"
FOREIGN KEY ("workflowExecutionId") REFERENCES "workflow_executions"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "_task_linked_executions" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL,
  CONSTRAINT "_task_linked_executions_AB_pkey" PRIMARY KEY ("A", "B")
);

CREATE INDEX "_task_linked_executions_B_index"
ON "_task_linked_executions"("B");

ALTER TABLE "_task_linked_executions"
ADD CONSTRAINT "_task_linked_executions_A_fkey"
FOREIGN KEY ("A") REFERENCES "tasks"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_task_linked_executions"
ADD CONSTRAINT "_task_linked_executions_B_fkey"
FOREIGN KEY ("B") REFERENCES "workflow_executions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
