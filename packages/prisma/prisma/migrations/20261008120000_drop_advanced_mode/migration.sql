-- Advanced Mode is gone: Studio and Agent default to Auto model selection and
-- expose manual model choice inline, so neither preference has a reader.
ALTER TABLE "settings" DROP COLUMN IF EXISTS "isAdvancedMode";
ALTER TABLE "organization_settings" DROP COLUMN IF EXISTS "isAdvancedMode";
