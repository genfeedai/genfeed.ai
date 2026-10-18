-- Per-user hidden core apps.
--
-- Mirrors railAppOrder: a text array defaulting to empty. Existing rows keep
-- every core app on the rail until the member unpins one.
ALTER TABLE "settings"
  ADD COLUMN "hiddenAppIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
