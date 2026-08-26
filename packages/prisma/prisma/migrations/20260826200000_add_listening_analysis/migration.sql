-- Deterministic, attributable theme clustering and bounded listening signals (#1796).

CREATE UNIQUE INDEX "listening_evidence_id_scope_topic_key"
  ON "listening_evidence"("id", "organizationId", "brandId", "topicId");

CREATE TABLE "listening_themes" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "clusterKey" TEXT NOT NULL,
  "methodologyVersion" TEXT NOT NULL,
  "analysisKey" TEXT NOT NULL,
  "currentWindowStart" TIMESTAMP(3) NOT NULL,
  "currentWindowEnd" TIMESTAMP(3) NOT NULL,
  "previousWindowStart" TIMESTAMP(3) NOT NULL,
  "previousWindowEnd" TIMESTAMP(3) NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "listening_themes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "listening_themes_window_check" CHECK (
    "previousWindowStart" < "previousWindowEnd"
    AND "previousWindowEnd" <= "currentWindowStart"
    AND "currentWindowStart" < "currentWindowEnd"
    AND "previousWindowEnd" - "previousWindowStart" <= INTERVAL '31 days'
    AND "currentWindowEnd" - "currentWindowStart" <= INTERVAL '31 days'
    AND "previousWindowEnd" - "previousWindowStart" = "currentWindowEnd" - "currentWindowStart"
  )
);

CREATE UNIQUE INDEX "listening_themes_id_scope_topic_key"
  ON "listening_themes"("id", "organizationId", "brandId", "topicId");
CREATE UNIQUE INDEX "listening_themes_scope_idempotency_key"
  ON "listening_themes"("organizationId", "brandId", "topicId", "idempotencyKey");
CREATE INDEX "listening_themes_scope_analysis_idx"
  ON "listening_themes"("organizationId", "brandId", "topicId", "analysisKey", "isDeleted");
CREATE INDEX "listening_themes_scope_window_idx"
  ON "listening_themes"("organizationId", "brandId", "topicId", "isDeleted", "currentWindowEnd" DESC);

ALTER TABLE "listening_themes" ADD CONSTRAINT "listening_themes_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "listening_themes" ADD CONSTRAINT "listening_themes_brand_scope_fkey"
  FOREIGN KEY ("brandId", "organizationId") REFERENCES "brands"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "listening_themes" ADD CONSTRAINT "listening_themes_topic_scope_fkey"
  FOREIGN KEY ("topicId", "organizationId", "brandId") REFERENCES "listening_topics"("id", "organizationId", "brandId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "listening_theme_evidence" (
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "themeId" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "listening_theme_evidence_pkey" PRIMARY KEY ("themeId", "evidenceId")
);

CREATE INDEX "listening_theme_evidence_evidence_idx"
  ON "listening_theme_evidence"("evidenceId");

ALTER TABLE "listening_theme_evidence" ADD CONSTRAINT "listening_theme_evidence_theme_scope_fkey"
  FOREIGN KEY ("themeId", "organizationId", "brandId", "topicId") REFERENCES "listening_themes"("id", "organizationId", "brandId", "topicId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listening_theme_evidence" ADD CONSTRAINT "listening_theme_evidence_evidence_scope_fkey"
  FOREIGN KEY ("evidenceId", "organizationId", "brandId", "topicId") REFERENCES "listening_evidence"("id", "organizationId", "brandId", "topicId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "listening_signals" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "themeId" TEXT,
  "signalType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "insufficiencyReason" TEXT,
  "value" DOUBLE PRECISION,
  "confidence" DOUBLE PRECISION NOT NULL,
  "methodologyVersion" TEXT NOT NULL,
  "analysisKey" TEXT NOT NULL,
  "currentWindowStart" TIMESTAMP(3) NOT NULL,
  "currentWindowEnd" TIMESTAMP(3) NOT NULL,
  "previousWindowStart" TIMESTAMP(3) NOT NULL,
  "previousWindowEnd" TIMESTAMP(3) NOT NULL,
  "includedSourceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "excludedSourceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "evidenceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "idempotencyKey" TEXT NOT NULL,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "listening_signals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "listening_signals_windows_check" CHECK (
    "previousWindowStart" < "previousWindowEnd"
    AND "previousWindowEnd" <= "currentWindowStart"
    AND "currentWindowStart" < "currentWindowEnd"
    AND "previousWindowEnd" - "previousWindowStart" <= INTERVAL '31 days'
    AND "currentWindowEnd" - "currentWindowStart" <= INTERVAL '31 days'
    AND "previousWindowEnd" - "previousWindowStart" = "currentWindowEnd" - "currentWindowStart"
  ),
  CONSTRAINT "listening_signals_type_check" CHECK (
    "signalType" IN ('volume', 'change', 'sentiment_direction', 'comparative')
  ),
  CONSTRAINT "listening_signals_status_check" CHECK (
    "status" IN ('sufficient', 'insufficient_evidence')
  ),
  CONSTRAINT "listening_signals_reason_check" CHECK (
    "insufficiencyReason" IS NULL
    OR "insufficiencyReason" IN ('missing_evidence', 'stale_evidence', 'underpowered_evidence', 'source_coverage_gap')
  ),
  CONSTRAINT "listening_signals_value_status_check" CHECK (
    ("status" = 'sufficient' AND "value" IS NOT NULL AND "insufficiencyReason" IS NULL)
    OR
    ("status" = 'insufficient_evidence' AND "value" IS NULL AND "insufficiencyReason" IS NOT NULL)
  ),
  CONSTRAINT "listening_signals_confidence_check" CHECK (
    "confidence" >= 0 AND "confidence" <= 1
  )
);

CREATE UNIQUE INDEX "listening_signals_scope_idempotency_key"
  ON "listening_signals"("organizationId", "brandId", "topicId", "idempotencyKey");
CREATE INDEX "listening_signals_scope_analysis_idx"
  ON "listening_signals"("organizationId", "brandId", "topicId", "analysisKey", "isDeleted");
CREATE INDEX "listening_signals_scope_window_idx"
  ON "listening_signals"("organizationId", "brandId", "topicId", "isDeleted", "currentWindowEnd" DESC);

ALTER TABLE "listening_signals" ADD CONSTRAINT "listening_signals_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "listening_signals" ADD CONSTRAINT "listening_signals_brand_scope_fkey"
  FOREIGN KEY ("brandId", "organizationId") REFERENCES "brands"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "listening_signals" ADD CONSTRAINT "listening_signals_topic_scope_fkey"
  FOREIGN KEY ("topicId", "organizationId", "brandId") REFERENCES "listening_topics"("id", "organizationId", "brandId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listening_signals" ADD CONSTRAINT "listening_signals_theme_scope_fkey"
  FOREIGN KEY ("themeId", "organizationId", "brandId", "topicId") REFERENCES "listening_themes"("id", "organizationId", "brandId", "topicId") ON DELETE CASCADE ON UPDATE CASCADE;
