BEGIN;
CREATE TYPE "KnowledgeSourceKind" AS ENUM ('TEXT', 'URL', 'FILE', 'DOCUMENT', 'VIDEO', 'AUDIO', 'RSS');
CREATE TYPE "KnowledgeSourcePurpose" AS ENUM ('BRAND_TRUTH', 'INSPIRATION', 'RESEARCH');
CREATE TYPE "KnowledgeProcessingState" AS ENUM ('QUEUED', 'PROCESSING', 'READY', 'FAILED');
CREATE TYPE "KnowledgeRetrievalState" AS ENUM ('ACTIVE', 'STALE', 'CONTRADICTED', 'SUPERSEDED', 'QUARANTINED', 'EXPIRED');
CREATE TYPE "KnowledgeRetentionState" AS ENUM ('RETAINED', 'SCHEDULED_FOR_PURGE', 'PAYLOAD_PURGED', 'POLICY_ERASED');
CREATE TYPE "KnowledgeRetentionPolicy" AS ENUM ('KEEP', 'UNTIL_EXPIRY');

CREATE TABLE "knowledge_sources" (
  "id" text PRIMARY KEY,
  "organizationId" text NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "brandId" text,
  "userId" text NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "scope" text NOT NULL,
  "title" text NOT NULL,
  "kind" "KnowledgeSourceKind" NOT NULL,
  "purpose" "KnowledgeSourcePurpose" NOT NULL,
  "isVisible" boolean NOT NULL DEFAULT true,
  "isDeleted" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,
  UNIQUE ("id", "organizationId"),
  FOREIGN KEY ("brandId", "organizationId") REFERENCES "brands"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "knowledge_sources_scope_check" CHECK (
    "scope" IN ('personal', 'brand', 'org') AND
    (("scope" = 'brand' AND "brandId" IS NOT NULL) OR
     ("scope" IN ('personal', 'org') AND "brandId" IS NULL))
  )
);
CREATE INDEX "knowledge_sources_organizationId_isDeleted_scope_brandId_idx" ON "knowledge_sources"("organizationId", "isDeleted", "scope", "brandId");

CREATE TABLE "knowledge_spaces" (
  "id" text PRIMARY KEY,
  "organizationId" text NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "brandId" text,
  "userId" text NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "scope" text NOT NULL,
  "title" text NOT NULL,
  "isInbox" boolean NOT NULL DEFAULT false,
  "isDeleted" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,
  UNIQUE ("id", "organizationId"),
  FOREIGN KEY ("brandId", "organizationId") REFERENCES "brands"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "knowledge_spaces_scope_check" CHECK (
    "scope" IN ('personal', 'brand', 'org') AND
    (("scope" = 'brand' AND "brandId" IS NOT NULL) OR
     ("scope" IN ('personal', 'org') AND "brandId" IS NULL))
  )
);
CREATE INDEX "knowledge_spaces_organizationId_isDeleted_scope_brandId_idx" ON "knowledge_spaces"("organizationId", "isDeleted", "scope", "brandId");

CREATE UNIQUE INDEX "knowledge_spaces_inbox_scope_key" ON "knowledge_spaces" (
  "organizationId", "scope", COALESCE("brandId", ''),
  (CASE WHEN "scope" = 'personal' THEN "userId" ELSE '' END)
) WHERE "isInbox" = true;

CREATE TABLE "knowledge_source_versions" (
  "id" text PRIMARY KEY,
  "organizationId" text NOT NULL,
  "sourceId" text NOT NULL,
  "version" integer NOT NULL CHECK ("version" > 0),
  "contentHash" text NOT NULL,
  "provenance" jsonb,
  "payload" jsonb,
  "processingState" "KnowledgeProcessingState" NOT NULL DEFAULT 'QUEUED',
  "retrievalState" "KnowledgeRetrievalState" NOT NULL DEFAULT 'ACTIVE',
  "retentionState" "KnowledgeRetentionState" NOT NULL DEFAULT 'RETAINED',
  "retentionPolicy" "KnowledgeRetentionPolicy" NOT NULL DEFAULT 'KEEP',
  "observedAt" timestamp(3) NOT NULL,
  "verifiedAt" timestamp(3),
  "expiresAt" timestamp(3),
  "purgeScheduledAt" timestamp(3),
  "purgedAt" timestamp(3),
  "supersededByVersionId" text,
  "isCurrent" boolean NOT NULL DEFAULT true,
  "isDeleted" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,
  UNIQUE ("sourceId", "version"),
  UNIQUE ("id", "sourceId", "organizationId"),
  FOREIGN KEY ("sourceId", "organizationId") REFERENCES "knowledge_sources"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "knowledge_version_supersession_fkey" FOREIGN KEY ("supersededByVersionId", "sourceId", "organizationId") REFERENCES "knowledge_source_versions"("id", "sourceId", "organizationId") ON DELETE RESTRICT ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT "knowledge_version_retention_check" CHECK (
    ("retentionState" IN ('RETAINED', 'SCHEDULED_FOR_PURGE') AND "purgedAt" IS NULL AND "provenance" IS NOT NULL) OR
    ("retentionState" IN ('PAYLOAD_PURGED', 'POLICY_ERASED') AND "purgedAt" IS NOT NULL AND "payload" IS NULL AND "provenance" IS NULL)
  ),
  CONSTRAINT "knowledge_version_purge_schedule_check" CHECK ("retentionState" <> 'SCHEDULED_FOR_PURGE' OR "purgeScheduledAt" IS NOT NULL),
  CONSTRAINT "knowledge_version_supersession_check" CHECK (
    ("supersededByVersionId" IS NULL OR ("supersededByVersionId" <> "id" AND NOT "isCurrent" AND "retrievalState" = 'SUPERSEDED')) AND
    ("retrievalState" <> 'SUPERSEDED' OR NOT "isCurrent")
  ),
  CONSTRAINT "knowledge_version_expiry_check" CHECK ("retentionPolicy" <> 'UNTIL_EXPIRY' OR "expiresAt" IS NOT NULL)
);
CREATE UNIQUE INDEX "knowledge_source_versions_current_key" ON "knowledge_source_versions"("sourceId") WHERE "isCurrent" = true;
CREATE INDEX "knowledge_source_versions_scope_current_idx" ON "knowledge_source_versions"("organizationId", "sourceId", "isDeleted", "isCurrent");

