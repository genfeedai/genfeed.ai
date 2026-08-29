ALTER TABLE "clip_projects"
ADD COLUMN "workflowExecutionId" TEXT;

CREATE UNIQUE INDEX "clip_projects_workflowExecutionId_key"
ON "clip_projects"("workflowExecutionId");

ALTER TABLE "clip_projects"
ADD CONSTRAINT "clip_projects_workflowExecutionId_fkey"
FOREIGN KEY ("workflowExecutionId")
REFERENCES "workflow_executions"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
