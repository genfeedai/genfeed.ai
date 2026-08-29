ALTER TABLE "clip_projects"
ADD COLUMN "continuityQaStatus" TEXT NOT NULL DEFAULT 'not-required',
ADD COLUMN "continuityWorkflowExecutionId" TEXT;

CREATE UNIQUE INDEX "clip_projects_continuityWorkflowExecutionId_key"
ON "clip_projects"("continuityWorkflowExecutionId");

ALTER TABLE "clip_projects"
ADD CONSTRAINT "clip_projects_continuityWorkflowExecutionId_fkey"
FOREIGN KEY ("continuityWorkflowExecutionId")
REFERENCES "workflow_executions"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
