-- Harness profile as its own table, with a brand key and append-only revisions (#10191).
--
-- The profile lived in the generic `profiles.data` JSON, found by a JSON path on
-- `data.brandId`, with no history. This creates `harness_profiles` (brandId is a
-- foreign key) and `harness_profile_revisions` (one immutable row per change,
-- naming its source and actor). Rows are copied over by the next migration.

-- CreateEnum
CREATE TYPE "HarnessProfileRevisionSource" AS ENUM ('USER_EDIT', 'RULE_PROPOSAL', 'WINNER_PROMOTION', 'REVIEW_FEEDBACK', 'EXPERT_PATH', 'SEED', 'MIGRATION', 'ROLLBACK');

-- CreateTable
CREATE TABLE "harness_profiles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'brand',
    "status" TEXT NOT NULL DEFAULT 'active',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "content" JSONB NOT NULL DEFAULT '{}',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "harness_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "harness_profile_revisions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "harnessProfileId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "source" "HarnessProfileRevisionSource" NOT NULL,
    "actorUserId" TEXT,
    "actorLabel" TEXT,
    "rolledBackToVersion" INTEGER,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "harness_profile_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "harness_profiles_organizationId_brandId_isDeleted_idx" ON "harness_profiles"("organizationId", "brandId", "isDeleted");

-- CreateIndex
CREATE INDEX "harness_profile_revisions_organizationId_harnessProfileId_i_idx" ON "harness_profile_revisions"("organizationId", "harnessProfileId", "isDeleted", "version");

-- CreateIndex
CREATE UNIQUE INDEX "harness_profile_revisions_harnessProfileId_version_key" ON "harness_profile_revisions"("harnessProfileId", "version");

-- AddForeignKey
ALTER TABLE "harness_profiles" ADD CONSTRAINT "harness_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harness_profiles" ADD CONSTRAINT "harness_profiles_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harness_profiles" ADD CONSTRAINT "harness_profiles_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harness_profile_revisions" ADD CONSTRAINT "harness_profile_revisions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harness_profile_revisions" ADD CONSTRAINT "harness_profile_revisions_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harness_profile_revisions" ADD CONSTRAINT "harness_profile_revisions_harnessProfileId_fkey" FOREIGN KEY ("harnessProfileId") REFERENCES "harness_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "harness_profile_revisions" ADD CONSTRAINT "harness_profile_revisions_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Revisions are append-only: no row is ever rewritten or removed. Two column
-- changes are allowed because other code owns them: the actor foreign key being
-- nulled when a user is erased, and `organizationId` when a brand moves to
-- another organization (the brand-relocation cascade).
CREATE OR REPLACE FUNCTION prevent_harness_profile_revision_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'harness profile revisions are append-only';
  END IF;
  IF (NEW."actorUserId" IS NULL OR NEW."actorUserId" = OLD."actorUserId")
    AND (to_jsonb(NEW) - 'actorUserId' - 'organizationId')
      = (to_jsonb(OLD) - 'actorUserId' - 'organizationId') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'harness profile revisions are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER harness_profile_revisions_append_only
  BEFORE UPDATE OR DELETE ON "harness_profile_revisions"
  FOR EACH ROW EXECUTE FUNCTION prevent_harness_profile_revision_mutation();
