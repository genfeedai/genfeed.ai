-- AlterTable
ALTER TABLE "agent_memories" ADD COLUMN     "currentRevisionId" TEXT,
ADD COLUMN     "promotedRevisionId" TEXT;

-- AlterTable
ALTER TABLE "context_entries" ADD COLUMN     "sourceAgentMemoryRevisionId" TEXT;

-- CreateTable
CREATE TABLE "agent_memory_revisions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "importance" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "reason" TEXT,
    "actorUserId" TEXT,
    "originalCreatedAt" TIMESTAMP(3),
    "originalOwnerUserId" TEXT,
    "provenance" JSONB NOT NULL DEFAULT '{}',
    "requestId" TEXT,
    "requestHash" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_memory_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_memory_revisions_organizationId_memoryId_revision_idx" ON "agent_memory_revisions"("organizationId", "memoryId", "revision" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "agent_memory_revisions_org_memory_revision_key" ON "agent_memory_revisions"("organizationId", "memoryId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "agent_memory_revisions_org_memory_request_key" ON "agent_memory_revisions"("organizationId", "memoryId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_memory_revisions_id_memoryId_organizationId_key" ON "agent_memory_revisions"("id", "memoryId", "organizationId");

-- AddForeignKey
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_current_revision_fkey" FOREIGN KEY ("currentRevisionId", "id", "organizationId") REFERENCES "agent_memory_revisions"("id", "memoryId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_promoted_revision_fkey" FOREIGN KEY ("promotedRevisionId", "id", "organizationId") REFERENCES "agent_memory_revisions"("id", "memoryId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "agent_memory_revisions" ADD CONSTRAINT "agent_memory_revisions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_memory_revisions" ADD CONSTRAINT "agent_memory_revisions_memory_fkey" FOREIGN KEY ("memoryId", "organizationId") REFERENCES "agent_memories"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- AddForeignKey
ALTER TABLE "agent_memory_revisions" ADD CONSTRAINT "agent_memory_revisions_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_entries" ADD CONSTRAINT "context_entries_source_memory_revision_fkey" FOREIGN KEY ("sourceAgentMemoryRevisionId", "sourceAgentMemoryId", "organizationId") REFERENCES "agent_memory_revisions"("id", "memoryId", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;


-- A revision is either the original capture, a user correction, or the snapshot
-- the migration took of a memory that predates revisions.
ALTER TABLE "agent_memory_revisions"
  ADD CONSTRAINT "agent_memory_revisions_kind_check"
    CHECK ("kind" IN ('original', 'correction', 'legacy_snapshot')),
  ADD CONSTRAINT "agent_memory_revisions_revision_check" CHECK ("revision" >= 1),
  ADD CONSTRAINT "agent_memory_revisions_scores_check" CHECK (
    ("importance" IS NULL OR ("importance" >= 0 AND "importance" <= 1))
    AND ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1))
  ),
  -- A correction always names who made it and why; nothing else may invent either.
  ADD CONSTRAINT "agent_memory_revisions_correction_check" CHECK (
    ("kind" = 'correction' AND "actorUserId" IS NOT NULL AND btrim(COALESCE("reason", '')) <> '')
    OR ("kind" <> 'correction' AND "actorUserId" IS NULL AND "reason" IS NULL)
  ),
  ADD CONSTRAINT "agent_memory_revisions_request_check" CHECK (
    ("requestId" IS NULL) = ("requestHash" IS NULL)
  );

ALTER TABLE "context_entries"
  ADD CONSTRAINT "context_entries_source_memory_revision_check" CHECK (
    "sourceAgentMemoryRevisionId" IS NULL OR "sourceAgentMemoryId" IS NOT NULL
  );

-- Stored revision content is never rewritten: only the soft-delete flag may change.
-- Hard deletion stays possible for purges, but the memory's own foreign key
-- (ON DELETE RESTRICT) keeps a live memory from losing its history.
CREATE OR REPLACE FUNCTION agent_memory_revision_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF ROW(NEW."id", NEW."organizationId", NEW."memoryId", NEW."revision", NEW."kind",
      NEW."content", NEW."summary", NEW."tags", NEW."importance", NEW."confidence",
      NEW."reason", NEW."actorUserId", NEW."originalCreatedAt", NEW."originalOwnerUserId",
      NEW."provenance", NEW."requestId", NEW."requestHash", NEW."createdAt")
    IS DISTINCT FROM
    ROW(OLD."id", OLD."organizationId", OLD."memoryId", OLD."revision", OLD."kind",
      OLD."content", OLD."summary", OLD."tags", OLD."importance", OLD."confidence",
      OLD."reason", OLD."actorUserId", OLD."originalCreatedAt", OLD."originalOwnerUserId",
      OLD."provenance", OLD."requestId", OLD."requestHash", OLD."createdAt") THEN
    RAISE EXCEPTION 'Agent memory revisions are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "agent_memory_revision_immutable"
  BEFORE UPDATE ON "agent_memory_revisions"
  FOR EACH ROW EXECUTE FUNCTION agent_memory_revision_immutable();

-- Memories that predate revisions get one snapshot of what is known today. The
-- actor and reason of any earlier edit are unknown, so they stay NULL rather than
-- being credited to the memory's creator.
INSERT INTO "agent_memory_revisions" (
  "id", "organizationId", "memoryId", "revision", "kind", "content", "summary", "tags",
  "importance", "confidence", "originalCreatedAt", "originalOwnerUserId", "provenance"
)
SELECT
  'legacy_' || m."id", m."organizationId", m."id", 1, 'legacy_snapshot',
  COALESCE(m."content", ''), m."summary", m."tags", m."importance", m."confidence",
  m."createdAt", m."userId",
  jsonb_strip_nulls(jsonb_build_object(
    'sourceType', m."sourceType", 'sourceMessageId', m."sourceMessageId",
    'sourceContentId', m."sourceContentId", 'sourceUrl', m."sourceUrl",
    'scope', m."scope", 'brandId', m."brandId", 'campaignId', m."campaignId",
    'kind', m."kind", 'contentType', m."contentType", 'platform', m."platform",
    'performanceSnapshot', m."performanceSnapshot", 'metadata', m."metadata"
  ))
FROM "agent_memories" m
WHERE m."currentRevisionId" IS NULL;

UPDATE "agent_memories" m
SET "currentRevisionId" = 'legacy_' || m."id"
WHERE m."currentRevisionId" IS NULL;

-- A promoted memory was promoted from the content it had when the snapshot was taken.
UPDATE "agent_memories" m
SET "promotedRevisionId" = 'legacy_' || m."id"
WHERE m."promotedSkillId" IS NOT NULL AND m."promotedRevisionId" IS NULL;
