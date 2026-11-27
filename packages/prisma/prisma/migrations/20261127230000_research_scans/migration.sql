-- Counted scans of the trends and ads libraries (#11623). A plan's scan limit
-- is a count of these rows over a rolling window. Expand only: one new, empty
-- table.

CREATE TABLE IF NOT EXISTS "research_scans" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "library" TEXT NOT NULL,
  "subjectKey" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "research_scans_pkey" PRIMARY KEY ("id"),
  -- ResearchScanLibrary in @genfeedai/pricing.
  CONSTRAINT "research_scans_library_check"
    CHECK ("library" IN ('trends', 'ads'))
);

CREATE INDEX IF NOT EXISTS "research_scans_window_idx"
  ON "research_scans" ("organizationId", "library", "isDeleted", "createdAt");

ALTER TABLE "research_scans"
  DROP CONSTRAINT IF EXISTS "research_scans_organizationId_fkey",
  ADD CONSTRAINT "research_scans_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
