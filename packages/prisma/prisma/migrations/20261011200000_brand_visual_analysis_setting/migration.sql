-- Provider-backed reading of brand artifacts (OCR, logo and product placement, #6727).
-- Off by default: with the switch off the checks stay unknown and no provider is called.
ALTER TABLE "platform_settings"
  ADD COLUMN "isBrandVisualAnalysisEnabled" BOOLEAN NOT NULL DEFAULT false;
