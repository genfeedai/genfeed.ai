-- Thread-owned agent scope for conversation-shell context enforcement (#1672).
-- `contextVersion` is the server-owned shell scope version. It is deliberately
-- separate from thread event sequence and ThreadContextState compression data.

ALTER TABLE "agent_threads"
  ADD COLUMN "brandId" TEXT,
  ADD COLUMN "contextVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "scopeChangeProvenance" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "isLegacyBrandFallbackEligible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "legacyBrandFallbackCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "legacyBrandFallbackLastUsedAt" TIMESTAMP(3),
  ADD COLUMN "legacyBrandFallbackLastSource" TEXT,
  ADD COLUMN "legacyBrandFallbackLastBrandId" TEXT;

ALTER TABLE "posts"
  ADD COLUMN "agentThreadId" TEXT,
  ADD COLUMN "agentContextVersion" INTEGER,
  ADD COLUMN "agentContextSource" TEXT;

-- Only rows that existed before this contract may use the observable legacy
-- fallback. New threads remain strict even when intentionally brandless.
UPDATE "agent_threads"
SET "isLegacyBrandFallbackEligible" = true
WHERE "brandId" IS NULL;

CREATE INDEX "agent_threads_org_brand_deleted_updated_at_idx"
ON "agent_threads"("organizationId", "brandId", "isDeleted", "updatedAt" DESC);

CREATE INDEX "posts_agentThreadId_idx"
ON "posts"("agentThreadId");

ALTER TABLE "agent_threads"
ADD CONSTRAINT "agent_threads_brandId_organizationId_fkey"
FOREIGN KEY ("brandId", "organizationId")
REFERENCES "brands"("id", "organizationId")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "posts"
ADD CONSTRAINT "posts_agentThreadId_fkey"
FOREIGN KEY ("agentThreadId") REFERENCES "agent_threads"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
