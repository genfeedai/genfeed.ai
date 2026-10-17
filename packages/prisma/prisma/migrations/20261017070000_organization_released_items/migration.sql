-- Release items a platform admin opened for one organization (Admin -> Organization).
-- Empty by default: a new cloud organization sees only what Admin -> Flags released for everyone.
ALTER TABLE "organization_settings"
  ADD COLUMN "releasedItemIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
