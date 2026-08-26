-- Durable attribution from canonical Posts back to listening topics, themes,
-- and the bounded evidence snapshot selected for the action (#1798).

ALTER TABLE "posts"
  ADD COLUMN "listeningTopicId" TEXT,
  ADD COLUMN "listeningThemeId" TEXT,
  ADD COLUMN "listeningEvidenceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "posts"
  ADD CONSTRAINT "posts_listening_evidence_ids_bounded_check"
  CHECK (cardinality("listeningEvidenceIds") <= 100),
  ADD CONSTRAINT "posts_listening_attribution_shape_check"
  CHECK (
    (
      "listeningTopicId" IS NULL
      AND "listeningThemeId" IS NULL
      AND cardinality("listeningEvidenceIds") = 0
    )
    OR
    (
      "listeningTopicId" IS NOT NULL
      AND "listeningThemeId" IS NOT NULL
      AND cardinality("listeningEvidenceIds") BETWEEN 1 AND 100
    )
  );

CREATE INDEX "posts_org_brand_listening_theme_idx"
ON "posts"("organizationId", "brandId", "listeningThemeId");

ALTER TABLE "posts"
  ADD CONSTRAINT "posts_listening_theme_scope_fkey"
  FOREIGN KEY ("listeningThemeId", "organizationId", "brandId", "listeningTopicId")
  REFERENCES "listening_themes"("id", "organizationId", "brandId", "topicId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
