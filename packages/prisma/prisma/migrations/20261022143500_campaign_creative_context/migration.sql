ALTER TABLE "campaigns"
  ADD COLUMN "audience" TEXT,
  ADD COLUMN "tone" TEXT,
  ADD COLUMN "creativeDirection" TEXT,
  ADD COLUMN "assetIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
