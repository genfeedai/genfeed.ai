-- Organization defaults for the app rail (Settings -> Modules).
--
-- Empty order and a null home app mean no default: members see the standard
-- rail order and land on Workspace unless they choose otherwise.
ALTER TABLE "organization_settings"
  ADD COLUMN "defaultRailOrder" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "defaultHomeAppId" TEXT;
