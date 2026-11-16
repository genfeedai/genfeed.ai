-- Executions deleted between the orphan cleanup and the NOT VALID constraint
-- left a few claims behind; the constraint has blocked new ones since. Remove
-- them in the same transaction as the validation so it cannot fail on them.
DELETE FROM "workflow_node_claims" AS claim
WHERE NOT EXISTS (
  SELECT 1
  FROM "workflow_executions" AS execution
  WHERE execution."id" = claim."executionId"
);

-- VALIDATE CONSTRAINT scans existing rows while holding SHARE UPDATE EXCLUSIVE
-- on the referencing table, which permits normal reads and writes.
ALTER TABLE "workflow_node_claims"
VALIDATE CONSTRAINT "workflow_node_claims_executionId_fkey";
