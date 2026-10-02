-- Per-user pins for the app rail More menu.
--
-- Mirrors favoriteWorkflowIds: a text array defaulting to empty. Existing
-- rows start with nothing pinned. Writes accept only the pinnable app ids.
ALTER TABLE "settings"
  ADD COLUMN "pinnedAppIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
