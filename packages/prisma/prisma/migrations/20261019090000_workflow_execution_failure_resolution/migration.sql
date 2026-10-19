-- Platform admins mark failed agent runs as resolved from the admin failure feed.
ALTER TABLE "workflow_executions"
  ADD COLUMN "failureResolvedAt" TIMESTAMP(3),
  ADD COLUMN "failureResolvedBy" TEXT;
