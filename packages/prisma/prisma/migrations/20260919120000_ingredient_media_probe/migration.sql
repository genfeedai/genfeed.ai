ALTER TABLE "ingredients"
  ADD COLUMN "mediaProbe" JSONB,
  ADD COLUMN "mediaProbedAt" TIMESTAMP(3);
