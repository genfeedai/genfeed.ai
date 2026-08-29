-- Widen studio_looks into full Generation Setup Presets: router model
-- selection, output count, and brand/enhancement toggles saved alongside
-- the existing Look fields. All new columns are optional so existing rows
-- stay valid without a backfill.

ALTER TABLE "studio_looks"
ADD COLUMN "modelKey" TEXT,
ADD COLUMN "prioritize" TEXT,
ADD COLUMN "outputs" INTEGER,
ADD COLUMN "aspectRatio" TEXT,
ADD COLUMN "duration" INTEGER,
ADD COLUMN "resolution" TEXT,
ADD COLUMN "brandingMode" TEXT,
ADD COLUMN "isPromptEnhanceEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "studio_looks"
ADD CONSTRAINT "studio_looks_prioritize_check"
  CHECK ("prioritize" IS NULL OR "prioritize" IN ('quality', 'speed', 'cost', 'balanced')),
ADD CONSTRAINT "studio_looks_branding_mode_check"
  CHECK ("brandingMode" IS NULL OR "brandingMode" IN ('brand', 'off'));
