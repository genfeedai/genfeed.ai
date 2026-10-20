-- Rail order and home app are personal preferences (Setting.railAppOrder /
-- Setting.homeAppId); the organization-level defaults are removed.
-- genfeed-contract-after: v0.2.13
ALTER TABLE "organization_settings"
  DROP COLUMN "defaultRailOrder",
  DROP COLUMN "defaultHomeAppId";
