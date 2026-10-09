-- Organization preferences; an empty object resolves through the shared catalogue.
ALTER TABLE "organization_settings"
ADD COLUMN "moduleOverrides" JSONB NOT NULL DEFAULT '{}';
