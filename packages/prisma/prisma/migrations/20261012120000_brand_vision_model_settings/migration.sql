-- Brand visual analysis models are Admin-selected catalog models, not env vars (#6727).
-- Each column holds a `models.key`; the defaults are the Florence-2 and OWL-ViT rows the
-- model catalog seed registers on every boot. A missing or unpriced row, or NULL, leaves
-- the analysis unavailable, and the analysis switch stays off by default.
ALTER TABLE "platform_settings"
  ADD COLUMN "brandVisionOcrModelKey" TEXT DEFAULT 'lucataco/florence-2-large',
  ADD COLUMN "brandVisionDetectModelKey" TEXT DEFAULT 'adirik/owlvit-base-patch32';
