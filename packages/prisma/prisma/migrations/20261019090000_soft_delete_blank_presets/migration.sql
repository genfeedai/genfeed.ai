-- Soft-delete fully blank preset rows.
--
-- The admin Presets list showed ~88 rows with no label, key, category or
-- defaults ("undefined" in the Key column). They cannot be applied anywhere:
-- the Studio resolvers and the preset key lookups all need a key or label.
--
-- A row is "fully blank" only when it has no category and every value in its
-- config is null or empty (`{}` included). Anything carrying a label, key,
-- prompt or any other default is left alone. Reserved Studio platform
-- templates (`cpresetbuiltin*`) are never touched.
--
-- Reversible: sets "isDeleted" only. Nothing is removed, so a row can be
-- restored with `UPDATE "presets" SET "isDeleted" = false WHERE id = ...`.
UPDATE "presets"
SET "isDeleted" = true,
    "updatedAt" = now()
WHERE "isDeleted" = false
  AND "category" IS NULL
  AND "id" NOT LIKE 'cpresetbuiltin%'
  AND jsonb_typeof("config") = 'object'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_each("config") AS entry
    WHERE entry.value NOT IN ('null'::jsonb, '""'::jsonb, '{}'::jsonb, '[]'::jsonb)
  );
