ALTER TABLE "ingredients" ADD COLUMN "generationHarness" JSONB;
ALTER TABLE "organization_settings" ADD COLUMN "isPromptEnhancementEnabled" BOOLEAN;
ALTER TABLE "brands" ADD COLUMN "isPromptEnhancementEnabled" BOOLEAN;
