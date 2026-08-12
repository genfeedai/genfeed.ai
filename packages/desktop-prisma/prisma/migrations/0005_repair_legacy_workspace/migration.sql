-- Early desktop builds created desktop_workspace before linked_brand_id and
-- sync_policy were added to the generated Prisma model. Because 0001 uses
-- CREATE TABLE IF NOT EXISTS, those databases were recorded as migrated while
-- retaining the older table shape. Repair the known drift without replacing or
-- deleting the user's table.
ALTER TABLE desktop_workspace
  ADD COLUMN IF NOT EXISTS linked_brand_id TEXT;

ALTER TABLE desktop_workspace
  ADD COLUMN IF NOT EXISTS sync_policy TEXT NOT NULL DEFAULT 'local-only';
