-- Durable listening topic and normalized evidence contracts for #1794.
-- Provider-specific payloads remain outside these public contract tables.

BEGIN;

CREATE TABLE "listening_topics" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "excludedKeywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "freshnessHours" INTEGER NOT NULL DEFAULT 24,
  "fingerprint" TEXT NOT NULL,
  "contractVersion" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "auditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastCollectedAt" TIMESTAMP(3),
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "listening_topics_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "listening_topics_freshness_hours_check"
    CHECK ("freshnessHours" BETWEEN 1 AND 720),
  CONSTRAINT "listening_topics_contract_version_check"
    CHECK ("contractVersion" > 0),
  CONSTRAINT "listening_topics_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "listening_topics_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "brands"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "listening_topics_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "listening_topics_scope_fingerprint_key"
  ON "listening_topics"("organizationId", "brandId", "fingerprint")
  WHERE "isDeleted" = false;
CREATE INDEX "listening_topics_scope_fingerprint_idx"
  ON "listening_topics"("organizationId", "brandId", "fingerprint");
CREATE INDEX "listening_topics_scope_active_idx"
  ON "listening_topics"("organizationId", "brandId", "isDeleted", "isActive", "createdAt" DESC);

CREATE TABLE "listening_topic_sources" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "listening_topic_sources_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "listening_topic_sources_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "listening_topic_sources_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "brands"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "listening_topic_sources_topicId_fkey"
    FOREIGN KEY ("topicId") REFERENCES "listening_topics"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "listening_topic_sources_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "social_sources"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "listening_topic_sources_topic_source_key"
  ON "listening_topic_sources"("topicId", "sourceId");
CREATE INDEX "listening_topic_sources_scope_source_idx"
  ON "listening_topic_sources"("organizationId", "brandId", "sourceId");

CREATE TABLE "listening_evidence" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "topicSourceId" TEXT NOT NULL,
  "sourcePostId" TEXT,
  "platform" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "authorExternalId" TEXT,
  "authorHandle" TEXT,
  "contentExcerpt" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "freshnessExpiresAt" TIMESTAMP(3) NOT NULL,
  "contractVersion" INTEGER NOT NULL DEFAULT 1,
  "metrics" JSONB NOT NULL DEFAULT '{}',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "listening_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "listening_evidence_contract_version_check"
    CHECK ("contractVersion" > 0),
  CONSTRAINT "listening_evidence_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "listening_evidence_brandId_fkey"
    FOREIGN KEY ("brandId") REFERENCES "brands"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "listening_evidence_topicId_fkey"
    FOREIGN KEY ("topicId") REFERENCES "listening_topics"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "listening_evidence_topicSourceId_fkey"
    FOREIGN KEY ("topicSourceId") REFERENCES "listening_topic_sources"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "listening_evidence_sourcePostId_fkey"
    FOREIGN KEY ("sourcePostId") REFERENCES "source_posts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "listening_evidence_topic_platform_external_key"
  ON "listening_evidence"("topicId", "platform", "externalId");
CREATE INDEX "listening_evidence_topic_occurred_idx"
  ON "listening_evidence"("organizationId", "brandId", "topicId", "isDeleted", "occurredAt" DESC);
CREATE INDEX "listening_evidence_source_collected_idx"
  ON "listening_evidence"("topicSourceId", "isDeleted", "collectedAt" DESC);

COMMIT;
