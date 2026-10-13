-- #5495: #5485 stopped reading and writing this brand-level switch.
-- The per-account choice lives on credentials.isHistoryImportRequested.
ALTER TABLE "brands" DROP COLUMN IF EXISTS "isSocialHistoryImportEnabled";
