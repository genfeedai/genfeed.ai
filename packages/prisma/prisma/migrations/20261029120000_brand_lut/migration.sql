ALTER TABLE "brands"
  ADD COLUMN "isLutEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lutFileName" TEXT,
  ADD COLUMN "lutStorageKey" TEXT;

-- NOT VALID enforces the check on new writes immediately without scanning
-- existing "brands" rows.
ALTER TABLE "brands" ADD CONSTRAINT "brands_lut_enabled_needs_file_check" CHECK (NOT "isLutEnabled" OR "lutStorageKey" IS NOT NULL) NOT VALID;
