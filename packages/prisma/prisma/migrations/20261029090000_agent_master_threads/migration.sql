-- Agent master thread (#8526). Additive: one new column with a constant
-- default (catalog-only on PG11+), two indexes and one foreign key. There is
-- no backfill: a user's master thread is created on first open. Both
-- constraints are added NOT VALID and validated by the next migration, which
-- keeps the table scan out of this transaction's lock.

ALTER TABLE "agent_threads"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'thread';

-- NOT VALID enforces the check on new writes immediately without scanning
-- existing "agent_threads" rows (they all carry the 'thread' default).
ALTER TABLE "agent_threads"
  ADD CONSTRAINT "agent_threads_kind_check" CHECK ("kind" IN ('master', 'thread')) NOT VALID;

-- "parentThreadId" has been an unconstrained TEXT column since
-- 20260723000000. Clear any value that does not name a thread of the same
-- organization so the composite foreign key below can be added.
UPDATE "agent_threads" AS child
SET "parentThreadId" = NULL
WHERE child."parentThreadId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "agent_threads" AS parent
    WHERE parent."id" = child."parentThreadId"
      AND parent."organizationId" = child."organizationId"
  );

CREATE INDEX "agent_threads_organizationId_parentThreadId_idx" ON "agent_threads"("organizationId", "parentThreadId");

ALTER TABLE "agent_threads"
  ADD CONSTRAINT "agent_threads_parentThreadId_organizationId_fkey"
  FOREIGN KEY ("parentThreadId", "organizationId")
  REFERENCES "agent_threads"("id", "organizationId")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- At most one live master per user per organization. Concurrent
-- get-or-create calls race on this index; the loser reads the winner's row.
CREATE UNIQUE INDEX "agent_threads_active_master_per_org_user_key" ON "agent_threads"("organizationId", "userId") WHERE "kind" = 'master' AND "isDeleted" = false;
