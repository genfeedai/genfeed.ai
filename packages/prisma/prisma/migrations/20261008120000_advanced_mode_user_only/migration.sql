-- Advanced Mode is a personal prompt-bar preference (it reveals manual model
-- choice). The organization-level copy had no writer the UI used and split
-- the source of truth, so only the user setting remains. New users start in
-- simple mode; existing rows keep their saved value.
ALTER TABLE "organization_settings" DROP COLUMN IF EXISTS "isAdvancedMode";
ALTER TABLE "settings" ALTER COLUMN "isAdvancedMode" SET DEFAULT false;
