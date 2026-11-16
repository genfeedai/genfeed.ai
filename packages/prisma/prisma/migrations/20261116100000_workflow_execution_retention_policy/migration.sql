-- Run history of background system workflows is deleted in bulk (#10382).
-- `retentionPolicy = 'background'` marks a run whose workflow keeps no
-- long-term history; its terminal transition sets `purgeAt`, and the platform
-- purge task deletes it once that time has passed. A nullable column without a
-- default is a metadata-only change, so this does not rewrite the table.
ALTER TABLE "workflow_executions" ADD COLUMN "retentionPolicy" TEXT;