CREATE TABLE "knowledge_space_memberships" (
  "id" text PRIMARY KEY,
  "organizationId" text NOT NULL,
  "sourceId" text NOT NULL,
  "spaceId" text NOT NULL,
  "isDeleted" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL,
  UNIQUE ("spaceId", "sourceId"),
  FOREIGN KEY ("sourceId", "organizationId") REFERENCES "knowledge_sources"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("spaceId", "organizationId") REFERENCES "knowledge_spaces"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "knowledge_memberships_scope_source_idx" ON "knowledge_space_memberships"("organizationId", "sourceId", "isDeleted");

CREATE FUNCTION knowledge_preserve_scope() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF ROW(NEW."id", NEW."organizationId", NEW."brandId", NEW."userId", NEW."scope") IS DISTINCT FROM
     ROW(OLD."id", OLD."organizationId", OLD."brandId", OLD."userId", OLD."scope") THEN
    RAISE EXCEPTION 'Knowledge ownership and identity are immutable';
  END IF;
  IF TG_TABLE_NAME = 'knowledge_spaces' THEN
    IF NEW."isInbox" IS DISTINCT FROM OLD."isInbox" OR (OLD."isInbox" AND NEW."isDeleted") THEN
      RAISE EXCEPTION 'Knowledge Inbox identity cannot be changed or deleted';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER knowledge_source_scope BEFORE UPDATE ON "knowledge_sources" FOR EACH ROW EXECUTE FUNCTION knowledge_preserve_scope();
CREATE TRIGGER knowledge_space_scope BEFORE UPDATE ON "knowledge_spaces" FOR EACH ROW EXECUTE FUNCTION knowledge_preserve_scope();

CREATE FUNCTION knowledge_preserve_version() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF ROW(NEW."id", NEW."organizationId", NEW."sourceId", NEW."version", NEW."contentHash", NEW."observedAt", NEW."createdAt") IS DISTINCT FROM
     ROW(OLD."id", OLD."organizationId", OLD."sourceId", OLD."version", OLD."contentHash", OLD."observedAt", OLD."createdAt") THEN
    RAISE EXCEPTION 'Knowledge receipt identity is immutable';
  END IF;
  IF OLD."retentionState" = 'POLICY_ERASED' AND NEW."retentionState" <> 'POLICY_ERASED' THEN
    RAISE EXCEPTION 'Knowledge policy erasure is terminal';
  END IF;
  IF OLD."retentionState" IN ('PAYLOAD_PURGED', 'POLICY_ERASED') AND NEW."retentionState" NOT IN ('PAYLOAD_PURGED', 'POLICY_ERASED') THEN
    RAISE EXCEPTION 'Knowledge payload purge is irreversible';
  END IF;
  IF (NEW."payload" IS DISTINCT FROM OLD."payload" OR NEW."provenance" IS DISTINCT FROM OLD."provenance") AND
     NOT (NEW."retentionState" IN ('PAYLOAD_PURGED', 'POLICY_ERASED') AND NEW."payload" IS NULL AND NEW."provenance" IS NULL) THEN
    RAISE EXCEPTION 'Knowledge evidence is immutable except payload purge';
  END IF;
  IF NOT OLD."isCurrent" AND NEW."isCurrent" THEN
    RAISE EXCEPTION 'Historical Knowledge versions cannot become current';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER knowledge_version_identity BEFORE UPDATE ON "knowledge_source_versions" FOR EACH ROW EXECUTE FUNCTION knowledge_preserve_version();

CREATE FUNCTION knowledge_check_membership() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF NOT NEW."isDeleted" AND NOT EXISTS (
    SELECT 1 FROM "knowledge_sources" src JOIN "knowledge_spaces" sp ON sp."id" = NEW."spaceId"
    WHERE src."id" = NEW."sourceId" AND src."organizationId" = NEW."organizationId"
      AND sp."organizationId" = NEW."organizationId"
      AND NOT src."isDeleted" AND NOT sp."isDeleted"
      AND src."scope" = sp."scope" AND src."brandId" IS NOT DISTINCT FROM sp."brandId"
      AND (src."scope" <> 'personal' OR src."userId" = sp."userId")
  ) THEN
    RAISE EXCEPTION 'Knowledge membership requires live sources and spaces with identical ownership scope';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER knowledge_membership_scope BEFORE INSERT OR UPDATE ON "knowledge_space_memberships" FOR EACH ROW EXECUTE FUNCTION knowledge_check_membership();
COMMIT;
