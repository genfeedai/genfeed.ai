-- Platform default preset keys are globally unique (#6075).
--
-- Preset keys live in `config->>'key'`, which Prisma cannot declare as a
-- unique index, so this is raw SQL (same shape as the partial unique indexes in
-- `persona_grants` and `mcp_approvals`). Only platform defaults
-- (`organizationId IS NULL`) are constrained: an organization may own a preset
-- whose key matches a platform default, and the service resolves the
-- organization's own first.
--
-- Additive only: one index, no column or table changes, so the running release
-- is unaffected.
--
-- Pre-flight: building the index fails on existing duplicates. Abort with a
-- clear message instead of deleting or renaming any preset; the transaction
-- rolls back and the data is left untouched for manual resolution.
DO $$
DECLARE
  duplicate_keys text;
BEGIN
  SELECT string_agg(format('%s (%s rows)', preset_key, row_count), ', ' ORDER BY preset_key)
  INTO duplicate_keys
  FROM (
    SELECT config->>'key' AS preset_key, COUNT(*) AS row_count
    FROM "presets"
    WHERE "organizationId" IS NULL
      AND "isDeleted" = false
      AND config->>'key' IS NOT NULL
    GROUP BY config->>'key'
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF duplicate_keys IS NOT NULL THEN
    RAISE EXCEPTION 'Migration aborted (#6075): platform default presets share a key: %. Soft-delete or rename the extra rows manually, then re-run this migration.', duplicate_keys;
  END IF;
END$$;

CREATE UNIQUE INDEX "presets_platform_default_key_uidx"
  ON "presets" ((config->>'key'))
  WHERE "organizationId" IS NULL AND "isDeleted" = false AND config->>'key' IS NOT NULL;
