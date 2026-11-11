-- Thread sharing record (#9936, part of #8606).
--
-- Thread access was owner-only. A share row says who else may see or prompt a
-- thread: one named member, every member with access to a brand, or the whole
-- organization, at level `view` or `collaborate`. The row only nominates a
-- viewer. `AgentThreadAccessService` still checks the viewer's live membership
-- and brand access on every request, so a share never grants more than the
-- viewer's own access. Removing a share is a soft delete and takes effect on the
-- next request.
--
-- The table is new, so every constraint is created validated: there are no
-- existing rows to scan and no long lock to avoid.

CREATE TABLE "agent_thread_shares" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "targetUserId" TEXT,
  "targetBrandId" TEXT,
  "grantedByUserId" TEXT NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "agent_thread_shares_pkey" PRIMARY KEY ("id"),
  -- AgentThreadShareScope and AgentThreadShareLevel in @genfeedai/contracts.
  CONSTRAINT "agent_thread_shares_scope_check"
    CHECK ("scope" IN ('member', 'brand', 'organization')),
  CONSTRAINT "agent_thread_shares_level_check"
    CHECK ("level" IN ('view', 'collaborate')),
  -- Each scope names exactly the target it needs and nothing else.
  CONSTRAINT "agent_thread_shares_target_check" CHECK (
    ("scope" = 'member' AND "targetUserId" IS NOT NULL AND "targetBrandId" IS NULL)
    OR ("scope" = 'brand' AND "targetBrandId" IS NOT NULL AND "targetUserId" IS NULL)
    OR ("scope" = 'organization' AND "targetUserId" IS NULL AND "targetBrandId" IS NULL)
  )
);

CREATE INDEX "agent_thread_shares_organizationId_threadId_isDeleted_idx"
  ON "agent_thread_shares"("organizationId", "threadId", "isDeleted");
CREATE INDEX "agent_thread_shares_organizationId_targetUserId_isDeleted_idx"
  ON "agent_thread_shares"("organizationId", "targetUserId", "isDeleted");
CREATE INDEX "agent_thread_shares_organizationId_targetBrandId_isDeleted_idx"
  ON "agent_thread_shares"("organizationId", "targetBrandId", "isDeleted");

-- One live share per thread and target. Re-sharing updates the level of the
-- live row instead of adding a second one. Prisma cannot declare this index.
CREATE UNIQUE INDEX "agent_thread_shares_live_target_key"
  ON "agent_thread_shares"(
    "threadId",
    "scope",
    COALESCE("targetUserId", ''),
    COALESCE("targetBrandId", '')
  )
  WHERE "isDeleted" = false;

ALTER TABLE "agent_thread_shares" ADD CONSTRAINT "agent_thread_shares_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_thread_shares" ADD CONSTRAINT "agent_thread_shares_threadId_organizationId_fkey"
  FOREIGN KEY ("threadId", "organizationId") REFERENCES "agent_threads"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_thread_shares" ADD CONSTRAINT "agent_thread_shares_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_thread_shares" ADD CONSTRAINT "agent_thread_shares_targetBrandId_organizationId_fkey"
  FOREIGN KEY ("targetBrandId", "organizationId") REFERENCES "brands"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_thread_shares" ADD CONSTRAINT "agent_thread_shares_grantedByUserId_fkey"
  FOREIGN KEY ("grantedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A master thread is the owner's standing thread and is never shared. The
-- service refuses it first; this keeps a stray write from sharing one.
CREATE FUNCTION "reject_master_thread_share"() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "agent_threads"
    WHERE "id" = NEW."threadId" AND "kind" = 'master'
  ) THEN
    RAISE EXCEPTION 'a master agent thread cannot be shared'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "agent_thread_shares_reject_master"
  BEFORE INSERT ON "agent_thread_shares"
  FOR EACH ROW EXECUTE FUNCTION "reject_master_thread_share"();
