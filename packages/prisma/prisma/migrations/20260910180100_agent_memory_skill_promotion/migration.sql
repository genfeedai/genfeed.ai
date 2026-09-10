ALTER TABLE "agent_memories"
  ADD COLUMN "promotedSkillId" TEXT,
  ADD COLUMN "promotedAt" TIMESTAMP(3),
  ADD COLUMN "promotedByUserId" TEXT;

ALTER TABLE "agent_memories"
  ADD CONSTRAINT "agent_memories_promotedSkillId_fkey"
  FOREIGN KEY ("promotedSkillId") REFERENCES "skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agent_memories"
  ADD CONSTRAINT "agent_memories_promotedByUserId_fkey"
  FOREIGN KEY ("promotedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "agent_memories_promotedSkillId_idx"
  ON "agent_memories" ("promotedSkillId");
