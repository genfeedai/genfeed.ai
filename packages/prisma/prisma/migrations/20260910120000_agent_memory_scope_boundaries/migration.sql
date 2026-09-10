-- AgentMemory governance substrate for #3812:
-- persist isDeleted, canonicalize scope to personal|brand|org, and index
-- tenant + scope reads used by org listing and generation retrieval.

ALTER TABLE "agent_memories"
  ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

UPDATE "agent_memories"
SET "scope" = CASE
  WHEN "scope" IN ('personal', 'brand', 'org') THEN "scope"
  WHEN "scope" = 'user' THEN 'personal'
  WHEN "scope" = 'campaign' THEN 'brand'
  ELSE 'personal'
END
WHERE "scope" IS DISTINCT FROM CASE
  WHEN "scope" IN ('personal', 'brand', 'org') THEN "scope"
  WHEN "scope" = 'user' THEN 'personal'
  WHEN "scope" = 'campaign' THEN 'brand'
  ELSE 'personal'
END
   OR "scope" IS NULL;

ALTER TABLE "agent_memories"
  ALTER COLUMN "scope" SET DEFAULT 'personal';

ALTER TABLE "agent_memories"
  ALTER COLUMN "scope" SET NOT NULL;

ALTER TABLE "agent_memories"
  ADD CONSTRAINT "agent_memories_scope_check" CHECK (
    "scope" IN ('personal', 'brand', 'org')
  );

ALTER TABLE "agent_memories"
  ADD CONSTRAINT "agent_memories_brand_scope_check" CHECK (
    "scope" <> 'brand' OR "brandId" IS NOT NULL
  );

DROP INDEX IF EXISTS "agent_memories_organizationId_createdAt_idx";

CREATE INDEX "agent_memories_organizationId_isDeleted_createdAt_idx"
  ON "agent_memories" ("organizationId", "isDeleted", "createdAt" DESC);

CREATE INDEX "agent_memories_organizationId_isDeleted_scope_brandId_idx"
  ON "agent_memories" ("organizationId", "isDeleted", "scope", "brandId");
