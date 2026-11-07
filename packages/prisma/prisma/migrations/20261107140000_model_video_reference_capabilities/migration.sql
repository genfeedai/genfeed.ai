-- #9615: the registry row carries a video model's reference capabilities and
-- its draft siblings, so per-step recipe routing and Studio drafts read the
-- catalog instead of hardcoded key tables. Values arrive with the
-- reference-data sync after migrate. Additive and safe to replay.
ALTER TABLE "models"
  ADD COLUMN IF NOT EXISTS "draftModelKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "maxVideoReferences" INTEGER,
  ADD COLUMN IF NOT EXISTS "hasNativeExtend" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "hasVideoReferences" BOOLEAN;
