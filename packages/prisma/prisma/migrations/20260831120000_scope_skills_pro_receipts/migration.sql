-- Make Skills Pro receipts an explicit, claimable tenant entitlement instead
-- of relying on unindexed JSON fields. Existing checkout receipts remain
-- unclaimed until their first authenticated redemption.

ALTER TABLE "skill_receipts"
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "receiptId" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'completed',
  ADD COLUMN "productType" TEXT NOT NULL DEFAULT 'bundle',
  ADD COLUMN "skillSlugs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "downloadCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastDownloadedAt" TIMESTAMP(3);

UPDATE "skill_receipts"
SET
  "receiptId" = NULLIF("data" ->> 'receiptId', ''),
  "status" = COALESCE(NULLIF("data" ->> 'status', ''), 'completed'),
  "productType" = COALESCE(NULLIF("data" ->> 'productType', ''), 'bundle'),
  "skillSlugs" = CASE
    WHEN jsonb_typeof("data" -> 'skills') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text("data" -> 'skills'))
    WHEN NULLIF("data" ->> 'skillSlug', '') IS NOT NULL
      THEN ARRAY["data" ->> 'skillSlug']
    ELSE ARRAY[]::TEXT[]
  END,
  "expiresAt" = CASE
    WHEN NULLIF("data" ->> 'expiresAt', '') IS NOT NULL
      THEN ("data" ->> 'expiresAt')::TIMESTAMP(3)
    ELSE NULL
  END,
  "downloadCount" = CASE
    WHEN ("data" ->> 'downloadCount') ~ '^[0-9]+$'
      THEN ("data" ->> 'downloadCount')::INTEGER
    ELSE 0
  END,
  "lastDownloadedAt" = CASE
    WHEN NULLIF("data" ->> 'lastDownloadedAt', '') IS NOT NULL
      THEN ("data" ->> 'lastDownloadedAt')::TIMESTAMP(3)
    ELSE NULL
  END;

CREATE UNIQUE INDEX "skill_receipts_receiptId_key"
  ON "skill_receipts"("receiptId");
CREATE INDEX "skill_receipts_organizationId_isDeleted_createdAt_idx"
  ON "skill_receipts"("organizationId", "isDeleted", "createdAt" DESC);
CREATE INDEX "skill_receipts_organizationId_status_isDeleted_idx"
  ON "skill_receipts"("organizationId", "status", "isDeleted");

ALTER TABLE "skill_receipts"
  ADD CONSTRAINT "skill_receipts_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
