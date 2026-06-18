ALTER TABLE "trend_source_references"
ADD COLUMN "canonicalUrl" TEXT,
ADD COLUMN "platform" TEXT,
ADD COLUMN "authorHandle" TEXT,
ADD COLUMN "currentEngagementTotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "latestTrendViralityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "lastSeenAt" TIMESTAMP(3);

ALTER TABLE "trend_source_reference_snapshots"
ADD COLUMN "snapshotDate" TIMESTAMP(3);

UPDATE "trend_source_references"
SET
  "canonicalUrl" = NULLIF("data"->>'canonicalUrl', ''),
  "platform" = NULLIF("data"->>'platform', ''),
  "authorHandle" = NULLIF("data"->>'authorHandle', ''),
  "currentEngagementTotal" = CASE
    WHEN ("data"->>'currentEngagementTotal') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN FLOOR(("data"->>'currentEngagementTotal')::numeric)::integer
    ELSE 0
  END,
  "latestTrendViralityScore" = CASE
    WHEN ("data"->>'latestTrendViralityScore') ~ '^-?[0-9]+(\.[0-9]+)?$'
      THEN ("data"->>'latestTrendViralityScore')::double precision
    ELSE 0
  END,
  "lastSeenAt" = CASE
    WHEN ("data"->>'lastSeenAt') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
      THEN ("data"->>'lastSeenAt')::timestamp(3)
    ELSE NULL
  END;

UPDATE "trend_source_reference_snapshots"
SET "snapshotDate" = CASE
  WHEN ("data"->>'snapshotDate') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
    THEN ("data"->>'snapshotDate')::timestamp(3)
  ELSE NULL
END;

CREATE INDEX "trend_remix_lineages_org_brand_deleted_idx"
ON "trend_remix_lineages"("organizationId", "brandId", "isDeleted");

CREATE INDEX "trend_remix_lineages_content_draft_deleted_idx"
ON "trend_remix_lineages"("contentDraftId", "isDeleted");

CREATE INDEX "trend_remix_lineages_post_deleted_idx"
ON "trend_remix_lineages"("postId", "isDeleted");

CREATE INDEX "trend_source_refs_url_platform_deleted_idx"
ON "trend_source_references"("canonicalUrl", "platform", "isDeleted");

CREATE INDEX "trend_source_refs_account_lookup_idx"
ON "trend_source_references"("isDeleted", "platform", "authorHandle", "lastSeenAt" DESC);

CREATE INDEX "trend_source_refs_rank_idx"
ON "trend_source_references"("isDeleted", "currentEngagementTotal" DESC, "latestTrendViralityScore" DESC);

CREATE INDEX "trend_source_reference_links_trend_deleted_idx"
ON "trend_source_reference_links"("trendId", "isDeleted");

CREATE INDEX "trend_source_reference_links_ref_deleted_idx"
ON "trend_source_reference_links"("sourceReferenceId", "isDeleted");

CREATE INDEX "trend_source_reference_snapshots_ref_date_deleted_idx"
ON "trend_source_reference_snapshots"("sourceReferenceId", "snapshotDate", "isDeleted");
