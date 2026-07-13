-- Typed canonical references and immutable version pins for agent artifacts
-- (#1673). Pins contain identity, digest, and provenance only; canonical record
-- content and lifecycle state remain in their existing tables.

BEGIN;

CREATE TABLE "content_version_pins" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "recordKind" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "recordVersion" TEXT,
  "contentDigest" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "provenance" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "content_version_pins_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "content_version_pins_record_kind_check" CHECK (
    "recordKind" IN (
      'asset',
      'post',
      'content-draft',
      'ingredient',
      'article',
      'newsletter'
    )
  ),
  CONSTRAINT "content_version_pins_record_id_check" CHECK (
    length(btrim("recordId")) > 0
  ),
  CONSTRAINT "content_version_pins_digest_check" CHECK (
    "contentDigest" ~ '^sha256:v1:[0-9a-f]{64}$'
  ),
  CONSTRAINT "content_version_pins_idempotency_key_check" CHECK (
    length(btrim("idempotencyKey")) > 0
  ),
  CONSTRAINT "content_version_pins_org_idempotency_key" UNIQUE (
    "organizationId",
    "idempotencyKey"
  ),
  CONSTRAINT "content_version_pins_id_organization_key" UNIQUE (
    "id",
    "organizationId"
  ),
  CONSTRAINT "content_version_pins_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "content_version_pins_brandId_organizationId_fkey"
    FOREIGN KEY ("brandId", "organizationId")
    REFERENCES "brands"("id", "organizationId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "content_version_pins_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "content_version_pins_org_brand_created_at_idx"
ON "content_version_pins"("organizationId", "brandId", "createdAt" DESC);

CREATE INDEX "content_version_pins_record_lookup_idx"
ON "content_version_pins"(
  "organizationId",
  "recordKind",
  "recordId",
  "createdAt" DESC
);

CREATE FUNCTION "reject_content_version_pin_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'content version pins are immutable'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "content_version_pins_immutable"
BEFORE UPDATE OR DELETE ON "content_version_pins"
FOR EACH ROW
EXECUTE FUNCTION "reject_content_version_pin_mutation"();

ALTER TABLE "agent_messages"
  ADD COLUMN "artifactReferences" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "artifactVersionPinIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  -- This default is changed to false before commit. PostgreSQL retains true as
  -- the missing value for rows that predate this migration, while all writes
  -- after the migration commit receive false without a table rewrite.
  ADD COLUMN "isLegacyArtifactReferenceEligible" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "artifactReferenceEligibleReadCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "legacyArtifactReferenceReadCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "legacyArtifactReferenceLastUsedAt" TIMESTAMP(3),
  ADD COLUMN "legacyArtifactReferenceLastSource" TEXT;

ALTER TABLE "agent_messages"
  ALTER COLUMN "isLegacyArtifactReferenceEligible" SET DEFAULT false;

ALTER TABLE "agent_runs"
  ADD COLUMN "artifactReferences" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "artifactVersionPinIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "posts"
  ADD COLUMN "reviewVersionPinId" TEXT;

ALTER TABLE "content_drafts"
  ADD COLUMN "approvedVersionPinId" TEXT;

ALTER TABLE "newsletters"
  ADD COLUMN "approvedVersionPinId" TEXT;

-- New writes are checked immediately. Existing rows are validated separately
-- so the scan does not hold a lock that blocks normal reads or writes.
ALTER TABLE "posts"
ADD CONSTRAINT "posts_reviewVersionPinId_organizationId_fkey"
FOREIGN KEY ("reviewVersionPinId", "organizationId")
REFERENCES "content_version_pins"("id", "organizationId")
ON DELETE RESTRICT
ON UPDATE CASCADE
NOT VALID;

ALTER TABLE "content_drafts"
ADD CONSTRAINT "content_drafts_approvedVersionPinId_organizationId_fkey"
FOREIGN KEY ("approvedVersionPinId", "organizationId")
REFERENCES "content_version_pins"("id", "organizationId")
ON DELETE RESTRICT
ON UPDATE CASCADE
NOT VALID;

ALTER TABLE "newsletters"
ADD CONSTRAINT "newsletters_approvedVersionPinId_organizationId_fkey"
FOREIGN KEY ("approvedVersionPinId", "organizationId")
REFERENCES "content_version_pins"("id", "organizationId")
ON DELETE RESTRICT
ON UPDATE CASCADE
NOT VALID;

COMMIT;
