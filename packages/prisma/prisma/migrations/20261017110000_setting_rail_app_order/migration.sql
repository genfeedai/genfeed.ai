-- Per-user rail order.
--
-- Mirrors pinnedAppIds: a text array defaulting to empty. Existing rows keep
-- the default rail order until the member rearranges it.
ALTER TABLE "settings"
  ADD COLUMN "railAppOrder" TEXT[] DEFAULT ARRAY[]::TEXT[];
