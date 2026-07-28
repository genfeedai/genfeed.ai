-- Soft-delete is boolean-only. Tombstone instant is `updated_at` (updated on
-- the same write that flips is_deleted), matching the cloud Asset contract.
ALTER TABLE desktop_asset
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE desktop_asset
SET is_deleted = TRUE,
    updated_at = COALESCE(deleted_at, updated_at)
WHERE deleted_at IS NOT NULL
  AND deleted_at <> '';

ALTER TABLE desktop_asset
  DROP COLUMN IF EXISTS deleted_at;
