-- Per-user home app.
--
-- Nullable: no value means the organization's default, then Workspace.
ALTER TABLE "settings"
  ADD COLUMN "homeAppId" TEXT;
