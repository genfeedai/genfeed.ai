-- VALIDATE CONSTRAINT scans existing rows while holding SHARE UPDATE EXCLUSIVE
-- on the referencing table, which permits normal reads and writes. New writes
-- have already been enforced since the preceding NOT VALID constraints landed.

ALTER TABLE "agent_threads"
VALIDATE CONSTRAINT "agent_threads_brandId_organizationId_fkey";

ALTER TABLE "posts"
VALIDATE CONSTRAINT "posts_agentThreadId_fkey";
