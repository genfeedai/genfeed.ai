-- A claim leaves with its run (#10383). Add the foreign key without scanning
-- the live table under a stronger lock. PostgreSQL enforces NOT VALID
-- constraints for new writes immediately, and a deleted execution cascades to
-- its claims from now on; the follow-up migration validates the existing rows.
ALTER TABLE "workflow_node_claims"
ADD CONSTRAINT "workflow_node_claims_executionId_fkey"
FOREIGN KEY ("executionId") REFERENCES "workflow_executions"("id")
ON DELETE CASCADE
ON UPDATE CASCADE
NOT VALID;
