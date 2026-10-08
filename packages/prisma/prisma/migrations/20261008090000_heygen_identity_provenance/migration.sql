ALTER TABLE "organization_settings" ADD COLUMN "defaultAvatarRef" JSONB;
ALTER TABLE "ingredients" ADD COLUMN "generationProvider" JSONB;
ALTER TABLE "clip_results" ADD COLUMN "generationProvider" JSONB;
